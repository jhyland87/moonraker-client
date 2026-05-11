/**
 * 01 — Server info.
 *
 * The minimal example: connect, request `server.info`, print, disconnect.
 * Demonstrates the connect / open / close lifecycle and a single request.
 *
 * Run with:
 *   pnpm example examples/01-server-info.ts
 */
import { MoonrakerClient } from '../src/index';
import { config } from './_config';

const client = new MoonrakerClient(config);

client.on('open', async () => {
  console.log(`connected to ${client.config.server}:${client.config.port}`);

  const info = await client.getServerInfo();
  console.log('server.info:', info);

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
