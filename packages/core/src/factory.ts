import { ProjectSchema, SCHEMA_VERSION, type Project } from './schema';
import { nowIso } from './util';

/** A new, valid, nearly empty project: one chapter and one title shot. */
export function createBlankProject(id: string, title: string, subject: string, targetRuntimeSec: number): Project {
  const now = nowIso();
  return ProjectSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id,
    title,
    subject,
    targetRuntimeSec,
    stage: 'research',
    createdAt: now,
    updatedAt: now,
    revision: 1,
    chapters: [{ id: 'ch1', index: 1, title: 'Cold open' }],
    narration: [],
    shots: [{ id: 's01', chapterId: 'ch1', sceneId: 'sc1', anchor: { kind: 'start' }, category: 'typography', component: 'opening_title', props: {}, status: 'draft' }],
  });
}

/** Summary row for the dashboard; the same numbers whether the project lives on a server or in the browser. */
export function summarize(p: Project, issueCount: number, timelineSec: number) {
  const lastRender = [...p.renders].reverse().find((r) => r.ok);
  return {
    id: p.id,
    title: p.title,
    subject: p.subject,
    stage: p.stage,
    targetRuntimeSec: p.targetRuntimeSec,
    sliceRuntimeSec: p.sliceRuntimeSec,
    timelineSec,
    chapters: p.chapters.length,
    shots: p.shots.length,
    narrationReady: p.narration.filter((n) => n.audio).length,
    narrationTotal: p.narration.length,
    placeholders: p.shots.filter((s) => s.status === 'placeholder').length,
    // Open items: timeline/asset issues, plus every placeholder shot and scratch-voice clip.
    outstanding: issueCount + p.shots.filter((s) => s.status === 'placeholder').length + p.assets.filter((a) => a.placeholder).length,
    lastRender: lastRender ? { id: lastRender.id, kind: lastRender.kind, createdAt: lastRender.createdAt, relPath: lastRender.relPath } : undefined,
    updatedAt: p.updatedAt,
  };
}
