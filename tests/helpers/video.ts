import { ffmpeg } from '@uw/media';
import { spawn } from 'node:child_process';

/** Mean colour of one frame of a video at `sec`, as [r,g,b] 0–255 (scaled down to one pixel). */
export function meanColor(file: string, sec: number): Promise<[number, number, number]> {
  return new Promise((resolve, reject) => {
    const c = spawn('ffmpeg', ['-v', 'error', '-ss', String(sec), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    c.stdout.on('data', (d) => out.push(d));
    c.on('close', (code) => {
      const b = Buffer.concat(out);
      if (code !== 0 || b.length < 3) return reject(new Error('could not read a frame'));
      resolve([b[0]!, b[1]!, b[2]!]);
    });
  });
}

export const solidPng = (file: string, hex: string, size = '640x360') => ffmpeg(['-y', '-f', 'lavfi', '-i', `color=c=0x${hex}:s=${size}`, '-frames:v', '1', file]);
