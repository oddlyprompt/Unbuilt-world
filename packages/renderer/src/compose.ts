import type { Project, Timeline } from '@uw/core';
import type { CaptionLine, EpisodeProps, RenderAsset, RenderShot } from './types';

export interface ComposeOptions {
  /** Turns a project-relative path into a URL the composition can load. */
  urlFor: (relPath: string) => string;
  /** Asset ids whose files are known to exist; others are reported as missing and drawn as a slate. */
  existing?: Set<string>;
  audioUrl?: string;
}

/** Everything the Remotion composition needs, derived from the project and its resolved timeline. */
export function composeEpisode(project: Project, timeline: Timeline, opts: ComposeOptions): EpisodeProps {
  const { fps } = timeline;
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const toAsset = (id: string): RenderAsset | undefined => {
    const a = assets.get(id);
    if (!a) return undefined;
    if (opts.existing && !opts.existing.has(id)) return undefined;
    return {
      id: a.id,
      url: opts.urlFor(a.relPath),
      kind: a.kind,
      width: a.width,
      height: a.height,
      placeholder: a.placeholder,
      aiGenerated: a.aiGenerated,
      credit: a.attributionRequired ? a.attribution : a.attribution ?? undefined,
      title: a.filename,
    };
  };

  const shots: RenderShot[] = project.shots.map((shot, i) => {
    const r = timeline.shots[i]!;
    const next = timeline.shots[i + 1];
    const nextShot = project.shots[i + 1];
    const asset = shot.assetId ? toAsset(shot.assetId) : undefined;
    return {
      id: shot.id,
      sceneId: shot.sceneId,
      chapterId: shot.chapterId,
      startFrame: r.startFrame,
      durationFrames: r.durationFrames,
      tailFrames: next ? next.transitionFrames : 0,
      transitionIn: { type: shot.transitionIn.type, frames: r.transitionFrames },
      transitionOut: next && nextShot ? { type: nextShot.transitionIn.type, frames: next.transitionFrames } : { type: 'cut', frames: 0 },
      component: shot.component,
      category: shot.category,
      props: shot.props,
      camera: shot.camera,
      overlays: shot.overlays.map(({ atSec, durSec, ...o }) => ({ ...o, atFrame: Math.round(atSec * fps), durFrames: Math.max(1, Math.round(durSec * fps)) })),
      asset,
      assetMissing: shot.assetId && !asset ? shot.assetId : undefined,
      reconstruction: shot.reconstruction,
      status: shot.status,
    };
  });

  return {
    fps,
    width: project.settings.width,
    height: project.settings.height,
    totalFrames: timeline.totalFrames,
    shots,
    audioUrl: opts.audioUrl,
    captions: project.settings.captions ? captionLines(timeline) : [],
    disclosures: project.settings.disclosures,
    channel: project.channel,
  };
}

/** Caption lines of up to ~9 words, timed from the narration's word times. */
export function captionLines(timeline: Timeline): CaptionLine[] {
  const out: CaptionLine[] = [];
  for (const seg of timeline.segments) {
    const words = seg.words;
    for (let i = 0; i < words.length; i += 9) {
      const chunk = words.slice(i, i + 9);
      const start = seg.startSec + chunk[0]!.start;
      const end = seg.startSec + chunk[chunk.length - 1]!.end;
      out.push({ startFrame: Math.round(start * timeline.fps), endFrame: Math.round(end * timeline.fps), text: chunk.map((w) => w.text).join(' ') });
    }
  }
  return out;
}
