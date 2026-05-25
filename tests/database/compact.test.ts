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

describe('client.database.compact()', () => {
  it('sends server.database.compact with no params and returns the size delta', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.database.compact();

    const sent = ws.lastSentPayload<{ id: number; method: string; params?: unknown }>();
    expect(sent.method).toBe('server.database.compact');
    expect(sent.params).toBeUndefined();

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { previous_size: 1_000_000, new_size: 600_000 },
    });

    await expect(promise).resolves.toEqual({
      previous_size: 1_000_000,
      new_size: 600_000,
    });
  });

  it('rejects with MoonrakerError when the response is malformed', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.compact();
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { previous_size: '1MB', new_size: '600KB' },
    });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('server.database.compact'),
    });
  });

  it('propagates "Klipper is printing" server errors', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.compact();
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      error: { code: -32602, message: 'Cannot compact while printing' },
    });

    await expect(promise).rejects.toMatchObject({
      code: -32602,
      message: 'Cannot compact while printing',
    });
  });
});
