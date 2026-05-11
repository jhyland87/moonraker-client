# Examples

Runnable TypeScript examples covering the main `moonraker-client` API.

## Running

Requires **Node.js ≥ 24** for native TypeScript execution with automatic
`.js → .ts` import resolution. No transpiler step needed. From the
`moonraker-client` directory:

```sh
pnpm install
pnpm example examples/01-server-info.ts
```

(`pnpm example` is just an alias for `node` — you can also run
`node examples/01-server-info.ts` directly.)

Override the printer host with environment variables:

```sh
MOONRAKER_HOST=192.168.1.50 MOONRAKER_PORT=7125 \
  pnpm example examples/01-server-info.ts
```

Default host is `192.168.0.96:7125` (see [`_config.ts`](./_config.ts)).

## Index

| # | File | What it shows |
|---|------|---------------|
| 01 | [`01-server-info.ts`](./01-server-info.ts) | Connect, single request, disconnect — the minimal client lifecycle. |
| 02 | [`02-query-status.ts`](./02-query-status.ts) | One-shot `printer.objects.query`, all three `spec` shapes. |
| 03 | [`03-subscribe-temperatures.ts`](./03-subscribe-temperatures.ts) | Live status subscription via `notify:status_update`. |
| 04 | [`04-temperature-store.ts`](./04-temperature-store.ts) | Fetch the rolling 1Hz temperature cache (~20 min of history). |
| 05 | [`05-raw-request.ts`](./05-raw-request.ts) | Generic `request<T>(method, params)` with a typed response. |
| 06 | [`06-error-handling.ts`](./06-error-handling.ts) | Distinguish `MoonrakerError` from transport errors. |

## Notes

- Examples import from `../src/index.js`. Node's TS runtime resolves the
  `.js` suffix back to the `.ts` source — consumers of the published
  package would write `from 'moonraker-client'` instead.
- The `_config.ts` helper underscore-prefix keeps it from being treated as
  an example itself.
- All examples exit cleanly on completion (or on Ctrl+C for the
  subscription example).
