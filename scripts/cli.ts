/** Command line access to the production pipeline: tsx scripts/cli.ts <command> <project> [options] */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProject, formatTime, resolveTimeline } from '@uw/core';
import { loadProject } from '@uw/core/node';
import { ensureMix, importNarration, narrate, renderProject, syncAssetMetadata, type Quality, type RenderKind } from '../apps/worker/src/pipeline';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, projectId, ...rest] = process.argv.slice(2);
const flag = (n: string) => rest.includes(`--${n}`);
const opt = (n: string) => {
  const i = rest.indexOf(`--${n}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

if (!cmd || !projectId) {
  console.log(`usage:
  cli.ts timeline <project>                      show the resolved timeline and issues
  cli.ts narrate <project> [--force] [--provider local-espeak|elevenlabs] [--voice ID] [--confirm-paid]
  cli.ts import-narration <project> <segment> <audio-file>
  cli.ts mix <project>                           build the audio mix
  cli.ts render <project> <preview|scene|chapter|full> [--scene ID|--shot ID|--chapter ID] [--quality draft|final|ultra]`);
  process.exit(1);
}

const dir = path.join(root, 'projects', projectId);
const ctx = {
  dir,
  log: (m: string) => console.log(m),
  progress: (stage: string, f: number) => {
    if (process.stdout.isTTY) process.stdout.write(`\r${stage} ${(f * 100).toFixed(0)}%   `);
    else if (Math.round(f * 100) % 20 === 0) console.log(`${stage} ${(f * 100).toFixed(0)}%`);
  },
};

try {
  if (cmd === 'timeline') {
    const p = await syncAssetMetadata(dir);
    const t = resolveTimeline(p);
    console.log(`${p.title}: ${formatTime(t.totalSec)} (${t.totalFrames} frames @ ${t.fps} fps), narration ${formatTime(t.narrationStartSec)}–${formatTime(t.narrationEndSec)}`);
    for (const s of t.shots) console.log(`  ${s.id.padEnd(5)} ${formatTime(s.startSec)} → ${formatTime(s.endSec)}  (${(s.endSec - s.startSec).toFixed(2)}s)  ${p.shots[s.index]!.component}`);
    for (const i of checkProject(p, t)) console.log(`  [${i.severity}] ${i.message}`);
  } else if (cmd === 'narrate') {
    await narrate(ctx, { force: flag('force'), provider: opt('provider') as 'local-espeak' | 'elevenlabs' | undefined, voice: opt('voice'), confirmPaid: flag('confirm-paid') });
    const t = resolveTimeline(await loadProject(dir));
    console.log(`Narration ends at ${formatTime(t.narrationEndSec)}; video length ${formatTime(t.totalSec)}.`);
  } else if (cmd === 'import-narration') {
    await importNarration(dir, rest[0]!, path.resolve(rest[1]!));
    console.log('Imported.');
  } else if (cmd === 'mix') {
    const p = await loadProject(dir);
    const r = await ensureMix(ctx, p, resolveTimeline(p));
    console.log(r.file, r.notes.join('; '));
  } else if (cmd === 'render') {
    const kind = (rest[0] ?? 'preview') as RenderKind;
    const out = await renderProject(ctx, { kind, sceneId: opt('scene'), shotId: opt('shot'), chapterId: opt('chapter'), quality: opt('quality') as Quality | undefined });
    console.log('\n' + out.validation.checks.map((c) => `${c.ok ? 'PASS' : c.required ? 'FAIL' : 'warn'}  ${c.name}: ${c.detail}`).join('\n'));
    console.log(`\n${out.ok ? 'RENDER OK' : 'RENDER FAILED VALIDATION'}: ${out.outputPath}`);
    process.exit(out.ok ? 0 : 2);
  } else {
    console.error(`unknown command ${cmd}`);
    process.exit(1);
  }
} catch (e) {
  console.error(`\nERROR: ${(e as Error).message}`);
  process.exit(1);
}
