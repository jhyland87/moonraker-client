/**
 * Error returned by {@link MoonrakerClient.request} when the server
 * replies with a JSON-RPC error payload. Surfaces both the human
 * `message` (inherited from `Error`) and the numeric `code` so callers
 * can branch on specific failure modes.
 *
 * The numeric `code` follows the JSON-RPC 2.0 convention; Moonraker
 * additionally exposes a small set of custom codes (see the Moonraker
 * docs for the catalog). `data` is an opaque server-defined payload —
 * narrow it locally if you know the shape your method returns.
 *
 * @example
 * Catching a request error:
 * ```ts
 * import { MoonrakerError } from 'moonraker-client';
 *
 * try {
 *   await client.request('printer.gcode.script', { script: 'G28' });
 * } catch (err) {
 *   if (err instanceof MoonrakerError) {
 *     console.error(`Moonraker rejected the command (code ${err.code}):`, err.message);
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @example
 * Inspecting the structured `data` field:
 * ```ts
 * if (err instanceof MoonrakerError && typeof err.data === 'object') {
 *   console.error('details:', err.data);
 * }
 * ```
 * @source
 */
export class MoonrakerError extends Error {
  /**
   * Always `'MoonrakerError'`. Overrides the default `'Error'` so
   * `instanceof`-less duck-type checks (e.g. `err.name === ...`) work.
   * @source
   */
  override readonly name = 'MoonrakerError';

  /**
   * JSON-RPC error code from the server. Stable per Moonraker
   * implementation; see the upstream docs for the mapping.
   * @source
   */
  readonly code: number;

  /**
   * Optional server-defined payload accompanying the error. Opaque to
   * the client; narrow at the call site if your method documents a
   * specific shape.
   * @source
   */
  readonly data?: unknown;

  /**
   * Construct a new `MoonrakerError`.
   *
   * @param message - Human-readable failure description (the server's
   *   `error.message`).
   * @param code - The JSON-RPC `error.code` integer.
   * @param data - Optional `error.data` payload (left as `unknown`).
   * @source
   */
  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
