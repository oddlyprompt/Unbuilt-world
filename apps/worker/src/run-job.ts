/**
 * Child process entry for one background job. The studio server spawns it so a job can be cancelled
 * by killing the process and a crash cannot take the server down. Protocol: the job description is a
 * JSON file passed as argv[2]; progress and the result are printed to stdout as lines starting "@@".
 */
import { promises as fs } from 'node:fs';
import { resolveTimeline } from '@uw/core';
import { loadProject } from '@uw/core/node';
import { analyzeAudio } from '@uw/media';
import { ensureMix, importNarration, narrate, renderProject, syncAssetMetadata, type NarrateOptions, type RenderOptions } from './pipeline';

export type JobSpec =
  | { type: 'narrate'; dir: string; params: NarrateOptions }
  | { type: 'mix'; dir: string; params: Record<string, never> }
  | { type: 'render'; dir: string; params: RenderOptions }
  | { type: 'sync-assets'; dir: string; params: Record<string, never> }
  | { type: 'import-narration'; dir: string; params: { segmentId: string; source: string } };

const emit = (o: Record<string, unknown>) => process.stdout.write(`@@${JSON.stringify(o)}\n`);

const spec = JSON.parse(await fs.readFile(process.argv[2]!, 'utf8')) as JobSpec;
const ac = new AbortController();
process.on('SIGTERM', () => {
  emit({ type: 'log', message: 'Cancelling…' });
  ac.abort();
  setTimeout(() => process.exit(130), 4000).unref();
});

const ctx = {
  dir: spec.dir,
  signal: ac.signal,
  log: (message: string) => emit({ type: 'log', message }),
  progress: (stage: string, fraction: number, detail?: Record<string, unknown>) => emit({ type: 'progress', stage, fraction, ...detail }),
};

try {
  let result: Record<string, unknown> = {};
  if (spec.type === 'narrate') {
    const p = await narrate(ctx, spec.params);
    const t = resolveTimeline(p);
    result = { narrationEndSec: t.narrationEndSec, totalSec: t.totalSec };
  } else if (spec.type === 'mix') {
    const p = await loadProject(spec.dir);
    const t = resolveTimeline(p);
    const m = await ensureMix(ctx, p, t);
    const a = await analyzeAudio(m.file);
    result = { mix: m.relPath, reused: m.reused, notes: m.notes, analysis: a };
  } else if (spec.type === 'render') {
    const r = await renderProject(ctx, spec.params);
    result = {
      ok: r.ok,
      renderId: r.record.id,
      relPath: r.record.relPath,
      durationSec: r.record.durationSec,
      checks: r.validation.checks,
      sync: r.sync,
      warnings: r.warnings,
      contactSheet: r.validation.contactSheet ? r.validation.contactSheet.slice(spec.dir.length + 1) : undefined,
    };
    if (!r.ok) {
      emit({ type: 'result', ok: false, error: `Render did not pass validation: ${r.validation.checks.filter((c) => c.required && !c.ok).map((c) => `${c.name} (${c.detail})`).join('; ')}`, result });
      process.exit(0);
    }
  } else if (spec.type === 'sync-assets') {
    const p = await syncAssetMetadata(spec.dir);
    result = { assets: p.assets.length };
  } else if (spec.type === 'import-narration') {
    await importNarration(spec.dir, spec.params.segmentId, spec.params.source);
  }
  emit({ type: 'result', ok: true, result });
  process.exit(0);
} catch (e) {
  emit({ type: 'result', ok: false, error: ac.signal.aborted ? 'Cancelled.' : (e as Error).message });
  process.exit(ac.signal.aborted ? 130 : 1);
}
