import { promises as fs } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import {
  checkProject,
  hashString,
  nowIso,
  renderInputHash,
  resolveTimeline,
  segmentTextHash,
  uniqueId,
  upsertAsset,
  type Asset,
  type AssetKind,
  type NarrationAudio,
  type Project,
  type RenderRecord,
  type Timeline,
} from '@uw/core';
import { loadProject, saveProject, safeJoin, sha256File } from '@uw/core/node';
import { analyzeAudio, probe, renderMix, validateVideo, type ValidationReport } from '@uw/media';
import { ElevenLabsProvider, LocalEspeakProvider, UsageLedger, type TtsProvider } from '@uw/providers';
import { composeEpisode } from '@uw/renderer';
import { checkAudioSync, type SyncReport } from '@uw/quality';
import { ensureBundle, findBrowser } from './bundle';
import { serveProjectDir } from './files';

export interface Reporter {
  log(message: string): void;
  progress(stage: string, fraction: number, detail?: Record<string, unknown>): void;
}
export const silentReporter: Reporter = { log() {}, progress() {} };

export interface Ctx extends Reporter {
  dir: string;
  signal?: AbortSignal;
}

const exists = (f: string) => fs.stat(f).then(() => true, () => false);

// ---------------------------------------------------------------- assets

const KIND_BY_EXT: Record<string, AssetKind> = {
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.svg': 'image',
  '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.mkv': 'video',
  '.wav': 'audio', '.mp3': 'audio', '.m4a': 'audio', '.flac': 'audio', '.ogg': 'audio',
  '.woff2': 'font', '.ttf': 'font', '.otf': 'font',
};
export const kindForFile = (name: string): AssetKind => KIND_BY_EXT[path.extname(name).toLowerCase()] ?? 'other';

/** Fill in size, hash and duration for assets whose files exist. Missing files are left alone and reported by the checks. */
export async function syncAssetMetadata(dir: string): Promise<Project> {
  const project = await loadProject(dir);
  let changed = false;
  for (const a of project.assets) {
    const file = safeJoin(dir, a.relPath);
    if (!(await exists(file))) continue;
    const sha = await sha256File(file);
    if (a.sha256 !== sha) {
      a.sha256 = sha;
      changed = true;
      if (a.kind !== 'font' && a.kind !== 'other') {
        try {
          const p = await probe(file);
          a.durationSec = a.kind === 'image' ? undefined : p.durationSec;
          if (p.video) {
            a.width = p.video.width;
            a.height = p.video.height;
          }
        } catch {
          /* leave metadata as is */
        }
      }
    }
  }
  return changed ? saveProject(dir, project) : project;
}

export interface ImportOptions {
  /** Local path to copy from. */
  source: string;
  filename?: string;
  /** Id for a new asset (ignored when replacing). */
  id?: string;
  /** Replace the file behind an existing asset id; shots keep pointing at it. */
  replaceId?: string;
  meta?: Partial<Asset>;
}

/** Copy a file into media/original (never modifying it), probe it and register or replace an asset. */
export async function importAsset(dir: string, opts: ImportOptions): Promise<{ project: Project; asset: Asset }> {
  let project = await loadProject(dir);
  const filename = path.basename(opts.filename ?? opts.source).replace(/[^\w.\- ]+/g, '_');
  const id = opts.replaceId ?? opts.id ?? uniqueId(filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset', project.assets.map((a) => a.id));
  const sha = await sha256File(opts.source);
  const rel = `media/original/${id}-${sha.slice(0, 8)}${path.extname(filename).toLowerCase()}`;
  const dest = safeJoin(dir, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(opts.source, dest);
  const kind = kindForFile(filename);
  let width: number | undefined;
  let height: number | undefined;
  let durationSec: number | undefined;
  if (kind === 'image' || kind === 'video' || kind === 'audio') {
    const p = await probe(dest).catch((e) => {
      throw new Error(`"${filename}" could not be read as media: ${(e as Error).message}`);
    });
    width = p.video?.width;
    height = p.video?.height;
    if (kind !== 'image') durationSec = p.durationSec;
    if (kind === 'image' && !p.video) throw new Error(`"${filename}" is not a readable image.`);
  }
  const prev = project.assets.find((a) => a.id === id);
  if (opts.replaceId && !prev) throw new Error(`No asset "${opts.replaceId}" to replace.`);
  const asset: Asset = {
    ...(prev ?? {}),
    id,
    filename,
    relPath: rel,
    kind: prev?.kind === 'music' || prev?.kind === 'sfx' ? prev.kind : kind,
    width,
    height,
    durationSec,
    sha256: sha,
    origin: 'user_supplied',
    placeholder: false,
    approval: 'pending',
    licenseStatus: prev?.licenseStatus ?? 'unknown',
    attributionRequired: prev?.attributionRequired ?? false,
    aiGenerated: prev?.aiGenerated ?? false,
    ...opts.meta,
  } as Asset;
  project = upsertAsset(project, asset);
  project = await saveProject(dir, project);
  return { project, asset };
}

// ---------------------------------------------------------------- narration

export interface NarrateOptions {
  provider?: 'local-espeak' | 'elevenlabs';
  voice?: string;
  segmentIds?: string[];
  force?: boolean;
  /** Required for paid providers: batches of paid calls never start implicitly. */
  confirmPaid?: boolean;
}

export function makeProvider(id: NarrateOptions['provider'], settings?: Project['settings']): TtsProvider {
  const v = settings?.narrationVoice;
  return id === 'elevenlabs' ? new ElevenLabsProvider() : new LocalEspeakProvider({ voice: v?.voice, rate: v?.rate, pitch: v?.pitch });
}

export async function narrate(ctx: Ctx, opts: NarrateOptions = {}): Promise<Project> {
  const dir = ctx.dir;
  let project = await loadProject(dir);
  const provider = makeProvider(opts.provider, project.settings);
  const st = await provider.status();
  if (!st.ready) throw new Error(`${provider.name} is not available: ${st.reason}`);

  // Audio whose file is gone (for example a fresh clone, where media is not in git) counts as missing.
  const fileGone = new Set<string>();
  for (const n of project.narration) {
    const a = n.audio ? project.assets.find((x) => x.id === n.audio!.assetId) : undefined;
    if (n.audio && (!a || !(await exists(safeJoin(dir, a.relPath))))) fileGone.add(n.id);
  }
  const wanted = project.narration.filter((n) => (!opts.segmentIds || opts.segmentIds.includes(n.id)) && (!n.locked || opts.force) && (opts.force || fileGone.has(n.id) || !n.audio || n.audio.textHash !== segmentTextHash(n) || n.audio.provider !== provider.id));
  if (!wanted.length) {
    ctx.log('All narration is current; nothing to generate.');
    return project;
  }
  const chars = wanted.reduce((a, n) => a + (n.spokenText ?? n.text).length, 0);
  const ledger = new UsageLedger(path.join(dir, '.studio', 'usage.jsonl'));
  if (provider.capabilities.paid) {
    if (!opts.confirmPaid) throw new Error(`This would send ${chars} characters to ${provider.name} (about $${provider.estimateCostUsd(chars).toFixed(2)}). Confirm the paid batch explicitly.`);
    const voice = opts.voice ?? 'default';
    const dup = [];
    for (const n of wanted) if (!opts.force && (await ledger.has(UsageLedger.keyFor(provider.id, voice, n.spokenText ?? n.text)))) dup.push(n.id);
    if (dup.length) throw new Error(`Segments ${dup.join(', ')} were already generated with this voice; refusing duplicate paid calls. Import the earlier audio or pass force.`);
  }
  ctx.log(`Generating narration for ${wanted.length} segment(s) with ${provider.name}.`);
  const outDir = safeJoin(dir, 'media/generated/narration');
  const reqs = wanted.map((n) => ({ id: n.id, text: n.text, spokenText: n.spokenText, outFile: path.join(outDir, `${n.id}.${segmentTextHash(n).slice(0, 8)}.wav`) }));
  // One call per segment so progress is real, cancellable, and a failure keeps the earlier segments.
  for (let i = 0; i < reqs.length; i++) {
    if (ctx.signal?.aborted) throw new Error('Cancelled.');
    const [res] = await provider.synthesize([reqs[i]!], { signal: ctx.signal, voice: opts.voice });
    if (!res) throw new Error(`No audio returned for ${reqs[i]!.id}.`);
    const seg = wanted[i]!;
    project = await loadProject(dir); // reread: the user may have edited meanwhile
    const live = project.narration.find((n) => n.id === seg.id);
    if (!live) continue;
    if (segmentTextHash(live) !== segmentTextHash(seg)) {
      ctx.log(`"${seg.id}" was edited while generating; its audio was discarded.`);
      continue;
    }
    const assetId = `narr-${seg.id}`;
    const rel = path.relative(dir, res.file);
    const old = project.assets.find((a) => a.id === assetId);
    project = upsertAsset(project, {
      id: assetId,
      filename: path.basename(res.file),
      relPath: rel,
      kind: 'audio',
      mime: 'audio/wav',
      durationSec: res.durationSec,
      sha256: await sha256File(res.file),
      origin: provider.capabilities.paid ? 'ai_generated' : 'generated_local',
      licenseStatus: 'own_work',
      licenseName: provider.name,
      attributionRequired: false,
      aiGenerated: provider.capabilities.paid,
      placeholder: !provider.capabilities.paid,
      approval: 'pending',
      notes: provider.capabilities.paid ? 'Synthetic voice; disclose in the video description.' : 'Offline scratch voice. Replace before publication.',
    });
    const audio: NarrationAudio = { assetId, durationSec: res.durationSec, words: res.words, alignment: res.alignment, provider: provider.id, voice: res.voice, textHash: segmentTextHash(live), generatedAt: nowIso() };
    // upsertAsset returned a copy, so attach the audio to the segment of the project we are about to save.
    project.narration.find((n) => n.id === seg.id)!.audio = audio;
    project = await saveProject(dir, project);
    if (old && old.relPath !== rel) await fs.rm(safeJoin(dir, old.relPath), { force: true });
    if (res.characters) await ledger.record({ provider: provider.id, kind: 'tts', key: UsageLedger.keyFor(provider.id, res.voice, live.spokenText ?? live.text), characters: res.characters, estimatedCostUsd: res.estimatedCostUsd ?? 0 });
    ctx.progress('narration', (i + 1) / reqs.length, { segment: seg.id });
  }
  return project;
}

/** Use an existing recording for one segment. Word times are estimated until adjusted by hand. */
export async function importNarration(dir: string, segmentId: string, source: string): Promise<Project> {
  const before = await loadProject(dir);
  if (!before.narration.some((n) => n.id === segmentId)) throw new Error(`No narration segment "${segmentId}".`);
  const assetId = `narr-${segmentId}`;
  const { project, asset } = await importAsset(dir, {
    source,
    filename: `${segmentId}-imported${path.extname(source)}`,
    ...(before.assets.some((a) => a.id === assetId) ? { replaceId: assetId } : { id: assetId }),
    meta: { kind: 'audio', origin: 'user_supplied' },
  });
  const seg = project.narration.find((n) => n.id === segmentId)!;
  const p = await probe(safeJoin(dir, asset.relPath));
  seg.audio = { assetId: asset.id, durationSec: p.durationSec, words: [], alignment: 'estimated', provider: 'imported', textHash: segmentTextHash(seg), generatedAt: nowIso() };
  return saveProject(dir, project);
}

// ---------------------------------------------------------------- mix

export async function assetFiles(dir: string, project: Project): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const a of project.assets) {
    const f = safeJoin(dir, a.relPath);
    if (await exists(f)) m.set(a.id, f);
  }
  return m;
}

export function mixHash(project: Project, timeline: Timeline): string {
  return hashString(
    JSON.stringify({
      a: project.audio,
      n: timeline.segments.map((s) => [s.id, s.startSec, s.audioAssetId]),
      sh: project.shots.map((s, i) => [s.id, timeline.shots[i]!.startSec, s.soundCues]),
      f: project.assets.filter((a) => a.kind === 'audio' || a.kind === 'music' || a.kind === 'sfx').map((a) => [a.id, a.sha256]),
      t: timeline.totalFrames,
    }),
  );
}

/** The finished audio mix for the current state of the project, reused when nothing relevant changed. */
export async function ensureMix(ctx: Ctx, project: Project, timeline: Timeline): Promise<{ file: string; relPath: string; notes: string[]; reused: boolean }> {
  const h = mixHash(project, timeline);
  const rel = `.build/mix-${h}.wav`;
  const file = safeJoin(ctx.dir, rel);
  if (await exists(file)) return { file, relPath: rel, notes: [], reused: true };
  ctx.log('Mixing audio…');
  ctx.progress('mix', 0);
  const files = await assetFiles(ctx.dir, project);
  const r = await renderMix({ project, timeline, files }, file, { signal: ctx.signal });
  // Keep the three newest mixes.
  const buildDir = path.dirname(file);
  const olds = (await fs.readdir(buildDir)).filter((f) => /^mix-.*\.wav$/.test(f) && f !== path.basename(file));
  const stats = await Promise.all(olds.map(async (f) => ({ f, t: (await fs.stat(path.join(buildDir, f))).mtimeMs })));
  for (const { f } of stats.sort((a, b) => b.t - a.t).slice(2)) await fs.rm(path.join(buildDir, f), { force: true });
  ctx.progress('mix', 1);
  return { file, relPath: rel, notes: [...r.plan.notes, ...(r.skippedNormalization ? [r.skippedNormalization] : [])], reused: false };
}

// ---------------------------------------------------------------- render

export type RenderKind = 'preview' | 'scene' | 'chapter' | 'full';
export type Quality = 'draft' | 'final' | 'ultra';

export interface RenderOptions {
  kind: RenderKind;
  sceneId?: string;
  chapterId?: string;
  shotId?: string;
  quality?: Quality;
  crf?: number;
  /** Allow a final render when some narration is missing (it will be silent). */
  allowMissingNarration?: boolean;
}

export interface RenderOutcome {
  ok: boolean;
  record: RenderRecord;
  validation: ValidationReport;
  sync?: SyncReport;
  outputPath: string;
  warnings: string[];
}

const QUALITY = {
  draft: { scale: 0.5, crf: 30, audioBitrate: '128k' },
  final: { scale: 1, crf: 18, audioBitrate: '256k' },
  ultra: { scale: 2, crf: 18, audioBitrate: '256k' },
} as const;

export async function renderProject(ctx: Ctx, opts: RenderOptions): Promise<RenderOutcome> {
  const dir = ctx.dir;
  const project = await loadProject(dir);
  const quality: Quality = opts.quality ?? (opts.kind === 'full' ? 'final' : 'draft');
  const q = QUALITY[quality];
  const timeline = resolveTimeline(project);
  const issues = checkProject(project, timeline);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(`The project has errors that would break the render:\n- ${errors.map((e) => e.message).join('\n- ')}`);
  const missingNarr = project.narration.filter((n) => !n.audio).length;
  if (missingNarr && opts.kind === 'full' && quality !== 'draft' && !opts.allowMissingNarration) {
    throw new Error(`${missingNarr} narration segment(s) have no audio. Generate or import narration first, or allow a silent render.`);
  }
  const warnings = issues.filter((i) => i.severity === 'warning').map((i) => i.message);

  // Frame range.
  let startFrame = 0;
  let endFrame = timeline.totalFrames; // exclusive
  if (opts.kind === 'scene') {
    const sc = opts.shotId ? timeline.scenes.find((s) => s.shotIds.includes(opts.shotId!)) : timeline.scenes.find((s) => s.sceneId === opts.sceneId);
    if (!sc) throw new Error(`No scene found for ${opts.shotId ? `shot "${opts.shotId}"` : `"${opts.sceneId}"`}.`);
    if (opts.shotId) {
      const sh = timeline.shots.find((s) => s.id === opts.shotId)!;
      startFrame = sh.startFrame;
      endFrame = sh.endFrame;
    } else {
      startFrame = sc.startFrame;
      endFrame = sc.endFrame;
    }
  } else if (opts.kind === 'chapter') {
    const shots = timeline.shots.filter((s) => s.chapterId === opts.chapterId);
    if (!shots.length) throw new Error(`Chapter "${opts.chapterId}" has no shots.`);
    startFrame = shots[0]!.startFrame;
    endFrame = shots[shots.length - 1]!.endFrame;
  }
  const frames = endFrame - startFrame;
  const expectedDuration = frames / timeline.fps;

  const renderId = `${opts.kind}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${hashString(JSON.stringify(opts) + Date.now()).slice(0, 4)}`;
  const outDir = safeJoin(dir, `renders/${renderId}`);
  await fs.mkdir(outDir, { recursive: true });
  const logLines: string[] = [];
  const log = (m: string) => {
    logLines.push(`[${new Date().toISOString()}] ${m}`);
    ctx.log(m);
  };
  const outputPath = path.join(outDir, 'video.mp4');

  let server: Awaited<ReturnType<typeof serveProjectDir>> | undefined;
  try {
    const mix = await ensureMix({ ...ctx, log }, project, timeline);
    for (const n of mix.notes) log(`Mix: ${n}`);
    log(`Audio mix ${mix.reused ? 'reused' : 'built'}.`);

    server = await serveProjectDir(dir);
    const present = new Set<string>();
    for (const a of project.assets) if (await exists(safeJoin(dir, a.relPath))) present.add(a.id);
    const props = composeEpisode(project, timeline, { urlFor: (rel) => `${server!.baseUrl}/${rel.split('/').map(encodeURIComponent).join('/')}`, existing: present, audioUrl: `${server.baseUrl}/${mix.relPath}` });

    const serveUrl = await ensureBundle(log);
    const browserExecutable = await findBrowser();
    log(browserExecutable ? `Browser: ${browserExecutable}` : 'Browser: Remotion default (it may download one).');
    const inputProps = props as unknown as Record<string, unknown>;
    const composition = await selectComposition({ serveUrl, id: 'Episode', inputProps, browserExecutable, logLevel: 'error' });

    const { cancelSignal, cancel } = makeCancelSignal();
    ctx.signal?.addEventListener('abort', () => cancel(), { once: true });
    const crf = opts.crf ?? q.crf;
    log(`Rendering frames ${startFrame}–${endFrame - 1} (${expectedDuration.toFixed(2)}s) at ${Math.round(project.settings.width * q.scale)}×${Math.round(project.settings.height * q.scale)}, crf ${crf}.`);
    ctx.progress('render', 0);
    let lastReport = 0;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      crf,
      scale: q.scale,
      pixelFormat: 'yuv420p',
      audioBitrate: q.audioBitrate,
      frameRange: [startFrame, endFrame - 1],
      concurrency: Math.max(1, Math.min(4, cpus().length - 1)),
      browserExecutable,
      cancelSignal,
      logLevel: 'error',
      timeoutInMilliseconds: 90000,
      onProgress: (p) => {
        if (p.progress - lastReport >= 0.01) {
          lastReport = p.progress;
          ctx.progress('render', p.progress, { renderedFrames: p.renderedFrames, encodedFrames: p.encodedFrames });
        }
      },
    });
    ctx.progress('render', 1);

    // Never trust the file just because it exists.
    log('Validating output…');
    ctx.progress('validate', 0);
    const times = timeline.shots.filter((s) => s.endFrame > startFrame && s.startFrame < endFrame).map((s) => (Math.max(s.startFrame, startFrame) + Math.min(s.endFrame, endFrame) - 2 * startFrame) / 2 / timeline.fps).slice(0, 24);
    const darkShots = project.shots.map((s, i) => ({ s, r: timeline.shots[i]! })).filter(({ s }) => s.component === 'tonal_shift');
    const allowedBlack: [number, number][] = [
      [0, 1.2],
      [Math.max(0, expectedDuration - 3.5), expectedDuration + 1],
      ...darkShots.map(({ r }) => [Math.max(0, r.startSec - startFrame / timeline.fps), Math.max(0, r.endSec - startFrame / timeline.fps) + 1] as [number, number]),
    ];
    const validation = await validateVideo(outputPath, {
      expectedDurationSec: expectedDuration,
      toleranceSec: 0.25,
      width: Math.round(project.settings.width * q.scale),
      height: Math.round(project.settings.height * q.scale),
      fps: timeline.fps,
      allowedBlack,
      frameTimes: times,
      outDir: path.join(outDir, 'frames'),
      signal: ctx.signal,
    });

    // Audio/timeline synchronization: correlate the rendered audio with the narration placed on the timeline.
    let sync: SyncReport | undefined;
    if (project.narration.some((n) => n.audio)) {
      try {
        sync = await checkAudioSync({ video: outputPath, timeline, files: await assetFiles(dir, project), offsetSec: startFrame / timeline.fps, workDir: path.join(outDir, 'sync') });
        validation.checks.push({ name: 'narration in sync with timeline', ok: sync.ok, detail: sync.detail, required: true });
        validation.ok = validation.checks.filter((c) => c.required).every((c) => c.ok);
      } catch (e) {
        validation.checks.push({ name: 'narration in sync with timeline', ok: false, detail: `Could not measure: ${(e as Error).message}`, required: false });
      }
    }
    await fs.writeFile(path.join(outDir, 'validation.json'), JSON.stringify({ renderId, kind: opts.kind, quality, frameRange: [startFrame, endFrame], sync, ...validation }, null, 2));
    ctx.progress('validate', 1);

    const record: RenderRecord = {
      id: renderId,
      kind: opts.kind,
      createdAt: nowIso(),
      relPath: path.relative(dir, outputPath),
      ok: validation.ok,
      durationSec: validation.probe?.durationSec,
      expectedDurationSec: expectedDuration,
      width: validation.probe?.video?.width,
      height: validation.probe?.video?.height,
      validationRelPath: path.relative(dir, path.join(outDir, 'validation.json')),
      inputHash: renderInputHash(project, `${opts.kind}:${quality}:${startFrame}-${endFrame}`),
    };
    const fresh = await loadProject(dir);
    fresh.renders = [...fresh.renders, record].slice(-20);
    await saveProject(dir, fresh);
    if (!validation.ok) log(`Render FAILED validation: ${validation.checks.filter((c) => c.required && !c.ok).map((c) => `${c.name} (${c.detail})`).join('; ')}`);
    else log('Render passed validation.');
    return { ok: validation.ok, record, validation, sync, outputPath, warnings };
  } catch (e) {
    const message = (e as Error).message;
    log(`ERROR: ${message}`);
    await fs.writeFile(path.join(outDir, 'error.txt'), `${message}\n`).catch(() => {});
    throw e;
  } finally {
    await server?.close();
    await fs.writeFile(path.join(outDir, 'render.log'), logLines.join('\n') + '\n').catch(() => {});
    await fs.rm(path.join(outDir, 'sync'), { recursive: true, force: true }).catch(() => {});
  }
}

export { analyzeAudio };
