import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { timingSafeEqual } from 'node:crypto';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import {
  ProjectSchema,
  SCHEMA_VERSION,
  Op,
  OpError,
  applyOp,
  checkProject,
  createBlankProject,
  exportScript,
  migrateProject,
  mixHash,
  nowIso,
  resolveTimeline,
  slug,
  uniqueId,
  type Project,
} from '@uw/core';
import { listHistory, listProjects, loadProject, saveProject, safeJoin, ProjectLoadError } from '@uw/core/node';
import { analyzeAudio } from '@uw/media';
import { LocalEspeakProvider, PROVIDER_CATALOG, UsageLedger, configuredProviders, redact } from '@uw/providers';
import { composeEpisode } from '@uw/renderer';
import { importAsset, importNarration, syncAssetMetadata } from '../../worker/src/pipeline';
import { mimeFor } from '../../worker/src/files';
import { JobManager } from './jobs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
export const PROJECTS_DIR = process.env.UW_PROJECTS_DIR ? path.resolve(process.env.UW_PROJECTS_DIR) : path.join(repo, 'projects');
const STATE_DIR = process.env.UW_STATE_DIR ? path.resolve(process.env.UW_STATE_DIR) : path.join(repo, '.studio');
const WEB_DIST = path.join(repo, 'apps/studio/dist');

await fs.mkdir(STATE_DIR, { recursive: true });
await fs.mkdir(PROJECTS_DIR, { recursive: true });

const projectDir = (id: string) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(id)) throw new HttpError(400, 'Invalid project id.');
  return path.join(PROJECTS_DIR, id);
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const jobs = new JobManager(path.join(STATE_DIR, 'studio.db'), projectDir, path.join(repo, 'apps/worker/src/run-job.ts'));

// Serialize read-modify-write per project inside this process.
const locks = new Map<string, Promise<unknown>>();
function withProject<T>(id: string, fn: (p: Project) => Promise<T> | T): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(async () => fn(await loadProject(projectDir(id))));
  locks.set(id, next);
  return next as Promise<T>;
}

async function projectState(id: string) {
  const dir = projectDir(id);
  const project = await loadProject(dir);
  const timeline = resolveTimeline(project);
  const files: Record<string, { exists: boolean; bytes?: number }> = {};
  for (const a of project.assets) {
    const st = await fs.stat(safeJoin(dir, a.relPath)).catch(() => null);
    files[a.id] = st ? { exists: true, bytes: st.size } : { exists: false };
  }
  const issues = checkProject(project, timeline).concat(
    project.assets.filter((a) => !files[a.id]!.exists).map((a) => ({ severity: 'error' as const, code: 'asset_file_missing', message: `Asset "${a.id}" (${a.relPath}) has no file on disk.` })),
  );
  const history = await listHistory(dir);
  return { project, timeline, issues, files, historyCount: history.length, mixHash: mixHash(project, timeline) };
}

const app = new Hono();

// ---- access control for a separately hosted backend -------------------------------------------
// UW_STUDIO_TOKEN: shared bearer token for the API and media (header "Authorization: Bearer …" or ?token=… for <img>/<audio>).
// UW_ALLOWED_ORIGINS: comma-separated browser origins allowed by CORS, e.g. https://oddlyprompt.github.io
// The token only gates this studio; provider API keys never leave the server.
const TOKEN = process.env.UW_STUDIO_TOKEN || '';
const ORIGINS = (process.env.UW_ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
app.use('*', cors({ origin: (o) => (ORIGINS.includes('*') || ORIGINS.includes(o) ? o : ''), allowHeaders: ['authorization', 'content-type'], allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'], maxAge: 600 }));
const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
app.use('*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (!TOKEN || c.req.method === 'OPTIONS' || !(p.startsWith('/api/') || p.startsWith('/media/')) || p === '/api/health') return next();
  const given = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '') || (new URL(c.req.url).searchParams.get('token') ?? '');
  if (!given || !sameToken(given, TOKEN)) return c.json({ error: 'Unauthorized: the studio token is missing or wrong.' }, 401);
  return next();
});

app.onError(async (err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  if (err instanceof ProjectLoadError) return c.json({ error: err.message }, 422);
  if (err instanceof z.ZodError) return c.json({ error: `Invalid data: ${err.issues.slice(0, 4).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` }, 400);
  const msg = await redact((err as Error).message ?? String(err));
  console.error('[server]', msg);
  return c.json({ error: msg }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true, schemaVersion: SCHEMA_VERSION, authRequired: !!TOKEN }));

// ------------------------------------------------------------------ projects

app.get('/api/projects', async (c) => {
  const list = await listProjects(PROJECTS_DIR);
  return c.json(
    await Promise.all(
      list.map(async (e) => {
        if (!e.project) return { id: e.id, error: e.error };
        const p = e.project;
        const t = resolveTimeline(p);
        const lastRender = [...p.renders].reverse().find((r) => r.ok);
        const stat = await fs.stat(path.join(e.dir, 'project.json'));
        return {
          id: p.id,
          title: p.title,
          subject: p.subject,
          stage: p.stage,
          targetRuntimeSec: p.targetRuntimeSec,
          sliceRuntimeSec: p.sliceRuntimeSec,
          timelineSec: t.totalSec,
          chapters: p.chapters.length,
          shots: p.shots.length,
          narrationReady: p.narration.filter((n) => n.audio).length,
          narrationTotal: p.narration.length,
          placeholders: p.shots.filter((s) => s.status === 'placeholder').length,
          // Open items: timeline and asset issues, plus every placeholder shot and every scratch-voice clip.
          outstanding: checkProject(p, t).filter((i) => i.severity !== 'info').length + p.shots.filter((s) => s.status === 'placeholder').length + p.assets.filter((a) => a.placeholder).length,
          lastRender: lastRender ? { id: lastRender.id, kind: lastRender.kind, createdAt: lastRender.createdAt, relPath: lastRender.relPath } : undefined,
          updatedAt: p.updatedAt,
          modifiedAt: stat.mtime.toISOString(),
          usageUsd: await new UsageLedger(path.join(e.dir, '.studio', 'usage.jsonl')).totalUsd(),
        };
      }),
    ),
  );
});

const NewProject = z.object({ title: z.string().min(1).max(120), subject: z.string().max(200).default(''), targetRuntimeSec: z.number().positive().default(1620) });
app.post('/api/projects', async (c) => {
  const body = NewProject.parse(await c.req.json());
  const existing = (await fs.readdir(PROJECTS_DIR)).filter((d) => !d.startsWith('.'));
  const id = uniqueId(slug(body.title), existing);
  const project = createBlankProject(id, body.title, body.subject, body.targetRuntimeSec);
  await saveProject(projectDir(id), project, { touch: false });
  return c.json({ id }, 201);
});

/** Import a project.json (for example a shared episode) as a new project. */
app.post('/api/projects/import', async (c) => {
  const raw = await c.req.json();
  const migrated = migrateProject(raw);
  const project = ProjectSchema.parse(migrated);
  const existing = (await fs.readdir(PROJECTS_DIR)).filter((d) => !d.startsWith('.'));
  const id = uniqueId(slug(project.id), existing);
  await saveProject(projectDir(id), { ...project, id }, { touch: false });
  return c.json({ id, warning: 'Media files are not part of project.json. Missing assets show as placeholders until their files are added.' }, 201);
});

app.get('/api/projects/:id', async (c) => c.json(await projectState(c.req.param('id'))));

const PutBody = z.object({ project: z.unknown(), baseRevision: z.number().int() });
app.put('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const body = PutBody.parse(await c.req.json());
  await withProject(id, async (cur) => {
    if (cur.revision !== body.baseRevision) throw new HttpError(409, `The project changed (revision ${cur.revision}, you edited ${body.baseRevision}). Reload and reapply your change.`);
    const next = ProjectSchema.parse(body.project);
    if (next.id !== id) throw new HttpError(400, 'Project id cannot change.');
    // Renders and narration audio are produced by jobs; never let a stale client overwrite them.
    next.renders = cur.renders;
    next.narration = next.narration.map((n) => {
      const old = cur.narration.find((o) => o.id === n.id);
      return old?.audio && !n.audio ? { ...n, audio: old.audio } : n;
    });
    await saveProject(projectDir(id), next);
  });
  return c.json(await projectState(id));
});

app.post('/api/projects/:id/ops', async (c) => {
  const id = c.req.param('id');
  const op = Op.parse(await c.req.json());
  await withProject(id, async (cur) => {
    try {
      await saveProject(projectDir(id), applyOp(cur, op));
    } catch (e) {
      if (e instanceof OpError) throw new HttpError(e.status, e.message);
      throw e;
    }
  });
  return c.json(await projectState(id));
});

/** Raw-body upload: PUT /api/projects/:id/upload?filename=a.png[&replaceId=asset-id] */
app.put('/api/projects/:id/upload', async (c) => {
  const id = c.req.param('id');
  const filename = c.req.query('filename');
  if (!filename) throw new HttpError(400, 'filename is required.');
  const dir = projectDir(id);
  await loadProject(dir);
  const tmp = path.join(STATE_DIR, 'uploads', `${Date.now()}-${path.basename(filename).replace(/[^\w.\-]+/g, '_')}`);
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  await fs.writeFile(tmp, Buffer.from(await c.req.arrayBuffer()));
  try {
    const meta = c.req.query('meta') ? (JSON.parse(c.req.query('meta')!) as Record<string, unknown>) : undefined;
    const r = await withProject(id, () => importAsset(dir, { source: tmp, filename, replaceId: c.req.query('replaceId') || undefined, meta: meta as never }));
    return c.json({ asset: r.asset, state: await projectState(id) }, 201);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  } finally {
    await fs.rm(tmp, { force: true });
  }
});

/** Use an existing recording for one narration segment: PUT /api/projects/:id/narration/:segment/audio?filename=x.wav */
app.put('/api/projects/:id/narration/:seg/audio', async (c) => {
  const id = c.req.param('id');
  const filename = c.req.query('filename') ?? 'narration.wav';
  const dir = projectDir(id);
  await loadProject(dir);
  const tmp = path.join(STATE_DIR, 'uploads', `${Date.now()}-${path.basename(filename).replace(/[^\w.\-]+/g, '_')}`);
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  await fs.writeFile(tmp, Buffer.from(await c.req.arrayBuffer()));
  try {
    await withProject(id, () => importNarration(dir, c.req.param('seg'), tmp));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  } finally {
    await fs.rm(tmp, { force: true });
  }
  return c.json(await projectState(id));
});

app.get('/api/projects/:id/script', async (c) => {
  const p = await loadProject(projectDir(c.req.param('id')));
  const fmt = (c.req.query('format') ?? 'md') as 'md' | 'json' | 'txt';
  if (!['md', 'json', 'txt'].includes(fmt)) throw new HttpError(400, 'format must be md, json or txt.');
  const body = exportScript(p, resolveTimeline(p), fmt);
  return c.body(body, 200, { 'Content-Type': fmt === 'json' ? 'application/json' : 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${p.id}-script.${fmt}"` });
});

app.get('/api/projects/:id/export', async (c) => {
  const p = await loadProject(projectDir(c.req.param('id')));
  return c.body(JSON.stringify(p, null, 2), 200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${p.id}.project.json"` });
});

/** Props for the in-app Player. The mix is built by a job when the current one does not exist yet. */
app.get('/api/projects/:id/preview', async (c) => {
  const id = c.req.param('id');
  const dir = projectDir(id);
  const project = await loadProject(dir);
  const timeline = resolveTimeline(project);
  const h = mixHash(project, timeline);
  const mixRel = `.build/mix-${h}.wav`;
  const mixReady = await fs.stat(safeJoin(dir, mixRel)).then(() => true, () => false);
  let job;
  if (!mixReady) job = jobs.findActive('mix', id, {}) ?? jobs.enqueue('mix', id, {});
  const present = new Set<string>();
  for (const a of project.assets) if (await fs.stat(safeJoin(dir, a.relPath)).then(() => true, () => false)) present.add(a.id);
  const urlFor = (rel: string) => `/media/${id}/${rel.split('/').map(encodeURIComponent).join('/')}`;
  const props = composeEpisode(project, timeline, { urlFor, existing: present, audioUrl: mixReady ? urlFor(mixRel) : undefined });
  return c.json({ props, mixReady, mixHash: h, mixJobId: job?.id });
});

app.get('/api/projects/:id/usage', async (c) => {
  const ledger = new UsageLedger(path.join(projectDir(c.req.param('id')), '.studio', 'usage.jsonl'));
  return c.json({ entries: await ledger.entries(), totalUsd: await ledger.totalUsd() });
});

app.get('/api/projects/:id/analyze-mix', async (c) => {
  const id = c.req.param('id');
  const project = await loadProject(projectDir(id));
  const h = mixHash(project, resolveTimeline(project));
  const file = safeJoin(projectDir(id), `.build/mix-${h}.wav`);
  if (!(await fs.stat(file).catch(() => null))) throw new HttpError(404, 'The current mix has not been built yet. Run "Rebuild mix".');
  return c.json(await analyzeAudio(file));
});

// ------------------------------------------------------------------ jobs

const JobBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('narrate'), params: z.object({ provider: z.enum(['local-espeak', 'elevenlabs']).optional(), voice: z.string().optional(), segmentIds: z.array(z.string()).optional(), force: z.boolean().optional(), confirmPaid: z.boolean().optional() }).default({}) }),
  z.object({ type: z.literal('mix'), params: z.object({}).default({}) }),
  z.object({
    type: z.literal('render'),
    params: z.object({ kind: z.enum(['preview', 'scene', 'chapter', 'full']), sceneId: z.string().optional(), chapterId: z.string().optional(), shotId: z.string().optional(), quality: z.enum(['draft', 'final', 'ultra']).optional(), allowMissingNarration: z.boolean().optional() }),
  }),
]);

app.post('/api/projects/:id/jobs', async (c) => {
  const id = c.req.param('id');
  await loadProject(projectDir(id));
  const body = JobBody.parse(await c.req.json());
  if (body.type === 'narrate' && body.params.provider === 'elevenlabs' && !body.params.confirmPaid) throw new HttpError(400, 'Paid narration needs explicit confirmation (confirmPaid).');
  const dup = jobs.findActive(body.type, id, body.params);
  if (dup) return c.json({ job: dup, duplicate: true });
  return c.json({ job: jobs.enqueue(body.type, id, body.params) }, 201);
});
app.get('/api/jobs', (c) => c.json(jobs.list(c.req.query('projectId'), 60)));
app.get('/api/jobs/:id', (c) => {
  const j = jobs.get(Number(c.req.param('id')));
  if (!j) throw new HttpError(404, 'No such job.');
  return c.json(j);
});
app.post('/api/jobs/:id/cancel', (c) => c.json({ ok: jobs.cancel(Number(c.req.param('id'))) }));
app.post('/api/jobs/:id/retry', (c) => {
  const j = jobs.retry(Number(c.req.param('id')));
  if (!j) throw new HttpError(400, 'Only failed or cancelled jobs can be retried.');
  return c.json({ job: j });
});

app.get('/api/providers', async (c) => {
  const local = new LocalEspeakProvider();
  return c.json({ configured: await configuredProviders(), catalog: PROVIDER_CATALOG, local: await local.status(), localVoices: await local.voices() });
});

// ------------------------------------------------------------------ media and UI

app.get('/media/:id/*', async (c) => {
  const id = c.req.param('id');
  const rel = decodeURIComponent(new URL(c.req.url).pathname.replace(`/media/${id}/`, ''));
  if (!/^(media|renders|\.build)\//.test(rel)) throw new HttpError(403, 'Not a media path.');
  const file = safeJoin(projectDir(id), rel);
  const st = await fs.stat(file).catch(() => null);
  if (!st?.isFile()) return c.text('not found', 404);
  const headers: Record<string, string> = { 'Content-Type': mimeFor(file), 'Accept-Ranges': 'bytes', 'Cache-Control': rel.startsWith('.build/') || rel.startsWith('media/') ? 'public, max-age=31536000, immutable' : 'no-store' };
  const range = c.req.header('range')?.match(/bytes=(\d*)-(\d*)/);
  const { Readable } = await import('node:stream');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers: { ...headers, 'Content-Length': String(st.size) } });
});

app.get('*', async (c) => {
  const p = new URL(c.req.url).pathname;
  const rel = p === '/' ? 'index.html' : p.slice(1);
  let file: string;
  try {
    file = safeJoin(WEB_DIST, rel);
  } catch {
    return c.text('not found', 404);
  }
  let st = await fs.stat(file).catch(() => null);
  if (!st?.isFile()) {
    file = path.join(WEB_DIST, 'index.html');
    st = await fs.stat(file).catch(() => null);
    if (!st) return c.text('The studio interface is not built. Run: npm run studio:build (or npm run studio:web for development).', 503);
  }
  const { Readable } = await import('node:stream');
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { 'Content-Type': mimeFor(file), 'Content-Length': String(st.size) } });
});

export const PORT = Number(process.env.PORT ?? 4173);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !TOKEN) {
    console.error('Refusing to listen on a non-loopback address without UW_STUDIO_TOKEN. Set a long random token first.');
    process.exit(1);
  }
  serve({ fetch: app.fetch, port: PORT, hostname: host }, (info) => {
    console.log(`The Unbuilt World Studio: http://127.0.0.1:${info.port}  (projects: ${PROJECTS_DIR})`);
  });
}
export { app, jobs };
void syncAssetMetadata;
