/**
 * Const-object mirror of the WebSocket spec's `readyState` enumeration.
 * Used by {@link MoonrakerClient.readyState} so callers don't have to
 * import the `ws` package directly.
 *
 * @example
 * ```ts
 * import { MoonrakerClient, SocketState } from 'moonraker-client';
 *
 * if (client.readyState === SocketState.OPEN) {
 *   await client.request('printer.info');
 * }
 * ```
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
 * @source
 */
export const SocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/**
 * Numeric union of the four valid {@link SocketState} values
 * (`0 | 1 | 2 | 3`). Returned by `client.readyState` and accepted by
 * {@link describeSocketState}.
 *
 * @example
 * ```ts
 * const s: SocketStateValue = client.readyState;
 * console.log(describeSocketState(s));
 * ```
 * @source
 */
export type SocketStateValue = (typeof SocketState)[keyof typeof SocketState];

/**
 * Human-readable description for each {@link SocketStateValue}.
 */
const DESCRIPTIONS: Record<SocketStateValue, string> = {
  [SocketState.CONNECTING]: 'Socket has been created. The connection is not yet open.',
  [SocketState.OPEN]: 'The connection is open and ready to communicate.',
  [SocketState.CLOSING]: 'The connection is in the process of closing.',
  [SocketState.CLOSED]: 'The connection is closed or could not be opened.',
};

/**
 * Look up the human-readable description for a given socket state.
 *
 * @param state - A {@link SocketStateValue} (typically
 *   `client.readyState`).
 * @returns The matching English description.
 *
 * @example
 * ```ts
 * console.log(describeSocketState(client.readyState));
 * // → "The connection is open and ready to communicate."
 * ```
 * @source
 */
export const describeSocketState = (state: SocketStateValue): string => DESCRIPTIONS[state];
