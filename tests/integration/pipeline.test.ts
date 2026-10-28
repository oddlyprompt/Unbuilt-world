import { beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { assignAsset, resolveTimeline, setShotDuration, type Project } from '@uw/core';
import { loadProject, saveProject } from '@uw/core/node';
import { LocalEspeakProvider } from '@uw/providers';
import { importAsset, narrate, renderProject, silentReporter } from '../../apps/worker/src/pipeline';
import { miniProject, shot, tmpDir } from '../helpers/fixtures';
import { meanColor, solidPng } from '../helpers/video';

/**
 * These tests render real video through Remotion and Chromium, so they take a few minutes. They are
 * the evidence that: narration drives the timeline, edits reach the output, replaced assets show up,
 * missing assets do not crash, and a bad render is reported as bad.
 */
let dir: string;
let tools: string;
let canNarrate = false;
const ctx = () => ({ dir, ...silentReporter });
const T = 420_000;

function project(): Project {
  const p = miniProject();
  p.id = 'pipeline';
  p.narration = [
    { id: 'n1', chapterId: 'ch1', text: 'First line of narration.', gapBeforeSec: 0.3, claimIds: [], locked: false },
    { id: 'n2', chapterId: 'ch1', text: 'And here is the second line.', gapBeforeSec: 0.4, claimIds: [], locked: false },
    { id: 'n3', chapterId: 'ch1', text: 'Done.', gapBeforeSec: 0.4, claimIds: [], locked: false },
  ];
  p.settings.leadInSec = 0.5;
  p.settings.tailSec = 1;
  p.shots = [
    shot('s1', { category: 'typography', component: 'title_reveal', props: { title: 'Test', fadeOutSec: 0 } }),
    shot('s2', { anchor: { kind: 'segment', segmentId: 'n2', word: 0, offsetSec: 0 }, category: 'historical_photo', component: 'media', camera: { preset: 'static', intensity: 0, focus: { x: 0.5, y: 0.5 }, easing: 'linear' } }),
    shot('s3', { anchor: { kind: 'segment', segmentId: 'n3', word: 0, offsetSec: 0 }, category: 'animated_map', component: 'network_map', reconstruction: { isReconstruction: true, label: 'SCHEMATIC' } }),
  ];
  return p;
}

beforeAll(async () => {
  dir = path.join(await tmpDir('uw-pipe-'), 'pipeline');
  tools = await tmpDir('uw-pipe-media-');
  await saveProject(dir, project(), { touch: false });
  canNarrate = (await new LocalEspeakProvider().status()).ready;
  if (!canNarrate) return;
  await narrate(ctx());
  await solidPng(path.join(tools, 'red.png'), 'e02020');
  await solidPng(path.join(tools, 'green.png'), '20c040');
  const { asset } = await importAsset(dir, { source: path.join(tools, 'red.png'), id: 'photo' });
  await fs.writeFile(path.join(dir, 'asset-id.txt'), asset.id);
  const p = await loadProject(dir);
  await saveProject(dir, assignAsset(p, 's2', 'photo'));
}, T);

describe('end-to-end render', () => {
  it('narrates, renders a full validated video, and the audio sits where the timeline says', async () => {
    if (!canNarrate) return;
    const p = await loadProject(dir);
    expect(p.narration.every((n) => n.audio?.alignment === 'engine')).toBe(true);
    const t = resolveTimeline(p);
    expect(t.issues.filter((i) => i.code === 'narration_estimated')).toEqual([]);
    const out = await renderProject(ctx(), { kind: 'preview', quality: 'draft' });
    expect(out.ok).toBe(true);
    const failed = out.validation.checks.filter((c) => c.required && !c.ok);
    expect(failed).toEqual([]);
    expect(Math.abs(out.validation.probe!.durationSec - t.totalSec)).toBeLessThan(0.25);
    expect(out.validation.probe!.video).toMatchObject({ codec: 'h264', width: 960, height: 540 });
    expect(out.validation.probe!.audio).toBeTruthy();
    expect(out.sync!.ok).toBe(true);
    expect(Math.abs(out.sync!.lagMs)).toBeLessThanOrEqual(80);
    expect(out.validation.frames.length).toBe(3);
    const saved = await loadProject(dir);
    expect(saved.renders.at(-1)).toMatchObject({ kind: 'preview', ok: true });
  }, T);

  it('shows the assigned image, and replacing the file changes the rendered output', async () => {
    if (!canNarrate) return;
    const p = await loadProject(dir);
    const t = resolveTimeline(p);
    const mid = (t.shots[1]!.startSec + t.shots[1]!.endSec) / 2 - t.shots[1]!.startSec;
    const first = await renderProject(ctx(), { kind: 'scene', shotId: 's2', quality: 'draft' });
    expect(first.ok).toBe(true);
    const [r1, g1] = await meanColor(first.outputPath, mid);
    expect(r1).toBeGreaterThan(g1 + 40); // red image

    await importAsset(dir, { source: path.join(tools, 'green.png'), replaceId: 'photo' });
    const second = await renderProject(ctx(), { kind: 'scene', shotId: 's2', quality: 'draft' });
    expect(second.ok).toBe(true);
    const [r2, g2] = await meanColor(second.outputPath, mid);
    expect(g2).toBeGreaterThan(r2 + 40); // now green, with the storyboard untouched
    expect((await loadProject(dir)).shots[1]!.assetId).toBe('photo');
  }, T);

  it('changing a shot length changes the length of the rendered scene', async () => {
    if (!canNarrate) return;
    let p = await loadProject(dir);
    const t = resolveTimeline(p);
    const len = t.shots[1]!.endSec - t.shots[1]!.startSec;
    p = setShotDuration(p, t, 's2', len + 1.5);
    await saveProject(dir, p);
    const t2 = resolveTimeline(p);
    const out = await renderProject(ctx(), { kind: 'scene', shotId: 's2', quality: 'draft' });
    expect(out.ok).toBe(true);
    expect(out.validation.probe!.durationSec).toBeCloseTo(len + 1.5, 0);
    expect(Math.abs(out.validation.probe!.durationSec - (t2.shots[1]!.endSec - t2.shots[1]!.startSec))).toBeLessThan(0.25);
    // Lengthening s2 slides the NEXT cut (s3) later by the same amount, by design.
    expect(t2.shots[2]!.startSec - t.shots[2]!.startSec).toBeCloseTo(1.5, 1);
    expect(t2.shots[1]!.startSec).toBeCloseTo(t.shots[1]!.startSec, 3);
  }, T);

  it('does not crash when an asset file is missing: it renders a visible slate and still validates', async () => {
    if (!canNarrate) return;
    const p = await loadProject(dir);
    const a = p.assets.find((x) => x.id === 'photo')!;
    await fs.rm(path.join(dir, a.relPath));
    const out = await renderProject(ctx(), { kind: 'scene', shotId: 's2', quality: 'draft' });
    expect(out.ok).toBe(true);
    const [r, g, b] = await meanColor(out.outputPath, 0.5);
    expect(Math.abs(r - g) + Math.abs(g - b)).toBeLessThan(90); // neither the red nor the green picture: a dark slate
  }, T);

  it('reports project errors accurately instead of rendering garbage', async () => {
    const p = await loadProject(dir);
    p.shots[2]!.chapterId = 'ghost';
    await saveProject(dir, p);
    await expect(renderProject(ctx(), { kind: 'preview' })).rejects.toThrow(/unknown chapter "ghost"/);
    p.shots[2]!.chapterId = 'ch1';
    await saveProject(dir, p);
    await expect(renderProject(ctx(), { kind: 'scene', shotId: 'nope' })).rejects.toThrow(/No scene found/);
    await expect(renderProject(ctx(), { kind: 'chapter', chapterId: 'zzz' })).rejects.toThrow(/no shots/);
  }, T);

  it('refuses a final render while narration is missing, unless silence is allowed', async () => {
    const p = await loadProject(dir);
    p.narration[0]!.audio = undefined;
    await saveProject(dir, p);
    await expect(renderProject(ctx(), { kind: 'full', quality: 'final' })).rejects.toThrow(/no audio/);
  }, T);

  it('can be cancelled', async () => {
    if (!canNarrate) return;
    await narrate(ctx()); // regenerate the segment removed above
    const ac = new AbortController();
    const started = renderProject({ dir, ...silentReporter, signal: ac.signal }, { kind: 'preview', quality: 'draft' });
    setTimeout(() => ac.abort(), 12_000);
    await expect(started).rejects.toThrow();
    const dirs = await fs.readdir(path.join(dir, 'renders'));
    const withTime = await Promise.all(dirs.map(async (d) => ({ d, t: (await fs.stat(path.join(dir, 'renders', d))).mtimeMs })));
    const last = withTime.sort((a, b) => a.t - b.t).at(-1)!.d;
    expect((await fs.readFile(path.join(dir, 'renders', last, 'error.txt'), 'utf8')).length).toBeGreaterThan(0);
  }, T);
});
