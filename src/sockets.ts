/**
 * @fileoverview Pluggable WebSocket transport for {@link MoonrakerClient}.
 *
 * The client talks to the socket through the small {@link SocketLike}
 * interface rather than a concrete WebSocket implementation. The default
 * factory ({@link defaultSocketFactory}) wraps the platform-global
 * `WebSocket` via {@link NativeWebSocketAdapter}, which works unmodified in
 * browsers, Chrome-extension service workers, and Node 22+ (all of which
 * expose a standard `WebSocket`). Tests and exotic runtimes can inject their
 * own factory through the client's constructor options.
 */
import { type SocketStateValue } from './socket-states';

/**
 * Payload delivered to a `'message'` listener. Moonraker only ever sends
 * UTF-8 JSON text frames, so this is normally a `string`; binary frames are
 * surfaced as-is for completeness and the client calls `.toString()` before
 * parsing.
 */
export type SocketData = string | ArrayBuffer | ArrayBufferView;

/**
 * The minimal socket surface {@link MoonrakerClient} depends on. Modeled on
 * the subset of the Node `ws` API the client historically used, so existing
 * test doubles keep working: an `EventEmitter`-style `.on`, a `send` that
 * takes an optional completion callback, and `close`/`terminate`.
 */
export interface SocketLike {
  /** WebSocket-spec `readyState` (`0` CONNECTING … `3` CLOSED). */
  readonly readyState: SocketStateValue;

  /** Subscribe to the connection lifecycle / inbound frames. */
  on(event: 'open', listener: () => void): void;
  on(event: 'message', listener: (data: SocketData) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  on(event: 'close', listener: (code: number, reason: string) => void): void;
  on(event: 'ping', listener: () => void): void;

  /**
   * Send a text frame. The optional callback mirrors `ws`'s signature and is
   * invoked once the frame has been handed to the transport (or with an error
   * if the send threw).
   */
  send(data: string, cb?: (err?: Error) => void): void;

  /** Initiate a graceful close. */
  close(code?: number, reason?: string): void;

  /** Force the socket shut immediately (no close handshake). */
  terminate(): void;
}

/**
 * Constructs a {@link SocketLike} for a given URL. The `protocols` argument
 * is accepted for parity with the WebSocket constructor; the default adapter
 * ignores it.
 */
export type SocketFactory = (url: string, protocols?: string | string[]) => SocketLike;

/**
 * Adapts the platform-global `WebSocket` (browser / service worker / Node 22+)
 * to {@link SocketLike}.
 *
 * Notes on the impedance mismatch with the old `ws`-based path:
 * - The standard `WebSocket` has no `terminate()`; {@link terminate} maps to a
 *   plain `close()`.
 * - Browsers don't surface protocol-level `ping` frames, so `'ping'` listeners
 *   never fire. This is harmless: the client's heartbeat is reset on *any*
 *   inbound traffic (and Moonraker streams notifications continuously), so it
 *   never relied on ping frames for liveness.
 * - The `error` event carries no useful detail in the DOM API, so a generic
 *   `Error` is synthesized.
 */
export class NativeWebSocketAdapter implements SocketLike {
  private readonly ws: WebSocket;

  constructor(url: string, protocols?: string | string[]) {
    this.ws = new WebSocket(url, protocols);
  }

  get readyState(): SocketStateValue {
    // The DOM `WebSocket.readyState` is typed `number` but is spec-guaranteed
    // to be one of 0..3 — assert it to the narrower union at this boundary.
    return this.ws.readyState as SocketStateValue;
  }

  on(event: 'open', listener: () => void): void;
  on(event: 'message', listener: (data: SocketData) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  on(event: 'close', listener: (code: number, reason: string) => void): void;
  on(event: 'ping', listener: () => void): void;
  on(event: string, listener: (...args: never[]) => void): void {
    switch (event) {
      case 'open':
        this.ws.addEventListener('open', () => (listener as () => void)());
        return;
      case 'message':
        this.ws.addEventListener('message', (ev: MessageEvent) => {
          (listener as (data: SocketData) => void)(ev.data as SocketData);
        });
        return;
      case 'error':
        this.ws.addEventListener('error', () => {
          (listener as (err: Error) => void)(new Error('WebSocket transport error'));
        });
        return;
      case 'close':
        this.ws.addEventListener('close', (ev: CloseEvent) => {
          (listener as (code: number, reason: string) => void)(ev.code, ev.reason);
        });
        return;
      case 'ping':
        // Standard WebSocket never surfaces ping frames; intentionally a no-op.
        return;
      default:
        return;
    }
  }

  send(data: string, cb?: (err?: Error) => void): void {
    try {
      this.ws.send(data);
      cb?.();
    } catch (err) {
      cb?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  terminate(): void {
    this.ws.close();
  }
}

/**
 * Default {@link SocketFactory}: wraps the platform-global `WebSocket`.
 *
 * @throws Error if no global `WebSocket` exists (e.g. Node < 22 with no
 *   polyfill) — inject a custom `socketFactory` in that case.
 */
export const defaultSocketFactory: SocketFactory = (url, protocols) => {
  if (typeof WebSocket === 'undefined') {
    throw new Error(
      'No global WebSocket available; pass a socketFactory in the client options',
    );
  }
  return new NativeWebSocketAdapter(url, protocols);
};
