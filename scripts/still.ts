/** Render still frames to look at: tsx scripts/still.ts <project> <outDir> <shotId[@sec]>... */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { resolveTimeline } from '@uw/core';
import { loadProject } from '@uw/core/node';
import { composeEpisode } from '@uw/renderer';
import { ensureBundle, findBrowser } from '../apps/worker/src/bundle';
import { serveProjectDir } from '../apps/worker/src/files';

const [projectId, outDir, ...specs] = process.argv.slice(2);
const dir = path.resolve('projects', projectId!);
const project = await loadProject(dir);
const timeline = resolveTimeline(project);
const server = await serveProjectDir(dir);
const present = new Set<string>();
for (const a of project.assets) if (await fs.stat(path.join(dir, a.relPath)).then(() => true, () => false)) present.add(a.id);
const props = composeEpisode(project, timeline, { urlFor: (r) => `${server.baseUrl}/${r}`, existing: present }) as unknown as Record<string, unknown>;
const serveUrl = await ensureBundle(console.log);
const browserExecutable = await findBrowser();
const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions: {} });
const composition = await selectComposition({ serveUrl, id: 'Episode', inputProps: props, puppeteerInstance: browser, logLevel: 'error' });
await fs.mkdir(outDir!, { recursive: true });
for (const spec of specs) {
  const [id, at] = spec.split('@');
  const r = timeline.shots.find((s) => s.id === id);
  if (!r) throw new Error(`no shot ${id}`);
  const sec = at ? Number(at) : (r.endSec - r.startSec) / 2;
  const frame = Math.min(timeline.totalFrames - 1, r.startFrame + Math.round(sec * timeline.fps));
  const out = path.join(outDir!, `${id}-${sec.toFixed(1)}s.png`);
  await renderStill({ composition, serveUrl, output: out, frame, inputProps: props, puppeteerInstance: browser, logLevel: 'error', scale: 0.6 });
  console.log(out);
}
await browser.close({ silent: true });
await server.close();
