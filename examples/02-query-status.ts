/**
 * 02 — One-shot status query.
 *
 * Read the current temperatures of the extruder and heater bed via
 * `printer.objects.query`. No subscription — single round trip.
 *
 * Demonstrates the three spec shapes accepted by `queryObjects`:
 *   - object: name → fields to fetch
 *   - array : list of names (all fields each)
 *   - string: one name (all fields)
 *
 * Run with:
 *   pnpm example examples/02-query-status.ts
 */
import { MoonrakerClient } from '../src/index';
import { config } from './_config';

const client = new MoonrakerClient(config);

client.on('open', async () => {
  // Pick specific fields per object.
  const detailed = await client.queryObjects({
    extruder: ['temperature', 'target', 'power'],
    heater_bed: ['temperature', 'target', 'power'],
  });
  console.log('extruder:  ', detailed.status.extruder);
  console.log('heater_bed:', detailed.status.heater_bed);

  // Array form — all fields of each object listed.
  const broad = await client.queryObjects(['toolhead', 'print_stats']);
  console.log('print_stats.state:', broad.status.print_stats?.state);

  client.close();
});

client.on('error', (err) => {
  console.error('error:', err.message);
  process.exit(1);
});

client.on('close', () => process.exit(0));
