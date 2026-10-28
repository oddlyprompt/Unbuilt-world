import { ffmpeg, type RunOptions } from './exec';

export interface AudioAnalysis {
  durationSec?: number;
  /** Highest sample peak, dBFS. */
  peakDb: number;
  meanDb: number;
  integratedLufs?: number;
  truePeakDb?: number;
  loudnessRange?: number;
  /** Intervals of digital silence longer than `minSilenceSec`. */
  silences: { start: number; end: number; duration: number }[];
  clipped: boolean;
  warnings: string[];
}

/** Peak, loudness, clipping and silence in one pass each. Warnings are plain language. */
export async function analyzeAudio(file: string, opts: RunOptions & { minSilenceSec?: number; silenceDb?: number } = {}): Promise<AudioAnalysis> {
  const minSil = opts.minSilenceSec ?? 2;
  const vol = await ffmpeg(['-i', file, '-af', `volumedetect,silencedetect=noise=${opts.silenceDb ?? -50}dB:d=${minSil}`, '-vn', '-f', 'null', '-'], opts);
  const num = (re: RegExp) => {
    const m = vol.stderr.match(re);
    return m ? Number(m[1]) : NaN;
  };
  const peakDb = num(/max_volume:\s*(-?[\d.]+|-?inf) dB/);
  const meanDb = num(/mean_volume:\s*(-?[\d.]+|-?inf) dB/);
  const silences: AudioAnalysis['silences'] = [];
  let start: number | undefined;
  for (const line of vol.stderr.split('\n')) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) start = Math.max(0, Number(s[1]));
    const e = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (e) {
      silences.push({ start: start ?? Number(e[1]) - Number(e[2]), end: Number(e[1]), duration: Number(e[2]) });
      start = undefined;
    }
  }
  const eb = await ffmpeg(['-i', file, '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-'], opts);
  const tail = eb.stderr.slice(eb.stderr.lastIndexOf('Summary:'));
  const grab = (re: RegExp) => {
    const m = tail.match(re);
    return m ? Number(m[1]) : undefined;
  };
  const integratedLufs = grab(/I:\s*(-?[\d.]+) LUFS/);
  const loudnessRange = grab(/LRA:\s*([\d.]+) LU/);
  const truePeakDb = grab(/Peak:\s*(-?[\d.]+) dBFS/);

  const warnings: string[] = [];
  const clipped = Number.isFinite(peakDb) && peakDb >= -0.1;
  if (clipped) warnings.push(`Audio peaks at ${peakDb} dBFS and is likely clipping. Lower the music or narration gain.`);
  if (truePeakDb !== undefined && truePeakDb > -1) warnings.push(`True peak is ${truePeakDb} dBTP; platforms may clip it after re-encoding.`);
  if (integratedLufs !== undefined && integratedLufs < -24) warnings.push(`Programme loudness is ${integratedLufs} LUFS; this is quiet for online video.`);
  if (integratedLufs !== undefined && integratedLufs > -12) warnings.push(`Programme loudness is ${integratedLufs} LUFS; this is louder than most platforms play back.`);
  for (const s of silences) warnings.push(`Silence of ${s.duration.toFixed(1)}s at ${s.start.toFixed(1)}s.`);
  return { peakDb, meanDb, integratedLufs, truePeakDb, loudnessRange, silences, clipped, warnings };
}
