/**
 * Runtime type guards for the JSON-RPC message shapes. Using these instead of
 * `as` casts lets the compiler narrow the type itself, so the rest of the
 * client never has to lie about what it's holding.
 */
import type {
  JsonRpcErrorResponse,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcSuccessResponse,
  PrinterStatus,
} from './types.js';

/** True for anything that looks structurally like a JSON-RPC 2.0 message. */
export const isJsonRpcMessage = (value: unknown): value is JsonRpcMessage =>
  typeof value === 'object' &&
  value !== null &&
  'jsonrpc' in value &&
  value.jsonrpc === '2.0';

/** True for replies to a request (i.e. has a numeric `id`). */
export const isJsonRpcResponse = (
  msg: JsonRpcMessage,
): msg is JsonRpcSuccessResponse | JsonRpcErrorResponse =>
  'id' in msg && typeof msg.id === 'number';

/** True for server-pushed notifications (i.e. has a string `method`). */
export const isJsonRpcNotification = (msg: JsonRpcMessage): msg is JsonRpcNotification =>
  'method' in msg && typeof msg.method === 'string';

/** Discriminator between the success and error variants of a response. */
export const isJsonRpcErrorResponse = (
  msg: JsonRpcSuccessResponse | JsonRpcErrorResponse,
): msg is JsonRpcErrorResponse => 'error' in msg;

/**
 * The `params` shape of a `notify_status_update` notification: a 2-tuple of
 * `[status, eventtime]`. Validated structurally — we don't deeply inspect the
 * status object's contents (consumers do that based on what they subscribed to).
 */
export const isStatusUpdateParams = (value: unknown): value is [PrinterStatus, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'object' &&
  value[0] !== null &&
  typeof value[1] === 'number';
