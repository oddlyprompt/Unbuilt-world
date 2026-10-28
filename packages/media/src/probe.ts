import { run, FFPROBE } from './exec';

export interface ProbeResult {
  path: string;
  durationSec: number;
  formatName: string;
  sizeBytes: number;
  video?: { codec: string; width: number; height: number; fps: number; pixFmt?: string; frames?: number };
  audio?: { codec: string; sampleRate: number; channels: number };
}

const frac = (s?: string) => {
  if (!s) return 0;
  const [a, b] = s.split('/').map(Number);
  return b ? a! / b : Number(a);
};

export async function probe(path: string): Promise<ProbeResult> {
  const r = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path]);
  if (r.code !== 0) throw new Error(`ffprobe cannot read ${path}: ${r.stderr.trim().split('\n')[0]}`);
  const j = JSON.parse(r.stdout) as { format: Record<string, string>; streams: Record<string, string | number>[] };
  const v = j.streams.find((s) => s.codec_type === 'video' && s.disposition !== undefined && !(s as unknown as { disposition: { attached_pic: number } }).disposition.attached_pic);
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const dur = Number(j.format.duration ?? v?.duration ?? a?.duration ?? 0);
  return {
    path,
    durationSec: Number.isFinite(dur) ? dur : 0,
    formatName: String(j.format.format_name ?? ''),
    sizeBytes: Number(j.format.size ?? 0),
    video: v
      ? { codec: String(v.codec_name), width: Number(v.width), height: Number(v.height), fps: frac(String(v.avg_frame_rate ?? v.r_frame_rate)), pixFmt: v.pix_fmt as string | undefined, frames: v.nb_frames ? Number(v.nb_frames) : undefined }
      : undefined,
    audio: a ? { codec: String(a.codec_name), sampleRate: Number(a.sample_rate), channels: Number(a.channels) } : undefined,
  };
}
