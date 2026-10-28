# The Unbuilt World Studio

A local-first documentary production studio for **The Unbuilt World**, a faceless YouTube channel about
forgotten technology and the futures we left behind. It turns a narrated, storyboarded episode into a
validated MP4, and keeps a person in control of every editorial decision.

**Status: Milestone 1 (rendered cold open) is complete and tested. Milestones 2–5 are partly started; see
[docs/MILESTONES.md](docs/MILESTONES.md) for exactly what works and what does not.**

The pilot is *The Computer That Almost Ran a Country* (Project Cybersyn). `projects/cybersyn-pilot` holds its
storyboard, narration script and research dossier, and renders to a ~87 second cold open.

> **Important.** The pilot's imagery is original illustration drawn in code and labelled on screen as
> reconstruction. Archival photographs and portraits are **placeholders** until you add licensed material.
> The narration voice is an **offline scratch voice**. Every historical claim in the dossier is still
> *needs verification*, *interpretation* or *disputed*; nothing is marked verified.

## Use it from a browser (PC or phone)

The interface is a static website (`npm run studio:build:pages`). On GitHub Pages it runs in **demo mode**: projects, storyboard
editing, live previews and asset management all work in the browser with no server; rendering, narration and re-mixing need the
backend, which you host separately and connect from the **Backend** button. Full details, hosting requirements and security:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Deployment workflow: `.github/workflows/pages.yml`; Vercel: `vercel.json`.

## Requirements

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js | 22.13 or newer | everything (uses the built-in `node:sqlite`) |
| ffmpeg and ffprobe | 6 or newer, on `PATH` | audio mixing, loudness, validation |
| Python | 3.10 or newer | offline scratch voice and the synthesized pilot audio |
| Chromium | any recent | rendering. The preinstalled Playwright headless shell is found automatically; otherwise Remotion downloads one |

No account, subscription or API key is needed to render the pilot.

## Set up from a fresh checkout

```bash
git clone https://github.com/oddlyprompt/Unbuilt-world.git && cd Unbuilt-world
npm run setup          # npm install, pip install -r requirements.txt, then generates the pilot audio
npm run pilot:narrate  # scratch narration for the pilot (offline, about 5 seconds)
```

`npm run setup` writes the pilot's synthesized music and sound effects to `projects/cybersyn-pilot/media/`
(these files are generated, not stored in git). If your Chromium is somewhere unusual, set `UW_CHROME` to its path.

## Run it

```bash
npm run studio:build   # builds the interface once
npm run studio         # http://127.0.0.1:4173
```

For interface development use `npm run studio` in one terminal and `npm run studio:web` in another
(http://localhost:5173, proxied to the API). `npm run remotion` opens Remotion's own studio on the compositions.

### From the command line

```bash
npx tsx scripts/cli.ts timeline cybersyn-pilot                   # resolved shot times and any problems
npx tsx scripts/cli.ts narrate  cybersyn-pilot                   # missing or out-of-date narration only
npx tsx scripts/cli.ts render   cybersyn-pilot preview           # fast 960x540 whole-project preview
npx tsx scripts/cli.ts render   cybersyn-pilot scene --scene sc-end
npx tsx scripts/cli.ts render   cybersyn-pilot full              # 1920x1080 export (use --quality ultra for 3840x2160)
```

Every render writes `projects/<id>/renders/<render-id>/` with `video.mp4`, `validation.json`, `render.log`
and `frames/contact-sheet.jpg` (frames pulled from the finished video). A render is reported as successful
only if the validation passes (see below).

## Tests

```bash
npm run typecheck
npm test                 # unit + integration (integration renders real video; allow a few minutes)
npm run test:e2e         # Playwright against the Node studio (a few minutes)
npm run test:e2e:pages   # the static website alone, desktop and iPhone-sized viewport
npm run test:e2e:remote  # static website + separate backend with token and CORS
```

The integration and end-to-end tests run on a temporary copy of the pilot. No test makes a paid API call.

## What a render checks

After encoding, the file is decoded and measured. These are **required** and fail the render:
file exists, readable by ffprobe, H.264 video stream, exact resolution and frame rate, duration within 0.25 s of
the timeline, audio stream present, full decode without errors, audio not silent, no unexpected black stretches,
and narration offset against the timeline within 80 ms (envelope correlation between the rendered audio and the
narration placed on the timeline). Peak and programme loudness are reported as warnings.

## How editing works

* **Narration is the clock.** Narration segments are laid out in order with editable pauses. Shots are anchored to a
  *word* of a segment (plus an optional offset), so regenerating or re-recording narration moves every cut with it.
  Changing a shot's length slides the next cut against the narration. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
* **Assets are replaceable.** A shot's media can be swapped for another asset, or the file behind an asset can be
  replaced; the storyboard keeps pointing at the same id, and the next render picks the new file up.
* **Nothing is overwritten silently.** Each save snapshots the previous project file in `.history/`.
  Edits made by the interface use optimistic revisions, so two editors cannot clobber each other.

## Keys, costs and licences

* API keys are read from environment variables (`ELEVENLABS_API_KEY`, …) or `~/.config/unbuilt-world/secrets.json`
  (mode 0600). They are never written to a project, log, job record or export, and error text is scrubbed.
* Paid narration (ElevenLabs) needs an explicit confirmation per batch, refuses repeats of an identical request, and
  logs an *estimated* cost per project. Its adapter has been tested against a mock server only.
* Fonts (Cormorant, IBM Plex Sans, IBM Plex Mono) are under the SIL Open Font License; see `packages/renderer/assets/fonts`.
* Assets keep origin, rights holder, licence and attribution. Being publicly viewable is never treated as permission.

## Repository layout

```
apps/studio      Hono API + React interface (server/ and web/)
apps/worker      pipeline (narrate, mix, render, validate) and the child-process job runner
packages/core    versioned project schema, narration-driven timeline, edit operations, storage
packages/renderer  Remotion compositions and the project -> composition mapping
packages/media   ffmpeg/ffprobe: mixing, loudness, analysis, validation
packages/quality audio/timeline synchronisation check
packages/providers text-to-speech adapters, secret store, usage ledger, provider contracts
projects/        one folder per episode (project.json is the source of truth)
scripts/         CLI, pilot project definition, audio synthesis
tools/           offline voice (espeak-ng through ctypes)
docs/            architecture, milestones, risks
tests/           integration and end-to-end tests
```
