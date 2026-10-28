import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { hashString } from '@uw/core';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../../..');
const RENDERER_SRC = path.join(REPO_ROOT, 'packages/renderer');
const CORE_SRC = path.join(REPO_ROOT, 'packages/core/src');

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Fingerprint of everything that goes into the video bundle, so it is rebuilt only when code changes. */
export async function sourceFingerprint(): Promise<string> {
  const parts: string[] = [];
  for (const root of [RENDERER_SRC, CORE_SRC]) {
    for await (const f of walk(root)) {
      const st = await fs.stat(f);
      parts.push(`${path.relative(REPO_ROOT, f)}:${st.size}:${Math.floor(st.mtimeMs)}`);
    }
  }
  return hashString(parts.sort().join('\n'));
}

/** Returns a built Remotion bundle directory, reusing a cached one when the sources have not changed. */
export async function ensureBundle(log: (m: string) => void = () => {}): Promise<string> {
  const cacheRoot = path.join(REPO_ROOT, '.cache', 'remotion');
  const fp = await sourceFingerprint();
  const dir = path.join(cacheRoot, fp);
  if (await fs.stat(path.join(dir, 'index.html')).then(() => true, () => false)) {
    log(`Using cached bundle ${fp}.`);
    return dir;
  }
  log('Bundling compositions (first render after a code change takes longer)…');
  await fs.mkdir(cacheRoot, { recursive: true });
  const out = await bundle({
    entryPoint: path.join(RENDERER_SRC, 'src/remotion/index.ts'),
    outDir: dir,
    onProgress: () => {},
  });
  // Keep only the newest few bundles.
  const olds = (await fs.readdir(cacheRoot)).filter((d) => d !== fp);
  const stats = await Promise.all(olds.map(async (d) => ({ d, t: (await fs.stat(path.join(cacheRoot, d))).mtimeMs })));
  for (const { d } of stats.sort((a, b) => b.t - a.t).slice(2)) await fs.rm(path.join(cacheRoot, d), { recursive: true, force: true });
  return out;
}

/** The Chromium that Remotion should use: an explicit path, a preinstalled headless shell, or Remotion's own download. */
export async function findBrowser(): Promise<string | null> {
  if (process.env.UW_CHROME) return process.env.UW_CHROME;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(process.env.HOME ?? '', '.cache/ms-playwright')].filter(Boolean) as string[];
  for (const r of roots) {
    try {
      for (const d of (await fs.readdir(r)).filter((x) => x.startsWith('chromium_headless_shell')).sort().reverse()) {
        const exe = path.join(r, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
        if (await fs.stat(exe).then(() => true, () => false)) return exe;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}
