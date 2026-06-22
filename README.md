# moonraker-client

A strongly-typed JSON-RPC **WebSocket** client for a
[Moonraker](https://moonraker.readthedocs.io/) instance.

Works in **Node 22+ terminals/console programs** and in the **browser /
Chrome-extension service workers** — both expose a standard global
`WebSocket`, which the client uses by default. No `ws` dependency.

```ts
import { MoonrakerClient } from '@jhyland87/moonraker-client';

const client = new MoonrakerClient({
  API: { connection: { server: '192.168.0.96', port: 7125 } },
});

client.on('open', async () => {
  await client.subscribe({
    extruder: ['temperature', 'target'],
    heater_bed: ['temperature', 'target'],
  });
  console.log(await client.getServerInfo());
});

client.on('notify:status_update', (status, eventtime) => {
  console.log(eventtime, status.extruder?.temperature);
});
```

## Transport (pluggable socket)

By default the client wraps the platform-global `WebSocket`. For runtimes
without one (e.g. Node < 22), or for tests, inject a `socketFactory`:

```ts
import { MoonrakerClient, type SocketFactory } from '@jhyland87/moonraker-client';

const socketFactory: SocketFactory = (url) => new MyAdapter(url); // implements SocketLike
const client = new MoonrakerClient(cfg, { socketFactory });
```

`SocketLike`, `SocketFactory`, `NativeWebSocketAdapter`, and
`defaultSocketFactory` are all exported.

## Capabilities

- Low-level `request()` plus `subscribe` / `queryObjects` / `getObjectsList`.
- Typed convenience events: `open`, `close`, `error`,
  `notify:status_update`, `notify:gcode_response`, `notify:proc_stat_update`,
  and generic `method:<name>` / `response:<id>`.
- High-level commands: `runGcode`, `emergencyStop`,
  `pause/resume/cancelPrint`, `restartFirmware/Klippy/Server`,
  `setHeaterTemperature`, `setFanSpeed`, `home`, `setVelocityLimits`,
  `runMacro`, `adjustGcodeOffsetZ`, `startPrint`.
- Queries: `getServerInfo`, `getPrinterInfo`, `getTemperatureStore`,
  `getGcodeHelp`, `getGcodeStore`, `discoverFans`, `getFileMetadata`,
  `listFiles`, `getJobQueue`, `getHistory`, `getHistoryTotals`,
  `getMachineSystemInfo`, `getProcStats`, `getWebcams`, `getLogTail`.
- Database: `getDatabaseItem`, `postDatabaseItem`, `deleteDatabaseItem`,
  `listDatabaseNamespaces` (per-printer UI state à la Mainsail/Fluidd).

## ToDo

- Add a driver/adapter for other 3D-printer APIs (e.g. OctoPrint) behind a
  shared base interface.
- Improve heartbeat/reconnect robustness.
