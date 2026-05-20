import type {
  JsonRpcErrorResponse,
  JsonRpcSuccessResponse,
  PrinterStatus,
} from './types';

/**
 * Strongly-typed event map for the MoonrakerClient EventEmitter.
 *
 * Lifecycle events: `open`, `close`, `error`.
 * Response events: `response:<id>` — emitted once per JSON-RPC reply.
 * Method events:   `method:<method>` — emitted for every server-pushed notification
 *                  (e.g. `method:notify_status_update`).
 * @source
 */
export interface MoonrakerEvents {
  open: [];
  close: [code: number | undefined, reason: string | undefined];
  error: [error: Error];
  'notify:status_update': [status: PrinterStatus, eventtime: number];
  'notify:gcode_response': [message: string];
  'notify:proc_stat_update': [stats: Record<string, unknown>];
  // String-indexed signals for dynamic response/method events
  [key: `response:${number}`]: [JsonRpcSuccessResponse | JsonRpcErrorResponse];
  [key: `method:${string}`]: [params: unknown];
}
