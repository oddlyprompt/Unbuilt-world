# Milestones

Status is what was actually run. "Tested" names the test.

## Milestone 1: rendered cold open: COMPLETE

| Deliverable | State | Evidence |
| --- | --- | --- |
| Application shell (dashboard, project view, tabs) | works | `tests/e2e` 1, screenshot-checked |
| Importable Cybersyn project | works | `projects/cybersyn-pilot/project.json`; schema test; import path in e2e 9 |
| Structured storyboard | 19 shots, 15 narration segments, word-anchored | `scripts/cli.ts timeline` |
| Remotion composition | works | integration + full export |
| Narration playback | offline scratch voice, real word timings; ElevenLabs adapter mock-tested only | provider tests, integration 1 |
| Editable shot durations | works; slides next cut | core ops test, e2e 3, integration 3 |
| Replaceable assets | works (assign, upload, replace file keeping id) | integration 2 (red→green frame colours), e2e 5 |
| Background music | synthesized bed + ducking, keyframes tied to shots | media test measures ≥ 9 dB ducking |
| Scene preview | Player in browser; scene/shot/chapter MP4 jobs | e2e 7 |
| Exported MP4 ≈ 90 s | 86.6 s, 1920×1080, H.264/AAC | `renders/full-*/validation.json` |

Acceptance list: app launches with documented commands ✔; project opens ✔; narration and visuals in sync ✔ (audio offset 0 ms,
correlation 0.81; picture shares the same timeline by construction) ; durations editable ✔; asset replacement changes output ✔;
audio unclipped ✔ (−1.5 dBFS peak, −16 LUFS); MP4 decodes ✔; duration within tolerance ✔; no missing-asset crash ✔; render errors
reported accurately ✔ (integration 5, 6); fresh environment: commands in README were followed on this machine from a clean
checkout state of the repo plus generated media, **not** on a second machine.

Known limits: picture/audio sync was verified for audio against the timeline; cut alignment of the picture was not measured
independently of the shared timeline. Playback "with sound" in e2e checks that the player advances, not that audio is audible.
The full export is 137 MB at CRF 18 because film grain is expensive to encode.

## Milestone 2: production editor: PARTIAL
Done: shot split/merge/move/delete, duration editing, narration replacement/import, media management, audio controls, versioned
saving (`.history`, revision checks), scene/chapter/shot previews, 20 compositions (title, chapter title, quotation, map, data,
timeline, before/after, closing, attribution, people, telex, display wall, room, close-up).
Missing: a draggable timeline (editing is by numeric fields and buttons), history restore UI, word-level manual alignment UI,
captions are generated but only toggled in project settings (no UI), undo.

## Milestone 3: AI assistance: NOT STARTED
Contracts exist (`packages/providers/src/interfaces.ts`); no LLM, image or video adapter is implemented. Cost tracking and the
duplicate-call guard exist for narration. Source verification is a manual workflow (named reviewer required).

## Milestone 4: reference video workflow: NOT STARTED
Nothing is implemented. Rule recorded for when it is: metadata and authorised transcripts only; no downloading; general
techniques, never another creator's words, voice or footage.

## Milestone 5: full-length production: NOT STARTED
Chapter rendering and job recovery exist and are tested on the pilot. A 20–35 minute episode, hundreds of assets and an
editorial review package have not been attempted.
