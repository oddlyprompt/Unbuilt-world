import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ffmpeg, run, FFMPEG, type RunOptions } from './exec';
import { probe, type ProbeResult } from './probe';
import { analyzeAudio, type AudioAnalysis } from './analyze';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** Failing a required check means the render is NOT reported as successful. */
  required: boolean;
}

export interface ValidationReport {
  file: string;
  ok: boolean;
  checks: Check[];
  probe?: ProbeResult;
  audio?: AudioAnalysis;
  blackIntervals: { start: number; end: number }[];
  frames: string[];
  contactSheet?: string;
}

export interface ValidateOptions extends RunOptions {
  expectedDurationSec: number;
  toleranceSec?: number;
  width: number;
  height: number;
  fps?: number;
  requireAudio?: boolean;
  /** Intervals where black frames are intended (fades from black, the tonal beat), seconds. */
  allowedBlack?: [number, number][];
  maxBlackSec?: number;
  /** Times (seconds) to pull representative frames from. */
  frameTimes?: number[];
  outDir: string;
}

/** Decode the whole file; any decoder error output counts as a failure. */
async function decodeCheck(file: string, opts: RunOptions): Promise<{ ok: boolean; detail: string }> {
  const r = await run(FFMPEG, ['-v', 'error', '-nostdin', '-i', file, '-f', 'null', '-'], opts);
  const msg = r.stderr.trim();
  return r.code === 0 && !msg ? { ok: true, detail: 'Full decode produced no errors.' } : { ok: false, detail: `Decode problems: ${msg.split('\n').slice(0, 3).join(' | ') || `exit ${r.code}`}` };
}

export async function detectBlack(file: string, opts: RunOptions = {}): Promise<{ start: number; end: number }[]> {
  const r = await ffmpeg(['-i', file, '-vf', 'blackdetect=d=0.4:pix_th=0.06', '-an', '-f', 'null', '-'], opts);
  const out: { start: number; end: number }[] = [];
  for (const m of r.stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)) out.push({ start: Number(m[1]), end: Number(m[2]) });
  return out;
}

export async function extractFrames(file: string, times: number[], outDir: string, opts: RunOptions = {}): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true });
  const out: string[] = [];
  for (let i = 0; i < times.length; i++) {
    const f = path.join(outDir, `frame-${String(i + 1).padStart(2, '0')}-${times[i]!.toFixed(1)}s.jpg`);
    await ffmpeg(['-y', '-ss', times[i]!.toFixed(3), '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', f], opts);
    out.push(f);
  }
  return out;
}

export async function contactSheet(frames: string[], out: string, cols = 4, opts: RunOptions = {}): Promise<void> {
  if (!frames.length) return;
  const rows = Math.ceil(frames.length / cols);
  const args = ['-y'];
  for (const f of frames) args.push('-i', f);
  const labels = frames.map((_, i) => `[${i}:v]scale=480:-2[v${i}]`).join(';');
  const stack = frames.map((_, i) => `[v${i}]`).join('');
  await ffmpeg([...args, '-filter_complex', `${labels};${stack}xstack=inputs=${frames.length}:layout=${frames.map((_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|')}:fill=black[o]`, '-map', '[o]', '-frames:v', '1', '-q:v', '3', out], opts);
  void rows;
}

/** Decide whether a render is real: never based on "the file exists" alone. */
export async function validateVideo(file: string, o: ValidateOptions): Promise<ValidationReport> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, required = true) => checks.push({ name, ok, detail, required });
  const report: ValidationReport = { file, ok: false, checks, blackIntervals: [], frames: [] };

  const st = await fs.stat(file).catch(() => null);
  add('file exists', !!st && st.size > 1000, st ? `${(st.size / 1e6).toFixed(2)} MB` : 'not found');
  if (!st || st.size <= 1000) return report;

  let p: ProbeResult;
  try {
    p = await probe(file);
  } catch (e) {
    add('readable by ffprobe', false, (e as Error).message);
    return report;
  }
  report.probe = p;
  add('readable by ffprobe', true, p.formatName);
  add('video stream', !!p.video, p.video ? `${p.video.codec} ${p.video.width}x${p.video.height} @ ${p.video.fps.toFixed(2)} fps` : 'none');
  add('H.264 video', p.video?.codec === 'h264', p.video?.codec ?? 'none');
  add('resolution', p.video?.width === o.width && p.video?.height === o.height, `${p.video?.width}x${p.video?.height}, expected ${o.width}x${o.height}`);
  if (o.fps) add('frame rate', Math.abs((p.video?.fps ?? 0) - o.fps) < 0.05, `${p.video?.fps.toFixed(3)}, expected ${o.fps}`);
  const tol = o.toleranceSec ?? 0.25;
  add('duration', Math.abs(p.durationSec - o.expectedDurationSec) <= tol, `${p.durationSec.toFixed(2)}s, expected ${o.expectedDurationSec.toFixed(2)}s ±${tol}s`);
  if (o.requireAudio !== false) add('audio stream', !!p.audio, p.audio ? `${p.audio.codec} ${p.audio.sampleRate} Hz ${p.audio.channels}ch` : 'none');

  const dec = await decodeCheck(file, o);
  add('decodes without errors', dec.ok, dec.detail);

  if (p.audio) {
    try {
      const a = await analyzeAudio(file, { ...o, minSilenceSec: 4 });
      report.audio = a;
      add('audio is not silent', Number.isFinite(a.meanDb) && a.meanDb > -60, `mean ${a.meanDb} dB`);
      add('audio does not clip', !a.clipped, `peak ${a.peakDb} dBFS`, false);
      if (a.integratedLufs !== undefined) add('programme loudness', a.integratedLufs > -24 && a.integratedLufs < -12, `${a.integratedLufs} LUFS`, false);
    } catch (e) {
      add('audio analysis', false, (e as Error).message, false);
    }
  }

  // Timeline gaps: unplanned black or frozen stretches.
  const black = await detectBlack(file, o).catch(() => []);
  report.blackIntervals = black;
  const allowed = o.allowedBlack ?? [];
  const maxBlack = o.maxBlackSec ?? 1.2;
  const bad = black.filter((b) => b.end - b.start > maxBlack || !allowed.some(([s, e]) => b.start >= s - 0.5 && b.end <= e + 0.5)).filter((b) => b.end - b.start > 0.6);
  add('no unexpected black gaps', bad.length === 0, bad.length ? bad.map((b) => `${b.start.toFixed(1)}–${b.end.toFixed(1)}s`).join(', ') : `${black.length} black interval(s), all expected`);

  const times = o.frameTimes ?? [];
  if (times.length) {
    try {
      report.frames = await extractFrames(file, times.map((t) => Math.min(Math.max(0, t), Math.max(0, p.durationSec - 0.1))), o.outDir, o);
      report.contactSheet = path.join(o.outDir, 'contact-sheet.jpg');
      await contactSheet(report.frames, report.contactSheet, 4, o);
    } catch (e) {
      add('frame extraction', false, (e as Error).message, false);
    }
  }
  report.ok = checks.filter((c) => c.required).every((c) => c.ok);
  return report;
}
