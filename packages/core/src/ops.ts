import type { Anchor, Asset, Project, Shot } from './schema';
import type { Timeline } from './timeline';
import { uniqueId } from './util';

/**
 * Pure edit operations. Each returns a new project and never mutates its input, so the UI can keep
 * undo history and the server can validate the result before saving.
 */

const clone = <T>(v: T): T => structuredClone(v);

export function updateShot(project: Project, shotId: string, patch: Partial<Shot>): Project {
  const p = clone(project);
  const i = p.shots.findIndex((s) => s.id === shotId);
  if (i < 0) throw new Error(`No shot "${shotId}".`);
  p.shots[i] = { ...p.shots[i]!, ...patch, id: shotId };
  return p;
}

/**
 * Change a shot's length by moving the start of the NEXT shot (a cut slides against the narration).
 * For the last shot it changes the tail after the narration instead.
 */
export function setShotDuration(project: Project, timeline: Timeline, shotId: string, durationSec: number): Project {
  const p = clone(project);
  const i = p.shots.findIndex((s) => s.id === shotId);
  if (i < 0) throw new Error(`No shot "${shotId}".`);
  const r = timeline.shots[i]!;
  const want = Math.max(0.25, durationSec);
  const delta = want - (r.endSec - r.startSec);
  if (Math.abs(delta) < 1e-6) return p;
  const next = p.shots[i + 1];
  if (!next) {
    p.settings.tailSec = Math.max(0, +(p.settings.tailSec + delta).toFixed(3));
    return p;
  }
  next.anchor = shiftAnchor(next.anchor, delta);
  return p;
}

export function shiftAnchor(a: Anchor, deltaSec: number): Anchor {
  switch (a.kind) {
    case 'segment':
      return { ...a, offsetSec: +(a.offsetSec + deltaSec).toFixed(3) };
    case 'after_narration':
      return { ...a, offsetSec: +(a.offsetSec + deltaSec).toFixed(3) };
    case 'time':
      return { ...a, sec: Math.max(0, +(a.sec + deltaSec).toFixed(3)) };
    case 'start':
      return a;
  }
}

/** The anchor that lands on an absolute time, tied to narration when the time falls inside a segment. */
export function anchorAtTime(timeline: Timeline, sec: number): Anchor {
  for (const s of timeline.segments) {
    if (sec >= s.startSec && sec < s.endSec) {
      const rel = sec - s.startSec;
      let w = 0;
      for (let k = 0; k < s.words.length; k++) if (s.words[k]!.start <= rel + 1e-9) w = k;
      return { kind: 'segment', segmentId: s.id, word: w, offsetSec: +(rel - (s.words[w]?.start ?? 0)).toFixed(3) };
    }
  }
  if (sec >= timeline.narrationEndSec) return { kind: 'after_narration', offsetSec: +(sec - timeline.narrationEndSec).toFixed(3) };
  return { kind: 'time', sec: +sec.toFixed(3) };
}

/** Split a shot in two at an absolute time. The second half copies the first's look. */
export function splitShot(project: Project, timeline: Timeline, shotId: string, atSec: number): Project {
  const p = clone(project);
  const i = p.shots.findIndex((s) => s.id === shotId);
  if (i < 0) throw new Error(`No shot "${shotId}".`);
  const r = timeline.shots[i]!;
  if (atSec <= r.startSec + 0.25 || atSec >= r.endSec - 0.25) throw new Error('Split point must be at least 0.25s inside the shot.');
  const src = p.shots[i]!;
  const copy: Shot = clone(src);
  copy.id = uniqueId(`${src.id}-b`, p.shots.map((s) => s.id));
  copy.anchor = anchorAtTime(timeline, atSec);
  copy.transitionIn = { type: 'cut', durationSec: 0 };
  copy.overlays = [];
  copy.soundCues = [];
  copy.camera = { ...copy.camera, preset: copy.camera.preset === 'static' ? 'static' : 'drift' };
  p.shots.splice(i + 1, 0, copy);
  return p;
}

/** Merge a shot into the one before it; the earlier shot now runs through both. */
export function mergeWithPrevious(project: Project, shotId: string): Project {
  const p = clone(project);
  const i = p.shots.findIndex((s) => s.id === shotId);
  if (i <= 0) throw new Error('Nothing to merge with.');
  p.shots.splice(i, 1);
  return p;
}

/**
 * Move a shot to a new position. The timing slots stay where they are (shot k keeps the k-th anchor),
 * so reordering swaps which picture sits on which stretch of narration.
 */
export function moveShot(project: Project, from: number, to: number): Project {
  const p = clone(project);
  if (from === to || from < 0 || to < 0 || from >= p.shots.length || to >= p.shots.length) return p;
  const anchors = p.shots.map((s) => s.anchor);
  const transitions = p.shots.map((s) => s.transitionIn);
  const [m] = p.shots.splice(from, 1);
  p.shots.splice(to, 0, m!);
  p.shots.forEach((s, k) => {
    s.anchor = anchors[k]!;
    s.transitionIn = k === 0 ? { type: 'cut', durationSec: 0 } : transitions[k]!;
  });
  return p;
}

export function deleteShot(project: Project, shotId: string): Project {
  const p = clone(project);
  const i = p.shots.findIndex((s) => s.id === shotId);
  if (i < 0) throw new Error(`No shot "${shotId}".`);
  if (i === 0) throw new Error('The first shot cannot be deleted; merge or replace it.');
  p.shots.splice(i, 1);
  return p;
}

/** Point a shot at a different asset (or clear it to return to the built-in artwork). */
export function assignAsset(project: Project, shotId: string, assetId: string | undefined): Project {
  if (assetId && !project.assets.some((a) => a.id === assetId)) throw new Error(`No asset "${assetId}".`);
  const asset = project.assets.find((a) => a.id === assetId);
  const patch: Partial<Shot> = { assetId };
  if (asset && !asset.placeholder) patch.status = 'ready';
  return updateShot(project, shotId, patch);
}

export function upsertAsset(project: Project, asset: Asset): Project {
  const p = clone(project);
  const i = p.assets.findIndex((a) => a.id === asset.id);
  if (i >= 0) p.assets[i] = asset;
  else p.assets.push(asset);
  return p;
}

/** Why an asset is not ready to publish. Empty when it is fine. */
export function assetProblems(a: Asset): string[] {
  const out: string[] = [];
  if (a.placeholder) out.push('placeholder: replace before publication');
  if (a.licenseStatus === 'unknown' || a.licenseStatus === 'needs_clearance') out.push('license not cleared');
  if (a.attributionRequired && !a.attribution) out.push('attribution required but missing');
  if (a.aiGenerated && a.kind === 'image' && a.approval !== 'approved') out.push('AI-generated: needs approval and disclosure');
  return out;
}
