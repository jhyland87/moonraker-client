import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeWebSocket } from './_helpers/fakeWebSocket';

vi.mock('ws', async () => {
  const { FakeWebSocket: Fake } = await import('./_helpers/fakeWebSocket');
  return { default: Fake };
});

import { MoonrakerClient, MoonrakerError, SocketState } from '../src';
import type { ClientConfig } from '../src';

const baseConfig: ClientConfig = {
  API: { connection: { server: '127.0.0.1', port: 7125 } },
};

const setup = (overrides?: Partial<ClientConfig['API']['connection']>) => {
  const cfg: ClientConfig = {
    API: { connection: { ...baseConfig.API.connection, ...overrides } },
  };
  const client = new MoonrakerClient(cfg);
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
  return { client, ws };
};

beforeEach(() => {
  FakeWebSocket.reset();
});

afterEach(() => {
  // Drain any lingering error listeners we attached.
  vi.restoreAllMocks();
});

describe('MoonrakerClient — construction', () => {
  it('throws when API.connection is missing', () => {
    expect(() => new MoonrakerClient({} as unknown as ClientConfig)).toThrow(
      /No API\.connection/,
    );
  });

  it('throws when the connection has no server', () => {
    expect(
      () => new MoonrakerClient({ API: { connection: {} } } as unknown as ClientConfig),
    ).toThrow(/no websocket server/i);
  });

  it('opens a websocket eagerly on construction', () => {
    setup();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('builds the websocket URL from config', () => {
    const { ws } = setup();
    expect(ws.url).toBe('ws://127.0.0.1:7125/websocket');
  });

  it('defaults port to 80 when omitted', () => {
    const { ws } = setup({ port: undefined });
    expect(ws.url).toBe('ws://127.0.0.1:80/websocket');
  });

  it('respects a custom path', () => {
    const { ws } = setup({ path: '/custom/ws' });
    expect(ws.url).toBe('ws://127.0.0.1:7125/custom/ws');
  });

  it('exposes the config through the `config` getter', () => {
    const { client } = setup();
    expect(client.config).toMatchObject({ server: '127.0.0.1', port: 7125 });
  });
});

describe('MoonrakerClient — connection state', () => {
  it('reports readyState from the underlying socket', () => {
    const { client, ws } = setup();
    expect(client.readyState).toBe(SocketState.CONNECTING);
    ws.simulateOpen();
    expect(client.readyState).toBe(SocketState.OPEN);
    expect(client.isOpen).toBe(true);
    ws.close();
    expect(client.readyState).toBe(SocketState.CLOSED);
    expect(client.isOpen).toBe(false);
  });
});

describe('MoonrakerClient — request()', () => {
  it('sends a JSON-RPC payload and resolves with the unwrapped result', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.request<{ version: string }>('server.info');

    const sent = ws.lastSentPayload<{ id: number; jsonrpc: string; method: string }>();
    expect(sent).toMatchObject({ jsonrpc: '2.0', method: 'server.info' });
    expect(typeof sent.id).toBe('number');

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { version: '1.2.3' },
    });

    await expect(promise).resolves.toEqual({ version: '1.2.3' });
  });

  it('includes params when provided', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.request('server.files.metadata', { filename: 'benchy.gcode' });
    const sent = ws.lastSentPayload<{ params: unknown }>();
    expect(sent.params).toEqual({ filename: 'benchy.gcode' });
  });

  it('omits params when not provided', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.request('server.info');
    const sent = ws.lastSentPayload<Record<string, unknown>>();
    expect(sent).not.toHaveProperty('params');
  });

  it('rejects with MoonrakerError when the server returns a JSON-RPC error', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.request('bad.method');
    const sent = ws.lastSentPayload<{ id: number }>();

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      error: { code: -32601, message: 'Method not found', data: { method: 'bad.method' } },
    });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({
      code: -32601,
      message: 'Method not found',
      data: { method: 'bad.method' },
    });
  });

  it('rejects when the socket is not yet open', async () => {
    const { client } = setup();
    // No simulateOpen — socket still CONNECTING
    await expect(client.request('server.info')).rejects.toThrow(/websocket not open/i);
  });

  it('issues unique ids for concurrent requests', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.request('a');
    void client.request('b');
    void client.request('c');

    const ids = ws.sent.map((b) => (JSON.parse(b.toString()) as { id: number }).id);
    expect(new Set(ids).size).toBe(3);
  });

  it('routes responses to the correct request by id', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const a = client.request<string>('a');
    const b = client.request<string>('b');

    const [idA, idB] = ws.sent.map((buf) => (JSON.parse(buf.toString()) as { id: number }).id);

    // Reply to B first, then A — promise routing must use ids, not order.
    ws.simulateMessage({ jsonrpc: '2.0', id: idB, result: 'b-result' });
    ws.simulateMessage({ jsonrpc: '2.0', id: idA, result: 'a-result' });

    await expect(a).resolves.toBe('a-result');
    await expect(b).resolves.toBe('b-result');
  });
});

describe('MoonrakerClient — subscribe / queryObjects spec normalization', () => {
  it('treats a bare string as { name: null }', () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.subscribe('toolhead');
    const sent = ws.lastSentPayload<{ params: { objects: unknown } }>();
    expect(sent.params.objects).toEqual({ toolhead: null });
  });

  it('treats an array as { name: null } for each entry', () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.queryObjects(['toolhead', 'print_stats']);
    const sent = ws.lastSentPayload<{ params: { objects: unknown } }>();
    expect(sent.params.objects).toEqual({ toolhead: null, print_stats: null });
  });

  it('passes a record spec through unchanged', () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.subscribe({
      extruder: ['temperature', 'target'],
      heater_bed: null,
    });
    const sent = ws.lastSentPayload<{ params: { objects: unknown } }>();
    expect(sent.params.objects).toEqual({
      extruder: ['temperature', 'target'],
      heater_bed: null,
    });
  });

  it('subscribe calls the correct JSON-RPC method', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.subscribe('toolhead');
    expect(ws.lastSentPayload<{ method: string }>().method).toBe('printer.objects.subscribe');
  });

  it('queryObjects calls the correct JSON-RPC method', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.queryObjects('toolhead');
    expect(ws.lastSentPayload<{ method: string }>().method).toBe('printer.objects.query');
  });

  it('unsubscribe sends an empty objects map', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.unsubscribe();
    const sent = ws.lastSentPayload<{ method: string; params: { objects: unknown } }>();
    expect(sent.method).toBe('printer.objects.subscribe');
    expect(sent.params.objects).toEqual({});
  });
});

describe('MoonrakerClient — lifecycle events', () => {
  it("emits 'open' when the socket opens", () => {
    const { client, ws } = setup();
    const handler = vi.fn();
    client.on('open', handler);
    ws.simulateOpen();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("emits 'close' with code and reason", () => {
    const { client, ws } = setup();
    const handler = vi.fn();
    client.on('close', handler);
    ws.close(1000, 'normal');
    expect(handler).toHaveBeenCalledWith(1000, 'normal');
  });

  it("emits 'error' for transport errors", () => {
    const { client, ws } = setup();
    const handler = vi.fn();
    client.on('error', handler);
    const err = new Error('socket dead');
    ws.simulateError(err);
    expect(handler).toHaveBeenCalledWith(err);
  });

  it("emits 'error' for unparseable incoming frames", () => {
    const { client, ws } = setup();
    const handler = vi.fn();
    client.on('error', handler);
    ws.simulateRawMessage('not json {');
    expect(handler).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('MoonrakerClient — convenience method wrappers', () => {
  it('getObjectsList → printer.objects.list', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.getObjectsList();
    expect(ws.lastSentPayload<{ method: string }>().method).toBe('printer.objects.list');
  });

  it('getServerInfo → server.info', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.getServerInfo();
    expect(ws.lastSentPayload<{ method: string }>().method).toBe('server.info');
  });

  it('getPrinterInfo → printer.info', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.getPrinterInfo();
    expect(ws.lastSentPayload<{ method: string }>().method).toBe('printer.info');
  });

  it('getTemperatureStore → server.temperature_store, no params by default', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.getTemperatureStore();
    const sent = ws.lastSentPayload<Record<string, unknown>>();
    expect(sent.method).toBe('server.temperature_store');
    expect(sent).not.toHaveProperty('params');
  });

  it('getTemperatureStore forwards include_monitors when supplied', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.getTemperatureStore({ includeMonitors: true });
    const sent = ws.lastSentPayload<{ params: { include_monitors: boolean } }>();
    expect(sent.params).toEqual({ include_monitors: true });
  });
});

describe('MoonrakerClient — close()', () => {
  it('closes the underlying socket with the provided code and reason', () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const handler = vi.fn();
    client.on('close', handler);
    client.close(4000, 'bye');

    expect(handler).toHaveBeenCalledWith(4000, 'bye');
  });
});

describe('MoonrakerClient — generic method:<name> events', () => {
  it('forwards arbitrary server notifications as method:<name>', () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const handler = vi.fn();
    client.on('method:notify_klippy_ready', handler);

    ws.simulateMessage({
      jsonrpc: '2.0',
      method: 'notify_klippy_ready',
      params: { state: 'ready' },
    });

    expect(handler).toHaveBeenCalledWith({ state: 'ready' });
  });
});

describe("MoonrakerClient — 'notify:status_update' convenience event", () => {
  it('fires with [status, eventtime] when a notify_status_update arrives', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const handler = vi.fn();
    client.on('notify:status_update', handler);

    ws.simulateMessage({
      jsonrpc: '2.0',
      method: 'notify_status_update',
      params: [{ extruder: { temperature: 200 } }, 12.34],
    });

    expect(handler).toHaveBeenCalledWith({ extruder: { temperature: 200 } }, 12.34);
  });

  it('does not fire when params are malformed', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const handler = vi.fn();
    client.on('notify:status_update', handler);

    ws.simulateMessage({
      jsonrpc: '2.0',
      method: 'notify_status_update',
      params: 'invalid',
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire for unrelated notification methods', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const handler = vi.fn();
    client.on('notify:status_update', handler);

    ws.simulateMessage({
      jsonrpc: '2.0',
      method: 'notify_klippy_ready',
      params: [],
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
