import type { NarrationSegment, Project, Shot, WordTiming } from './schema';
import { hashString } from './util';

export type IssueSeverity = 'error' | 'warning' | 'info';
export interface TimelineIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  shotId?: string;
  segmentId?: string;
}

export interface ResolvedSegment {
  id: string;
  chapterId: string;
  text: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  /** Times relative to the start of the segment, one per whitespace token. */
  words: WordTiming[];
  /** True when there is no usable audio and the duration comes from words-per-minute. */
  estimated: boolean;
  stale: boolean;
  audioAssetId?: string;
}

export interface ResolvedShot {
  id: string;
  index: number;
  chapterId: string;
  sceneId: string;
  startSec: number;
  endSec: number;
  startFrame: number;
  /** Exclusive. */
  endFrame: number;
  durationFrames: number;
  /** Frames of crossfade/dip that overlap the end of the previous shot. */
  transitionFrames: number;
  /** Narration segment ids that have audio inside this shot. */
  segmentIds: string[];
}

export interface ResolvedScene {
  sceneId: string;
  chapterId: string;
  shotIds: string[];
  startFrame: number;
  endFrame: number;
}

export interface Timeline {
  fps: number;
  totalFrames: number;
  totalSec: number;
  narrationStartSec: number;
  narrationEndSec: number;
  segments: ResolvedSegment[];
  shots: ResolvedShot[];
  scenes: ResolvedScene[];
  issues: TimelineIssue[];
}

export const tokenize = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean);

/** Relative weight of a token for estimating how long it takes to say. */
function weight(token: string): number {
  let w = Math.max(2, token.replace(/[^\p{L}\p{N}]/gu, '').length) + 2;
  if (/[,;:–—]$/.test(token)) w += 5;
  if (/[.!?…]["')\]]*$/.test(token)) w += 9;
  return w;
}

/** Word times for a segment of `durationSec`, distributed by token weight. */
export function estimateWords(text: string, durationSec: number): WordTiming[] {
  const tokens = tokenize(text);
  const ws = tokens.map(weight);
  const total = ws.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return tokens.map((token, i) => {
    const start = t;
    t += (ws[i]! / total) * durationSec;
    return { text: token, start, end: t };
  });
}

export function estimateDurationSec(text: string, wpm: number): number {
  const tokens = tokenize(text);
  const base = (tokens.length * 60) / wpm;
  const pauses = tokens.filter((t) => /[.!?…]["')\]]*$/.test(t)).length * 0.25 + tokens.filter((t) => /[,;:–—]$/.test(t)).length * 0.12;
  return base + pauses;
}

export function segmentTextHash(seg: Pick<NarrationSegment, 'text' | 'spokenText'>): string {
  return hashString(`${seg.spokenText ?? ''}\u0000${seg.text}`);
}

export interface TimelineOptions {
  /** Audio durations by asset id measured from the files, overriding the stored value. */
  audioDurations?: Record<string, number>;
}

export function resolveTimeline(project: Project, opts: TimelineOptions = {}): Timeline {
  const { fps, leadInSec, tailSec, narrationWpm } = project.settings;
  const issues: TimelineIssue[] = [];
  const toFrame = (sec: number) => Math.round(sec * fps);

  // 1. Narration is the master clock.
  const segments: ResolvedSegment[] = [];
  let cursor = leadInSec;
  for (const seg of project.narration) {
    const tokens = tokenize(seg.text);
    const a = seg.audio;
    const stale = !!a && a.textHash !== segmentTextHash(seg);
    let durationSec: number;
    let words: WordTiming[];
    let estimated = false;
    if (a) {
      durationSec = opts.audioDurations?.[a.assetId] ?? a.durationSec;
      words = a.words.length === tokens.length && !stale ? a.words : estimateWords(seg.text, durationSec);
      if (stale) issues.push({ severity: 'warning', code: 'narration_stale', segmentId: seg.id, message: `Narration for "${seg.id}" was generated from different text. Regenerate it.` });
    } else {
      durationSec = estimateDurationSec(seg.text, narrationWpm);
      words = estimateWords(seg.text, durationSec);
      estimated = true;
      issues.push({ severity: 'warning', code: 'narration_estimated', segmentId: seg.id, message: `No narration audio for "${seg.id}"; its length is estimated at ${narrationWpm} words per minute.` });
    }
    const start = segments.length === 0 ? cursor : cursor + seg.gapBeforeSec;
    const end = start + durationSec;
    if (seg.gapBeforeSec > 2.5) issues.push({ severity: 'warning', code: 'long_silence', segmentId: seg.id, message: `Silence of ${seg.gapBeforeSec.toFixed(1)}s before "${seg.id}".` });
    segments.push({ id: seg.id, chapterId: seg.chapterId, text: seg.text, startSec: start, endSec: end, durationSec, words, estimated, stale, audioAssetId: a?.assetId });
    cursor = end;
  }
  const narrationStartSec = segments[0]?.startSec ?? leadInSec;
  const narrationEndSec = segments.length ? segments[segments.length - 1]!.endSec : leadInSec;
  const segById = new Map(segments.map((s) => [s.id, s]));

  // 2. Shot starts come from anchors.
  const shotStarts: number[] = [];
  project.shots.forEach((shot, i) => {
    shotStarts.push(anchorSec(shot, i, segById, narrationEndSec, issues));
  });

  // 3. Total length: narration, tail, and any shot that starts later.
  let totalSec = narrationEndSec + tailSec;
  const lastStart = shotStarts.length ? Math.max(...shotStarts) : 0;
  if (lastStart + 0.5 > totalSec) {
    totalSec = lastStart + 0.5;
    issues.push({ severity: 'warning', code: 'tail_extended', message: 'A shot starts after the end of the narration tail; the video was extended.' });
  }
  const totalFrames = Math.max(1, toFrame(totalSec));

  // 4. Frames, enforcing strictly increasing starts.
  const minGap = Math.max(1, toFrame(0.25));
  const startFrames: number[] = [];
  shotStarts.forEach((s, i) => {
    let f = Math.max(0, toFrame(s));
    const prev = startFrames[i - 1];
    if (i === 0) f = 0;
    else if (prev !== undefined && f < prev + minGap) {
      issues.push({ severity: 'error', code: 'shot_order', shotId: project.shots[i]!.id, message: `Shot "${project.shots[i]!.id}" starts at or before the previous shot. Its start was moved to ${((prev + minGap) / fps).toFixed(2)}s; fix its anchor.` });
      f = prev + minGap;
    }
    startFrames.push(f);
  });

  const shots: ResolvedShot[] = project.shots.map((shot, i) => {
    const startFrame = startFrames[i]!;
    const endFrame = i + 1 < startFrames.length ? startFrames[i + 1]! : Math.max(totalFrames, startFrame + 1);
    const durationFrames = endFrame - startFrame;
    const prevDur = i > 0 ? startFrames[i]! - startFrames[i - 1]! : 0;
    const tf = i === 0 ? 0 : Math.min(toFrame(shot.transitionIn.durationSec), prevDur, Math.floor(durationFrames / 2));
    const startSec = startFrame / fps;
    const endSec = endFrame / fps;
    const segmentIds = segments.filter((s) => s.endSec > startSec && s.startSec < endSec).map((s) => s.id);
    if (durationFrames / fps < 0.8) issues.push({ severity: 'warning', code: 'short_shot', shotId: shot.id, message: `Shot "${shot.id}" lasts only ${(durationFrames / fps).toFixed(2)}s.` });
    if (durationFrames / fps > 14) issues.push({ severity: 'info', code: 'long_shot', shotId: shot.id, message: `Shot "${shot.id}" lasts ${(durationFrames / fps).toFixed(1)}s; consider cutting or adding variation.` });
    return { id: shot.id, index: i, chapterId: shot.chapterId, sceneId: shot.sceneId, startSec, endSec, startFrame, endFrame, durationFrames, transitionFrames: Math.max(0, tf), segmentIds };
  });

  // 5. Narration that is cut by a shot boundary is fine; narration outside every shot cannot happen,
  //    but audio running past the end of the video can.
  if (segments.length && toFrame(narrationEndSec) > totalFrames) {
    issues.push({ severity: 'error', code: 'narration_overrun', message: 'Narration runs past the end of the video.' });
  }

  // 6. Scenes.
  const scenes: ResolvedScene[] = [];
  for (const s of shots) {
    const last = scenes[scenes.length - 1];
    if (last && last.sceneId === s.sceneId) {
      last.shotIds.push(s.id);
      last.endFrame = s.endFrame;
    } else scenes.push({ sceneId: s.sceneId, chapterId: s.chapterId, shotIds: [s.id], startFrame: s.startFrame, endFrame: s.endFrame });
  }

  // 7. References.
  const chapterIds = new Set(project.chapters.map((c) => c.id));
  for (const s of project.shots) if (!chapterIds.has(s.chapterId)) issues.push({ severity: 'error', code: 'bad_chapter', shotId: s.id, message: `Shot "${s.id}" refers to unknown chapter "${s.chapterId}".` });
  const ids = new Set<string>();
  for (const s of project.shots) {
    if (ids.has(s.id)) issues.push({ severity: 'error', code: 'duplicate_shot_id', shotId: s.id, message: `Duplicate shot id "${s.id}".` });
    ids.add(s.id);
  }

  return { fps, totalFrames, totalSec: totalFrames / fps, narrationStartSec, narrationEndSec, segments, shots, scenes, issues };
}

function anchorSec(shot: Shot, index: number, segById: Map<string, ResolvedSegment>, narrationEnd: number, issues: TimelineIssue[]): number {
  const a = shot.anchor;
  switch (a.kind) {
    case 'start':
      if (index !== 0) issues.push({ severity: 'error', code: 'bad_anchor', shotId: shot.id, message: `Only the first shot can anchor to the start ("${shot.id}").` });
      return 0;
    case 'time':
      return a.sec;
    case 'after_narration':
      return narrationEnd + a.offsetSec;
    case 'segment': {
      const seg = segById.get(a.segmentId);
      if (!seg) {
        issues.push({ severity: 'error', code: 'missing_segment', shotId: shot.id, message: `Shot "${shot.id}" is anchored to missing narration segment "${a.segmentId}".` });
        return 0;
      }
      let w = a.word;
      if (w >= seg.words.length) {
        issues.push({ severity: 'warning', code: 'anchor_word_clamped', shotId: shot.id, message: `Shot "${shot.id}" is anchored to word ${w}, but "${seg.id}" has ${seg.words.length}. Using the last word.` });
        w = Math.max(0, seg.words.length - 1);
      }
      return seg.startSec + (seg.words[w]?.start ?? 0) + a.offsetSec;
    }
  }
}

/** Hash of everything that changes the rendered picture or sound, for "is this render current?". */
export function renderInputHash(project: Project, extra = ''): string {
  return hashString(
    JSON.stringify({
      s: project.settings,
      sh: project.shots,
      n: project.narration.map((n) => [n.id, n.text, n.gapBeforeSec, n.audio?.textHash, n.audio?.durationSec, n.audio?.assetId]),
      a: project.assets.map((a) => [a.id, a.relPath, a.sha256]),
      au: project.audio,
      x: extra,
    }),
  );
}

export const frameToSec = (frame: number, fps: number) => frame / fps;

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Hash of everything that changes the mixed audio. Same value in the browser and on the server. */
export function mixHash(project: Project, timeline: Timeline): string {
  return hashString(
    JSON.stringify({
      a: project.audio,
      n: timeline.segments.map((s) => [s.id, s.startSec, s.audioAssetId]),
      sh: project.shots.map((s, i) => [s.id, timeline.shots[i]!.startSec, s.soundCues]),
      f: project.assets.filter((a) => a.kind === 'audio' || a.kind === 'music' || a.kind === 'sfx').map((a) => [a.id, a.sha256]),
      t: timeline.totalFrames,
    }),
  );
}

