/**
 * WebSocket readyState enumeration.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
 * @source
 */
export const SocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

export type SocketStateValue = (typeof SocketState)[keyof typeof SocketState];

const DESCRIPTIONS: Record<SocketStateValue, string> = {
  [SocketState.CONNECTING]: 'Socket has been created. The connection is not yet open.',
  [SocketState.OPEN]: 'The connection is open and ready to communicate.',
  [SocketState.CLOSING]: 'The connection is in the process of closing.',
  [SocketState.CLOSED]: 'The connection is closed or could not be opened.',
};

export const describeSocketState = (state: SocketStateValue): string => DESCRIPTIONS[state];
