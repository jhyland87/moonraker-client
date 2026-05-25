import { EventEmitter } from 'node:events';
import WebSocket, { type ClientOptions } from 'ws';

import { MoonrakerError } from './errors';
import type { MoonrakerEvents } from './events';
import {
  isGcodeResponseParams,
  isJsonRpcErrorResponse,
  isJsonRpcMessage,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isProcStatUpdateParams,
  isStatusUpdateParams,
} from './guards';
import { SocketState, type SocketStateValue } from './socket-states';
import {
  type ClientConfig,
  type ConnectionConfig,
  type FileEntry,
  type GcodeFileMetadata,
  type JsonRpcRequest,
  type PrinterObjectSpec,
  type SubscribeResult,
  type TemperatureStore,
} from './types';

/** Default heartbeat timeout (ms) — see {@link MoonrakerClient.resetHeartbeat}. */
const DEFAULT_HEARTBEAT_MS = 31_000;

/** Default handshake timeout passed to the underlying `ws` `WebSocket`. */
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 1_000;

/**
 * Like `Array.isArray` but narrows to `readonly string[]` instead of
 * widening to `any[]`. Used to keep TypeScript's union narrowing
 * accurate across {@link PrinterObjectSpec}.
 *
 * `Array.isArray` doesn't narrow `readonly T[]` out of a union (TS
 * issue #17002), so we wrap it in our own predicate.
 *
 * @param v - Any value.
 * @returns `true` iff `v` is an array (typed as a readonly string array).
 * @source
 */
const isReadonlyStringArray = (v: unknown): v is readonly string[] => Array.isArray(v);

/**
 * Coerce any of the three accepted {@link PrinterObjectSpec} shorthand
 * shapes into the canonical object-map form
 * (`{ [name]: fieldList | null }`) the Moonraker wire protocol
 * expects.
 *
 * - A string `name` becomes `{ [name]: null }`.
 * - An array of names becomes `{ [name]: null }` for each entry.
 * - An object map is returned unchanged.
 *
 * @param spec - One of the {@link PrinterObjectSpec} shorthand shapes.
 * @returns The fully-expanded object map.
 *
 * @example
 * ```ts
 * normalizeObjectSpec('toolhead');
 * // → { toolhead: null }
 *
 * normalizeObjectSpec(['toolhead', 'print_stats']);
 * // → { toolhead: null, print_stats: null }
 *
 * normalizeObjectSpec({ extruder: ['temperature'] });
 * // → { extruder: ['temperature'] }
 * ```
 * @source
 */
const normalizeObjectSpec = (
  spec: PrinterObjectSpec,
): Record<string, readonly string[] | null> => {
  if (typeof spec === 'string') {
    return { [spec]: null };
  }
  if (isReadonlyStringArray(spec)) {
    return Object.fromEntries(spec.map((name) => [name, null]));
  }
  return spec;
};

/**
 * Typed event-emitter signatures for {@link MoonrakerClient}, applied via
 * interface declaration merging. This adds strict overloads alongside the
 * loose `EventEmitter` ones inherited from the parent class — without
 * forcing us to override the methods at runtime (which would require
 * casting listeners through `(...args: unknown[]) => void`).
 * @source
 */
export interface MoonrakerClient {
  on<K extends keyof MoonrakerEvents & string>(
    event: K,
    listener: (...args: MoonrakerEvents[K]) => void,
  ): this;
  once<K extends keyof MoonrakerEvents & string>(
    event: K,
    listener: (...args: MoonrakerEvents[K]) => void,
  ): this;
  off<K extends keyof MoonrakerEvents & string>(
    event: K,
    listener: (...args: MoonrakerEvents[K]) => void,
  ): this;
  emit<K extends keyof MoonrakerEvents & string>(
    event: K,
    ...args: MoonrakerEvents[K]
  ): boolean;
}

/**
 * Strongly-typed JSON-RPC websocket client for a Moonraker instance.
 *
 * The client opens a websocket immediately on construction, manages the
 * heartbeat, and re-emits server traffic as typed events. Inherits from
 * {@link https://nodejs.org/api/events.html#class-eventemitter | EventEmitter};
 * see {@link MoonrakerEvents} for the full event map.
 *
 * @remarks
 * Events of interest:
 * - `open` — websocket established. Fire-and-forget your first requests here.
 * - `close` — websocket closed. Args: `[code, reason]`.
 * - `error` — transport or parse error. Args: `[Error]`.
 * - `notify:status_update` — convenience event for subscription deltas.
 *   Args: `[status, eventtime]`.
 * - `` `response:${id}` `` — single JSON-RPC reply for a given request id.
 * - `` `method:${name}` `` — any server-pushed JSON-RPC notification.
 *
 * @example
 * Basic connect, query, and clean shutdown:
 * ```ts
 * import { MoonrakerClient } from 'moonraker-client';
 *
 * const client = new MoonrakerClient({
 *   API: { connection: { server: '192.168.0.96', port: 7125 } },
 * });
 *
 * client.on('open', async () => {
 *   const info = await client.getServerInfo();
 *   console.log(info);
 *   client.close();
 * });
 *
 * client.on('error', (err) => console.error(err));
 * ```
 *
 * @example
 * Subscribe to live extruder + bed temperatures:
 * ```ts
 * client.on('open', async () => {
 *   await client.subscribe({
 *     extruder:   ['temperature', 'target'],
 *     heater_bed: ['temperature', 'target'],
 *   });
 * });
 *
 * client.on('notify:status_update', (status, eventtime) => {
 *   console.log(eventtime, status.extruder?.temperature);
 * });
 * ```
 *
 * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/ | Moonraker Web API}
 * @source
 */
export class MoonrakerClient extends EventEmitter {
  /**
   * The connection settings the client was constructed with. Surfaced as
   * a public `readonly` field rather than a pass-through getter (which
   * Google's style guide flags as an anti-pattern for accessor-only
   * properties).
   * @source
   */
  readonly config: ConnectionConfig;

  /**
   * Base URL for the Moonraker HTTP API — `{http|https}://host[:port]`
   * with no trailing slash. Built once in the constructor from
   * {@link ConnectionConfig}. Use this when constructing URLs for any
   * Moonraker HTTP endpoint (logs, files, thumbnails) so the scheme +
   * port follow whatever the client was configured with rather than
   * being re-derived (and possibly drifted) at each call site.
   *
   * @example
   * ```ts
   * const url = `${client.httpBaseUrl}/server/files/gcodes/${path}`;
   * const res = await fetch(url);
   * ```
   *
   * @source
   */
  readonly httpBaseUrl: string;

  private readonly wsOptions: ClientOptions;
  private readonly wsURL: string;
  private readonly heartbeatTimeoutMs: number;

  private ws: WebSocket;
  private pingTimeout: NodeJS.Timeout | null = null;
  private requestCounter = 0;

  /**
   * Construct the client and open the websocket. The connection is asynchronous;
   * wait for the `open` event (or check {@link isOpen}) before issuing requests.
   *
   * @param config - Connection settings. Only `API.connection.server` is required;
   *   `port` defaults to `80` and `path` to `/websocket`.
   * @param options - Optional client tuning.
   * @param options.heartbeatTimeoutMs - How long to wait between pings before
   *   force-terminating the socket. Defaults to `31000`.
   * @throws Error if `config.API.connection` is missing or `server` is empty.
   *
   * @example
   * ```ts
   * const client = new MoonrakerClient({
   *   API: {
   *     connection: { server: '192.168.0.96', port: 7125, path: '/websocket' },
   *   },
   * });
   * ```
   * @source
   */
  constructor(config: ClientConfig, options: { heartbeatTimeoutMs?: number } = {}) {
    super();
    const connection = config?.API?.connection;
    if (!connection) {
      throw new Error('No API.connection found in config');
    }

    this.config = connection;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_MS;
    this.wsOptions = { handshakeTimeout: DEFAULT_HANDSHAKE_TIMEOUT_MS };
    this.wsURL = MoonrakerClient.buildUrl(connection);
    this.httpBaseUrl = MoonrakerClient.buildHttpBase(connection);
    this.ws = this.openSocket();
  }

  /**
   * Current websocket readyState, as defined by the WebSocket spec.
   *
   * @returns One of `SocketState.CONNECTING`, `OPEN`, `CLOSING`, `CLOSED`.
   *
   * @example
   * ```ts
   * import { SocketState } from 'moonraker-client';
   * if (client.readyState === SocketState.OPEN) { /* ... *\/ }
   * ```
   * @source
   */
  get readyState(): SocketStateValue {
    return this.ws.readyState;
  }

  /**
   * Convenience check for the most common state.
   *
   * @returns `true` iff the websocket is in the `OPEN` state.
   *
   * @example
   * ```ts
   * if (!client.isOpen) await once(client, 'open');
   * await client.request('printer.info');
   * ```
   * @source
   */
  get isOpen(): boolean {
    return this.readyState === SocketState.OPEN;
  }

  // --- Public API -----------------------------------------------------------

  /**
   * Send a JSON-RPC 2.0 request and resolve with the unwrapped `result` payload.
   * Auto-assigns a unique request id and routes the matching reply back via the
   * internal `` `response:${id}` `` event.
   *
   * @typeParam T - Expected shape of the response `result`. Defaults to `unknown`.
   * @param method - JSON-RPC method name (e.g. `printer.info`).
   * @param params - Optional parameters object passed through as `params`.
   * @returns A promise that resolves with the response's `result`, or rejects
   *   with a {@link MoonrakerError} carrying the JSON-RPC error code.
   * @throws {@link MoonrakerError} for JSON-RPC error responses.
   * @throws Error for transport errors.
   *
   * @example
   * ```ts
   * // Generic call:
   * const info = await client.request<{ version: string }>('server.info');
   *
   * // With params:
   * const meta = await client.request('server.files.metadata', {
   *   filename: 'benchy.gcode',
   * });
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#json-rpc-api-overview | JSON-RPC API overview}
   * @source
   */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const { promise, resolve, reject } = Promise.withResolvers<T>();

    const id = ++this.requestCounter;
    const payload: JsonRpcRequest = { jsonrpc: '2.0', method, id };
    if (params !== undefined) payload.params = params;

    this.once(`response:${id}`, (msg) => {
      if (isJsonRpcErrorResponse(msg)) {
        reject(new MoonrakerError(msg.error.message, msg.error.code, msg.error.data));
        return;
      }
      // The caller's chosen `T` is a runtime assertion about the server's
      // response shape — TS can't validate it for us. This is the only place
      // we apply that assertion, at the API boundary.
      resolve(msg.result as T);
    });

    this.send(payload).catch(reject);

    return promise;
  }

  /**
   * Subscribe to live status updates for one or more printer objects. The
   * returned promise resolves with the *initial* snapshot; subsequent changes
   * arrive as `notify:status_update` events.
   *
   * @remarks
   * Moonraker only pushes updates when a value *changes*. For dense
   * historical data, also call {@link getTemperatureStore}.
   *
   * @param spec - Which objects (and optionally which fields) to subscribe to.
   *   Accepts a string, an array of names, or an object mapping object name
   *   to a field list (or `null` for all fields). See {@link PrinterObjectSpec}.
   * @returns A promise resolving to the initial `{ eventtime, status }` snapshot.
   * @throws {@link MoonrakerError} if the server rejects the request.
   *
   * @example
   * Subscribe to extruder + bed temperatures and listen for updates:
   * ```ts
   * await client.subscribe({
   *   extruder:   ['temperature', 'target'],
   *   heater_bed: ['temperature', 'target'],
   * });
   *
   * client.on('notify:status_update', (status, eventtime) => {
   *   console.log(eventtime, status.extruder?.temperature);
   * });
   * ```
   *
   * @example
   * Subscribe to every field of a single object:
   * ```ts
   * await client.subscribe('toolhead');
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#subscribe-to-printer-object-status | Subscribe to Printer Object Status}
   * @source
   */
  subscribe(spec: PrinterObjectSpec): Promise<SubscribeResult> {
    return this.request<SubscribeResult>('printer.objects.subscribe', {
      objects: normalizeObjectSpec(spec),
    });
  }

  /**
   * Cancel the websocket's active subscription by sending an empty objects map.
   *
   * @returns A promise resolving to Moonraker's confirmation snapshot
   *   (`{ eventtime, status: {} }`).
   * @throws {@link MoonrakerError} if the request fails.
   *
   * @example
   * ```ts
   * await client.unsubscribe();
   * ```
   * @source
   */
  unsubscribe(): Promise<SubscribeResult> {
    return this.request<SubscribeResult>('printer.objects.subscribe', { objects: {} });
  }

  /**
   * Query the current state of one or more printer objects *once*, without
   * subscribing. Same `spec` shapes as {@link subscribe}.
   *
   * @param spec - Which objects (and optionally which fields) to query.
   * @returns A promise resolving to `{ eventtime, status }`.
   * @throws {@link MoonrakerError} if the request fails.
   *
   * @example
   * One-shot read of every attribute of `toolhead` and `print_stats`:
   * ```ts
   * const { status } = await client.queryObjects(['toolhead', 'print_stats']);
   * console.log(status.toolhead);
   * ```
   *
   * @example
   * Just two fields of `toolhead`:
   * ```ts
   * const { status } = await client.queryObjects({
   *   toolhead: ['position', 'print_time'],
   * });
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#query-printer-object-status | Query Printer Object Status}
   * @source
   */
  queryObjects(spec: PrinterObjectSpec): Promise<SubscribeResult> {
    return this.request<SubscribeResult>('printer.objects.query', {
      objects: normalizeObjectSpec(spec),
    });
  }

  /**
   * List the names of every printer object exposed by Klippy. Useful for
   * discovering object names like `temperature_fan chamber_fan` or
   * `gcode_macro START_PRINT`.
   *
   * @returns A promise resolving to `{ objects: string[] }`.
   * @throws {@link MoonrakerError} if the request fails.
   *
   * @example
   * ```ts
   * const { objects } = await client.getObjectsList();
   * const macros = objects
   *   .filter((o) => o.startsWith('gcode_macro '))
   *   .map((o) => o.slice('gcode_macro '.length));
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#list-available-printer-objects | List Available Printer Objects}
   * @source
   */
  getObjectsList(): Promise<{ objects: string[] }> {
    return this.request('printer.objects.list');
  }

  /**
   * Fetch high-level Moonraker server info (version, registered components,
   * api version, klippy state).
   *
   * @returns A promise resolving to the raw server.info payload.
   * @throws {@link MoonrakerError} if the request fails.
   *
   * @example
   * ```ts
   * const info = await client.getServerInfo();
   * console.log(info);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#query-server-info | Query Server Info}
   * @source
   */
  getServerInfo(): Promise<unknown> {
    return this.request('server.info');
  }

  /**
   * Fetch Klippy host information (state, hostname, software version).
   *
   * @returns A promise resolving to the raw printer.info payload.
   * @throws {@link MoonrakerError} if the request fails.
   *
   * @example
   * ```ts
   * const info = await client.getPrinterInfo();
   * console.log(info);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#get-klippy-host-information | Get Klippy Host Information}
   * @source
   */
  getPrinterInfo(): Promise<unknown> {
    return this.request('printer.info');
  }

  /**
   * Fetch the server-side rolling cache of temperature samples — recorded at
   * 1Hz, defaulting to ~20 minutes of history per sensor. Each sensor returns
   * `temperatures[]`, plus `targets[]` and `powers[]` (heaters) or `speeds[]`
   * (temperature_fan) where applicable.
   *
   * Useful for seeding charts with backfilled history *before* live status
   * updates begin arriving.
   *
   * @param options - Optional flags.
   * @param options.includeMonitors - If `true`, includes any
   *   `temperature_monitor` objects in the response.
   * @returns A promise resolving to a {@link TemperatureStore} keyed by object name.
   * @throws {@link MoonrakerError} if the request fails.
   *
   * @example
   * Seed a chart with the last N samples:
   * ```ts
   * const store = await client.getTemperatureStore();
   * const last10ExtruderTemps = store.extruder?.temperatures.slice(-10);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#get-cached-temperature-data | Get Cached Temperature Data}
   * @source
   */
  getTemperatureStore(
    options: { includeMonitors?: boolean } = {},
  ): Promise<TemperatureStore> {
    const params =
      options.includeMonitors !== undefined
        ? { include_monitors: options.includeMonitors }
        : undefined;
    return this.request<TemperatureStore>('server.temperature_store', params);
  }

  /**
   * Fetch the catalog of extended G-code commands Klipper currently exposes.
   *
   * Klipper builds this dictionary by scanning loaded modules at startup, so
   * the available commands vary by printer config (e.g. `BED_MESH_CALIBRATE`
   * only appears if `[bed_mesh]` is configured). Useful for driving an
   * autocomplete UI, validating a script before sending it, or rendering a
   * `HELP` table without re-implementing it.
   *
   * @returns A promise resolving to a dictionary keyed by command name
   *   (uppercase, no leading slash) with the one-line description as value.
   * @throws {@link MoonrakerError} if the request fails.
   *
   * @example
   * Populate an autocomplete dropdown:
   * ```ts
   * const help = await client.getGcodeHelp();
   * const names = Object.keys(help).sort();
   * // names → ['BED_MESH_CALIBRATE', 'FIRMWARE_RESTART', 'HELP', 'RESTART', …]
   * console.log(help.RESTART);
   * // → 'Reload config file and restart host software'
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#list-available-gcode-commands | List Available GCode Commands}
   * @source
   */
  getGcodeHelp(): Promise<Readonly<Record<string, string>>> {
    return this.request<Readonly<Record<string, string>>>('printer.gcode.help');
  }

  /**
   * Fetch metadata for a single gcode file Moonraker has cataloged — the
   * same payload Fluidd / Mainsail use to populate their file lists and
   * print-status thumbnails. Includes slicer info, layer/time estimates,
   * filament weights, and the `thumbnails` array (small/medium/large PNGs
   * extracted from the file at upload time).
   *
   * To render a thumbnail: pick an entry from `thumbnails`, then fetch
   * the PNG over HTTP from
   * `http://<host>:<port>/server/files/gcodes/<thumbnail.relative_path>`.
   *
   * @param filename - Relative path / filename as Moonraker knows it,
   *   without a leading `gcodes/` (e.g. `"print.gcode"` or
   *   `"subdir/print.gcode"`).
   * @returns The metadata object — see {@link GcodeFileMetadata}.
   * @throws {@link MoonrakerError} if the request fails or the file is
   *   not in Moonraker's catalog.
   *
   * @example
   * ```ts
   * const status = await client.request<{ print_stats: { filename: string } }>(
   *   'printer.objects.query',
   *   { objects: { print_stats: ['filename'] } },
   * );
   * const meta = await client.getFileMetadata(status.print_stats.filename);
   * const thumb = meta.thumbnails.find((t) => t.width >= 100) ?? meta.thumbnails[0];
   * if (thumb) {
   *   const url = `http://${host}:${port}/server/files/gcodes/${thumb.relative_path}`;
   * }
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#get-gcode-metadata | Get GCode Metadata}
   * @source
   */
  getFileMetadata(filename: string): Promise<GcodeFileMetadata> {
    return this.request<GcodeFileMetadata>('server.files.metadata', { filename });
  }

  /**
   * List files Moonraker has cataloged under a given root, optionally
   * recursing into subdirectories. The most common root is `'gcodes'`
   * (the print-files root); other roots include `'config'`, `'logs'`,
   * and `'timelapse'`.
   *
   * Each entry is a {@link FileEntry} with `path`, `modified`, `size`,
   * and `permissions`. Subdirectories aren't returned as entries —
   * they're implied by the `path` strings (e.g. `'subdir/print.gcode'`).
   *
   * @param root - File root to list. Defaults to `'gcodes'`.
   * @returns Array of files.
   * @throws {@link MoonrakerError} on transport / server errors.
   *
   * @example
   * ```ts
   * const files = await client.listFiles();
   * for (const f of files) console.log(f.path, f.size);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#list-available-files | List Available Files}
   * @source
   */
  listFiles(root: string = 'gcodes'): Promise<readonly FileEntry[]> {
    return this.request<readonly FileEntry[]>('server.files.list', { root });
  }

  /**
   * Look up a key (or the entire namespace) in Moonraker's persistent
   * database. The `gcode_metadata` namespace holds a `{ filename →
   * GcodeFileMetadata }` map that's much cheaper to populate a file
   * browser from than calling `server.files.metadata` per file.
   *
   * @param namespace - Namespace name. e.g. `'gcode_metadata'`.
   * @param key - Optional key to read. Omit to read the whole namespace.
   * @returns Whatever JSON value is stored at that key (or the namespace
   *   root if `key` is omitted). Cast with a type parameter on the call.
   * @throws {@link MoonrakerError} if the namespace or key doesn't exist.
   *
   * @example
   * Read the full gcode metadata cache:
   * ```ts
   * import type { GcodeMetadataMap } from '@jhyland87/moonraker-client';
   * const all = await client.getDatabaseItem<GcodeMetadataMap>(
   *   'gcode_metadata',
   * );
   * console.log(Object.keys(all).length, 'files cached');
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#get-database-item | Get Database Item}
   * @source
   */
  getDatabaseItem<T = unknown>(namespace: string, key?: string): Promise<T> {
    const params: Record<string, string> = { namespace };
    if (key !== undefined) params.key = key;
    // Moonraker wraps the actual value in `{ namespace, key, value }`.
    // Unwrap so callers get just what they asked for.
    return this.request<{ namespace: string; key?: string; value: T }>(
      'server.database.item',
      params,
    ).then((response) => response.value);
  }

  /**
   * Delete a file from a Moonraker root. The path is relative to the
   * root and is given in the standard `root/path` form (e.g.
   * `'gcodes/print.gcode'`).
   *
   * Safe to call mid-print only for files that aren't currently being
   * printed — Moonraker will refuse the deletion otherwise. This method
   * doesn't preflight that check.
   *
   * @param rootAndPath - Full file identifier, e.g.
   *   `'gcodes/subdir/print.gcode'`.
   * @returns The deleted file's metadata (echoes the input).
   * @throws {@link MoonrakerError} if the file is missing, currently
   *   printing, or otherwise undeletable.
   *
   * @example
   * ```ts
   * await client.deleteFile('gcodes/old-print.gcode');
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#delete-file | Delete File}
   * @source
   */
  deleteFile(rootAndPath: string): Promise<unknown> {
    return this.request('server.files.delete_file', { path: rootAndPath });
  }

  /**
   * Start a print of the named gcode file.
   *
   * **Has a side effect on the printer** — issues `printer.print.start`,
   * which actually begins motion. Callers should confirm intent before
   * calling. Will fail if a print is already active.
   *
   * @param filename - Gcode filename as Moonraker knows it (no leading
   *   `'gcodes/'`; e.g. `'subdir/print.gcode'`).
   * @returns Moonraker's `'ok'` acknowledgment string.
   * @throws {@link MoonrakerError} if the file is missing or the printer
   *   isn't ready.
   *
   * @example
   * ```ts
   * await client.startPrint('print.gcode');
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/web_api/#start-print | Start Print}
   * @source
   */
  startPrint(filename: string): Promise<string> {
    return this.request<string>('printer.print.start', { filename });
  }

  /**
   * Fetch the trailing bytes of a Moonraker-served log file over HTTP.
   *
   * Uses an HTTP `Range: bytes=-N` request against `/server/files/<name>` on
   * the same host/port as the websocket. A 206 response usually starts mid-line;
   * everything up to the first newline is discarded so callers always receive
   * whole lines.
   *
   * @param name - Log filename. Defaults to `klippy.log`.
   * @param bytes - Maximum trailing bytes to request. Defaults to `50_000`.
   * @returns The decoded UTF-8 text, with a leading partial line trimmed on 206.
   * @throws {@link MoonrakerError} for non-2xx HTTP responses.
   *
   * @example
   * ```ts
   * const tail = await client.getLogTail('klippy.log', 50_000);
   * for (const line of tail.split('\n')) { /* ... *\/ }
   * ```
   * @source
   */
  async getLogTail(name: string = 'klippy.log', bytes: number = 50_000): Promise<string> {
    const url = `${this.httpBaseUrl}/server/files/${name}`;
    const res = await fetch(url, { headers: { Range: `bytes=-${bytes}` } });
    if (!res.ok && res.status !== 206) {
      throw new MoonrakerError(`getLogTail ${name}: HTTP ${res.status}`, res.status);
    }
    const text = await res.text();
    if (res.status !== 206) return text;
    const nl = text.indexOf('\n');
    return nl >= 0 ? text.slice(nl + 1) : text;
  }

  /**
   * Close the websocket. The {@link MoonrakerEvents | `close`} event fires when
   * the connection is fully closed.
   *
   * @param code - Optional close code (per the WebSocket spec). Defaults to
   *   `1005` (no status).
   * @param reason - Optional human-readable reason string.
   *
   * @example
   * ```ts
   * process.on('SIGINT', () => client.close());
   * client.on('close', (code, reason) => {
   *   console.log(`closed: ${code} ${reason ?? ''}`);
   *   process.exit(0);
   * });
   * ```
   * @source
   */
  close(code?: number, reason?: string): void {
    if (this.pingTimeout !== null) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    this.ws.close(code, reason);
  }

  // --- Internal -------------------------------------------------------------

  /**
   * Open the underlying `ws` WebSocket and wire its lifecycle events
   * through to this class's typed `EventEmitter` surface.
   *
   * Listeners installed here stay attached for the socket's lifetime;
   * the corresponding {@link close} or terminate cleans them up when
   * the underlying connection is closed and garbage-collected.
   *
   * @returns The freshly-constructed `WebSocket` instance, already
   *   wired with `open` / `message` / `error` / `close` / `ping`
   *   handlers.
   * @source
   */
  private openSocket(): WebSocket {
    const ws = new WebSocket(this.wsURL, this.wsOptions);
    ws.on('open', () => this.handleOpen());
    ws.on('message', (data: WebSocket.RawData) => this.handleMessage(data));
    ws.on('error', (err: Error) => this.emit('error', err));
    ws.on('close', (code: number, reasonBuf: Buffer) =>
      this.handleClose(code, reasonBuf.toString('utf-8')),
    );
    ws.on('ping', () => this.resetHeartbeat());
    return ws;
  }

  /**
   * Handler for the underlying `ws`'s `open` event. Arms the heartbeat
   * watchdog (so a server-side hang trips a reconnect) and re-emits
   * `'open'` on the typed event surface.
   *
   * @returns The boolean result of `EventEmitter.emit` — `true` if any
   *   listener handled `'open'`, `false` otherwise.
   * @source
   */
  private handleOpen(): boolean {
    this.resetHeartbeat();
    return this.emit('open');
  }

  /**
   * Handler for the underlying `ws`'s `close` event. Cancels the
   * heartbeat watchdog and re-emits `'close'` with the WS-level close
   * code and reason string.
   *
   * @param code - The WebSocket close code (per RFC 6455).
   * @param reason - The optional human-readable close reason.
   * @returns The boolean result of `EventEmitter.emit` — `true` if any
   *   listener handled `'close'`, `false` otherwise.
   * @source
   */
  private handleClose(code: number, reason: string): boolean {
    if (this.pingTimeout !== null) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    return this.emit('close', code, reason);
  }

  /**
   * Handler for every inbound WebSocket frame.
   *
   * Parses the JSON payload and dispatches it as either a
   * `response:${id}` event (for replies to {@link request}) or a
   * `method:${name}` event (for server-pushed notifications). For the
   * handful of notifications we have first-class typed convenience
   * events for (`notify_status_update`, `notify_gcode_response`,
   * `notify_proc_stat_update`), the typed variant is fired *in
   * addition* to the generic `method:*` event.
   *
   * Every inbound frame also resets the heartbeat watchdog — Moonraker
   * sends JSON notifications continuously but never WebSocket-level
   * PING frames, so a ping-only watchdog would terminate healthy
   * sockets.
   *
   * @param data - The raw `Buffer` / typed-array payload as received
   *   from `ws`. Decoded with `toString()` and JSON-parsed; parse
   *   errors are re-emitted as `'error'` events.
   * @source
   */
  private handleMessage(data: WebSocket.RawData): void {
    // Any inbound traffic counts as liveness — Moonraker streams JSON
    // notifications continuously but doesn't send WebSocket-level PING
    // frames, so a ping-only heartbeat would terminate a perfectly healthy
    // connection after `heartbeatTimeoutMs`.
    this.resetHeartbeat();

    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return;
    }

    if (!isJsonRpcMessage(parsed)) return;

    if (isJsonRpcResponse(parsed)) {
      this.emit(`response:${parsed.id}`, parsed);
      return;
    }

    if (isJsonRpcNotification(parsed)) {
      this.emit(`method:${parsed.method}`, parsed.params);
      if (parsed.method === 'notify_status_update' && isStatusUpdateParams(parsed.params)) {
        this.emit('notify:status_update', parsed.params[0], parsed.params[1]);
      } else if (
        parsed.method === 'notify_gcode_response' &&
        isGcodeResponseParams(parsed.params)
      ) {
        this.emit('notify:gcode_response', parsed.params[0]);
      } else if (
        parsed.method === 'notify_proc_stat_update' &&
        isProcStatUpdateParams(parsed.params)
      ) {
        this.emit('notify:proc_stat_update', parsed.params[0]);
      }
    }
  }

  /**
   * (Re-)arm the heartbeat timeout. Called on every inbound frame so
   * the socket is only terminated when the server actually goes silent
   * for {@link MoonrakerClient.heartbeatTimeoutMs} consecutive ms —
   * not on every period where the WS-level PING happens to be skipped.
   *
   * Clears any prior pending timeout before installing the new one, so
   * repeated calls don't pile up handlers.
   * @source
   */
  private resetHeartbeat(): void {
    if (this.pingTimeout !== null) clearTimeout(this.pingTimeout);
    this.pingTimeout = setTimeout(() => this.ws.terminate(), this.heartbeatTimeoutMs);
  }

  /**
   * Serialize a JSON-RPC request and write it to the websocket.
   *
   * The promise resolves once the bytes have been handed off to the
   * underlying `ws` (the success/error reply itself arrives later via
   * `handleMessage` and the `response:${id}` event).
   *
   * @param payload - The frame to send. Caller is responsible for
   *   assigning a unique `id`.
   * @returns A promise that resolves on send-complete and rejects with
   *   any transport-level error.
   * @throws Error if the socket is not in {@link SocketState.OPEN}.
   * @source
   */
  private async send(payload: JsonRpcRequest): Promise<void> {
    if (this.ws.readyState !== SocketState.OPEN) {
      throw new Error(`Cannot send: websocket not open (state ${this.ws.readyState})`);
    }
    const buf = Buffer.from(JSON.stringify(payload), 'utf-8');
    await new Promise<void>((resolve, reject) => {
      this.ws.send(buf, (err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Compose the full websocket URL (`ws://` or `wss://`) from a
   * {@link ConnectionConfig}. Applied once in the constructor and
   * cached on the instance.
   *
   * Scheme tracks {@link ConnectionConfig.secure}; the port segment is
   * elided when it matches the scheme's default (80 / 443) so URLs read
   * naturally instead of carrying the redundant port.
   *
   * @param cfg - The validated connection config.
   * @returns The fully-qualified websocket URL string.
   * @throws Error if `cfg.server` is empty or missing.
   * @source
   */
  private static buildUrl(cfg: ConnectionConfig): string {
    if (!cfg.server) throw new Error('No websocket server specified in connection config');
    const scheme = cfg.secure ? 'wss' : 'ws';
    const defaultPort = cfg.secure ? 443 : 80;
    const port = cfg.port ?? defaultPort;
    const portSegment = port === defaultPort ? '' : `:${port}`;
    const path = cfg.path ?? '/websocket';
    return `${scheme}://${cfg.server}${portSegment}${path}`;
  }

  /**
   * Compose the Moonraker HTTP base URL — `{http|https}://host[:port]`
   * with no trailing slash. Mirrors {@link buildUrl}'s scheme/port logic
   * but for the HTTP side of the API (file fetches, log tails, etc.).
   *
   * Exposed on the instance as {@link MoonrakerClient.httpBaseUrl} so
   * consumers don't have to re-derive host/port/scheme.
   *
   * @param cfg - The validated connection config.
   * @returns The HTTP base URL without trailing slash.
   * @source
   */
  private static buildHttpBase(cfg: ConnectionConfig): string {
    const scheme = cfg.secure ? 'https' : 'http';
    const defaultPort = cfg.secure ? 443 : 80;
    const port = cfg.port ?? defaultPort;
    const portSegment = port === defaultPort ? '' : `:${port}`;
    return `${scheme}://${cfg.server}${portSegment}`;
  }
}
