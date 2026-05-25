/**
 * Shallow runtime type guards for the database endpoint responses. Used at
 * the {@link DatabaseAPI} boundary so that any malformed payload turns into
 * a {@link MoonrakerError} thrown by the caller's `await`, instead of
 * silently flowing through an `as` cast.
 *
 * The guards intentionally validate top-level shape only — `DatabaseValue`
 * is arbitrary JSON and can't be checked further without a schema.
 * @source
 */
import type {
  DatabaseBackupResult,
  DatabaseCompactResult,
  DatabaseDebugListResult,
  DatabaseItemResult,
  DatabaseListResult,
  DatabaseRestoreResult,
  DatabaseTableResult,
  DatabaseTableRow,
} from '../types/database';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');

/**
 * True when `value` matches {@link DatabaseListResult}: an object with
 * `namespaces: string[]` and `backups: string[]`.
 * @source
 */
export const isDatabaseListResult = (value: unknown): value is DatabaseListResult =>
  isRecord(value) && isStringArray(value.namespaces) && isStringArray(value.backups);

/**
 * True when `value` matches {@link DatabaseItemResult}: an object with a
 * string `namespace`, a key (string, array of strings, or null), and a
 * `value` property of any type.
 * @source
 */
export const isDatabaseItemResult = (value: unknown): value is DatabaseItemResult => {
  if (!isRecord(value)) return false;
  if (typeof value.namespace !== 'string') return false;
  if (!('value' in value)) return false;
  const { key } = value;
  return key === null || typeof key === 'string' || isStringArray(key);
};

/**
 * True when `value` matches {@link DatabaseCompactResult}: numeric
 * `previous_size` and `new_size` fields (bytes).
 * @source
 */
export const isDatabaseCompactResult = (value: unknown): value is DatabaseCompactResult =>
  isRecord(value) &&
  typeof value.previous_size === 'number' &&
  typeof value.new_size === 'number';

/**
 * True when `value` matches {@link DatabaseBackupResult}: a string
 * `backup_path` field.
 * @source
 */
export const isDatabaseBackupResult = (value: unknown): value is DatabaseBackupResult =>
  isRecord(value) && typeof value.backup_path === 'string';

/**
 * True when `value` matches {@link DatabaseRestoreResult}: string-array
 * `restored_tables` and `restored_namespaces` fields.
 * @source
 */
export const isDatabaseRestoreResult = (value: unknown): value is DatabaseRestoreResult =>
  isRecord(value) &&
  isStringArray(value.restored_tables) &&
  isStringArray(value.restored_namespaces);

/**
 * True when `value` matches {@link DatabaseDebugListResult}: the public
 * list shape plus a `tables: string[]` field.
 * @source
 */
export const isDatabaseDebugListResult = (
  value: unknown,
): value is DatabaseDebugListResult =>
  isRecord(value) &&
  isStringArray(value.namespaces) &&
  isStringArray(value.backups) &&
  isStringArray(value.tables);

const isDatabaseTableRow = (value: unknown): value is DatabaseTableRow => isRecord(value);

/**
 * True when `value` matches {@link DatabaseTableResult}: a string
 * `table_name` and an array of row objects.
 * @source
 */
export const isDatabaseTableResult = (value: unknown): value is DatabaseTableResult =>
  isRecord(value) &&
  typeof value.table_name === 'string' &&
  Array.isArray(value.rows) &&
  value.rows.every(isDatabaseTableRow);
