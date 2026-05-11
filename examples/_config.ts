/**
 * Shared configuration for the examples.
 *
 * Override the printer host with the `MOONRAKER_HOST` (and optionally
 * `MOONRAKER_PORT`) environment variables — e.g.:
 *
 *   MOONRAKER_HOST=192.168.1.50 pnpm example examples/01-server-info.ts
 */
import type { ClientConfig } from '../src/index';

export const config: ClientConfig = {
  API: {
    connection: {
      server: process.env.MOONRAKER_HOST ?? '192.168.0.96',
      port: process.env.MOONRAKER_PORT ? Number(process.env.MOONRAKER_PORT) : 7125,
      path: '/websocket',
      timeout: 1000,
    },
  },
};
