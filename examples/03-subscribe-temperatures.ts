/**
 * 03 — Live temperature subscription.
 *
 * `subscribe` resolves with the initial snapshot. After that, Moonraker
 * pushes updates *only when values change* — they arrive as
 * `'notify:status_update'` events with `[status, eventtime]`.
 *
 * Run until Ctrl+C:
 *   pnpm example examples/03-subscribe-temperatures.ts
 */
import { MoonrakerClient } from '../src/index.js';
import { config } from './_config.js';

const client = new MoonrakerClient(config);

client.on('open', async () => {
  const initial = await client.subscribe({
    extruder: ['temperature', 'target'],
    heater_bed: ['temperature', 'target'],
  });
  console.log('initial snapshot:');
  console.log('  extruder:  ', initial.status.extruder);
  console.log('  heater_bed:', initial.status.heater_bed);
  console.log('listening for updates… (Ctrl+C to quit)');
});

client.on('notify:status_update', (status, eventtime) => {
  const ext = status.extruder?.temperature?.toFixed(1) ?? '--';
  const bed = status.heater_bed?.temperature?.toFixed(1) ?? '--';
  console.log(`[t=${eventtime.toFixed(2)}]  ext=${ext}°C  bed=${bed}°C`);
});

client.on('error', (err) => {
  console.error('error:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\nclosing…');
  client.close();
});

client.on('close', () => process.exit(0));
