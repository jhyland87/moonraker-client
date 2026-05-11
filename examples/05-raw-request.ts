/**
 * 05 — Generic JSON-RPC request with a typed response.
 *
 * `request<T>(method, params)` is the escape hatch for any Moonraker method
 * that isn't covered by a dedicated wrapper. Pass a type argument and you
 * get autocompletion on the resolved value.
 *
 * Run with:
 *   pnpm example examples/05-raw-request.ts
 */
import { MoonrakerClient } from '../src/index';
import { config } from './_config';

interface PrinterInfo {
  readonly state: string;
  readonly state_message: string;
  readonly hostname: string;
  readonly software_version: string;
  readonly cpu_info: string;
  readonly klipper_path: string;
  readonly python_path: string;
  readonly log_file: string;
  readonly config_file: string;
}

const client = new MoonrakerClient(config);

client.on('open', async () => {
  // Typed request — TS knows the shape of `info`.
  const info = await client.request<PrinterInfo>('printer.info');
  console.log(`Klipper ${info.software_version} on ${info.hostname}`);
  console.log(`state: ${info.state} (${info.state_message.trim()})`);

  // Untyped request — the result is `unknown`, narrow as needed.
  const sysInfo = await client.request('machine.system_info');
  console.log('machine.system_info:', sysInfo);

  client.close();
});

client.on('error', (err) => {
  console.error('error:', err.message);
  process.exit(1);
});

client.on('close', () => process.exit(0));
