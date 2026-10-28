import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Project, Timeline, MusicTrack } from '@uw/core';
import { ffmpeg, type RunOptions } from './exec';
import { probe } from './probe';

export const MIX_RATE = 48000;

export interface MixInputs {
  project: Project;
  timeline: Timeline;
  /** Absolute file paths by asset id. */
  files: Map<string, string>;
}

export interface MixPlan {
  /** Input files in order; `loop` inputs are repeated with -stream_loop. */
  inputs: { file: string; loop: boolean }[];
  filter: string;
  durationSec: number;
  notes: string[];
}

const db = (x: number) => x.toFixed(3);
const sec = (x: number) => Math.max(0, x).toFixed(4);

/** Windows (seconds) in which narration is speaking, merged across short gaps. */
export function narrationWindows(timeline: Timeline, mergeGap = 0.9): [number, number][] {
  const w: [number, number][] = [];
  for (const s of timeline.segments) {
    const last = w[w.length - 1];
    if (last && s.startSec - last[1] < mergeGap) last[1] = s.endSec;
    else w.push([s.startSec, s.endSec]);
  }
  return w;
}

/** dB offset over time from keyframes, as an ffmpeg expression in `t`. */
export function keyframeExpr(keys: { atSec: number; gainDb: number }[]): string {
  if (!keys.length) return '0';
  const k = [...keys].sort((a, b) => a.atSec - b.atSec);
  const parts = [`lt(t,${sec(k[0]!.atSec)})*${db(k[0]!.gainDb)}`];
  for (let i = 0; i + 1 < k.length; i++) {
    const a = k[i]!;
    const b = k[i + 1]!;
    const span = Math.max(1e-3, b.atSec - a.atSec);
    parts.push(`between(t,${sec(a.atSec)},${sec(b.atSec)})*(${db(a.gainDb)}+(${db(b.gainDb - a.gainDb)})*(t-${sec(a.atSec)})/${span.toFixed(4)})`);
  }
  const last = k[k.length - 1]!;
  parts.push(`gt(t,${sec(last.atSec)})*${db(last.gainDb)}`);
  return parts.join('+');
}

/** Ducking depth over time (positive dB to subtract), as an expression in `t`. */
export function duckExpr(windows: [number, number][], track: MusicTrack): string {
  if (!track.duck.enabled || !windows.length) return '0';
  const A = Math.max(0.01, track.duck.attackMs / 1000);
  const R = Math.max(0.01, track.duck.releaseMs / 1000);
  const terms = windows.map(([a, b]) => `min(clip((t-${sec(a - A)})/${A.toFixed(3)},0,1),clip((${sec(b + R)}-t)/${R.toFixed(3)},0,1))`);
  return `${db(track.duck.amountDb)}*(${terms.join('+')})`;
}

export function planMix({ project, timeline, files }: MixInputs): MixPlan {
  const notes: string[] = [];
  const inputs: MixPlan['inputs'] = [];
  const chains: string[] = [];
  const total = timeline.totalSec;
  const fmt = `aresample=${MIX_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo`;

  // Narration clips at their timeline positions.
  const narrLabels: string[] = [];
  for (const seg of timeline.segments) {
    if (!seg.audioAssetId) continue;
    const file = files.get(seg.audioAssetId);
    if (!file) {
      notes.push(`Narration file for "${seg.id}" is missing; the segment is silent.`);
      continue;
    }
    const idx = inputs.push({ file, loop: false }) - 1;
    const label = `n${idx}`;
    chains.push(`[${idx}:a]${fmt},adelay=${Math.round(seg.startSec * 1000)}:all=1,volume=${db(project.audio.narrationGainDb)}dB[${label}]`);
    narrLabels.push(`[${label}]`);
  }
  const buses: string[] = [];
  let narrBus = '';
  if (narrLabels.length) {
    chains.push(`${narrLabels.join('')}amix=inputs=${narrLabels.length}:normalize=0:duration=longest[narr]`);
    narrBus = '[narr]';
    buses.push(narrBus);
  }

  // Music with fades, keyframes and deterministic ducking from the known narration windows.
  const windows = narrationWindows(timeline);
  project.audio.music.forEach((m, mi) => {
    const file = files.get(m.assetId);
    if (!file) {
      notes.push(`Music file for track "${m.id}" is missing; the track is skipped.`);
      return;
    }
    const idx = inputs.push({ file, loop: m.loop }) - 1;
    const end = Math.min(total, m.endSec ?? total);
    const dur = Math.max(0.1, end - m.startSec);
    const label = `m${mi}`;
    const keys = m.keyframes.map((k) => {
      const shot = k.shotId ? timeline.shots.find((x) => x.id === k.shotId) : undefined;
      if (k.shotId && !shot) notes.push(`Music keyframe refers to unknown shot "${k.shotId}"; using project time.`);
      return { atSec: Math.max(0, (shot ? shot.startSec : 0) + k.atSec), gainDb: k.gainDb };
    });
    const gain = `${db(m.gainDb)}+${keyframeExpr(keys)}-(${duckExpr(windows, m)})`;
    const fadeOutStart = Math.max(0, dur - m.fadeOutSec);
    const f = [
      `[${idx}:a]${fmt}`,
      `atrim=0:${dur.toFixed(3)}`,
      m.fadeInSec > 0 ? `afade=t=in:st=0:d=${m.fadeInSec}` : '',
      m.fadeOutSec > 0 ? `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${m.fadeOutSec}` : '',
      `adelay=${Math.round(m.startSec * 1000)}:all=1`,
      // The envelope is a function of project time, which is what `t` is after adelay.
      `volume='pow(10,(${gain})/20)':eval=frame`,
    ].filter(Boolean);
    chains.push(`${f.join(',')}[${label}]`);
    buses.push(`[${label}]`);
  });

  // Sound effects from shot cues.
  project.shots.forEach((shot, si) => {
    const r = timeline.shots[si]!;
    for (const cue of shot.soundCues) {
      const file = files.get(cue.assetId);
      if (!file) {
        notes.push(`Sound cue "${cue.id}" in shot "${shot.id}" has no file; skipped.`);
        continue;
      }
      const idx = inputs.push({ file, loop: false }) - 1;
      const at = Math.max(0, r.startSec + cue.atSec);
      chains.push(`[${idx}:a]${fmt},adelay=${Math.round(at * 1000)}:all=1,volume=${db(cue.gainDb)}dB[s${idx}]`);
      buses.push(`[s${idx}]`);
    }
  });

  if (!buses.length) {
    chains.push(`anullsrc=r=${MIX_RATE}:cl=stereo,atrim=0:${total.toFixed(3)}[out]`);
  } else {
    chains.push(`${buses.join('')}amix=inputs=${buses.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[out]`);
  }
  return { inputs, filter: chains.join(';\n'), durationSec: total, notes };
}

export interface LoudnessMeasure {
  inputI: number;
  inputTP: number;
  inputLRA: number;
  inputThresh: number;
  targetOffset: number;
}

/** Measure integrated loudness with loudnorm (pass one of two-pass normalization). */
export async function measureLoudness(file: string, target: { lufs: number; tp: number }, opts: RunOptions = {}): Promise<LoudnessMeasure> {
  const r = await ffmpeg(['-i', file, '-af', `loudnorm=I=${target.lufs}:TP=${target.tp}:LRA=11:print_format=json`, '-f', 'null', '-'], opts);
  const m = r.stderr.match(/\{[\s\S]*?"target_offset"[\s\S]*?\}/);
  if (!m) throw new Error('Could not read loudness measurement from ffmpeg.');
  const j = JSON.parse(m[0]) as Record<string, string>;
  return { inputI: Number(j.input_i), inputTP: Number(j.input_tp), inputLRA: Number(j.input_lra), inputThresh: Number(j.input_thresh), targetOffset: Number(j.target_offset) };
}

export interface MixResult {
  file: string;
  plan: MixPlan;
  measuredBefore?: LoudnessMeasure;
  /** Set when the signal was silent and normalization was skipped. */
  skippedNormalization?: string;
}

/** Build the project's final audio: premix to float, measure, then linear loudness normalization. */
export async function renderMix(input: MixInputs, outFile: string, opts: RunOptions = {}): Promise<MixResult> {
  const plan = planMix(input);
  const dir = path.dirname(outFile);
  await fs.mkdir(dir, { recursive: true });
  const scriptFile = path.join(dir, 'mix.filter.txt');
  await fs.writeFile(scriptFile, plan.filter);
  const raw = path.join(dir, 'mix.raw.wav');
  const args: string[] = ['-y'];
  for (const i of plan.inputs) args.push(...(i.loop ? ['-stream_loop', '-1'] : []), '-i', i.file);
  args.push('-filter_complex_script', scriptFile, '-map', '[out]', '-c:a', 'pcm_f32le', '-ar', String(MIX_RATE), raw);
  await ffmpeg(args, opts);

  const target = { lufs: input.project.audio.targetLufs, tp: input.project.audio.truePeakDb };
  const before = await measureLoudness(raw, target, opts);
  let af: string;
  let skipped: string | undefined;
  if (!Number.isFinite(before.inputI) || before.inputI < -60) {
    skipped = 'Mix is silent or nearly silent; loudness normalization skipped.';
    af = `alimiter=limit=${Math.pow(10, target.tp / 20).toFixed(4)}:level=0`;
  } else {
    af = `loudnorm=I=${target.lufs}:TP=${target.tp}:LRA=11:measured_I=${before.inputI}:measured_TP=${before.inputTP}:measured_LRA=${before.inputLRA}:measured_thresh=${before.inputThresh}:offset=${before.targetOffset}:linear=true,alimiter=limit=${Math.pow(10, target.tp / 20).toFixed(4)}:level=0`;
  }
  await ffmpeg(['-y', '-i', raw, '-af', `${af},aresample=${MIX_RATE}`, '-c:a', 'pcm_s16le', '-ar', String(MIX_RATE), outFile], opts);
  await fs.rm(raw, { force: true });
  const p = await probe(outFile);
  if (Math.abs(p.durationSec - plan.durationSec) > 0.1) plan.notes.push(`Mix is ${p.durationSec.toFixed(2)}s but the timeline is ${plan.durationSec.toFixed(2)}s.`);
  return { file: outFile, plan, measuredBefore: before, skippedNormalization: skipped };
}
