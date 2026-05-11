/**
 * 04 — Cached temperature history.
 *
 * Moonraker keeps a rolling 1Hz cache of every temperature object (~20 min
 * by default). Useful for seeding charts before any live updates arrive.
 *
 * Run with:
 *   pnpm example examples/04-temperature-store.ts
 */
import { MoonrakerClient } from '../src/index.js';
import { config } from './_config.js';

const client = new MoonrakerClient(config);

client.on('open', async () => {
  const store = await client.getTemperatureStore();

  console.log(`${Object.keys(store).length} sensors cached:`);
  for (const [name, sensor] of Object.entries(store)) {
    const last = sensor.temperatures[sensor.temperatures.length - 1];
    const target = sensor.targets?.[sensor.targets.length - 1];
    console.log(
      `  ${name.padEnd(36)} samples=${String(sensor.temperatures.length).padStart(4)}` +
        `  latest=${last?.toFixed(1) ?? '--'}°C` +
        (target !== undefined ? `  target=${target.toFixed(0)}°C` : ''),
    );
  }

  client.close();
});

client.on('error', (err) => {
  console.error('error:', err.message);
  process.exit(1);
});

client.on('close', () => process.exit(0));
