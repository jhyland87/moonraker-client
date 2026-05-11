import { EventEmitter } from 'node:events';

/**
 * Stand-in for the `ws` package's `WebSocket` class. Tests `vi.mock('ws')`
 * the module to swap the real implementation for this one.
 *
 * Captures every instance constructed (in {@link FakeWebSocket.instances}) so
 * tests can drive the lifecycle manually:
 *
 * ```ts
 * vi.mock('ws', () => ({ default: FakeWebSocket }));
 * const client = new MoonrakerClient(config);
 * FakeWebSocket.instances[0].simulateOpen();
 * FakeWebSocket.instances[0].simulateMessage({ jsonrpc: '2.0', id: 1, result: 'ok' });
 * ```
 */
export class FakeWebSocket extends EventEmitter {
  static instances: FakeWebSocket[] = [];
  static reset(): void {
    FakeWebSocket.instances.length = 0;
  }

  readyState = 0; // CONNECTING
  url: string;
  options: unknown;
  sent: Buffer[] = [];

  constructor(url: string, options?: unknown) {
    super();
    this.url = url;
    this.options = options;
    FakeWebSocket.instances.push(this);
  }

  send(data: Buffer, cb?: (err?: Error) => void): void {
    this.sent.push(data);
    cb?.();
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3; // CLOSED
    this.emit('close', code ?? 1000, Buffer.from(reason ?? ''));
  }

  terminate(): void {
    this.readyState = 3;
    this.emit('close', 1006, Buffer.from(''));
  }

  // --- test driver helpers --------------------------------------------------

  /** Move the socket to OPEN and emit `'open'`. */
  simulateOpen(): void {
    this.readyState = 1; // OPEN
    this.emit('open');
  }

  /** Emit a `'message'` event with a JSON-stringified payload. */
  simulateMessage(payload: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(payload)));
  }

  /** Emit a raw `'message'` (used to test parse-error handling). */
  simulateRawMessage(raw: string): void {
    this.emit('message', Buffer.from(raw));
  }

  simulateError(err: Error): void {
    this.emit('error', err);
  }

  simulatePing(): void {
    this.emit('ping', Buffer.alloc(0));
  }

  /** Read and parse the most recent payload the client sent. */
  lastSentPayload<T = Record<string, unknown>>(): T {
    const last = this.sent[this.sent.length - 1];
    if (!last) throw new Error('no payloads sent');
    return JSON.parse(last.toString()) as T;
  }
}
