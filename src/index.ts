/**
 * @fileoverview Public entry point for the moonraker-client library.
 *
 * Re-exports the JSON-RPC websocket client, its error type, runtime
 * type guards, socket-state helpers, and every public type. Consumers
 * should import from this module (`'@jhyland87/moonraker-client'`)
 * rather than reaching into the individual files — those are
 * implementation details and may move.
 *
 * @example
 * Construct a client, query, and shut down:
 * ```ts
 * import { MoonrakerClient } from '@jhyland87/moonraker-client';
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
 * ```
 */

export { MoonrakerClient, parseFanSettings } from './client';
export { MoonrakerError } from './errors';
export {
  isGcodeResponseParams,
  isJsonRpcErrorResponse,
  isJsonRpcMessage,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isProcStatUpdateParams,
  isStatusUpdateParams,
} from './guards';
export { SocketState, describeSocketState } from './socket-states';
export type { SocketStateValue } from './socket-states';
export type { MoonrakerEvents } from './events';
export type {
  ClientConfig,
  ConnectionConfig,
  FanDescriptor,
  FanDiscovery,
  FanSectionType,
  FileEntry,
  GcodeFileMetadata,
  GcodeMetadataMap,
  GcodeThumbnail,
  HeaterStatus,
  JsonRpcErrorPayload,
  JsonRpcErrorResponse,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  PrinterObjectSpec,
  PrinterStatus,
  SubscribeResult,
  TemperatureStore,
  TemperatureStoreSensor,
} from './types';
