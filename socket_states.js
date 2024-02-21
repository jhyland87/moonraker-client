// Enumerator for simple websocket states
// https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
const SOCKET_STATES = {
  CONNECTING : 0, // Socket has been created. The connection is not yet open.
  OPEN       : 1, // The connection is open and ready to communicate.
  CLOSING    : 2, // The connection is in the process of closing.
  CLOSED     : 3  // The connection is closed or couldn't be opened.
}

const STATE_DESCRIPTIONS = [
  'Socket has been created. The connection is not yet open.',
  'The connection is open and ready to communicate.',
  'The connection is in the process of closing.',
  'The connection is closed or could not be opened.'
]

// Reverse mapping index
SOCKET_STATES.properties = Object.fromEntries(
  Object.entries(SOCKET_STATES).map(a => a.reverse())
)

// Reverse mapping fn
SOCKET_STATES.fromState = value => SOCKET_STATES.properties[value]


export default SOCKET_STATES