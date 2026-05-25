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

describe('client.database.backup()', () => {
  it('sends server.database.post_backup with no params when filename is omitted', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.database.backup();

    const sent = ws.lastSentPayload<{ id: number; method: string; params?: unknown }>();
    expect(sent.method).toBe('server.database.post_backup');
    expect(sent.params).toBeUndefined();

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { backup_path: '/data/backup/database/sqldb-backup-20260512000000.db' },
    });

    await expect(promise).resolves.toEqual({
      backup_path: '/data/backup/database/sqldb-backup-20260512000000.db',
    });
  });

  it('forwards an explicit filename', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    void client.database.backup('before-upgrade.db');
    const sent = ws.lastSentPayload<{ params: { filename: string } }>();
    expect(sent.params).toEqual({ filename: 'before-upgrade.db' });
  });

  it('rejects with MoonrakerError when the response is malformed', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.backup();
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({ jsonrpc: '2.0', id: sent.id, result: { wrong: 'shape' } });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('server.database.post_backup'),
    });
  });
});
