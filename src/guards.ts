/**
 * Runtime type guards for the JSON-RPC message shapes. Using these instead of
 * `as` casts lets the compiler narrow the type itself, so the rest of the
 * client never has to lie about what it's holding.
 * @source
 */
import type {
  JsonRpcErrorResponse,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcSuccessResponse,
  PrinterStatus,
} from './types';

/**
 * True for anything that looks structurally like a JSON-RPC 2.0 message.
 * @source
 */
export const isJsonRpcMessage = (value: unknown): value is JsonRpcMessage =>
  typeof value === 'object' &&
  value !== null &&
  'jsonrpc' in value &&
  value.jsonrpc === '2.0';

/**
 * True for replies to a request (i.e. has a numeric `id`).
 * @source
 */
export const isJsonRpcResponse = (
  msg: JsonRpcMessage,
): msg is JsonRpcSuccessResponse | JsonRpcErrorResponse =>
  'id' in msg && typeof msg.id === 'number';

/**
 * True for server-pushed notifications (i.e. has a string `method`).
 * @source
 */
export const isJsonRpcNotification = (msg: JsonRpcMessage): msg is JsonRpcNotification =>
  'method' in msg && typeof msg.method === 'string';

/**
 * Discriminator between the success and error variants of a response.
 * @source
 */
export const isJsonRpcErrorResponse = (
  msg: JsonRpcSuccessResponse | JsonRpcErrorResponse,
): msg is JsonRpcErrorResponse => 'error' in msg;

/**
 * The `params` shape of a `notify_status_update` notification: a 2-tuple of
 * `[status, eventtime]`. Validated structurally — we don't deeply inspect the
 * status object's contents (consumers do that based on what they subscribed to).
 * @source
 */
export const isStatusUpdateParams = (value: unknown): value is [PrinterStatus, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'object' &&
  value[0] !== null &&
  typeof value[1] === 'number';

/**
 * The `params` shape of a `notify_gcode_response` notification: a 1-element
 * array `[message]`. Moonraker emits one of these for every gcode response
 * line (echoes, M118 messages, errors, etc.).
 * @source
 */
export const isGcodeResponseParams = (value: unknown): value is [string] =>
  Array.isArray(value) && value.length >= 1 && typeof value[0] === 'string';

/**
 * The `params` shape of a `notify_proc_stat_update` notification: a 1-element
 * array containing a stats object (moonraker_stats, cpu_temp, network, etc.).
 * Validated structurally only — consumers narrow the inner fields.
 * @source
 */
export const isProcStatUpdateParams = (value: unknown): value is [Record<string, unknown>] =>
  Array.isArray(value) &&
  value.length >= 1 &&
  typeof value[0] === 'object' &&
  value[0] !== null;
