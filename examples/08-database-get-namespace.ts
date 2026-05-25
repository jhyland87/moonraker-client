/**
 * 08 — Get an entire database namespace.
 *
 * Calls `client.database.getItem(namespace)` with no key, which fetches
 * the whole namespace as a single JSON object. Override the namespace
 * via the `MOONRAKER_NS` environment variable; defaults to
 * `gcode_metadata` (always present on a running Moonraker).
 *
 * Run with:
 *   pnpm example examples/08-database-get-namespace.ts
 *   MOONRAKER_NS=mainsail pnpm example examples/08-database-get-namespace.ts
 */
import { MoonrakerClient } from '../src/index';
import { config } from './_config';

const namespace = process.env.MOONRAKER_NS ?? 'gcode_metadata';
const client = new MoonrakerClient(config);

client.on('open', async () => {
  console.log(`fetching namespace "${namespace}" ...`);

  const item = await client.database.getItem(namespace);
  console.log(`namespace: ${item.namespace}`);
  console.log(`key:       ${JSON.stringify(item.key)}`);
  console.log('value:', item.value);

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
