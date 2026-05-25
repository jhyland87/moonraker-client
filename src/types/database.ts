/**
 * Types for the Moonraker database endpoints (`server.database.*` and the
 * `debug.database.*` variants). Each shape mirrors the JSON payloads
 * documented in the Moonraker reference.
 *
 * @see {@link https://moonraker.readthedocs.io/en/latest/external_api/database/ | Moonraker Database API}
 * @source
 */

/**
 * Path to a value within a namespace. Moonraker accepts either a
 * dot-separated string (`'foo.bar.baz'`) or an array of segments
 * (`['foo', 'bar', 'baz']`). Use the array form when a segment itself
 * contains a literal dot.
 * @source
 */
export type DatabaseKey = string | readonly string[];

/**
 * Database values are arbitrary JSON — strings, numbers, booleans, arrays,
 * objects, or `null`. The client surfaces them as `unknown` so callers
 * narrow with their own type guards or schemas.
 * @source
 */
export type DatabaseValue = unknown;

/**
 * Result of `server.database.list` — every accessible namespace plus the
 * list of on-disk backup files. Reserved namespaces are included in
 * `namespaces` but cannot be modified via the non-debug endpoints.
 * @source
 */
export interface DatabaseListResult {
  readonly namespaces: readonly string[];
  readonly backups: readonly string[];
}

/**
 * Result of `server.database.get_item` / `post_item` / `delete_item` (and
 * their debug variants). `key` echoes back the input form: a string when
 * the request used dot-notation, an array when it used segments, or `null`
 * when the whole namespace was requested.
 * @source
 */
export interface DatabaseItemResult {
  readonly namespace: string;
  readonly key: DatabaseKey | null;
  readonly value: DatabaseValue;
}

/**
 * Result of `server.database.compact`. Sizes are reported in bytes.
 * @source
 */
export interface DatabaseCompactResult {
  readonly previous_size: number;
  readonly new_size: number;
}

/**
 * Result of `server.database.post_backup` and `delete_backup`. The path is
 * absolute and points into `<data_path>/backup/database/`.
 * @source
 */
export interface DatabaseBackupResult {
  readonly backup_path: string;
}

/**
 * Result of `server.database.restore`. Lists the tables and namespaces that
 * were repopulated from the backup file. Moonraker restarts immediately
 * after responding.
 * @source
 */
export interface DatabaseRestoreResult {
  readonly restored_tables: readonly string[];
  readonly restored_namespaces: readonly string[];
}

/**
 * Result of `debug.database.list`. Extends the public list result with
 * the underlying SQL table names (only exposed when debug mode is on).
 * @source
 */
export interface DatabaseDebugListResult extends DatabaseListResult {
  readonly tables: readonly string[];
}

/**
 * A single row from `debug.database.table`. Column names depend on the
 * table; values are arbitrary JSON.
 * @source
 */
export interface DatabaseTableRow {
  readonly [column: string]: unknown;
}

/**
 * Result of `debug.database.table`. The `rowid` (or its alias, e.g.
 * `job_id`) is included as one of the row's columns.
 * @source
 */
export interface DatabaseTableResult {
  readonly table_name: string;
  readonly rows: readonly DatabaseTableRow[];
}
