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

describe('client.database.deleteItem()', () => {
  it('sends server.database.delete_item with namespace and key', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.database.deleteItem('my_app', 'lastRun');

    const sent = ws.lastSentPayload<{
      id: number;
      method: string;
      params: { namespace: string; key: string };
    }>();
    expect(sent.method).toBe('server.database.delete_item');
    expect(sent.params).toEqual({ namespace: 'my_app', key: 'lastRun' });

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { namespace: 'my_app', key: 'lastRun', value: 'old-value' },
    });

    await expect(promise).resolves.toEqual({
      namespace: 'my_app',
      key: 'lastRun',
      value: 'old-value',
    });
  });

  it('forwards an array key form', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.database.deleteItem('my_app', ['a', 'b', 'c']);
    const sent = ws.lastSentPayload<{ params: { key: string[] } }>();
    expect(sent.params.key).toEqual(['a', 'b', 'c']);
  });

  it('rejects when the server reports the key does not exist', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.deleteItem('my_app', 'gone');
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      error: { code: 404, message: 'Key not found' },
    });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({ code: 404 });
  });

  it('rejects with MoonrakerError when the response is malformed', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.deleteItem('ns', 'k');
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({ jsonrpc: '2.0', id: sent.id, result: 'not-an-item' });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('server.database.delete_item'),
    });
  });
});
