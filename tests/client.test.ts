import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeWebSocket } from './_helpers/fakeWebSocket';

import { MoonrakerClient, MoonrakerError, SocketState } from '../src';
import type { ClientConfig } from '../src';

const baseConfig: ClientConfig = {
  // Default suite connects synchronously without a one-shot token fetch; the
  // token flow has its own dedicated tests below.
  API: { connection: { server: '127.0.0.1', port: 7125, oneshotToken: false } },
};

const setup = (overrides?: Partial<ClientConfig['API']['connection']>) => {
  const cfg: ClientConfig = {
    API: { connection: { ...baseConfig.API.connection, ...overrides } },
  };
  const client = new MoonrakerClient(cfg, {
    socketFactory: (url) => new FakeWebSocket(url),
  });
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
  return { client, ws };
};

beforeEach(() => {
  FakeWebSocket.reset();
});

afterEach(() => {
  // Drain any lingering error listeners we attached.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it('defaults port to 80 when omitted (elided from the URL as the ws default)', () => {
    const { ws } = setup({ port: undefined });
    expect(ws.url).toBe('ws://127.0.0.1/websocket');
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

describe('MoonrakerClient — high-level command wrappers', () => {
  const sentScript = (ws: FakeWebSocket): string =>
    ws.lastSentPayload<{ method: string; params: { script: string } }>().params.script;

  it('runGcode → printer.gcode.script with the raw script', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.runGcode('G28 X');
    const sent = ws.lastSentPayload<{ method: string; params: { script: string } }>();
    expect(sent.method).toBe('printer.gcode.script');
    expect(sent.params.script).toBe('G28 X');
  });

  it('emergencyStop → printer.emergency_stop', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.emergencyStop();
    expect(ws.lastSentPayload<{ method: string }>().method).toBe('printer.emergency_stop');
  });

  it.each([
    ['pausePrint', 'printer.print.pause'],
    ['resumePrint', 'printer.print.resume'],
    ['cancelPrint', 'printer.print.cancel'],
    ['restartFirmware', 'printer.firmware_restart'],
    ['restartKlippy', 'printer.restart'],
    ['restartServer', 'server.restart'],
  ] as const)('%s → %s', (method, rpc) => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void (client[method] as () => Promise<string>)();
    expect(ws.lastSentPayload<{ method: string }>().method).toBe(rpc);
  });

  it('setHeaterTemperature emits SET_HEATER_TEMPERATURE', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.setHeaterTemperature('extruder', 215);
    expect(sentScript(ws)).toBe('SET_HEATER_TEMPERATURE HEATER=extruder TARGET=215');
  });

  it('setFanSpeed picks the right gcode per fan kind', () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.setFanSpeed('fan', 1);
    expect(sentScript(ws)).toBe('M106 S255');

    void client.setFanSpeed('fan_generic exhaust', 0.5);
    expect(sentScript(ws)).toBe('SET_FAN_SPEED FAN=exhaust SPEED=0.5');

    void client.setFanSpeed('output_pin fan0', 0.25);
    expect(sentScript(ws)).toBe('SET_PIN PIN=fan0 VALUE=0.25');
  });

  it('setFanSpeed clamps to 0..1', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.setFanSpeed('fan', 5);
    expect(sentScript(ws)).toBe('M106 S255');
  });

  it('home → G28 (all) or per-axis', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.home();
    expect(sentScript(ws)).toBe('G28');
    void client.home(['x', 'y']);
    expect(sentScript(ws)).toBe('G28 X Y');
  });

  it('setVelocityLimits sends only provided fields', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.setVelocityLimits({ velocity: 300, accel: 3000 });
    expect(sentScript(ws)).toBe('SET_VELOCITY_LIMIT VELOCITY=300 ACCEL=3000');
  });

  it('setVelocityLimits throws when given nothing', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    expect(() => client.setVelocityLimits({})).toThrow(/no limit fields/i);
  });

  it('runMacro uppercases the name and KEY=VALUE params, quoting spaces', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.runMacro('load_filament', { temp: 220, name: 'cool blue' });
    expect(sentScript(ws)).toBe('LOAD_FILAMENT TEMP=220 NAME="cool blue"');
  });

  it('adjustGcodeOffsetZ → SET_GCODE_OFFSET Z_ADJUST … MOVE=1', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.adjustGcodeOffsetZ(-0.05);
    expect(sentScript(ws)).toBe('SET_GCODE_OFFSET Z_ADJUST=-0.05 MOVE=1');
  });
});

describe('MoonrakerClient — database + query wrappers', () => {
  it('getDatabaseItem → server.database.get_item and unwraps value', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.getDatabaseItem<{ a: number }>('helmsman', 'cfg');
    const sent = ws.lastSentPayload<{ id: number; method: string; params: unknown }>();
    expect(sent.method).toBe('server.database.get_item');
    expect(sent.params).toEqual({ namespace: 'helmsman', key: 'cfg' });
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { namespace: 'helmsman', key: 'cfg', value: { a: 1 } },
    });
    await expect(promise).resolves.toEqual({ a: 1 });
  });

  it('postDatabaseItem → server.database.post_item with namespace/key/value', () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    void client.postDatabaseItem('helmsman', 'dashboard', { layout: [] });
    const sent = ws.lastSentPayload<{ method: string; params: unknown }>();
    expect(sent.method).toBe('server.database.post_item');
    expect(sent.params).toEqual({
      namespace: 'helmsman',
      key: 'dashboard',
      value: { layout: [] },
    });
  });

  it('getWebcams → server.webcams.list and unwraps the array', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.getWebcams();
    const sent = ws.lastSentPayload<{ id: number; method: string }>();
    expect(sent.method).toBe('server.webcams.list');
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { webcams: [{ name: 'cam', stream_url: '/stream' }] },
    });
    await expect(promise).resolves.toEqual([{ name: 'cam', stream_url: '/stream' }]);
  });

  it('getMachineSystemInfo unwraps system_info', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.getMachineSystemInfo();
    const sent = ws.lastSentPayload<{ id: number; method: string }>();
    expect(sent.method).toBe('machine.system_info');
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { system_info: { provider: 'systemd_dbus' } },
    });
    await expect(promise).resolves.toEqual({ provider: 'systemd_dbus' });
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

describe('MoonrakerClient — one-shot token auth', () => {
  const mockFetch = (impl: (url: string, init?: RequestInit) => unknown): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => Promise.resolve(impl(url, init))),
    );
  };

  // openWithOneshotToken() is fire-and-forget; wait for the socket to appear.
  const waitForSocket = async (): Promise<FakeWebSocket> => {
    for (let i = 0; i < 50 && FakeWebSocket.instances.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const ws = FakeWebSocket.instances.at(-1);
    if (!ws) throw new Error('socket was never opened');
    return ws;
  };

  const connect = (overrides?: Partial<ClientConfig['API']['connection']>): MoonrakerClient =>
    new MoonrakerClient(
      { API: { connection: { server: '127.0.0.1', port: 7125, ...overrides } } },
      { socketFactory: (url) => new FakeWebSocket(url) },
    );

  it('fetches a token and appends it to the websocket URL by default', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve({ result: 'TOK123' }) }));
    connect();
    const ws = await waitForSocket();
    expect(ws.url).toBe('ws://127.0.0.1:7125/websocket?token=TOK123');
  });

  it('requests the oneshot_token endpoint, with X-Api-Key when configured', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => ({
      ok: true,
      json: () => Promise.resolve({ result: 'K' }),
    }));
    vi.stubGlobal('fetch', fetchImpl);
    connect({ apiKey: 'secret-key' });
    await waitForSocket();
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:7125/access/oneshot_token',
      { headers: { 'X-Api-Key': 'secret-key' } },
    );
  });

  it('falls back to a tokenless connection when the endpoint is unavailable', async () => {
    mockFetch(() => ({ ok: false, status: 404, json: () => Promise.resolve({}) }));
    connect();
    const ws = await waitForSocket();
    expect(ws.url).toBe('ws://127.0.0.1:7125/websocket');
  });

  it('connects tokenless on a network failure (then surfaces socket errors)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))));
    connect();
    const ws = await waitForSocket();
    expect(ws.url).toBe('ws://127.0.0.1:7125/websocket');
  });
});
