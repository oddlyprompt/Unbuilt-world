import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectSchema, SCHEMA_VERSION, type Project, type Shot } from '@uw/core';

export const NOW = '2026-01-01T00:00:00.000Z';

export function shot(id: string, extra: Partial<Shot> = {}): Shot {
  return {
    id,
    chapterId: 'ch1',
    sceneId: 'sc1',
    anchor: { kind: 'start' },
    narrationText: '',
    category: 'typography',
    component: 'blank',
    props: {},
    camera: { preset: 'static', intensity: 0.5, focus: { x: 0.5, y: 0.5 }, easing: 'inOutSine' },
    overlays: [],
    transitionIn: { type: 'cut', durationSec: 0 },
    soundCues: [],
    claimIds: [],
    reconstruction: { isReconstruction: false },
    status: 'draft',
    ...extra,
  };
}

/** A small project: three narration segments, three shots anchored to words. No audio unless added. */
export function miniProject(over: Partial<Project> = {}): Project {
  return ProjectSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: 'mini',
    title: 'Mini',
    targetRuntimeSec: 600,
    createdAt: NOW,
    updatedAt: NOW,
    revision: 1,
    settings: { fps: 30, width: 1920, height: 1080, narrationWpm: 150, leadInSec: 1, tailSec: 1 },
    chapters: [{ id: 'ch1', index: 1, title: 'One' }],
    narration: [
      { id: 'n1', chapterId: 'ch1', text: 'This is the first sentence of the test.', gapBeforeSec: 0.5 },
      { id: 'n2', chapterId: 'ch1', text: 'Here comes a second one that is a little longer than the first.', gapBeforeSec: 0.5 },
      { id: 'n3', chapterId: 'ch1', text: 'And a short end.', gapBeforeSec: 0.5 },
    ],
    shots: [
      shot('a'),
      shot('b', { anchor: { kind: 'segment', segmentId: 'n2', word: 0, offsetSec: 0 } }),
      shot('c', { anchor: { kind: 'segment', segmentId: 'n3', word: 0, offsetSec: 0 } }),
    ],
    ...over,
  });
}

export async function tmpDir(prefix = 'uw-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
