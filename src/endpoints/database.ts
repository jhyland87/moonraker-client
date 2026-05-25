/**
 * Sub-client for Moonraker's database endpoints, exposed on a
 * {@link MoonrakerClient} instance as `client.database`. Splits the
 * `server.database.*` family (and the `debug.database.*` family) out of
 * the main class so it can grow without bloating {@link MoonrakerClient}.
 *
 * Every method delegates to {@link MoonrakerClient.request}, which means
 * every call rides the **already-open WebSocket** — no separate HTTP
 * client or new transport is involved.
 *
 * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/ | Moonraker Database API}
 * @source
 */
import type { MoonrakerClient } from '../client';
import { MoonrakerError } from '../errors';
import {
  isDatabaseBackupResult,
  isDatabaseCompactResult,
  isDatabaseDebugListResult,
  isDatabaseItemResult,
  isDatabaseListResult,
  isDatabaseRestoreResult,
  isDatabaseTableResult,
} from '../guards/database';
import type {
  DatabaseBackupResult,
  DatabaseCompactResult,
  DatabaseDebugListResult,
  DatabaseItemResult,
  DatabaseKey,
  DatabaseListResult,
  DatabaseRestoreResult,
  DatabaseTableResult,
  DatabaseValue,
} from '../types/database';

/**
 * JSON-RPC error code attached to {@link MoonrakerError}s raised when a
 * response fails a type guard. `-32000` is the conventional "generic
 * server error" slot in the JSON-RPC reserved range; we reuse it here so
 * callers can distinguish "the server replied with garbage" from a real
 * server-side error without inventing a new error class.
 * @source
 */
const MALFORMED_RESPONSE_CODE = -32000;

/**
 * Build the {@link MoonrakerError} thrown when a database response fails
 * its shallow shape check. The raw payload is attached to `error.data`.
 * @source
 */
const malformedResponse = (method: string, raw: unknown): MoonrakerError =>
  new MoonrakerError(`Malformed response from ${method}`, MALFORMED_RESPONSE_CODE, raw);

/**
 * Build the `{ namespace, key? }` params object expected by the
 * `*.get_item` and `*.delete_item` methods. Key is only included when
 * supplied; passing it as `undefined` would still serialize as the
 * property being present in JSON.
 * @source
 */
const itemParams = (namespace: string, key?: DatabaseKey): Record<string, unknown> => {
  const params: Record<string, unknown> = { namespace };
  if (key !== undefined) params.key = key;
  return params;
};

/**
 * Sub-client for the `/debug/database/*` endpoints. Exposed as
 * `client.database.debug`. These calls **require Moonraker to be running
 * with debug mode enabled** (see Moonraker's `[server]` config). They
 * can read and modify reserved namespaces and inspect raw SQL tables,
 * which is unsafe outside development.
 *
 * @remarks
 * Modifying protected namespaces outside of Moonraker can result in
 * broken functionality and is not supported. Use these endpoints only
 * for diagnostics and tooling.
 *
 * @example
 * ```ts
 * const dump = await client.database.debug.listAll();
 * console.log(dump.tables); // SQL tables backing the database
 *
 * const job = await client.database.debug.getTable('job_history');
 * console.log(job.rows.length);
 * ```
 *
 * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#debug-endpoints | Moonraker debug database endpoints}
 * @source
 */
export class DatabaseDebugAPI {
  readonly #client: MoonrakerClient;

  /**
   * @param client - The owning {@link MoonrakerClient}. The debug API
   *   reuses the client's open websocket for every request.
   * @source
   */
  constructor(client: MoonrakerClient) {
    this.#client = client;
  }

  /**
   * List every namespace, backup file, and underlying SQL table. The
   * response is a superset of {@link DatabaseAPI.list} — reserved
   * namespaces are included.
   *
   * @returns A promise resolving to {@link DatabaseDebugListResult}.
   * @throws {@link MoonrakerError} if the server errors or returns a
   *   malformed payload.
   *
   * @example
   * ```ts
   * const { namespaces, tables } = await client.database.debug.listAll();
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#debug-list-database-info | Debug: List Database Info}
   * @source
   */
  async listAll(): Promise<DatabaseDebugListResult> {
    const method = 'debug.database.list';
    const raw = await this.#client.request(method);
    if (!isDatabaseDebugListResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Read an item — or a whole namespace — including reserved namespaces.
   *
   * @param namespace - Target namespace.
   * @param key - Optional dot-separated path or array of segments. Omit
   *   to fetch the entire namespace.
   * @returns A promise resolving to {@link DatabaseItemResult}.
   * @throws {@link MoonrakerError} if the key is missing or the response
   *   is malformed.
   *
   * @example
   * ```ts
   * const item = await client.database.debug.getItem('moonraker', 'database_version');
   * console.log(item.value);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#debug-get-database-item | Debug: Get Database Item}
   * @source
   */
  async getItem(namespace: string, key?: DatabaseKey): Promise<DatabaseItemResult> {
    const method = 'debug.database.get_item';
    const raw = await this.#client.request(method, itemParams(namespace, key));
    if (!isDatabaseItemResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Write an item, including into reserved namespaces.
   *
   * @remarks
   * Modifying protected namespaces outside of Moonraker can result in
   * broken functionality and is not supported.
   *
   * @param namespace - Target namespace (created if missing).
   * @param key - Dot-separated path or array of segments. Parent fields
   *   are created as needed; existing values are overwritten.
   * @param value - Any JSON-serializable value.
   * @returns A promise resolving to {@link DatabaseItemResult} echoing
   *   the stored value.
   * @throws {@link MoonrakerError} on a server error or malformed response.
   *
   * @example
   * ```ts
   * await client.database.debug.addItem('my_namespace', ['nested', 'key'], 42);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#debug-add-database-item | Debug: Add Database Item}
   * @source
   */
  async addItem(
    namespace: string,
    key: DatabaseKey,
    value: DatabaseValue,
  ): Promise<DatabaseItemResult> {
    const method = 'debug.database.post_item';
    const raw = await this.#client.request(method, { namespace, key, value });
    if (!isDatabaseItemResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Delete an item, including from reserved namespaces. Empty namespaces
   * are removed automatically.
   *
   * @remarks
   * Modifying protected namespaces outside of Moonraker can result in
   * broken functionality and is not supported.
   *
   * @param namespace - Target namespace.
   * @param key - Dot-separated path or array of segments.
   * @returns A promise resolving to {@link DatabaseItemResult} echoing
   *   the removed value.
   * @throws {@link MoonrakerError} if the key does not exist or the
   *   response is malformed.
   *
   * @example
   * ```ts
   * await client.database.debug.deleteItem('my_namespace', 'temp');
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#debug-delete-database-item | Debug: Delete Database Item}
   * @source
   */
  async deleteItem(namespace: string, key: DatabaseKey): Promise<DatabaseItemResult> {
    const method = 'debug.database.delete_item';
    const raw = await this.#client.request(method, { namespace, key });
    if (!isDatabaseItemResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Dump every row in an underlying SQL table. The row id column may be
   * aliased (e.g. `job_id` on `job_history`).
   *
   * @param table - The SQL table name (see {@link listAll | listAll().tables}).
   * @returns A promise resolving to {@link DatabaseTableResult}.
   * @throws {@link MoonrakerError} if the table is unknown or the
   *   response is malformed.
   *
   * @example
   * ```ts
   * const { rows } = await client.database.debug.getTable('job_history');
   * console.log(`recorded jobs: ${rows.length}`);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#debug-get-database-table | Debug: Get Database Table}
   * @source
   */
  async getTable(table: string): Promise<DatabaseTableResult> {
    const method = 'debug.database.table';
    const raw = await this.#client.request(method, { table });
    if (!isDatabaseTableResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }
}

/**
 * Sub-client for the public `/server/database/*` endpoints. Exposed as
 * `client.database`. Provides namespaced read/write of arbitrary JSON
 * values plus admin operations (compact, backup, restore).
 *
 * @remarks
 * Every call goes out on the {@link MoonrakerClient}'s existing
 * websocket — no extra connection is opened. The
 * {@link DatabaseAPI.debug | debug} property exposes the
 * `debug.database.*` family for diagnostics.
 *
 * @example
 * Basic read/write:
 * ```ts
 * await client.database.addItem('my_app', 'lastRun', Date.now());
 * const item = await client.database.getItem('my_app', 'lastRun');
 * console.log(item.value);
 * ```
 *
 * @example
 * List, then back up:
 * ```ts
 * const { namespaces } = await client.database.list();
 * const { backup_path } = await client.database.backup();
 * console.log(`backed up ${namespaces.length} namespaces to ${backup_path}`);
 * ```
 *
 * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/ | Moonraker Database API}
 * @source
 */
export class DatabaseAPI {
  readonly #client: MoonrakerClient;
  #debugApi?: DatabaseDebugAPI;

  /**
   * @param client - The owning {@link MoonrakerClient}. All requests are
   *   issued via `client.request(...)` over its open websocket.
   * @source
   */
  constructor(client: MoonrakerClient) {
    this.#client = client;
  }

  /**
   * Access the `debug.database.*` endpoints. Lazily constructed on first
   * read so a client that never touches debug pays nothing extra.
   *
   * @returns The {@link DatabaseDebugAPI} sub-client.
   *
   * @example
   * ```ts
   * const tables = (await client.database.debug.listAll()).tables;
   * ```
   * @source
   */
  get debug(): DatabaseDebugAPI {
    this.#debugApi ??= new DatabaseDebugAPI(this.#client);
    return this.#debugApi;
  }

  /**
   * List every namespace and on-disk backup file accessible via the
   * public endpoints. Reserved namespaces are included but cannot be
   * modified through {@link addItem} / {@link deleteItem}.
   *
   * @returns A promise resolving to {@link DatabaseListResult}.
   * @throws {@link MoonrakerError} on a server error or malformed response.
   *
   * @example
   * ```ts
   * const { namespaces, backups } = await client.database.list();
   * console.log(`namespaces: ${namespaces.join(', ')}`);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#list-database-info | List Database Info}
   * @source
   */
  async list(): Promise<DatabaseListResult> {
    const method = 'server.database.list';
    const raw = await this.#client.request(method);
    if (!isDatabaseListResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Read an item — or a whole namespace — from the database.
   *
   * @param namespace - Target namespace.
   * @param key - Optional dot-separated path (`'a.b.c'`) or array of
   *   segments (`['a', 'b', 'c']`). Use the array form when a segment
   *   contains a literal dot. Omit to fetch the entire namespace.
   * @returns A promise resolving to {@link DatabaseItemResult}.
   * @throws {@link MoonrakerError} if the key is not found or the
   *   response is malformed.
   *
   * @example
   * Fetch a single value:
   * ```ts
   * const item = await client.database.getItem('gcode_metadata', 'last_print');
   * console.log(item.value);
   * ```
   *
   * @example
   * Fetch an entire namespace:
   * ```ts
   * const ns = await client.database.getItem('mainsail');
   * console.log(ns.value); // whole namespace object
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#get-database-item | Get Database Item}
   * @source
   */
  async getItem(namespace: string, key?: DatabaseKey): Promise<DatabaseItemResult> {
    const method = 'server.database.get_item';
    const raw = await this.#client.request(method, itemParams(namespace, key));
    if (!isDatabaseItemResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Insert or overwrite a value in the database. Creates the namespace
   * and any parent fields as needed.
   *
   * @param namespace - Target namespace (created if missing).
   * @param key - Dot-separated path or array of segments. Parent fields
   *   are created automatically; an existing value at the key is
   *   overwritten.
   * @param value - Any JSON-serializable value.
   * @returns A promise resolving to {@link DatabaseItemResult} echoing
   *   the stored value.
   * @throws {@link MoonrakerError} on a server error or malformed response.
   *
   * @example
   * ```ts
   * await client.database.addItem('my_app', 'lastRun', { ts: Date.now() });
   * ```
   *
   * @example
   * Array key form (use when a segment contains a literal dot):
   * ```ts
   * await client.database.addItem('my_app', ['user.profile', 'name'], 'Justin');
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#add-database-item | Add Database Item}
   * @source
   */
  async addItem(
    namespace: string,
    key: DatabaseKey,
    value: DatabaseValue,
  ): Promise<DatabaseItemResult> {
    const method = 'server.database.post_item';
    const raw = await this.#client.request(method, { namespace, key, value });
    if (!isDatabaseItemResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Delete an item from the database. Empty namespaces are removed
   * automatically.
   *
   * @param namespace - Target namespace.
   * @param key - Dot-separated path or array of segments. Required.
   * @returns A promise resolving to {@link DatabaseItemResult} echoing
   *   the removed value.
   * @throws {@link MoonrakerError} if the key does not exist or the
   *   response is malformed.
   *
   * @example
   * ```ts
   * const removed = await client.database.deleteItem('my_app', 'lastRun');
   * console.log('removed:', removed.value);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#delete-database-item | Delete Database Item}
   * @source
   */
  async deleteItem(namespace: string, key: DatabaseKey): Promise<DatabaseItemResult> {
    const method = 'server.database.delete_item';
    const raw = await this.#client.request(method, { namespace, key });
    if (!isDatabaseItemResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Compact (vacuum) the database file. Returns the byte sizes before
   * and after, so the caller can report how much space was reclaimed.
   *
   * @remarks
   * Rejected by Moonraker while Klipper is actively printing.
   *
   * @returns A promise resolving to {@link DatabaseCompactResult}.
   * @throws {@link MoonrakerError} on a server error or malformed response.
   *
   * @example
   * ```ts
   * const { previous_size, new_size } = await client.database.compact();
   * console.log(`reclaimed ${previous_size - new_size} bytes`);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#compact-database | Compact Database}
   * @source
   */
  async compact(): Promise<DatabaseCompactResult> {
    const method = 'server.database.compact';
    const raw = await this.#client.request(method);
    if (!isDatabaseCompactResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Snapshot the database to a backup file under
   * `<data_path>/backup/database/`. If `filename` is omitted Moonraker
   * uses `sqldb-backup-<YYYYMMDDhhmmss>.db`.
   *
   * @remarks
   * Rejected by Moonraker while Klipper is actively printing.
   *
   * @param filename - Optional override for the backup filename.
   * @returns A promise resolving to {@link DatabaseBackupResult} with the
   *   absolute on-disk path.
   * @throws {@link MoonrakerError} on a server error or malformed response.
   *
   * @example
   * ```ts
   * const { backup_path } = await client.database.backup();
   * console.log('wrote backup to', backup_path);
   * ```
   *
   * @example
   * With an explicit filename:
   * ```ts
   * await client.database.backup('before-upgrade.db');
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#backup-database | Backup Database}
   * @source
   */
  async backup(filename?: string): Promise<DatabaseBackupResult> {
    const method = 'server.database.post_backup';
    const params = filename !== undefined ? { filename } : undefined;
    const raw = await this.#client.request(method, params);
    if (!isDatabaseBackupResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Delete a backup file previously created with {@link backup}.
   *
   * @param filename - Name of a file listed under
   *   `(await client.database.list()).backups`.
   * @returns A promise resolving to {@link DatabaseBackupResult} with the
   *   absolute path that was removed.
   * @throws {@link MoonrakerError} if the file does not exist or the
   *   response is malformed.
   *
   * @example
   * ```ts
   * await client.database.deleteBackup('sqldb-backup-20260101000000.db');
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#delete-backup | Delete Backup}
   * @source
   */
  async deleteBackup(filename: string): Promise<DatabaseBackupResult> {
    const method = 'server.database.delete_backup';
    const raw = await this.#client.request(method, { filename });
    if (!isDatabaseBackupResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }

  /**
   * Restore the database from a backup file. Moonraker restarts
   * immediately after sending the response, so the websocket will close.
   *
   * @remarks
   * Rejected by Moonraker while Klipper is actively printing.
   *
   * @param filename - Name of a file under
   *   `<data_path>/backup/database/`.
   * @returns A promise resolving to {@link DatabaseRestoreResult} listing
   *   which tables and namespaces were repopulated.
   * @throws {@link MoonrakerError} on a server error or malformed response.
   *
   * @example
   * ```ts
   * const { restored_namespaces } = await client.database.restore(
   *   'sqldb-backup-20260101000000.db',
   * );
   * console.log('restored:', restored_namespaces);
   * ```
   *
   * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/#restore-database | Restore Database}
   * @source
   */
  async restore(filename: string): Promise<DatabaseRestoreResult> {
    const method = 'server.database.restore';
    const raw = await this.#client.request(method, { filename });
    if (!isDatabaseRestoreResult(raw)) throw malformedResponse(method, raw);
    return raw;
  }
}
