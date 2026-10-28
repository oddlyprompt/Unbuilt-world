/**
 * Packs the pilot into static files for the website's demo mode (apps/studio/web/public/demo).
 * Re-run after changing the pilot or re-rendering it, then commit the output. Needs ffmpeg and a
 * finished full render plus mix in projects/cybersyn-pilot.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTimeline, mixHash } from '@uw/core';
import { loadProject } from '@uw/core/node';
import { ffmpeg } from '@uw/media';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'projects/cybersyn-pilot');
const out = path.join(root, 'apps/studio/web/public/demo/cybersyn-pilot');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

const project = await loadProject(src);
const timeline = resolveTimeline(project);
const hash = mixHash(project, timeline);
const mix = path.join(src, `.build/mix-${hash}.wav`);
await fs.stat(mix).catch(() => { throw new Error(`Current mix ${mix} not found. Run: npx tsx scripts/cli.ts mix cybersyn-pilot`); });

// Audio assets as small MP3s next to where the project says they live (extension swapped).
let bytes = 0;
for (const a of project.assets) {
  if (!['audio', 'music', 'sfx'].includes(a.kind)) continue;
  const from = path.join(src, a.relPath);
  const to = path.join(out, a.relPath.replace(/\.wav$/i, '.mp3'));
  await fs.mkdir(path.dirname(to), { recursive: true });
  await ffmpeg(['-y', '-i', from, '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '2', to]);
  bytes += (await fs.stat(to)).size;
}
await ffmpeg(['-y', '-i', mix, '-c:a', 'libmp3lame', '-b:a', '160k', path.join(out, 'mix.mp3')]);

// The latest validated full render, with local paths removed from its report.
const full = [...project.renders].reverse().find((r) => r.kind === 'full' && r.ok);
if (!full) throw new Error('No validated full render in project.renders.');
const rdir = path.join(out, path.dirname(full.relPath));
await fs.mkdir(path.join(rdir, 'frames'), { recursive: true });
await ffmpeg(['-y', '-i', path.join(src, full.relPath), '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(out, full.relPath)]);
await fs.copyFile(path.join(src, path.dirname(full.relPath), 'frames/contact-sheet.jpg'), path.join(rdir, 'frames/contact-sheet.jpg'));
const v = JSON.parse(await fs.readFile(path.join(src, full.validationRelPath!), 'utf8')) as Record<string, unknown>;
const scrub = (x: unknown): unknown => (typeof x === 'string' ? x.split(src).join('.') : Array.isArray(x) ? x.map(scrub) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, scrub(y)])) : x);
await fs.writeFile(path.join(out, full.validationRelPath!), JSON.stringify(scrub(v)));

const demo = structuredClone(project);
demo.renders = [{ ...full, relPath: full.relPath }];
await fs.writeFile(path.join(out, 'project.json'), JSON.stringify(demo));
await fs.writeFile(path.join(out, 'demo.json'), JSON.stringify({ id: project.id, mixHash: hash, mix: 'mix.mp3', files: project.assets.map((a) => a.relPath), builtAt: new Date().toISOString() }));
console.log(`demo data: ${(bytes / 1e6).toFixed(1)} MB audio, video ${((await fs.stat(path.join(out, full.relPath))).size / 1e6).toFixed(1)} MB`);
