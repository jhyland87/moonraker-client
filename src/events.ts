import type {
  JsonRpcErrorResponse,
  JsonRpcSuccessResponse,
  PrinterStatus,
} from './types';

/**
 * Strongly-typed event map for {@link MoonrakerClient}'s
 * `EventEmitter` surface. Each property name is an event name; the
 * tuple type is the listener's parameter list.
 *
 * The shape is consumed via TypeScript declaration merging in
 * `client.ts`: a same-name interface adds strict overloads of `on` /
 * `once` / `off` / `emit` on top of the loose ones inherited from
 * `EventEmitter`, so consumers get auto-complete + tuple narrowing
 * without runtime overhead.
 *
 * @example
 * Listening for a typed event:
 * ```ts
 * client.on('notify:status_update', (status, eventtime) => {
 *   //                              ^? PrinterStatus, number
 *   console.log(eventtime, status.extruder?.temperature);
 * });
 * ```
 *
 * @example
 * Listening for a dynamic response-id event:
 * ```ts
 * client.once('response:42', (msg) => {
 *   //                       ^? JsonRpcSuccessResponse | JsonRpcErrorResponse
 *   console.log(msg);
 * });
 * ```
 * @source
 */
export interface MoonrakerEvents {
  /**
   * Fired once when the underlying websocket transitions to
   * {@link SocketState.OPEN}. Issue your first requests from here.
   */
  open: [];

  /**
   * Fired when the websocket transitions to {@link SocketState.CLOSED}.
   * Both `code` and `reason` are optional because some close paths
   * (e.g. a hard `terminate`) don't carry either.
   */
  close: [code: number | undefined, reason: string | undefined];

  /**
   * Fired on transport errors (handshake failure, parse errors, ws-level
   * faults). Always carries a real `Error` — never a string.
   */
  error: [error: Error];

  /**
   * Convenience event for `notify_status_update` notifications.
   * `status` carries only the *changed* fields per Moonraker's delta
   * semantics; `eventtime` is the Klipper-side wall clock.
   */
  'notify:status_update': [status: PrinterStatus, eventtime: number];

  /**
   * Convenience event for `notify_gcode_response` notifications.
   * One emit per gcode response line (echoes, `M118` messages, errors).
   */
  'notify:gcode_response': [message: string];

  /**
   * Convenience event for `notify_proc_stat_update` notifications.
   * The payload is a snapshot of `machine.proc_stats` (cpu_temp,
   * moonraker_stats, network, system_cpu_usage, …). Narrow at the use
   * site since Moonraker may add fields over time.
   */
  'notify:proc_stat_update': [stats: Record<string, unknown>];

  /**
   * Per-request reply, emitted exactly once for each call to
   * {@link MoonrakerClient.request}. The `number` template-literal
   * portion is the request id assigned at send time.
   */
  [key: `response:${number}`]: [JsonRpcSuccessResponse | JsonRpcErrorResponse];

  /**
   * Generic catch-all for any server-pushed JSON-RPC notification —
   * `method:notify_status_update`, `method:notify_klippy_ready`, etc.
   * Prefer the typed `notify:*` events above when one exists; this
   * surface is for everything Moonraker may push that we haven't
   * special-cased.
   */
  [key: `method:${string}`]: [params: unknown];
}
