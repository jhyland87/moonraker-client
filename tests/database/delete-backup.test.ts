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

describe('client.database.deleteBackup()', () => {
  it('sends server.database.delete_backup with the filename', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();

    const promise = client.database.deleteBackup('sqldb-backup-20260101000000.db');

    const sent = ws.lastSentPayload<{
      id: number;
      method: string;
      params: { filename: string };
    }>();
    expect(sent.method).toBe('server.database.delete_backup');
    expect(sent.params).toEqual({ filename: 'sqldb-backup-20260101000000.db' });

    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      result: { backup_path: '/data/backup/database/sqldb-backup-20260101000000.db' },
    });

    await expect(promise).resolves.toEqual({
      backup_path: '/data/backup/database/sqldb-backup-20260101000000.db',
    });
  });

  it('rejects with MoonrakerError when the response is malformed', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.deleteBackup('x.db');
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({ jsonrpc: '2.0', id: sent.id, result: null });

    await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('server.database.delete_backup'),
    });
  });

  it('propagates a missing-file server error', async () => {
    const { client, ws } = setup();
    ws.simulateOpen();
    const promise = client.database.deleteBackup('missing.db');
    const sent = ws.lastSentPayload<{ id: number }>();
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: sent.id,
      error: { code: 404, message: 'Backup file not found' },
    });

    await expect(promise).rejects.toMatchObject({ code: 404, message: 'Backup file not found' });
  });
});
