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

describe('client.database.restore()', () => {
  it('sends server.database.restore with the filename and parses the lists', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.database.restore('sqldb-backup-20260101000000.db');

    const sent = ws.lastSentPayload<{
      id: number;
      method: string;
      params: { filename: string };
    }>();
    expect(sent.method).toBe('server.database.restore');
    expect(sent.params).toEqual({ filename: 'sqldb-backup-20260101000000.db' });

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: {
        restored_tables: ['namespace_storage', 'job_history'],
        restored_namespaces: ['mainsail', 'gcode_metadata'],
      },
    });

    await expect(promise).resolves.toEqual({
      restored_tables: ['namespace_storage', 'job_history'],
      restored_namespaces: ['mainsail', 'gcode_metadata'],
    });
  });

  it('rejects with MoonrakerError when the response is malformed', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.restore('x.db');
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { restored_tables: 'not-an-array', restored_namespaces: [] },
    });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('server.database.restore'),
    });
  });
});
