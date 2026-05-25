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

describe('client.database.addItem()', () => {
  it('sends server.database.post_item with namespace, key, value', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.database.addItem('my_app', 'lastRun', { ts: 1700000000 });

    const sent = ws.lastSentPayload<{
      id: number;
      method: string;
      params: { namespace: string; key: string; value: unknown };
    }>();
    expect(sent.method).toBe('server.database.post_item');
    expect(sent.params).toEqual({
      namespace: 'my_app',
      key: 'lastRun',
      value: { ts: 1700000000 },
    });

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { namespace: 'my_app', key: 'lastRun', value: { ts: 1700000000 } },
    });

    await expect(promise).resolves.toEqual({
      namespace: 'my_app',
      key: 'lastRun',
      value: { ts: 1700000000 },
    });
  });

  it('forwards arbitrary JSON values (string, number, boolean, null, array)', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    for (const value of ['x', 42, true, null, [1, 2, 3]]) {
      void client.database.addItem('ns', 'k', value);
      const sent = ws.lastSentPayload<{ params: { value: unknown } }>();
      expect(sent.params.value).toEqual(value);
    }
  });

  it('rejects with MoonrakerError when the response is malformed', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.addItem('ns', 'k', 1);
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({ jsonrpc: '2.0', id: sent.id, result: { not_an_item: true } });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('server.database.post_item'),
    });
  });
});
