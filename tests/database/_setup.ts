/**
 * Shared test setup for the `tests/database/` suite.
 *
 * Each test file calls `vi.mock('ws', …)` at the top — that part can't be
 * extracted because `vi.mock` calls are hoisted per-file. After mocking
 * the `ws` module, files import `setup` from here to spin up a client
 * wired to a fresh {@link FakeWebSocket}.
 */
import { FakeWebSocket } from '../_helpers/fakeWebSocket';

import { MoonrakerClient } from '../../src';
import type { ClientConfig } from '../../src';

const baseConfig: ClientConfig = {
  API: { connection: { server: '127.0.0.1', port: 7125 } },
};

export const setup = (
  overrides?: Partial<ClientConfig['API']['connection']>,
): { client: MoonrakerClient; ws: FakeWebSocket } => {
  const cfg: ClientConfig = {
    API: { connection: { ...baseConfig.API.connection, ...overrides } },
  };
  const client = new MoonrakerClient(cfg);
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!ws) throw new Error('FakeWebSocket was not constructed — was ws mocked?');
  return { client, ws };
};
