export interface ConnectionConfig {
  readonly server: string;
  readonly port?: number;
  readonly path?: string;
  readonly timeout?: number;
}

export interface ClientConfig {
  readonly API: {
    readonly connection: ConnectionConfig;
  };
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: number;
  params?: unknown;
}

export interface JsonRpcSuccessResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result: T;
}

export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number;
  error: JsonRpcErrorPayload;
}

export interface JsonRpcNotification<T = unknown> {
  jsonrpc: '2.0';
  method: string;
  params?: T;
}

export type JsonRpcMessage<T = unknown> =
  | JsonRpcSuccessResponse<T>
  | JsonRpcErrorResponse
  | JsonRpcNotification<T>;

/**
 * Spec for which printer objects (and which of their attributes) to query or
 * subscribe to. A null/undefined value means "all attributes for that object".
 *
 * See https://moonraker.readthedocs.io/en/latest/web_api/#query-printer-object-status
 * @source
 */
export type PrinterObjectSpec =
  | string
  | readonly string[]
  | Record<string, readonly string[] | null>;

export interface HeaterStatus {
  temperature: number;
  target: number;
  power: number;
}

export interface PrinterStatus {
  extruder?: Partial<HeaterStatus>;
  heater_bed?: Partial<HeaterStatus>;
  [object: string]: Record<string, unknown> | undefined;
}

export interface SubscribeResult {
  eventtime: number;
  status: PrinterStatus;
}

export interface NotifyStatusUpdateParams extends Array<unknown> {
  0: PrinterStatus;
  1: number;
}

/**
 * Per-sensor cache returned by `server.temperature_store`. Samples are recorded
 * at 1Hz; the most recent sample is the last element of each array. Non-heater
 * sensors (e.g. plain thermistors) omit `targets` and `powers`.
 *
 * @see https://moonraker.readthedocs.io/en/latest/web_api/#get-cached-temperature-data
 * @source
 */
export interface TemperatureStoreSensor {
  readonly temperatures: readonly number[];
  readonly targets?: readonly number[];
  readonly powers?: readonly number[];
}

export type TemperatureStore = Readonly<Record<string, TemperatureStoreSensor>>;
