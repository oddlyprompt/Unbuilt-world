# The studio BACKEND (API, jobs, ffmpeg, Chromium, speech). The website talks to this over https.
# Build from the repository root:  docker build -f deploy/Dockerfile -t unbuilt-studio .
FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json requirements.txt ./
RUN npm ci && python3 -m pip install --break-system-packages -r requirements.txt
# Chromium for Remotion (the worker looks for the Playwright headless shell automatically).
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN npx playwright install --with-deps chromium
COPY . .
# Project files live on a mounted volume so renders and edits survive restarts.
ENV UW_PROJECTS_DIR=/data/projects UW_STATE_DIR=/data/state HOST=0.0.0.0 PORT=4173
VOLUME /data
EXPOSE 4173
# UW_STUDIO_TOKEN (required, the server refuses to start on 0.0.0.0 without it) and UW_ALLOWED_ORIGINS are set at run time.
CMD ["node", "--import", "tsx", "--disable-warning=ExperimentalWarning", "apps/studio/server/main.ts"]
