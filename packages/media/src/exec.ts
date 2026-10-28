import { spawn } from 'node:child_process';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  signal?: AbortSignal;
  onStderrLine?: (line: string) => void;
  cwd?: string;
}

/** Run a program without a shell (arguments are never interpreted), with cancellation. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let buf = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => {
      const s = String(d);
      stderr += s;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
      if (opts.onStderrLine) {
        buf += s;
        const lines = buf.split(/\r|\n/);
        buf = lines.pop() ?? '';
        for (const l of lines) if (l) opts.onStderrLine(l);
      }
    });
    child.on('error', (e) => reject(new Error(`Could not start ${cmd}: ${e.message}. Is it installed and on PATH?`)));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (opts.signal) {
      const kill = () => child.kill('SIGKILL');
      if (opts.signal.aborted) kill();
      else opts.signal.addEventListener('abort', kill, { once: true });
    }
  });
}

export async function ffmpeg(args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const r = await run(FFMPEG, ['-hide_banner', '-nostdin', ...args], opts);
  if (r.code !== 0) throw new Error(`ffmpeg failed (exit ${r.code}): ${r.stderr.trim().split('\n').slice(-6).join('\n')}`);
  return r;
}
