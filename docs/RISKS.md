# Technical risks

| Risk | Impact | Mitigation / status |
| --- | --- | --- |
| Render time. 1080p software rendering of the 3D scenes is slow (see README for measured time) | long iteration | scene/shot/chapter previews at half resolution; mix and bundle cached; concurrency tuned to cores. A GPU or more cores helps directly |
| A 27-minute render has not been run | unknown memory/time behaviour | chapter rendering exists and is tested on the pilot; Milestone 5 must prove a full-length episode |
| Historical accuracy | credibility | claim status model; nothing auto-verified; intended vs demonstrated tracked; narration wording flagged, not silently changed |
| Licences of archival media | legal | assets record origin, rights holder, licence, attribution; placeholders are visible and block "ready"; nothing is downloaded automatically |
| Reference video analysis (YouTube) | legal/ToS | not implemented yet; design rule: metadata and authorised transcripts only, no downloading, no copying of expression |
| Scratch voice is robotic | low production value | explicit placeholder flag; ElevenLabs adapter ready (mock-tested only); import of recorded audio works |
| Provider APIs change | breakage | adapters behind small interfaces; mocks in tests; no live calls by default |
| Chromium/ffmpeg availability | setup failures | documented; `UW_CHROME`, `FFMPEG_PATH`, `FFPROBE_PATH`; clear error messages |
| `node:sqlite` is experimental in Node 22 | API change | used only for the jobs table; wrapped in one class |
| Concurrent writes (UI, job, CLI) | lost edits | per-process lock, revision check on the API, atomic saves, history snapshots |
| espeak word timings differ from perceived speech | slight visual offset | timings come from the synthesizer; sync check measures the real output against the timeline |
