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

describe('client.database.debug', () => {
  it('reuses the same DatabaseDebugAPI instance across accesses (lazy cache)', () => {
    const { client } = setup();
    expect(client.database.debug).toBe(client.database.debug);
  });

  describe('.listAll()', () => {
    it('sends debug.database.list and returns the parsed result including tables', async () => {
      const { client, ws } = setup();
      ws.simulateOpen();

      const promise = client.database.debug.listAll();

      const sent = ws.lastSentPayload<{ id: number; method: string; params?: unknown }>();
      expect(sent.method).toBe('debug.database.list');
      expect(sent.params).toBeUndefined();

      ws.simulateMessage({
        jsonrpc: '2.0',
        id: sent.id,
        result: {
          namespaces: ['gcode_metadata', 'moonraker'],
          backups: [],
          tables: ['namespace_storage', 'job_history'],
        },
      });

      await expect(promise).resolves.toEqual({
        namespaces: ['gcode_metadata', 'moonraker'],
        backups: [],
        tables: ['namespace_storage', 'job_history'],
      });
    });

    it('rejects when the response lacks the `tables` field', async () => {
      const { client, ws } = setup();
      ws.simulateOpen();
      const promise = client.database.debug.listAll();
      const sent = ws.lastSentPayload<{ id: number }>();
      ws.simulateMessage({
        jsonrpc: '2.0',
        id: sent.id,
        result: { namespaces: [], backups: [] },
      });

      await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
      await expect(promise).rejects.toMatchObject({
        message: expect.stringContaining('debug.database.list'),
      });
    });
  });

  describe('.getItem()', () => {
    it('sends debug.database.get_item without a key when omitted', async () => {
      const { client, ws } = setup();
      ws.simulateOpen();

      void client.database.debug.getItem('moonraker');
      const sent = ws.lastSentPayload<{ method: string; params: { namespace: string } }>();
      expect(sent.method).toBe('debug.database.get_item');
      expect(sent.params).toEqual({ namespace: 'moonraker' });
    });

    it('forwards a string key', async () => {
      const { client, ws } = setup();
      ws.simulateOpen();
      void client.database.debug.getItem('moonraker', 'database_version');
      const sent = ws.lastSentPayload<{
        params: { namespace: string; key: string };
      }>();
      expect(sent.params).toEqual({ namespace: 'moonraker', key: 'database_version' });
    });

    it('returns a parsed DatabaseItemResult', async () => {
      const { client, ws } = setup();
      ws.simulateOpen();
      const promise = client.database.debug.getItem('moonraker', 'database_version');
      const sent = ws.lastSentPayload<{ id: number }>();
      ws.simulateMessage({
        jsonrpc: '2.0',
        id: sent.id,
        result: { namespace: 'moonraker', key: 'database_version', value: 4 },
      });
      await expect(promise).resolves.toEqual({
        namespace: 'moonraker',
        key: 'database_version',
        value: 4,
      });
    });
  });

  describe('.addItem()', () => {
    it('sends debug.database.post_item with namespace, key, value', async () => {
      const { client, ws } = setup();
      ws.simulateOpen();
      void client.database.debug.addItem('moonraker', 'debug_flag', true);
      const sent = ws.lastSentPayload<{
        method: string;
        params: { namespace: string; key: string; value: unknown };
      }>();
      expect(sent.method).toBe('debug.database.post_item');
      expect(sent.params).toEqual({
        namespace: 'moonraker',
        key: 'debug_flag',
        value: true,
      });
    });
  });

  describe('.deleteItem()', () => {
    it('sends debug.database.delete_item with namespace and key', async () => {
      const { client, ws } = setup();
      ws.simulateOpen();
      void client.database.debug.deleteItem('moonraker', ['nested', 'key']);
      const sent = ws.lastSentPayload<{
        method: string;
        params: { namespace: string; key: string[] };
      }>();
      expect(sent.method).toBe('debug.database.delete_item');
      expect(sent.params).toEqual({ namespace: 'moonraker', key: ['nested', 'key'] });
    });
  });

  describe('.getTable()', () => {
    it('sends debug.database.table with the table name', async () => {
      const { client, ws } = setup();
      ws.simulateOpen();

      const promise = client.database.debug.getTable('job_history');

      const sent = ws.lastSentPayload<{
        id: number;
        method: string;
        params: { table: string };
      }>();
      expect(sent.method).toBe('debug.database.table');
      expect(sent.params).toEqual({ table: 'job_history' });

      ws.simulateMessage({
        jsonrpc: '2.0',
        id: sent.id,
        result: {
          table_name: 'job_history',
          rows: [
            { job_id: 1, filename: 'a.gcode' },
            { job_id: 2, filename: 'b.gcode' },
          ],
        },
      });

      await expect(promise).resolves.toEqual({
        table_name: 'job_history',
        rows: [
          { job_id: 1, filename: 'a.gcode' },
          { job_id: 2, filename: 'b.gcode' },
        ],
      });
    });

    it('rejects when rows is not an array', async () => {
      const { client, ws } = setup();
      ws.simulateOpen();
      const promise = client.database.debug.getTable('job_history');
      const sent = ws.lastSentPayload<{ id: number }>();
      ws.simulateMessage({
        jsonrpc: '2.0',
        id: sent.id,
        result: { table_name: 'job_history', rows: 'not-an-array' },
      });
      await expect(promise).rejects.toBeInstanceOf(MoonrakerError);
      await expect(promise).rejects.toMatchObject({
        message: expect.stringContaining('debug.database.table'),
      });
    });
  });
});
