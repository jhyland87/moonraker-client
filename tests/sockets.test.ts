import { afterEach, describe, expect, it, vi } from 'vitest';

import { NativeWebSocketAdapter, defaultSocketFactory } from '../src';

/**
 * Minimal stand-in for the DOM `WebSocket`, recording listeners so tests can
 * dispatch synthetic events and assert the adapter forwards them.
 */
class StubWebSocket {
  static last: StubWebSocket | undefined;
  readyState = 0;
  url: string;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | undefined;
  private readonly listeners: Record<string, ((ev: unknown) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    StubWebSocket.last = this;
  }

  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }

  dispatch(type: string, ev?: unknown): void {
    for (const cb of this.listeners[type] ?? []) cb(ev);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    this.readyState = 3;
  }
}

const withStubGlobal = (): StubWebSocket => {
  vi.stubGlobal('WebSocket', StubWebSocket as unknown as typeof WebSocket);
  return StubWebSocket.last as StubWebSocket;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NativeWebSocketAdapter', () => {
  it('forwards open / message / close to .on listeners', () => {
    vi.stubGlobal('WebSocket', StubWebSocket as unknown as typeof WebSocket);
    const adapter = new NativeWebSocketAdapter('ws://host/websocket');
    const stub = StubWebSocket.last!;

    const open = vi.fn();
    const message = vi.fn();
    const close = vi.fn();
    adapter.on('open', open);
    adapter.on('message', message);
    adapter.on('close', close);

    stub.dispatch('open');
    stub.dispatch('message', { data: '{"jsonrpc":"2.0"}' });
    stub.dispatch('close', { code: 1006, reason: 'gone' });

    expect(open).toHaveBeenCalledOnce();
    expect(message).toHaveBeenCalledWith('{"jsonrpc":"2.0"}');
    expect(close).toHaveBeenCalledWith(1006, 'gone');
  });

  it('synthesizes an Error for the error event', () => {
    vi.stubGlobal('WebSocket', StubWebSocket as unknown as typeof WebSocket);
    const adapter = new NativeWebSocketAdapter('ws://host/websocket');
    const stub = StubWebSocket.last!;
    const error = vi.fn();
    adapter.on('error', error);
    stub.dispatch('error');
    expect(error).toHaveBeenCalledWith(expect.any(Error));
  });

  it('send writes through and invokes the completion callback', () => {
    vi.stubGlobal('WebSocket', StubWebSocket as unknown as typeof WebSocket);
    const adapter = new NativeWebSocketAdapter('ws://host/websocket');
    const stub = StubWebSocket.last!;
    const cb = vi.fn();
    adapter.send('hello', cb);
    expect(stub.sent).toEqual(['hello']);
    expect(cb).toHaveBeenCalledWith();
  });

  it('terminate maps to close()', () => {
    vi.stubGlobal('WebSocket', StubWebSocket as unknown as typeof WebSocket);
    const adapter = new NativeWebSocketAdapter('ws://host/websocket');
    const stub = StubWebSocket.last!;
    adapter.terminate();
    expect(stub.closed).toBeDefined();
  });
});

describe('defaultSocketFactory', () => {
  it('returns a NativeWebSocketAdapter when a global WebSocket exists', () => {
    withStubGlobal();
    const socket = defaultSocketFactory('ws://host/websocket');
    expect(socket).toBeInstanceOf(NativeWebSocketAdapter);
  });

  it('throws a helpful error when no global WebSocket exists', () => {
    vi.stubGlobal('WebSocket', undefined);
    expect(() => defaultSocketFactory('ws://host/websocket')).toThrow(/socketFactory/);
  });
});
