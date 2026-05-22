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
