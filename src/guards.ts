/**
 * @fileoverview Runtime type guards for JSON-RPC message shapes the client
 * receives over the wire.
 *
 * Using `is`-predicate guards instead of `as` casts lets the compiler
 * narrow the type itself, so the rest of the client never has to lie
 * about what it's holding. Each guard does the minimum structural check
 * required to safely emit the corresponding event — consumers can do
 * deeper validation downstream.
 */
import type {
  JsonRpcErrorResponse,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcSuccessResponse,
  PrinterStatus,
} from './types';

/**
 * Structural test for any JSON-RPC 2.0 frame.
 *
 * @param value - The parsed JSON to test.
 * @returns `true` iff `value` is an object with a `'jsonrpc'` property
 *   set to the literal string `'2.0'`.
 *
 * @example
 * ```ts
 * const parsed: unknown = JSON.parse(raw);
 * if (isJsonRpcMessage(parsed)) {
 *   // parsed is now typed as JsonRpcMessage
 * }
 * ```
 * @source
 */
export const isJsonRpcMessage = (value: unknown): value is JsonRpcMessage =>
  typeof value === 'object' &&
  value !== null &&
  'jsonrpc' in value &&
  value.jsonrpc === '2.0';

/**
 * Narrow a {@link JsonRpcMessage} to a request reply (success or error).
 * Replies carry a numeric `id` matching the originating request; pushed
 * notifications do not.
 *
 * @param msg - A JSON-RPC message already narrowed by
 *   {@link isJsonRpcMessage}.
 * @returns `true` iff `msg` has a numeric `id` field.
 *
 * @example
 * ```ts
 * if (isJsonRpcResponse(msg)) {
 *   client.emit(`response:${msg.id}`, msg);
 * }
 * ```
 * @source
 */
export const isJsonRpcResponse = (
  msg: JsonRpcMessage,
): msg is JsonRpcSuccessResponse | JsonRpcErrorResponse =>
  'id' in msg && typeof msg.id === 'number';

/**
 * Narrow a {@link JsonRpcMessage} to a server-pushed notification — i.e.
 * a frame with a `method` string and no `id`.
 *
 * @param msg - A JSON-RPC message already narrowed by
 *   {@link isJsonRpcMessage}.
 * @returns `true` iff `msg` has a string `method` field.
 *
 * @example
 * ```ts
 * if (isJsonRpcNotification(msg)) {
 *   client.emit(`method:${msg.method}`, msg.params);
 * }
 * ```
 * @source
 */
export const isJsonRpcNotification = (msg: JsonRpcMessage): msg is JsonRpcNotification =>
  'method' in msg && typeof msg.method === 'string';

/**
 * Discriminate the success and error variants of a JSON-RPC response by
 * the presence of an `error` field.
 *
 * @param msg - A response already narrowed by {@link isJsonRpcResponse}.
 * @returns `true` iff `msg` carries an `error` payload.
 *
 * @example
 * ```ts
 * if (isJsonRpcErrorResponse(reply)) {
 *   throw new MoonrakerError(reply.error.message, reply.error.code, reply.error.data);
 * }
 * return reply.result;
 * ```
 * @source
 */
export const isJsonRpcErrorResponse = (
  msg: JsonRpcSuccessResponse | JsonRpcErrorResponse,
): msg is JsonRpcErrorResponse => 'error' in msg;

/**
 * Verify the `params` shape of a `notify_status_update` notification: a
 * 2-element tuple of `[status, eventtime]`.
 *
 * Validation is structural only — `status` is checked for being an
 * object, but its inner fields aren't inspected. Consumers narrow those
 * based on what they subscribed to.
 *
 * @param value - The raw `params` field from the notification.
 * @returns `true` iff `value` looks like `[status, eventtime]`.
 *
 * @example
 * ```ts
 * if (parsed.method === 'notify_status_update' && isStatusUpdateParams(parsed.params)) {
 *   client.emit('notify:status_update', parsed.params[0], parsed.params[1]);
 * }
 * ```
 * @source
 */
export const isStatusUpdateParams = (value: unknown): value is [PrinterStatus, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'object' &&
  value[0] !== null &&
  typeof value[1] === 'number';

/**
 * Verify the `params` shape of a `notify_gcode_response` notification:
 * a 1-element array `[message]`. Moonraker emits one of these per gcode
 * response line (echoes, M118 messages, errors, …).
 *
 * @param value - The raw `params` field from the notification.
 * @returns `true` iff `value` is `[string]`.
 *
 * @example
 * ```ts
 * if (parsed.method === 'notify_gcode_response' && isGcodeResponseParams(parsed.params)) {
 *   client.emit('notify:gcode_response', parsed.params[0]);
 * }
 * ```
 * @source
 */
export const isGcodeResponseParams = (value: unknown): value is [string] =>
  Array.isArray(value) && value.length >= 1 && typeof value[0] === 'string';

/**
 * Verify the `params` shape of a `notify_proc_stat_update` notification:
 * a 1-element array containing a stats object (the same shape
 * `machine.proc_stats` returns — `moonraker_stats`, `cpu_temp`,
 * `network`, etc.).
 *
 * Validation is structural only — consumers narrow the inner fields.
 *
 * @param value - The raw `params` field from the notification.
 * @returns `true` iff `value` is `[Record<string, unknown>]`.
 *
 * @example
 * ```ts
 * if (parsed.method === 'notify_proc_stat_update' && isProcStatUpdateParams(parsed.params)) {
 *   client.emit('notify:proc_stat_update', parsed.params[0]);
 * }
 * ```
 * @source
 */
export const isProcStatUpdateParams = (value: unknown): value is [Record<string, unknown>] =>
  Array.isArray(value) &&
  value.length >= 1 &&
  typeof value[0] === 'object' &&
  value[0] !== null;
