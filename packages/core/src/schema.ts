import { z } from 'zod';

/** Current on-disk project schema version. Bump it and add a migration in migrate.ts. */
export const SCHEMA_VERSION = 1;

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'ids use letters, digits, _ . -');

// ---------------------------------------------------------------- research

export const ClaimStatus = z.enum([
  'verified',
  'needs_verification',
  'disputed',
  'interpretation',
  'creative_reconstruction',
]);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

export const SourceKind = z.enum(['book', 'article', 'archive', 'web', 'video', 'interview', 'transcript', 'note']);

export const SourceSchema = z.object({
  id: Id,
  title: z.string(),
  kind: SourceKind.default('web'),
  author: z.string().optional(),
  url: z.string().optional(),
  publisher: z.string().optional(),
  year: z.number().int().optional(),
  /** primary = contemporaneous record or archive; secondary = scholarship; tertiary = summaries. */
  tier: z.enum(['primary', 'secondary', 'tertiary']).default('secondary'),
  /** Set only by a human (or by a recorded fetch) once the source itself has been read. */
  checked: z.object({ by: z.string(), on: z.string(), note: z.string().optional() }).optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const ClaimSchema = z.object({
  id: Id,
  text: z.string(),
  status: ClaimStatus.default('needs_verification'),
  sourceIds: z.array(Id).default([]),
  /** Where the claim comes from: model suggestions can never start as verified. */
  origin: z.enum(['human', 'ai_proposed', 'draft_narration']).default('ai_proposed'),
  note: z.string().optional(),
  /** Required for status "verified": who checked which source, and when. Never set by a model. */
  verification: z.object({ by: z.string(), on: z.string(), note: z.string().optional() }).optional(),
  /** Whether the claim concerns what was planned or what demonstrably worked. */
  scope: z.enum(['intended', 'demonstrated', 'context']).default('context'),
});
export type Claim = z.infer<typeof ClaimSchema>;

// ---------------------------------------------------------------- assets

export const AssetKind = z.enum(['image', 'video', 'audio', 'music', 'sfx', 'font', 'other']);
export type AssetKind = z.infer<typeof AssetKind>;

export const LicenseStatus = z.enum([
  'unknown',
  'needs_clearance',
  'public_domain',
  'cc0',
  'cc_by',
  'cc_by_sa',
  'licensed',
  'own_work',
]);
export type LicenseStatus = z.infer<typeof LicenseStatus>;

export const AssetSchema = z.object({
  id: Id,
  filename: z.string(),
  /** Path relative to the project directory (media/original/..., media/generated/...). */
  relPath: z.string(),
  kind: AssetKind,
  mime: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationSec: z.number().optional(),
  sha256: z.string().optional(),
  origin: z
    .enum(['user_supplied', 'generated_local', 'ai_generated', 'public_archive', 'placeholder', 'synthesized'])
    .default('user_supplied'),
  sourceUrl: z.string().optional(),
  author: z.string().optional(),
  rightsHolder: z.string().optional(),
  licenseStatus: LicenseStatus.default('unknown'),
  licenseName: z.string().optional(),
  attribution: z.string().optional(),
  attributionRequired: z.boolean().default(false),
  aiGenerated: z.boolean().default(false),
  /** True for stand-ins that must be replaced before publication. */
  placeholder: z.boolean().default(false),
  approval: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  notes: z.string().optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

// ---------------------------------------------------------------- narration

export const WordTiming = z.object({ text: z.string(), start: z.number(), end: z.number() });
export type WordTiming = z.infer<typeof WordTiming>;

export const NarrationAudio = z.object({
  assetId: Id,
  durationSec: z.number().positive(),
  /** One entry per whitespace-separated token of the segment text, times relative to the clip. */
  words: z.array(WordTiming).default([]),
  alignment: z.enum(['engine', 'estimated', 'manual']).default('estimated'),
  provider: z.string(),
  voice: z.string().optional(),
  /** Hash of the text the audio was generated from; a mismatch means the audio is stale. */
  textHash: z.string(),
  generatedAt: z.string().optional(),
});
export type NarrationAudio = z.infer<typeof NarrationAudio>;

export const NarrationSegmentSchema = z.object({
  id: Id,
  chapterId: Id,
  text: z.string().min(1),
  /** Text actually sent to the voice when the written form reads badly (numbers, names). */
  spokenText: z.string().optional(),
  /** Silence before this segment, seconds. Editable pacing. */
  gapBeforeSec: z.number().min(0).default(0.4),
  claimIds: z.array(Id).default([]),
  audio: NarrationAudio.optional(),
  locked: z.boolean().default(false),
});
export type NarrationSegment = z.infer<typeof NarrationSegmentSchema>;

// ---------------------------------------------------------------- storyboard

export const VisualCategory = z.enum([
  'historical_photo',
  'historical_video',
  'ai_reconstruction',
  'animated_diagram',
  'animated_map',
  'technical_illustration',
  'typography',
  'atmospheric_broll',
  'timeline',
]);
export type VisualCategory = z.infer<typeof VisualCategory>;

export const ComponentName = z.enum([
  'media', // plain image/video with camera
  'archival_photo', // photo in an archival presentation (placeholder until an asset is assigned)
  'ops_room',
  'chair_closeup',
  'display_wall',
  'telex',
  'network_map',
  'people_cards',
  'tonal_shift',
  'title_reveal',
  'opening_title',
  'chapter_title',
  'quotation',
  'data_card',
  'timeline',
  'before_after',
  'closing',
  'attribution',
  'blank',
]);
export type ComponentName = z.infer<typeof ComponentName>;

export const CameraPreset = z.enum([
  'static',
  'push_in',
  'pull_out',
  'pan_left',
  'pan_right',
  'pan_up',
  'pan_down',
  'drift',
]);
export type CameraPreset = z.infer<typeof CameraPreset>;

export const CameraSchema = z.object({
  preset: CameraPreset.default('push_in'),
  /** 0..1; how far the move travels. */
  intensity: z.number().min(0).max(1).default(0.5),
  /** Point the move favours, 0..1 of the frame. */
  focus: z.object({ x: z.number(), y: z.number() }).default({ x: 0.5, y: 0.5 }),
  easing: z.enum(['linear', 'inOutSine', 'outCubic', 'inOutCubic']).default('inOutSine'),
});
export type Camera = z.infer<typeof CameraSchema>;

export const OverlaySchema = z.object({
  id: Id,
  text: z.string(),
  style: z.enum(['kicker', 'lower_third', 'label', 'caption', 'title']).default('label'),
  /** Seconds after the shot starts. */
  atSec: z.number().min(0).default(0.4),
  durSec: z.number().positive().default(3),
  position: z.enum(['top_left', 'bottom_left', 'bottom_center', 'center', 'top_right']).default('bottom_left'),
});
export type Overlay = z.infer<typeof OverlaySchema>;

export const TransitionSchema = z.object({
  type: z.enum(['cut', 'fade', 'dip_black', 'dip_paper', 'wipe']).default('cut'),
  durationSec: z.number().min(0).max(3).default(0),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const SoundCueSchema = z.object({
  id: Id,
  assetId: Id,
  /** Seconds after the shot starts (may be negative to anticipate the cut). */
  atSec: z.number().default(0),
  gainDb: z.number().min(-60).max(12).default(-12),
});
export type SoundCue = z.infer<typeof SoundCueSchema>;

/** Where a shot begins on the narration-driven timeline. */
export const AnchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('start') }),
  z.object({
    kind: z.literal('segment'),
    segmentId: Id,
    /** 0-based index of the whitespace-separated token the shot starts on. */
    word: z.number().int().min(0).default(0),
    /** Cut earlier (negative) or later (positive) than the word, seconds. */
    offsetSec: z.number().default(0),
  }),
  z.object({ kind: z.literal('after_narration'), offsetSec: z.number().default(0) }),
  /** Not tied to narration: stays put when narration is regenerated. */
  z.object({ kind: z.literal('time'), sec: z.number().min(0) }),
]);
export type Anchor = z.infer<typeof AnchorSchema>;

export const ShotSchema = z.object({
  id: Id,
  chapterId: Id,
  sceneId: Id,
  anchor: AnchorSchema,
  /** Informational: the narration this shot illustrates. */
  narrationText: z.string().default(''),
  category: VisualCategory,
  component: ComponentName,
  /** Primary media. When set, it replaces the component's built-in artwork. */
  assetId: Id.optional(),
  /** Component props (each component validates and defaults its own). */
  props: z.record(z.unknown()).default({}),
  camera: CameraSchema.default({}),
  overlays: z.array(OverlaySchema).default([]),
  transitionIn: TransitionSchema.default({}),
  soundCues: z.array(SoundCueSchema).default([]),
  claimIds: z.array(Id).default([]),
  /** Must be true for anything that is not authentic archival material. */
  reconstruction: z
    .object({ isReconstruction: z.boolean(), label: z.string().optional() })
    .default({ isReconstruction: false }),
  status: z.enum(['draft', 'placeholder', 'ready', 'approved']).default('draft'),
  notes: z.string().optional(),
});
export type Shot = z.infer<typeof ShotSchema>;

// ---------------------------------------------------------------- audio mix

export const GainKeyframe = z.object({
  /** Seconds from the project start, or from the start of `shotId` when that is set (so it follows edits). */
  atSec: z.number(),
  shotId: z.string().optional(),
  gainDb: z.number().min(-80).max(12),
});
export type GainKeyframe = z.infer<typeof GainKeyframe>;

export const MusicTrackSchema = z.object({
  id: Id,
  assetId: Id,
  startSec: z.number().min(0).default(0),
  endSec: z.number().optional(),
  gainDb: z.number().min(-60).max(6).default(-22),
  fadeInSec: z.number().min(0).default(2),
  fadeOutSec: z.number().min(0).default(3),
  loop: z.boolean().default(true),
  /** Extra gain over time, added to gainDb. Linear interpolation between keyframes. */
  keyframes: z.array(GainKeyframe).default([]),
  duck: z
    .object({
      enabled: z.boolean().default(true),
      amountDb: z.number().min(0).max(30).default(9),
      attackMs: z.number().default(80),
      releaseMs: z.number().default(600),
    })
    .default({}),
});
export type MusicTrack = z.infer<typeof MusicTrackSchema>;

export const AudioSettingsSchema = z.object({
  narrationGainDb: z.number().min(-30).max(12).default(0),
  music: z.array(MusicTrackSchema).default([]),
  targetLufs: z.number().default(-16),
  truePeakDb: z.number().default(-1.5),
});
export type AudioSettings = z.infer<typeof AudioSettingsSchema>;

// ---------------------------------------------------------------- project

export const ChapterSchema = z.object({
  id: Id,
  index: z.number().int().min(1),
  title: z.string(),
  /** Provisional editorial window in the finished long-form episode, mm:ss. */
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  summary: z.string().optional(),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const RenderRecordSchema = z.object({
  id: Id,
  kind: z.enum(['preview', 'scene', 'chapter', 'full']),
  createdAt: z.string(),
  relPath: z.string(),
  ok: z.boolean(),
  durationSec: z.number().optional(),
  expectedDurationSec: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  validationRelPath: z.string().optional(),
  /** Hash of the inputs, so "is this render current?" has an exact answer. */
  inputHash: z.string().optional(),
});
export type RenderRecord = z.infer<typeof RenderRecordSchema>;

export const ProjectSettingsSchema = z.object({
  fps: z.number().int().min(12).max(60).default(30),
  width: z.number().int().default(1920),
  height: z.number().int().default(1080),
  narrationWpm: z.number().min(60).max(260).default(150),
  /** Silence before the first narration, seconds. */
  leadInSec: z.number().min(0).default(2),
  /** Silence after the last narration before the video ends, seconds. */
  tailSec: z.number().min(0).default(3),
  /** Voice tuning for the local scratch voice (words per minute and pitch 0–99). */
  narrationVoice: z.object({ voice: z.string().optional(), rate: z.number().min(80).max(260).optional(), pitch: z.number().min(0).max(99).optional() }).default({}),
  captions: z.boolean().default(false),
  /** Show a disclosure on shots that are reconstructions or illustrations. */
  disclosures: z.boolean().default(true),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  title: z.string(),
  channel: z.string().default('The Unbuilt World'),
  subject: z.string().default(''),
  tone: z.string().default(''),
  perspective: z.string().default(''),
  /** Runtime of the finished episode this project (or cold-open slice) belongs to. */
  targetRuntimeSec: z.number().positive(),
  /** Runtime this project's timeline is expected to land on. */
  sliceRuntimeSec: z.number().positive().optional(),
  stage: z
    .enum(['research', 'script', 'storyboard', 'assets', 'narration', 'edit', 'render', 'review', 'published'])
    .default('storyboard'),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().default(1),
  settings: ProjectSettingsSchema.default({}),
  chapters: z.array(ChapterSchema),
  narration: z.array(NarrationSegmentSchema),
  shots: z.array(ShotSchema),
  assets: z.array(AssetSchema).default([]),
  audio: AudioSettingsSchema.default({}),
  sources: z.array(SourceSchema).default([]),
  claims: z.array(ClaimSchema).default([]),
  renders: z.array(RenderRecordSchema).default([]),
  editorialNotes: z.array(z.object({ id: Id, text: z.string(), createdAt: z.string() })).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;
