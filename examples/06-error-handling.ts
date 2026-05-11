/**
 * 06 — Error handling.
 *
 * JSON-RPC error replies reject the request promise with a `MoonrakerError`
 * carrying the numeric `code` and optional `data` payload from the server.
 * Transport / parse failures reject with a plain `Error`.
 *
 * Use `instanceof MoonrakerError` to distinguish.
 *
 * Run with:
 *   pnpm example examples/06-error-handling.ts
 */
import { MoonrakerClient, MoonrakerError } from '../src/index';
import { config } from './_config';

const client = new MoonrakerClient(config);

client.on('open', async () => {
  try {
    // This method doesn't exist — Moonraker will reply with a JSON-RPC error.
    await client.request('this.method.does.not.exist');
  } catch (err) {
    if (err instanceof MoonrakerError) {
      console.log('JSON-RPC error:');
      console.log('  code:   ', err.code);
      console.log('  message:', err.message);
      if (err.data !== undefined) console.log('  data:   ', err.data);
    } else {
      console.log('transport error:', err);
    }
  }

  client.close();
});

client.on('error', (err) => {
  // Connection-level errors arrive here, not as rejected requests.
  console.error('connection error:', err.message);
  process.exit(1);
});

client.on('close', () => process.exit(0));
