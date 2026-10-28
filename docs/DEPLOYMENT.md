# Deployment: website and backend

There are two pieces. Only the first is a website.

| Piece | What it is | Where it can live |
| --- | --- | --- |
| **Website** (`apps/studio/web`) | The React studio interface, built to static files | GitHub Pages (workflow included) or Vercel (`vercel.json` included) |
| **Backend** (`apps/studio/server` + `apps/worker`) | Node API, SQLite job queue, ffmpeg, Chromium (Remotion), speech engine | A machine you control: your PC with a tunnel, a VPS, or a container host |

## What works with the website alone ("demo mode")

The website is useful without any server. It keeps your projects in the browser (localStorage; uploads in IndexedDB) and
runs the Remotion Player in the browser for previews.

Works: project dashboard, create/import/export projects, storyboard editing (length, split, merge, move, delete, camera,
transitions, on-screen text, labels), live scene previews with the pilot's audio, asset upload / assign / replace with
licence fields, script editing and export, audio settings, research and claim review, viewing the real validated render
of the pilot (video, checks, frames).

Does not work until a backend is connected: rendering MP4s (fast, scene, chapter, full, 4K), generating or regenerating
narration, re-mixing audio (so after you change timing or sound, the preview audio is still the original mix), loudness
analysis, the job queue and its cancel/retry. The interface says so wherever it matters; nothing pretends.

Demo data is per browser and per device: your iPhone and your PC do not share edits. Clearing site data or "Reset demo" discards them.

## GitHub Pages

`.github/workflows/pages.yml` builds `npm run studio:build:pages` and deploys `apps/studio/dist-pages`, then runs the browser tests
against the live URL. One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The site is served at `https://<owner>.github.io/<repo>/` (relative asset paths and hash routes make the sub-path work).

## Vercel

`vercel.json` sets the build command and output directory. Import the repository at vercel.com/new (needs your Vercel account;
it cannot be done from this repository alone). Every push then deploys automatically and branches get preview URLs.

## The backend and how the website reaches it

The website calls the backend's HTTP API (`/api/*`) and loads media from it (`/media/*`) directly from the browser. Open **Backend**
in the top bar, enter the backend's **https** address and the studio token. They are saved only in that browser's localStorage and
are not part of the built site, the repository or any log.

Requirements:

1. **https.** A page on https cannot call plain http (mixed content), except `http://localhost`. For a phone you need a real https address.
2. **CORS.** Set `UW_ALLOWED_ORIGINS` to the site's origin, for example `https://oddlyprompt.github.io` (comma-separated; `*` allows any).
3. **A token.** Set `UW_STUDIO_TOKEN` to a long random string. The server refuses to listen on a non-local address without it.
   It is accepted as `Authorization: Bearer …`, or `?token=…` for images, audio and video, which cannot send headers.
4. **Provider keys stay on the server.** `ELEVENLABS_API_KEY` and others are environment variables (or `~/.config/unbuilt-world/secrets.json`)
   of the backend process. No screen of the website accepts or shows them, and the API never returns them.
5. **Resources.** Rendering is CPU-heavy. Measured here: a 87 s cold open at 1080p took roughly 15 to 20 minutes on 4 cores; a half-resolution
   preview about 4 minutes. Plan for 4+ vCPUs, 4+ GB RAM, and a persistent disk (projects, media, renders are files).
6. **Long jobs.** Jobs run as child processes with polling from the browser, so no long-lived HTTP request or WebSocket is needed.

### Option A: your own PC, reachable from your phone (quickest)

```bash
UW_STUDIO_TOKEN=$(openssl rand -hex 24) UW_ALLOWED_ORIGINS=https://oddlyprompt.github.io HOST=127.0.0.1 npm run studio
cloudflared tunnel --url http://127.0.0.1:4173     # prints an https://….trycloudflare.com address
```
Enter that address and the token under **Backend**. The tunnel exposes the studio to anyone with the address, so keep the token secret
and stop the tunnel when you are done. (Any tunnel or reverse proxy that gives https works the same way.)

### Option B: a container host or VPS

```bash
docker build -f deploy/Dockerfile -t unbuilt-studio .
docker run -d -p 4173:4173 -v unbuilt-data:/data \
  -e UW_STUDIO_TOKEN=… -e UW_ALLOWED_ORIGINS=https://oddlyprompt.github.io unbuilt-studio
```
Put https in front of it (Caddy, nginx, or the host's TLS). Copy `projects/cybersyn-pilot` into the volume (run `npm run setup` inside the
container once to generate the pilot audio). **The Dockerfile has not been built or run in this repository's environment** (no Docker here);
treat it as a starting point and expect to adjust it.

Vercel and GitHub Pages cannot host the backend: they do not provide a long-running process, ffmpeg, Chromium or a writable disk.

## Security notes

* The studio token protects a service that can run ffmpeg and a browser on your machine. Treat it like a password; rotate it by restarting with a new value.
* Uploaded files are validated as media and stored under the project folder; paths that try to leave it are refused.
* The website never contains secrets: there is nothing to put in the build. CI needs no secrets either (Pages uses its own short-lived token).
