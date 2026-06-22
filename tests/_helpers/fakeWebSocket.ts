import { EventEmitter } from 'node:events';

import { type SocketStateValue } from '../../src/socket-states';

/**
 * Stand-in for a `SocketLike` transport, injected via the client's
 * `socketFactory` option. Mirrors the native-WebSocket-shaped surface the
 * client depends on (string frames, string close reason).
 *
 * Captures every instance constructed (in {@link FakeWebSocket.instances}) so
 * tests can drive the lifecycle manually:
 *
 * ```ts
 * const client = new MoonrakerClient(config, {
 *   socketFactory: (url) => new FakeWebSocket(url),
 * });
 * FakeWebSocket.instances[0].simulateOpen();
 * FakeWebSocket.instances[0].simulateMessage({ jsonrpc: '2.0', id: 1, result: 'ok' });
 * ```
 */
export class FakeWebSocket extends EventEmitter {
  static instances: FakeWebSocket[] = [];
  static reset(): void {
    FakeWebSocket.instances.length = 0;
  }

  readyState: SocketStateValue = 0; // CONNECTING
  url: string;
  options: unknown;
  sent: string[] = [];

  constructor(url: string, options?: unknown) {
    super();
    this.url = url;
    this.options = options;
    FakeWebSocket.instances.push(this);
  }

  send(data: string, cb?: (err?: Error) => void): void {
    this.sent.push(data);
    cb?.();
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3; // CLOSED
    this.emit('close', code ?? 1000, reason ?? '');
  }

  terminate(): void {
    this.readyState = 3;
    this.emit('close', 1006, '');
  }

  // --- test driver helpers --------------------------------------------------

  /** Move the socket to OPEN and emit `'open'`. */
  simulateOpen(): void {
    this.readyState = 1; // OPEN
    this.emit('open');
  }

  /** Emit a `'message'` event with a JSON-stringified payload. */
  simulateMessage(payload: unknown): void {
    this.emit('message', JSON.stringify(payload));
  }

  /** Emit a raw `'message'` (used to test parse-error handling). */
  simulateRawMessage(raw: string): void {
    this.emit('message', raw);
  }

  simulateError(err: Error): void {
    this.emit('error', err);
  }

  simulatePing(): void {
    this.emit('ping');
  }

  /** Read and parse the most recent payload the client sent. */
  lastSentPayload<T = Record<string, unknown>>(): T {
    const last = this.sent[this.sent.length - 1];
    if (last === undefined) throw new Error('no payloads sent');
    return JSON.parse(last) as T;
  }
}
