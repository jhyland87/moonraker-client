/**
 * 09 — Get a single database item.
 *
 * Calls `client.database.getItem(namespace, key)` to fetch one value.
 * The key supports both the dot-separated string form (`'foo.bar'`) and
 * the array form (`['foo', 'bar']`) — use the latter when a segment
 * itself contains a literal dot.
 *
 * Override the namespace and key via `MOONRAKER_NS` and
 * `MOONRAKER_KEY`. Defaults probe `moonraker / database_version`,
 * which exists on every running Moonraker instance.
 *
 * Run with:
 *   pnpm example examples/09-database-get-item.ts
 *   MOONRAKER_NS=my_app MOONRAKER_KEY=lastRun pnpm example examples/09-database-get-item.ts
 */
import { MoonrakerClient } from '../src/index';
import { config } from './_config';

const namespace = process.env.MOONRAKER_NS ?? 'moonraker';
const key = process.env.MOONRAKER_KEY ?? 'database_version';
const client = new MoonrakerClient(config);

client.on('open', async () => {
  console.log(`fetching ${namespace}.${key} ...`);

  const item = await client.database.getItem(namespace, key);
  console.log('namespace:', item.namespace);
  console.log('key:      ', item.key);
  console.log('value:    ', item.value);

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
