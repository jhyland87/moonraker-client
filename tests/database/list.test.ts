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

describe('client.database.list()', () => {
  it('sends server.database.list with no params and returns the parsed result', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.database.list();

    const sent = ws.lastSentPayload<{ id: number; method: string; params?: unknown }>();
    expect(sent.method).toBe('server.database.list');
    expect(sent.params).toBeUndefined();

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { namespaces: ['gcode_metadata', 'mainsail'], backups: ['sqldb-backup-20260101000000.db'] },
    });

    await expect(promise).resolves.toEqual({
      namespaces: ['gcode_metadata', 'mainsail'],
      backups: ['sqldb-backup-20260101000000.db'],
    });
  });

  it('rejects with MoonrakerError when the response shape is wrong', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.list();
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({ jsonrpc: '2.0', id: sent.id, result: { wrong: 'shape' } });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('server.database.list'),
    });
  });

  it('rejects with MoonrakerError when the server returns a JSON-RPC error', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.list();
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      error: { code: -32603, message: 'Internal error' },
    });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({ code: -32603, message: 'Internal error' });
  });

  it('exposes the same DatabaseAPI instance across accesses (lazy cache)', () => {
    const { client } = setup();
    expect(client.database).toBe(client.database);
  });
});
