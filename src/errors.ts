/**
 * Error returned by {@link MoonrakerClient.request} when the server replies
 * with a JSON-RPC error payload. The numeric `code` is the JSON-RPC error code
 * (Moonraker exposes a small set; see the Moonraker docs for meanings).
 */
export class MoonrakerError extends Error {
  override readonly name = 'MoonrakerError';
  readonly code: number;
  readonly data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
