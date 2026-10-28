import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Timeline } from '@uw/core';
import { FFMPEG, ffmpeg, run } from '@uw/media';

export interface SyncReport {
  ok: boolean;
  /** Positive: the rendered audio is later than the timeline says. */
  lagMs: number;
  correlation: number;
  detail: string;
}

const RATE = 8000;
const HOP = 80; // samples per envelope frame = 10 ms

async function pcm(args: string[]): Promise<Float32Array> {
  const r = await new Promise<Buffer>((resolve, reject) => {
    import('node:child_process').then(({ spawn }) => {
      const c = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-v', 'error', ...args, '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let err = '';
      c.stdout.on('data', (d) => chunks.push(d));
      c.stderr.on('data', (d) => (err += d));
      c.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err.trim() || `ffmpeg exit ${code}`))));
      c.on('error', reject);
    });
  });
  return new Float32Array(r.buffer, r.byteOffset, Math.floor(r.byteLength / 4));
}

function envelope(x: Float32Array): Float64Array {
  const n = Math.floor(x.length / HOP);
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < HOP; k++) s += x[i * HOP + k]! ** 2;
    e[i] = Math.sqrt(s / HOP);
  }
  // Compress so quiet words count as much as loud ones, then remove the mean.
  let mean = 0;
  for (let i = 0; i < n; i++) {
    e[i] = Math.log10(1e-4 + e[i]!);
    mean += e[i]!;
  }
  mean /= n || 1;
  for (let i = 0; i < n; i++) e[i] = e[i]! - mean;
  return e;
}

/**
 * Prove that narration in the rendered file sits where the timeline put it. The narration is rebuilt
 * on its own at the planned positions and compared with the audio of the video by envelope correlation.
 */
export async function checkAudioSync(o: { video: string; timeline: Timeline; files: Map<string, string>; offsetSec: number; workDir: string; maxLagMs?: number }): Promise<SyncReport> {
  await fs.mkdir(o.workDir, { recursive: true });
  const segs = o.timeline.segments.filter((s) => s.audioAssetId && o.files.has(s.audioAssetId));
  if (!segs.length) return { ok: true, lagMs: 0, correlation: 0, detail: 'No narration audio to compare.' };
  const dur = (o.timeline.totalFrames / o.timeline.fps) - o.offsetSec;
  const args: string[] = [];
  const chains: string[] = [];
  segs.forEach((s, i) => {
    args.push('-i', o.files.get(s.audioAssetId!)!);
    chains.push(`[${i}:a]aresample=${RATE},aformat=channel_layouts=mono,adelay=${Math.round(s.startSec * 1000)}:all=1[a${i}]`);
  });
  const mixed = `${segs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${segs.length}:normalize=0:duration=longest,atrim=start=${o.offsetSec.toFixed(3)},asetpts=PTS-STARTPTS,apad=whole_dur=${dur.toFixed(3)},atrim=0:${dur.toFixed(3)}[ref]`;
  const script = path.join(o.workDir, 'ref.filter.txt');
  await fs.writeFile(script, [...chains, mixed].join(';\n'));
  const ref = await pcm([...args, '-filter_complex_script', script, '-map', '[ref]', '-ar', String(RATE)]);
  const vid = await pcm(['-i', o.video, '-vn', '-ac', '1', '-ar', String(RATE)]);

  const a = envelope(ref);
  const b = envelope(vid);
  const n = Math.min(a.length, b.length);
  const maxLag = 100; // ±1 s
  let best = { lag: 0, c: -Infinity };
  let norm = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  norm = Math.sqrt(na * nb) || 1;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = Math.max(0, -lag); i < n - Math.max(0, lag); i++) c += a[i]! * b[i + lag]!;
    c /= norm;
    if (c > best.c) best = { lag, c };
  }
  const lagMs = best.lag * 10;
  const limit = o.maxLagMs ?? 80;
  const ok = Math.abs(lagMs) <= limit && best.c > 0.4;
  void run;
  void ffmpeg;
  return { ok, lagMs, correlation: +best.c.toFixed(3), detail: `audio offset ${lagMs} ms (limit ±${limit} ms), envelope correlation ${best.c.toFixed(2)}` };
}
