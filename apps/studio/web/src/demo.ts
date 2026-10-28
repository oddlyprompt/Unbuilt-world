import {
  Op,
  OpError,
  ProjectSchema,
  PROVIDER_NOTE,
  applyOp,
  checkProject,
  composeEpisodeForDemo,
  createBlankProject,
  exportScript,
  hashString,
  migrateProject,
  mixHash,
  nowIso,
  resolveTimeline,
  slug,
  summarize,
  uniqueId,
  upsertAsset,
  segmentTextHash,
  type Asset,
  type Project,
} from './demo-deps';

/**
 * The in-browser studio backend used on GitHub Pages. It answers the same /api routes as the Node
 * server for everything that can honestly run in a browser: projects, edits, assets, previews.
 * It refuses, with a clear message, the things that need ffmpeg, Chromium or a TTS engine.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const staticUrl = (rel: string) => new URL(`${BASE}demo/${rel}`, location.href).href;

interface DemoManifest { id: string; mixHash: string; mix: string; files: string[]; builtAt: string }
let manifest: DemoManifest | null = null;
const blobUrls = new Map<string, string>(); // `${project}/${relPath}` -> blob: URL

// ---------------------------------------------------------------- storage
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { throw new OpError(507, 'This browser refused to store more data (storage is full or blocked).'); } };
const idsKey = 'uw-demo:ids';
const ids = (): string[] => JSON.parse(lsGet(idsKey) ?? '[]');
const loadP = (id: string): Project => {
  const raw = lsGet(`uw-demo:p:${id}`);
  if (!raw) throw new OpError(404, `Cannot read project "${id}": it does not exist in this browser.`);
  return ProjectSchema.parse(migrateProject(JSON.parse(raw)));
};
function saveP(p: Project, touch = true): Project {
  const next = ProjectSchema.parse(touch ? { ...p, updatedAt: nowIso(), revision: p.revision + 1 } : p);
  lsSet(`uw-demo:p:${next.id}`, JSON.stringify(next));
  if (!ids().includes(next.id)) lsSet(idsKey, JSON.stringify([...ids(), next.id]));
  return next;
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('uw-demo', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function putBlob(key: string, blob: Blob) {
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => { const t = db.transaction('blobs', 'readwrite'); t.objectStore('blobs').put(blob, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  } catch { /* in-memory only for this visit */ }
  blobUrls.set(key, URL.createObjectURL(blob));
}
async function loadBlobs() {
  try {
    const db = await idb();
    await new Promise<void>((res) => {
      const req = db.transaction('blobs').objectStore('blobs').openCursor();
      req.onsuccess = () => { const c = req.result; if (!c) return res(); blobUrls.set(String(c.key), URL.createObjectURL(c.value as Blob)); c.continue(); };
      req.onerror = () => res();
    });
  } catch { /* no IndexedDB */ }
}

export async function initDemo() {
  await loadBlobs();
  try { manifest = (await (await fetch(staticUrl('cybersyn-pilot/demo.json'))).json()) as DemoManifest; } catch { manifest = null; }
  if (ids().length === 0 && manifest) await seed();
}
async function seed() {
  const p = ProjectSchema.parse(migrateProject(await (await fetch(staticUrl('cybersyn-pilot/project.json'))).json()));
  saveP(p, false);
}
export async function resetDemo() {
  for (const id of ids()) localStorage.removeItem(`uw-demo:p:${id}`);
  localStorage.removeItem(idsKey);
  try { const db = await idb(); await new Promise<void>((r) => { const t = db.transaction('blobs', 'readwrite'); t.objectStore('blobs').clear(); t.oncomplete = () => r(); }); } catch { /* ignore */ }
  blobUrls.clear();
  await seed();
}

export function demoMediaUrl(id: string, rel: string): string {
  const own = blobUrls.get(`${id}/${rel}`);
  if (own) return own;
  return staticUrl(`${id === manifest?.id || manifest?.files.includes(rel) || rel.startsWith('renders/') ? 'cybersyn-pilot' : id}/${rel.replace(/\.wav$/i, '.mp3')}`);
}
const fileExists = (id: string, rel: string) => blobUrls.has(`${id}/${rel}`) || (!!manifest && (manifest.files.includes(rel)));

// ---------------------------------------------------------------- state
function state(id: string) {
  const project = loadP(id);
  const timeline = resolveTimeline(project);
  const files: Record<string, { exists: boolean; bytes?: number }> = {};
  for (const a of project.assets) files[a.id] = { exists: fileExists(id, a.relPath) };
  const issues = checkProject(project, timeline).concat(project.assets.filter((a) => !files[a.id]!.exists).map((a) => ({ severity: 'error' as const, code: 'asset_file_missing', message: `Asset "${a.id}" (${a.relPath}) has no file in this browser.` })));
  return { project, timeline, issues, files, historyCount: 0, mixHash: mixHash(project, timeline) };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const err = (status: number, message: string) => json({ error: message }, status);
const NEEDS_BACKEND = 'Rendering, narration and audio mixing need the studio backend (ffmpeg, Chromium and a speech engine). This site is running in demo mode: it edits and previews in your browser. Use "Backend" in the top bar to connect one.';

const EXT: Record<string, Asset['kind']> = { png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', mp4: 'video', webm: 'video', mov: 'video', wav: 'audio', mp3: 'audio', m4a: 'audio', ogg: 'audio', flac: 'audio' };

async function sha(buf: ArrayBuffer): Promise<string> {
  if (crypto.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashString(String(buf.byteLength)) + hashString(new TextDecoder('latin1').decode(buf.slice(0, 4096)));
}
async function probeMedia(blob: Blob, kind: Asset['kind']): Promise<{ width?: number; height?: number; durationSec?: number }> {
  if (kind === 'image') {
    try { const b = await createImageBitmap(blob); const r = { width: b.width, height: b.height }; b.close(); return r; } catch { throw new OpError(400, 'That file could not be read as an image.'); }
  }
  if (kind === 'audio' || kind === 'video') {
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
        el.preload = 'metadata';
        el.onloadedmetadata = () => resolve({ durationSec: el.duration, ...(kind === 'video' ? { width: (el as HTMLVideoElement).videoWidth, height: (el as HTMLVideoElement).videoHeight } : {}) });
        el.onerror = () => reject(new OpError(400, 'That file could not be read as media.'));
        el.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }
  return {};
}

async function ingest(projectId: string, blob: Blob, filename: string, replaceId?: string, forceId?: string): Promise<{ project: Project; asset: Asset }> {
  const project = loadP(projectId);
  const clean = filename.replace(/[^\w.\- ]+/g, '_');
  const ext = (clean.split('.').pop() ?? '').toLowerCase();
  const kind = EXT[ext] ?? 'other';
  const prev = replaceId ? project.assets.find((a) => a.id === replaceId) : undefined;
  if (replaceId && !prev) throw new OpError(404, `No asset "${replaceId}" to replace.`);
  const meta = await probeMedia(blob, kind);
  const id = replaceId ?? forceId ?? uniqueId(clean.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset', project.assets.map((a) => a.id));
  const hash = await sha(await blob.arrayBuffer());
  const rel = `media/original/${id}-${hash.slice(0, 8)}.${ext || 'bin'}`;
  await putBlob(`${projectId}/${rel}`, blob);
  const asset = { ...(prev ?? {}), id, filename: clean, relPath: rel, kind: prev?.kind === 'music' || prev?.kind === 'sfx' ? prev.kind : kind, ...meta, sha256: hash, origin: 'user_supplied', placeholder: false, approval: 'pending', licenseStatus: prev?.licenseStatus ?? 'unknown', attributionRequired: prev?.attributionRequired ?? false, aiGenerated: prev?.aiGenerated ?? false } as Asset;
  return { project: upsertAsset(project, asset), asset };
}

// ---------------------------------------------------------------- the routes
export async function handleDemo(method: string, u: URL, body: BodyInit | null): Promise<Response> {
  try {
    const path = u.pathname;
    if (path === '/api/health') return json({ ok: true, mode: 'demo' });
    if (path === '/api/jobs') return json([]);
    if (path === '/api/providers') return json({ configured: {}, catalog: [], local: { ready: false, reason: PROVIDER_NOTE }, localVoices: [] });
    if (path === '/api/projects' && method === 'GET') {
      return json(ids().map((id) => { try { const s = state(id); return { ...summarize(s.project, s.issues.filter((i) => i.severity !== 'info').length, s.timeline.totalSec), usageUsd: 0 }; } catch (e) { return { id, error: (e as Error).message }; } }));
    }
    if (path === '/api/projects' && method === 'POST') {
      const b = JSON.parse(String(body)) as { title: string; subject?: string; targetRuntimeSec?: number };
      if (!b.title?.trim()) return err(400, 'A title is required.');
      const id = uniqueId(slug(b.title), ids());
      saveP(createBlankProject(id, b.title, b.subject ?? '', b.targetRuntimeSec ?? 1620), false);
      return json({ id }, 201);
    }
    if (path === '/api/projects/import' && method === 'POST') {
      const p = ProjectSchema.parse(migrateProject(JSON.parse(String(body))));
      const id = uniqueId(slug(p.id), ids());
      saveP({ ...p, id }, false);
      return json({ id, warning: 'Media files are not part of project.json. Missing assets show as placeholders until their files are added.' }, 201);
    }
    const m = path.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      const rest = m[2] ?? '';
      if (rest === '' && method === 'GET') return json(state(id));
      if (rest === 'ops' && method === 'POST') {
        const op = Op.parse(JSON.parse(String(body)));
        saveP(applyOp(loadP(id), op));
        return json(state(id));
      }
      if (rest === 'preview') {
        const s = state(id);
        const stale = !manifest || s.mixHash !== manifest.mixHash || id !== manifest.id;
        const hasMix = !!manifest && id === manifest.id;
        const present = new Set(s.project.assets.filter((a) => s.files[a.id]!.exists).map((a) => a.id));
        const props = composeEpisodeForDemo(s.project, s.timeline, { urlFor: (rel: string) => demoMediaUrl(id, rel), existing: present, audioUrl: hasMix ? staticUrl(`${id}/${manifest!.mix}`) : undefined });
        return json({ props, mixReady: true, mixHash: s.mixHash, mixStale: stale, demo: true });
      }
      if (rest === 'export') return new Response(JSON.stringify(loadP(id), null, 2), { headers: { 'content-type': 'application/json' } });
      if (rest === 'script') {
        const p = loadP(id);
        const fmt = (u.searchParams.get('format') ?? 'md') as 'md' | 'json' | 'txt';
        return new Response(exportScript(p, resolveTimeline(p), fmt), { headers: { 'content-type': fmt === 'json' ? 'application/json' : 'text/plain; charset=utf-8' } });
      }
      if (rest === 'usage') return json({ entries: [], totalUsd: 0 });
      if (rest === 'analyze-mix') return err(404, 'Mix analysis needs the studio backend.');
      if (rest === 'jobs' && method === 'POST') return err(503, NEEDS_BACKEND);
      if (rest === 'upload' && method === 'PUT') {
        const filename = u.searchParams.get('filename');
        if (!filename) return err(400, 'filename is required.');
        const { project, asset } = await ingest(id, body as Blob, filename, u.searchParams.get('replaceId') || undefined);
        saveP(project);
        return json({ asset, state: state(id) }, 201);
      }
      const nm = rest.match(/^narration\/([^/]+)\/audio$/);
      if (nm && method === 'PUT') {
        const seg = nm[1]!;
        const before = loadP(id);
        if (!before.narration.some((n) => n.id === seg)) return err(400, `No narration segment "${seg}".`);
        const aid = `narr-${seg}`;
        const has = before.assets.some((a) => a.id === aid);
        const { project, asset } = await ingest(id, body as Blob, `${seg}-imported.${(u.searchParams.get('filename') ?? 'a.wav').split('.').pop()}`, has ? aid : undefined, aid);
        const s = project.narration.find((n) => n.id === seg)!;
        s.audio = { assetId: asset.id, durationSec: asset.durationSec ?? 1, words: [], alignment: 'estimated', provider: 'imported', textHash: segmentTextHash(s), generatedAt: nowIso() };
        saveP(project);
        return json(state(id));
      }
    }
    if (path.startsWith('/media/')) return err(404, 'Media is served directly in demo mode.');
    return err(404, `Not available in demo mode: ${method} ${path}`);
  } catch (e) {
    if (e instanceof OpError) return err(e.status, e.message);
    if (e instanceof Error && e.name === 'ZodError') return err(400, `Invalid data: ${(e as unknown as { issues: { path: string[]; message: string }[] }).issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    return err(400, (e as Error).message);
  }
}
