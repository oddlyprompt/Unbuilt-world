/** Node-only project storage: one folder per project, atomic writes, numbered history. */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { migrateProject } from './migrate';
import { ProjectSchema, type Project } from './schema';
import { nowIso } from './util';

export const PROJECT_FILE = 'project.json';

export class ProjectLoadError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
  }
}

export async function loadProject(dir: string): Promise<Project> {
  const file = path.join(dir, PROJECT_FILE);
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (e) {
    throw new ProjectLoadError(`Cannot read ${file}: ${(e as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ProjectLoadError(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  const migrated = migrateProject(raw);
  const parsed = ProjectSchema.safeParse(migrated);
  if (!parsed.success) {
    const first = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ProjectLoadError(`${file} does not match the project schema: ${first}`, parsed.error.issues);
  }
  return parsed.data;
}

async function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

/** Validate, bump the revision, snapshot the previous file into .history/, write atomically. */
export async function saveProject(dir: string, project: Project, opts: { keepHistory?: number; touch?: boolean } = {}): Promise<Project> {
  const next = ProjectSchema.parse({ ...project, ...(opts.touch === false ? {} : { updatedAt: nowIso(), revision: project.revision + 1 }) });
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, PROJECT_FILE);
  try {
    const prev = await fs.readFile(file, 'utf8');
    const hist = path.join(dir, '.history');
    await fs.mkdir(hist, { recursive: true });
    const prevRev = (JSON.parse(prev) as { revision?: number }).revision ?? 0;
    await fs.writeFile(path.join(hist, `rev-${String(prevRev).padStart(5, '0')}.json`), prev);
    const keep = opts.keepHistory ?? 60;
    const files = (await fs.readdir(hist)).filter((f) => f.startsWith('rev-')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) await fs.rm(path.join(hist, f));
  } catch {
    /* first save */
  }
  await writeAtomic(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}

export async function listHistory(dir: string): Promise<{ revision: number; file: string }[]> {
  try {
    const files = (await fs.readdir(path.join(dir, '.history'))).filter((f) => f.startsWith('rev-')).sort();
    return files.map((f) => ({ revision: Number(f.slice(4, 9)), file: f }));
  } catch {
    return [];
  }
}

export async function listProjects(root: string): Promise<{ id: string; dir: string; project?: Project; error?: string }[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries.sort()) {
    const dir = path.join(root, e);
    if (!(await fs.stat(dir).catch(() => null))?.isDirectory()) continue;
    if (!(await fs.stat(path.join(dir, PROJECT_FILE)).catch(() => null))) continue;
    try {
      out.push({ id: e, dir, project: await loadProject(dir) });
    } catch (err) {
      out.push({ id: e, dir, error: (err as Error).message });
    }
  }
  return out;
}

export async function sha256File(file: string): Promise<string> {
  const h = createHash('sha256');
  h.update(await fs.readFile(file));
  return h.digest('hex');
}

/** Resolve a project-relative path and refuse anything that escapes the project directory. */
export function safeJoin(dir: string, rel: string): string {
  const abs = path.resolve(dir, rel);
  const base = path.resolve(dir);
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error(`Path escapes the project: ${rel}`);
  return abs;
}
