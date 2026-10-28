import type { Camera, ComponentName, Overlay, Transition, VisualCategory } from '@uw/core';

/** What a composition needs to know about an asset: a URL it can load and enough to describe it. */
export interface RenderAsset {
  id: string;
  url: string;
  kind: 'image' | 'video' | 'audio' | 'music' | 'sfx' | 'font' | 'other';
  width?: number;
  height?: number;
  placeholder: boolean;
  aiGenerated: boolean;
  /** Credit line to show with archival material. */
  credit?: string;
  title?: string;
}

export interface RenderOverlay extends Omit<Overlay, 'atSec' | 'durSec'> {
  atFrame: number;
  durFrames: number;
}

export interface RenderShot {
  id: string;
  sceneId: string;
  chapterId: string;
  startFrame: number;
  durationFrames: number;
  /** Frames this shot keeps rendering beneath the next shot while it fades/wipes in. */
  tailFrames: number;
  transitionIn: { type: Transition['type']; frames: number };
  transitionOut: { type: Transition['type']; frames: number };
  component: ComponentName;
  category: VisualCategory;
  props: Record<string, unknown>;
  camera: Camera;
  overlays: RenderOverlay[];
  asset?: RenderAsset;
  /** An asset id was set but could not be resolved to a file; draw a visible slate. */
  assetMissing?: string;
  reconstruction: { isReconstruction: boolean; label?: string };
  status: 'draft' | 'placeholder' | 'ready' | 'approved';
}

export interface CaptionLine {
  startFrame: number;
  endFrame: number;
  text: string;
}

export interface EpisodeProps {
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  shots: RenderShot[];
  /** The finished mix (narration, music, effects). Compositions never mix audio themselves. */
  audioUrl?: string;
  captions: CaptionLine[];
  disclosures: boolean;
  channel: string;
}
