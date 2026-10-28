import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { redact } from '@uw/providers';
import type { JobSpec } from '../../worker/src/run-job';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Job {
  id: number;
  type: string;
  projectId: string;
  params: unknown;
  status: JobStatus;
  progress: number;
  stage: string;
  detail: Record<string, unknown>;
  log: string[];
  result?: Record<string, unknown>;
  error?: string;
  retryOf?: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

const HEAVY = new Set(['render']);

/** SQLite-backed job list with two lanes (heavy renders, light everything else) and child-process workers. */
export class JobManager {
  private db: DatabaseSync;
  private running = new Map<number, ChildProcess>();
  private cancelling = new Set<number>();
  private listeners = new Set<(j: Job) => void>();

  constructor(
    private dbFile: string,
    private projectDir: (projectId: string) => string,
    private workerEntry: string,
  ) {
    this.db = new DatabaseSync(dbFile);
    this.db.exec(`CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, project_id TEXT NOT NULL, params TEXT NOT NULL,
      status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '{}',
      log TEXT NOT NULL DEFAULT '[]', result TEXT, error TEXT, retry_of INTEGER, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT)`);
    // A job that was running when the server stopped did not finish; mark it so it can be retried (resumed).
    this.db.prepare(`UPDATE jobs SET status='failed', error='Interrupted: the studio stopped while this job was running. Retry to resume.', finished_at=? WHERE status IN ('running','queued')`).run(new Date().toISOString());
  }

  onUpdate(fn: (j: Job) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private row(r: Record<string, unknown>): Job {
    return {
      id: Number(r.id),
      type: String(r.type),
      projectId: String(r.project_id),
      params: JSON.parse(String(r.params)),
      status: r.status as JobStatus,
      progress: Number(r.progress),
      stage: String(r.stage),
      detail: JSON.parse(String(r.detail)),
      log: JSON.parse(String(r.log)),
      result: r.result ? JSON.parse(String(r.result)) : undefined,
      error: r.error ? String(r.error) : undefined,
      retryOf: r.retry_of ? Number(r.retry_of) : undefined,
      createdAt: String(r.created_at),
      startedAt: r.started_at ? String(r.started_at) : undefined,
      finishedAt: r.finished_at ? String(r.finished_at) : undefined,
    };
  }

  get(id: number): Job | undefined {
    const r = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return r ? this.row(r) : undefined;
  }

  list(projectId?: string, limit = 40): Job[] {
    const rows = (projectId ? this.db.prepare('SELECT * FROM jobs WHERE project_id=? ORDER BY id DESC LIMIT ?').all(projectId, limit) : this.db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT ?').all(limit)) as Record<string, unknown>[];
    return rows.map((r) => this.row(r));
  }

  enqueue(type: string, projectId: string, params: unknown, retryOf?: number): Job {
    const res = this.db.prepare('INSERT INTO jobs (type, project_id, params, status, created_at, retry_of) VALUES (?,?,?,?,?,?)').run(type, projectId, JSON.stringify(params ?? {}), 'queued', new Date().toISOString(), retryOf ?? null);
    const job = this.get(Number(res.lastInsertRowid))!;
    this.emit(job);
    queueMicrotask(() => this.pump());
    return job;
  }

  /** Is an identical queued or running job already there? Used to avoid duplicate work from double clicks. */
  findActive(type: string, projectId: string, params: unknown): Job | undefined {
    const key = JSON.stringify(params ?? {});
    return this.list(projectId, 60).find((j) => j.type === type && (j.status === 'queued' || j.status === 'running') && JSON.stringify(j.params) === key);
  }

  private update(id: number, patch: Partial<Record<string, unknown>>) {
    const keys = Object.keys(patch);
    this.db.prepare(`UPDATE jobs SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`).run(...(keys.map((k) => patch[k]) as (string | number | null)[]), id);
    const j = this.get(id);
    if (j) this.emit(j);
  }

  private emit(j: Job) {
    for (const l of this.listeners) l(j);
  }

  private lanesBusy() {
    let heavy = 0;
    let light = 0;
    for (const id of this.running.keys()) {
      const j = this.get(id);
      if (j && HEAVY.has(j.type)) heavy++;
      else light++;
    }
    return { heavy, light };
  }

  private pump() {
    const queued = this.db.prepare(`SELECT * FROM jobs WHERE status='queued' ORDER BY id`).all() as Record<string, unknown>[];
    for (const r of queued) {
      const job = this.row(r);
      const busy = this.lanesBusy();
      if (HEAVY.has(job.type) ? busy.heavy >= 1 : busy.light >= 1) continue;
      void this.start(job);
    }
  }

  private async start(job: Job) {
    const dir = this.projectDir(job.projectId);
    const specFile = path.join(dir, '.studio', `job-${job.id}.json`);
    await fs.mkdir(path.dirname(specFile), { recursive: true });
    await fs.writeFile(specFile, JSON.stringify({ type: job.type, dir, params: job.params } satisfies Record<string, unknown> as JobSpec));
    this.update(job.id, { status: 'running', started_at: new Date().toISOString() });
    const child = spawn(process.execPath, ['--import', 'tsx', '--disable-warning=ExperimentalWarning', this.workerEntry, specFile], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    this.running.set(job.id, child);
    const log: string[] = [];
    let result: { ok: boolean; result?: Record<string, unknown>; error?: string } | undefined;
    let buf = '';
    let lastWrite = 0;
    const flush = async (force = false) => {
      if (!force && Date.now() - lastWrite < 400) return;
      lastWrite = Date.now();
      this.update(job.id, { log: JSON.stringify(log.slice(-200)) });
    };
    child.stdout.on('data', async (d) => {
      buf += String(d);
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('@@')) continue;
        try {
          const m = JSON.parse(line.slice(2)) as Record<string, unknown>;
          if (m.type === 'log') {
            log.push(await redact(String(m.message)));
            void flush();
          } else if (m.type === 'progress') {
            const { type: _t, stage, fraction, ...detail } = m;
            this.update(job.id, { stage: String(stage), progress: Number(fraction), detail: JSON.stringify(detail) });
          } else if (m.type === 'result') {
            result = { ok: !!m.ok, result: m.result as Record<string, unknown> | undefined, error: m.error as string | undefined };
          }
        } catch {
          /* ignore malformed line */
        }
      }
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', async (code) => {
      this.running.delete(job.id);
      const wasCancelled = this.cancelling.delete(job.id);
      const status: JobStatus = wasCancelled ? 'cancelled' : result?.ok ? 'succeeded' : 'failed';
      const err = wasCancelled ? 'Cancelled.' : result?.ok ? undefined : await redact(result?.error ?? (stderr.trim().split('\n').slice(-3).join(' ') || `Worker exited with code ${code}.`));
      if (err) log.push(`ERROR: ${err}`);
      this.update(job.id, { status, progress: status === 'succeeded' ? 1 : this.get(job.id)?.progress ?? 0, result: result?.result ? JSON.stringify(result.result) : null, error: err ?? null, log: JSON.stringify(log.slice(-200)), finished_at: new Date().toISOString() });
      await fs.rm(specFile, { force: true });
      this.pump();
    });
    child.on('error', (e) => log.push(`Could not start worker: ${e.message}`));
  }

  cancel(id: number): boolean {
    const j = this.get(id);
    if (!j) return false;
    if (j.status === 'queued') {
      this.update(id, { status: 'cancelled', error: 'Cancelled.', finished_at: new Date().toISOString() });
      return true;
    }
    const child = this.running.get(id);
    if (!child) return false;
    this.cancelling.add(id);
    child.kill('SIGTERM');
    setTimeout(() => child.killed || child.kill('SIGKILL'), 5000).unref();
    return true;
  }

  retry(id: number): Job | undefined {
    const j = this.get(id);
    if (!j || (j.status !== 'failed' && j.status !== 'cancelled')) return undefined;
    return this.enqueue(j.type, j.projectId, j.params, id);
  }
}
