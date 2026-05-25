/**
 * 07 — List database namespaces and backups.
 *
 * Calls `client.database.list()` (mapped to JSON-RPC
 * `server.database.list`) and prints the discovered namespaces and
 * on-disk backup files.
 *
 * Run with:
 *   pnpm example examples/07-database-list.ts
 */
import { MoonrakerClient } from '../src/index';
import { config } from './_config';

const client = new MoonrakerClient(config);

client.on('open', async () => {
  console.log(`connected to ${client.config.server}:${client.config.port}`);

  const { namespaces, backups } = await client.database.list();
  console.log(`namespaces (${namespaces.length}):`, namespaces);
  console.log(`backups    (${backups.length}):`, backups);

  client.close();
});

client.on('error', (err) => {
  console.error('error:', err.message);
  process.exit(1);
});

client.on('close', () => {
  console.log('disconnected');
  process.exit(0);
});
