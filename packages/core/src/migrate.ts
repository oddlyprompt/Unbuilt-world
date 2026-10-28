import { SCHEMA_VERSION } from './schema';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade FROM. A project file is migrated one step at a time
 * until it reaches SCHEMA_VERSION. Add an entry here whenever SCHEMA_VERSION is bumped.
 */
export const MIGRATIONS: Record<number, Migration> = {};

export function migrateProject(raw: unknown, migrations: Record<number, Migration> = MIGRATIONS, target = SCHEMA_VERSION): unknown {
  if (typeof raw !== 'object' || raw === null) throw new Error('Project file is not an object.');
  let cur = { ...(raw as Record<string, unknown>) };
  let v = typeof cur.schemaVersion === 'number' ? cur.schemaVersion : 0;
  if (v > target) throw new Error(`Project was saved by a newer version of the studio (schema ${v}, this build understands ${target}).`);
  while (v < target) {
    const step = migrations[v];
    if (!step) throw new Error(`No migration from schema ${v} to ${v + 1}.`);
    cur = step(cur);
    const next = cur.schemaVersion;
    if (typeof next !== 'number' || next <= v) throw new Error(`Migration from ${v} did not advance the schema version.`);
    v = next;
  }
  return cur;
}
