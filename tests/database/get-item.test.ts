import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeWebSocket } from '../_helpers/fakeWebSocket';

vi.mock('ws', async () => {
  const { FakeWebSocket: Fake } = await import('../_helpers/fakeWebSocket');
  return { default: Fake };
});

import { MoonrakerError } from '../../src';
import { setup } from './_setup';

beforeEach(() => {
  FakeWebSocket.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('client.database.getItem()', () => {
  it('sends server.database.get_item with only namespace when key is omitted', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.database.getItem('gcode_metadata');

    const sent = ws.lastSentPayload<{
      id: number;
      method: string;
      params: { namespace: string; key?: unknown };
    }>();
    expect(sent.method).toBe('server.database.get_item');
    expect(sent.params).toEqual({ namespace: 'gcode_metadata' });
    expect('key' in sent.params).toBe(false);

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { namespace: 'gcode_metadata', key: null, value: { foo: 1 } },
    });

    await expect(promise).resolves.toEqual({
      namespace: 'gcode_metadata',
      key: null,
      value: { foo: 1 },
    });
  });

  it('forwards a string key through unchanged', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.database.getItem('my_app', 'lastRun');
    const sent = ws.lastSentPayload<{ params: { namespace: string; key: string } }>();
    expect(sent.params).toEqual({ namespace: 'my_app', key: 'lastRun' });
  });

  it('forwards an array key through unchanged', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.database.getItem('my_app', ['nested', 'deep.key']);
    const sent = ws.lastSentPayload<{ params: { namespace: string; key: string[] } }>();
    expect(sent.params).toEqual({ namespace: 'my_app', key: ['nested', 'deep.key'] });
  });

  it('rejects with MoonrakerError when the response is malformed', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.getItem('x', 'y');
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({ jsonrpc: '2.0', id: sent.id, result: { wrong: true } });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('server.database.get_item'),
    });
  });

  it('propagates a JSON-RPC server error', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.getItem('missing', 'nope');
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      error: { code: 404, message: 'Key not found' },
    });

    await expect(promise).rejects.toMatchObject({ code: 404, message: 'Key not found' });
  });
});
