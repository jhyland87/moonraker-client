/**
 * Connection settings consumed by {@link MoonrakerClient} when it opens
 * its websocket.
 *
 * Only `server` is required. Everything else has a sensible default:
 * `port = 80`, `path = '/websocket'`, no handshake timeout cap beyond
 * the client's `DEFAULT_HANDSHAKE_TIMEOUT_MS`.
 *
 * @example
 * ```ts
 * const cfg: ConnectionConfig = {
 *   server: '192.168.0.96',
 *   port: 7125,
 *   path: '/websocket',
 * };
 * ```
 * @source
 */
export interface ConnectionConfig {
  /** Hostname or IP of the Moonraker instance. */
  readonly server: string;
  /** TCP port. Defaults to `80` if omitted. */
  readonly port?: number;
  /** WebSocket path on the server. Defaults to `'/websocket'` if omitted. */
  readonly path?: string;
  /**
   * Use TLS when connecting. When `true`, the websocket uses `wss://` and
   * the HTTP endpoints (e.g. {@link MoonrakerClient.getLogTail} and
   * Moonraker file fetches like thumbnails) use `https://`. Defaults to
   * `false` so existing plaintext setups don't break.
   *
   * Independent of any reverse-proxy or webcam server in front of the
   * printer — each of those has its own protocol flag.
   */
  readonly secure?: boolean;
  /**
   * Optional handshake timeout override (ms). Currently informational —
   * the client uses its own internal handshake timeout constant.
   */
  readonly timeout?: number;
}

/**
 * Top-level configuration container passed to the {@link MoonrakerClient}
 * constructor. The extra `API.connection` nesting exists so the same
 * config object can carry future, non-WebSocket settings without breaking
 * callers.
 *
 * @example
 * ```ts
 * const client = new MoonrakerClient({
 *   API: { connection: { server: '192.168.0.96', port: 7125 } },
 * });
 * ```
 * @source
 */
export interface ClientConfig {
  readonly API: {
    readonly connection: ConnectionConfig;
  };
}

/**
 * Outbound JSON-RPC 2.0 request frame. Constructed internally by
 * {@link MoonrakerClient.request} and serialized as the websocket
 * payload; callers don't usually build these directly.
 *
 * @example
 * ```ts
 * const frame: JsonRpcRequest = {
 *   jsonrpc: '2.0',
 *   method: 'printer.info',
 *   id: 42,
 * };
 * ```
 * @source
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: number;
  params?: unknown;
}

/**
 * Inbound JSON-RPC 2.0 success reply.
 *
 * @typeParam T - Shape of the unwrapped `result` field. Defaults to
 *   `unknown` so callers can narrow at the use site.
 * @source
 */
export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result: T;
}

/**
 * The `error` body inside a JSON-RPC error response. `code` follows the
 * JSON-RPC 2.0 spec; `data` is an optional opaque payload defined by
 * the server.
 * @source
 */
export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Inbound JSON-RPC 2.0 error reply. Sibling to
 * {@link JsonRpcSuccessResponse}; the two are discriminated by the
 * presence of an `error` field.
 * @source
 */
export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number;
  error: JsonRpcErrorPayload;
}

/**
 * Server-pushed JSON-RPC notification (no `id` field). The handler in
 * {@link MoonrakerClient} re-emits these as `method:<name>` events.
 *
 * @typeParam T - Shape of the `params` payload. Defaults to `unknown`.
 * @source
 */
export interface JsonRpcNotification<T = unknown> {
  jsonrpc: '2.0';
  method: string;
  params?: T;
}

/**
 * Union of every JSON-RPC frame shape the client can receive on the wire.
 *
 * @typeParam T - Shape of the success-result / notification-params payload.
 * @source
 */
export type JsonRpcMessage<T = unknown> =
  | JsonRpcSuccessResponse<T>
  | JsonRpcErrorResponse
  | JsonRpcNotification<T>;

/**
 * Spec for which printer objects (and which of their attributes) to query
 * or subscribe to. Three shorthand shapes are accepted, all normalized
 * internally to the third (object-map) form:
 *
 * - `'toolhead'` — a single object name, all attributes.
 * - `['toolhead', 'print_stats']` — multiple object names, all attributes.
 * - `{ toolhead: ['position'], print_stats: null }` — explicit per-object
 *   attribute lists. `null` means "all attributes for that object".
 *
 * @example
 * ```ts
 * const a: PrinterObjectSpec = 'toolhead';
 * const b: PrinterObjectSpec = ['toolhead', 'print_stats'];
 * const c: PrinterObjectSpec = { extruder: ['temperature', 'target'] };
 * ```
 *
 * @see https://moonraker.readthedocs.io/en/latest/web_api/#query-printer-object-status
 * @source
 */
export type PrinterObjectSpec =
  | string
  | readonly string[]
  | Record<string, readonly string[] | null>;

/**
 * Common subset of a Klipper heater object's status. Used as the typed
 * shape of `extruder` and `heater_bed` on {@link PrinterStatus}; other
 * heaters with different shapes still appear via the index signature.
 * @source
 */
export interface HeaterStatus {
  temperature: number;
  target: number;
  power: number;
}

/**
 * The `status` half of a `printer.objects.subscribe` / `query` response.
 *
 * Known heater objects are typed; everything else is an opaque record so
 * callers can narrow the fields they actually asked for. The index
 * signature is read-only by convention even though TypeScript can't
 * enforce that on Record-style types.
 *
 * @example
 * ```ts
 * const { status } = await client.queryObjects('extruder');
 * console.log(status.extruder?.temperature);
 * ```
 * @source
 */
export interface PrinterStatus {
  extruder?: Partial<HeaterStatus>;
  heater_bed?: Partial<HeaterStatus>;
  [object: string]: Record<string, unknown> | undefined;
}

/**
 * Wrapper returned by `printer.objects.subscribe` and `printer.objects.query`.
 * `eventtime` is the Klipper-side wall clock when the snapshot was taken;
 * `status` is the requested-object data.
 * @source
 */
export interface SubscribeResult {
  eventtime: number;
  status: PrinterStatus;
}

/**
 * `params` shape of a `notify_status_update` notification: a 2-element
 * tuple of `[status, eventtime]`. Modeled here as an interface
 * extending `Array<unknown>` to keep tuple semantics while preserving
 * any other array methods consumers might want.
 *
 * Most consumers narrow to this via {@link isStatusUpdateParams} rather
 * than referencing the type directly.
 * @source
 */
export interface NotifyStatusUpdateParams extends Array<unknown> {
  0: PrinterStatus;
  1: number;
}

/**
 * Per-sensor cache returned by `server.temperature_store`. Samples are
 * recorded at 1Hz; the most recent sample is the last element of each
 * array. Non-heater sensors (e.g. plain thermistors) omit `targets` and
 * `powers`.
 *
 * @example
 * ```ts
 * const store = await client.getTemperatureStore();
 * const last10 = store.extruder?.temperatures.slice(-10);
 * ```
 *
 * @see https://moonraker.readthedocs.io/en/latest/web_api/#get-cached-temperature-data
 * @source
 */
export interface TemperatureStoreSensor {
  /** Temperature samples, oldest first, newest last. Required field. */
  readonly temperatures: readonly number[];
  /** Target-temperature samples for the same indices, if applicable. */
  readonly targets?: readonly number[];
  /** Heater duty-cycle samples for the same indices, if applicable. */
  readonly powers?: readonly number[];
}

/**
 * Top-level shape of the `server.temperature_store` response — a map
 * from object name (e.g. `'extruder'`, `'temperature_sensor mcu_temp'`)
 * to its sensor cache.
 *
 * @example
 * ```ts
 * const store: TemperatureStore = await client.getTemperatureStore();
 * for (const [name, sensor] of Object.entries(store)) {
 *   console.log(name, sensor.temperatures.length, 'samples');
 * }
 * ```
 * @source
 */
export type TemperatureStore = Readonly<Record<string, TemperatureStoreSensor>>;

/**
 * One thumbnail variant attached to a gcode file's metadata. Moonraker
 * extracts these from the gcode's `; thumbnail` comments at upload time
 * and stores them under `.thumbs/<name>-<W>x<H>.png` next to the gcode.
 *
 * The `relative_path` is relative to the gcode's directory in the gcode
 * file root (typically `gcodes/`) — combine with the server's HTTP base
 * URL to fetch: `http://<host>:<port>/server/files/gcodes/<relative_path>`.
 *
 * Slicers commonly emit three sizes (32×32, 100×100, 320×320); the
 * 100×100 is usually the right one for a small inline preview.
 *
 * @example
 * ```ts
 * const meta = await client.getFileMetadata('print.gcode');
 * const thumb = meta.thumbnails.find((t) => t.width >= 100) ?? meta.thumbnails[0];
 * const url = `http://${host}:${port}/server/files/gcodes/${thumb.relative_path}`;
 * ```
 * @source
 */
export interface GcodeThumbnail {
  /** Image width in pixels. */
  readonly width: number;
  /** Image height in pixels. */
  readonly height: number;
  /** File size in bytes. */
  readonly size: number;
  /** Path relative to the gcode file root, including any `.thumbs/` subdir. */
  readonly relative_path: string;
}

/**
 * Subset of fields returned by `server.files.metadata`. Moonraker returns
 * a much larger object (filament weights, slicer name, layer count,
 * estimated time, …); we expose the fields a dashboard is likely to use
 * and leave room to add more as needed.
 *
 * @example
 * Fetching for the currently-loaded job:
 * ```ts
 * const status = await client.request<{ print_stats: { filename: string } }>(
 *   'printer.objects.query',
 *   { objects: { print_stats: ['filename'] } },
 * );
 * const meta = await client.getFileMetadata(status.print_stats.filename);
 * console.log(meta.thumbnails.length, 'thumbnails available');
 * ```
 * @source
 */
export interface GcodeFileMetadata {
  /** Filename as Moonraker knows it (no leading `gcodes/`). */
  readonly filename: string;
  /** Available pre-rendered thumbnails, smallest first by Moonraker's convention. */
  readonly thumbnails: readonly GcodeThumbnail[];
  /** File size in bytes. */
  readonly size?: number;
  /** Slicer name (e.g. `OrcaSlicer`, `PrusaSlicer`, `SuperSlicer`). */
  readonly slicer?: string;
  /** Slicer version string. */
  readonly slicer_version?: string;
  /** Total layer count, when the slicer included it. */
  readonly layer_count?: number;
  /** Maximum Z value reached by the print, in mm. */
  readonly object_height?: number;
  /** Layer height in mm, per the slicer. */
  readonly layer_height?: number;
  /** First-layer height in mm, per the slicer. */
  readonly first_layer_height?: number;
  /** First-layer extruder temperature in °C. */
  readonly first_layer_extr_temp?: number;
  /** First-layer bed temperature in °C. */
  readonly first_layer_bed_temp?: number;
  /** Target chamber temperature in °C (0 = none). */
  readonly chamber_temp?: number;
  /** Nozzle diameter in mm. */
  readonly nozzle_diameter?: number;
  /** Estimated print duration in seconds, per the slicer. */
  readonly estimated_time?: number;
  /** Total filament used across all extruders, in mm. */
  readonly filament_total?: number;
  /** Total filament weight across all extruders, in grams. */
  readonly filament_weight_total?: number;
  /** Material type from the slicer (e.g. `"PLA"`, `"PETG"`, `"ABS"`). */
  readonly filament_type?: string;
  /** Display name of the loaded filament profile from the slicer. */
  readonly filament_name?: string;
  /** Unix-seconds timestamp of the most recent print start, if known. */
  readonly print_start_time?: number | null;
  /** Most-recent print job id (Moonraker's internal counter). */
  readonly job_id?: string | null;
}

/**
 * One entry as returned by `server.files.list` — a single regular file
 * Moonraker has cataloged under the gcode root. `path` is the relative
 * path from the root (e.g. `'subdir/print.gcode'`); `modified` is a
 * Unix-seconds float; `size` is the byte count; `permissions` is the
 * POSIX-style mode string (typically `'rw'`).
 *
 * @source
 */
export interface FileEntry {
  readonly path: string;
  readonly modified: number;
  readonly size: number;
  readonly permissions?: string;
}

/**
 * Map of cached gcode metadata keyed by filename — the shape returned
 * by `server.database.item` with `namespace: 'gcode_metadata'`. Each
 * value follows the same shape as a single `server.files.metadata`
 * response, but the bulk lookup is much cheaper for populating a file
 * browser (one round-trip instead of one per file).
 *
 * @example
 * ```ts
 * const all = await client.getDatabaseItem<GcodeMetadataMap>(
 *   'gcode_metadata',
 * );
 * const meta = all['print1.gcode'];
 * console.log(meta?.estimated_time);
 * ```
 * @source
 */
export type GcodeMetadataMap = Readonly<Record<string, GcodeFileMetadata>>;
