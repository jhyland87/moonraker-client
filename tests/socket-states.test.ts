import { describe, expect, it } from 'vitest';

import { SocketState, describeSocketState } from '../src/socket-states';

describe('SocketState', () => {
  it('matches the standard WebSocket readyState values', () => {
    expect(SocketState.CONNECTING).toBe(0);
    expect(SocketState.OPEN).toBe(1);
    expect(SocketState.CLOSING).toBe(2);
    expect(SocketState.CLOSED).toBe(3);
  });
});

describe('describeSocketState', () => {
  it('returns a human description for each state', () => {
    expect(describeSocketState(SocketState.CONNECTING)).toMatch(/not yet open/i);
    expect(describeSocketState(SocketState.OPEN)).toMatch(/ready to communicate/i);
    expect(describeSocketState(SocketState.CLOSING)).toMatch(/closing/i);
    expect(describeSocketState(SocketState.CLOSED)).toMatch(/closed/i);
  });
});
