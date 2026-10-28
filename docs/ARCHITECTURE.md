# Architecture

Local-first, modular, no cloud services. The UI, the API, the job runner and the renderer are separate pieces
that communicate through files on disk and one small HTTP API.

```
 browser (React + Remotion Player)
        │  /api/*, /media/*
 apps/studio/server (Hono)  ── SQLite jobs table (node:sqlite)
        │  spawns one child process per job
 apps/worker/run-job ──► pipeline: narrate → mix (ffmpeg) → render (Remotion + Chromium) → validate (ffprobe/ffmpeg)
        │
 projects/<id>/project.json  +  media/  renders/  .build/  .history/
```

## Episode data lives outside the application

`projects/<id>/project.json` is the only source of truth and is versioned (`schemaVersion`, migrations in
`packages/core/src/migrate.ts`). Media is split by origin: `media/original` (user-supplied, never modified),
`media/generated` (narration, synthesized audio), `.build` (derived mixes, safe to delete), `renders`.
Saves are atomic (write + rename) and each save keeps the previous file in `.history/`.

## The timeline model (packages/core/src/timeline.ts)

1. **Narration is the master clock.** Segments are laid out from `leadInSec`; each has an editable `gapBeforeSec`.
   A segment's length comes from its audio file; without audio it is estimated from words per minute and flagged.
2. **Shots are anchored, not timed.** A shot starts at a word of a narration segment (+ offset), at the end of the
   narration (+ offset), at the start, or at an absolute time (explicitly not narration-following). A shot ends where
   the next begins. Starts are rounded to frames and must strictly increase (violations are reported, never hidden).
3. **Editing length** moves the *next* shot's anchor offset; later narration-anchored cuts do not move.
4. **Word timing.** Audio carries one timing per whitespace-separated word. The local voice reports them from the
   synthesizer itself; character-level timings from ElevenLabs are folded into words; imported audio is estimated until
   corrected. `alignment` records which one a segment has.
5. **Stale audio** is detected with a hash of the text that produced it.

## Audio (packages/media/src/mix.ts)

One deterministic ffmpeg filter graph: narration clips at their positions, music beds with fades, looping, dB
keyframes tied to shots (so they follow edits) and **ducking computed from the real narration windows** (a smooth dB
envelope, not a compressor guess), sound-effect cues anchored to shots. The premix is float; a two-pass
`loudnorm` (linear) brings it to the target LUFS and a limiter (auto-level off) enforces the true-peak ceiling.
Mixes are cached by a hash of everything that affects them. Remotion plays the finished mix and never mixes itself, so
the preview, the render and the analysis all hear the same file.

## Rendering (packages/renderer, apps/worker)

* One Remotion composition, `Episode`, driven entirely by props derived from the project (`composeEpisode`). Shots
  are `Sequence`s; transitions are overlaps (`tailFrames`) plus a fade, wipe or dip.
* Visual components are original SVG/CSS. The operations room is a **real 3D scene** (CSS perspective), so camera moves
  are dollies and orbits, not zooms on a flat picture. A shot's `assetId`, when set, always replaces the built-in art.
* Missing files produce a visible "MISSING ASSET" slate, never a crash. Placeholders are drawn as labelled slates.
* Honest labelling is data: `reconstruction` shots, placeholders and schematic maps carry an on-screen disclosure.
* Project assets are served to the render browser by a read-only local HTTP server restricted to the project folder.
* The bundle is cached by a fingerprint of the renderer and core sources.

## Jobs (apps/studio/server/jobs.ts)

SQLite table with statuses `queued → running → succeeded | failed | cancelled`. Two lanes: heavy (renders, one at a
time) and light (narration, mixing). Each job is a child process: cancelling kills it, a crash cannot take the server
down, and progress/log lines come back over stdout. A job that was running when the studio stopped is marked failed
with an explicit "retry to resume" message; narration resumes by construction (only missing or stale segments are
generated) and a render restarts with its mix cached. Identical queued/running jobs are de-duplicated.

## Providers (packages/providers)

Narration goes through `TtsProvider` (status, voices, cost estimate, synthesize). Two exist: the offline espeak-ng voice
and ElevenLabs. LLM, image and video contracts are defined (`interfaces.ts`) but have **no adapters yet** (Milestone 3).
Secrets live outside projects; paid calls need explicit confirmation, are de-duplicated by a ledger and logged with an
estimated cost.

## Decisions worth knowing

| Decision | Why |
| --- | --- |
| Hono instead of Express/Fastify | tiny, typed, no plugins needed |
| `node:sqlite` instead of better-sqlite3 | no native build step; needs Node ≥ 22.13 |
| Remotion + CSS 3D instead of a video-generation model | deterministic, free, editable; generative video stays optional |
| Mix outside Remotion | measurable (LUFS, peaks), cacheable, identical in preview and render |
| espeak-ng through `espeakng-loader` | the only offline, installable voice that also reports word boundaries |
| Optimistic revisions on the API | two tabs or a background job cannot silently overwrite each other |
| No separate `research`, `scripting`, `storyboard` packages yet | their logic is small and lives in `core`; split them when AI assistance (M3) adds weight |
