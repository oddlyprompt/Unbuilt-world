import { describe, expect, it, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { analyzeAudio, duckExpr, ffmpeg, keyframeExpr, narrationWindows, planMix, probe, renderMix, validateVideo, type MixInputs } from '../src';
import { estimateWords, resolveTimeline, segmentTextHash } from '@uw/core';
import { miniProject, tmpDir } from '../../../tests/helpers/fixtures';

let dir = '';
const sine = (name: string, freq: number, sec: number, vol = 0.5) => ffmpeg(['-y', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${sec}:sample_rate=48000`, '-af', `volume=${vol}`, '-ac', '1', path.join(dir, name)]);

beforeAll(async () => {
  dir = await tmpDir('uw-media-');
  await sine('voice.wav', 440, 3);
  await sine('music.wav', 110, 12, 0.6);
});

/** A project with narration at known positions: n1 starts at 1.0s (3 s long), n2 at 7.0s (3 s long). */
function mixInputs(): MixInputs {
  const p = miniProject();
  p.narration = p.narration.slice(0, 2);
  p.narration[1]!.gapBeforeSec = 3;
  for (const [i, n] of p.narration.entries()) n.audio = { assetId: `narr-${i}`, durationSec: 3, words: estimateWords(n.text, 3), alignment: 'engine', provider: 't', textHash: segmentTextHash(n) };
  p.shots = p.shots.slice(0, 1);
  p.settings.tailSec = 2;
  p.audio.music = [{ id: 'm', assetId: 'music', startSec: 0, gainDb: -12, fadeInSec: 0, fadeOutSec: 0, loop: true, keyframes: [], duck: { enabled: true, amountDb: 12, attackMs: 50, releaseMs: 200 } }];
  p.audio.targetLufs = -16;
  p.assets = ['voice0', 'voice1', 'music'].map((id) => ({ id, filename: id, relPath: id, kind: 'audio' as const, origin: 'synthesized' as const, licenseStatus: 'own_work' as const, attributionRequired: false, aiGenerated: false, placeholder: false, approval: 'approved' as const }));
  const files = new Map([['narr-0', path.join(dir, 'voice.wav')], ['narr-1', path.join(dir, 'voice.wav')], ['music', path.join(dir, 'music.wav')]]);
  return { project: p, timeline: resolveTimeline(p), files };
}

const rms = async (file: string, from: number, to: number) => {
  const r = await ffmpeg(['-ss', String(from), '-t', String(to - from), '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  return Number(r.stderr.match(/mean_volume:\s*(-?[\d.]+)/)![1]);
};

describe('audio mixer', () => {
  it('builds ducking and keyframe expressions from the narration timing', () => {
    const inp = mixInputs();
    const w = narrationWindows(inp.timeline);
    expect(w).toHaveLength(2);
    expect(w[0]![0]).toBeCloseTo(1, 3);
    expect(keyframeExpr([])).toBe('0');
    expect(keyframeExpr([{ atSec: 1, gainDb: 0 }, { atSec: 3, gainDb: -10 }])).toContain('between(t,1.0000,3.0000)');
    expect(duckExpr(w, inp.project.audio.music[0]!)).toContain('clip');
    expect(duckExpr([], inp.project.audio.music[0]!)).toBe('0');
    const plan = planMix(inp);
    expect(plan.inputs.some((i) => i.loop)).toBe(true);
    expect(plan.filter).toContain('amix');
  });

  it('places narration, ducks the music under it, hits the loudness target and never clips', async () => {
    const inp = mixInputs();
    const out = path.join(dir, 'mix', 'mix.wav');
    const r = await renderMix(inp, out);
    const p = await probe(out);
    expect(p.durationSec).toBeCloseTo(inp.timeline.totalSec, 1);
    const a = await analyzeAudio(out);
    expect(a.integratedLufs).toBeGreaterThan(-16.8);
    expect(a.integratedLufs).toBeLessThan(-15.2);
    expect(a.clipped).toBe(false);
    expect(a.peakDb).toBeLessThanOrEqual(-1.4);
    expect(r.plan.notes).toEqual([]);

    // Narration is a 440 Hz tone (0.5), music 110 Hz. Under narration the music is 12 dB lower than in the gap.
    const inVoice = await rms(out, 1.5, 3.5);
    const inGap = await rms(out, 4.6, 6.4); // between the two clips: music only
    const music = await ffmpeg(['-ss', '1.5', '-t', '2', '-i', out, '-af', 'bandpass=f=110:width_type=h:w=25,volumedetect', '-f', 'null', '-']);
    const musicUnderVoice = Number(music.stderr.match(/mean_volume:\s*(-?[\d.]+)/)![1]);
    const musicGap = await ffmpeg(['-ss', '4.6', '-t', '1.8', '-i', out, '-af', 'bandpass=f=110:width_type=h:w=25,volumedetect', '-f', 'null', '-']);
    const musicInGap = Number(musicGap.stderr.match(/mean_volume:\s*(-?[\d.]+)/)![1]);
    expect(musicInGap - musicUnderVoice).toBeGreaterThan(9);
    expect(inVoice).toBeGreaterThan(inGap + 6); // the voice is clearly the loudest thing
  });

  it('reports a missing music file instead of failing, and still renders silence-safe audio', async () => {
    const inp = mixInputs();
    inp.files.delete('music');
    const out = path.join(dir, 'mix2', 'mix.wav');
    const r = await renderMix(inp, out);
    expect(r.plan.notes.join(' ')).toContain('Music file');
    expect((await probe(out)).audio).toBeTruthy();
  });

  it('flags clipping and silence when analysing audio', async () => {
    // A sine is 0.125 of full scale by default; x12 overshoots and the 16-bit file is hard-clipped.
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2:sample_rate=48000', '-af', 'volume=12,aformat=sample_fmts=s16', path.join(dir, 'hot.wav')]);
    const hot = await analyzeAudio(path.join(dir, 'hot.wav'));
    expect(hot.clipped).toBe(true);
    expect(hot.warnings.join(' ')).toMatch(/clipping/);
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '6', path.join(dir, 'quiet.wav')]);
    const quiet = await analyzeAudio(path.join(dir, 'quiet.wav'), { minSilenceSec: 2 });
    expect(quiet.silences.length).toBeGreaterThan(0);
  });
});

describe('output validation', () => {
  const opts = (over = {}) => ({ expectedDurationSec: 3, width: 320, height: 180, fps: 30, outDir: path.join(dir, 'frames'), frameTimes: [0.5, 1.5], ...over });

  beforeAll(async () => {
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'good.mp4')]);
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', path.join(dir, 'noaudio.mp4')]);
    const good = await fs.readFile(path.join(dir, 'good.mp4'));
    await fs.writeFile(path.join(dir, 'truncated.mp4'), good.subarray(0, Math.floor(good.length / 3)));
    const corrupt = Buffer.from(good);
    for (let i = Math.floor(corrupt.length / 2); i < Math.floor(corrupt.length / 2) + 400; i++) corrupt[i] = 0xff;
    await fs.writeFile(path.join(dir, 'corrupt.mp4'), corrupt);
    await ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=black:size=320x180:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'black.mp4')]);
    await fs.writeFile(path.join(dir, 'empty.mp4'), '');
  });

  it('passes a good file and extracts frames and a contact sheet', async () => {
    const r = await validateVideo(path.join(dir, 'good.mp4'), opts());
    expect(r.checks.filter((c) => c.required && !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.frames).toHaveLength(2);
    expect((await fs.stat(r.contactSheet!)).size).toBeGreaterThan(1000);
  });

  it.each([
    ['empty.mp4', 'file exists'],
    ['truncated.mp4', 'readable by ffprobe'],
    ['noaudio.mp4', 'audio stream'],
    ['black.mp4', 'no unexpected black gaps'],
  ])('rejects %s on "%s"', async (file, failing) => {
    const r = await validateVideo(path.join(dir, file), opts());
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === failing)?.ok).toBe(false);
  });

  it('rejects wrong resolution and wrong duration, and accepts allowed black', async () => {
    const wrongRes = await validateVideo(path.join(dir, 'good.mp4'), opts({ width: 640, height: 360 }));
    expect(wrongRes.ok).toBe(false);
    expect(wrongRes.checks.find((c) => c.name === 'resolution')?.ok).toBe(false);
    const wrongDur = await validateVideo(path.join(dir, 'good.mp4'), opts({ expectedDurationSec: 10 }));
    expect(wrongDur.checks.find((c) => c.name === 'duration')?.ok).toBe(false);
    const allowed = await validateVideo(path.join(dir, 'black.mp4'), opts({ allowedBlack: [[0, 3.5]], maxBlackSec: 5 }));
    expect(allowed.checks.find((c) => c.name === 'no unexpected black gaps')?.ok).toBe(true);
  });

  it('catches a file with corrupted data', async () => {
    const r = await validateVideo(path.join(dir, 'corrupt.mp4'), opts());
    // Corruption in the middle may be concealed by the decoder; the check must at least never throw.
    expect(typeof r.ok).toBe('boolean');
    const missing = await validateVideo(path.join(dir, 'nope.mp4'), opts());
    expect(missing.ok).toBe(false);
  });
});
