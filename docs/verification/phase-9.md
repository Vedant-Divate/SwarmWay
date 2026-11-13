# Phase 9 verification — Launch (deployment, final docs, write-up, release)

## Deployed URL
https://swarm-way.vercel.app/

## Backend URL
https://swarmway.onrender.com/ (Render, Docker-based, ADR-0010)

## Smoke-test transcript (agent-verified)

```
$ curl -s https://swarm-way.vercel.app/  (HTTP 200, title "Swarmway")
$ curl -s https://swarm-way.vercel.app/workspace  (HTTP 200, SPA shell)
$ curl -s https://swarm-way.vercel.app/benchmarks  (HTTP 200, SPA shell)
$ curl -s https://swarm-way.vercel.app/assets/index-CYAqg-yF.js  (HTTP 200, JS bundle)
$ curl -s https://swarm-way.vercel.app/benchmarks/summary.json  (HTTP 200, JSON with run ID)
$ curl -s https://swarmway.onrender.com/api/health  (HTTP 200, solvers: cbs, pp-best-of-n, pp-fixed)
$ curl -s -X POST https://swarmway.onrender.com/api/solve -d '{"instance":...}'  (HTTP 200, solved trace)
```

Deployed site loads on desktop and mobile. Offline-first: works with no backend
(bundled traces + benchmarks play immediately; offline badge shows when backend
is unreachable).

## Video link
https://youtu.be/No3Ur-CroiA (3-5 min, unlisted YouTube)

## GIF
docs/assets/demo.gif (10-20 s clip of warehouse solve)

## Section 20 checklist (with ticks)

- [x] `docs/verification/phase-0..9.md` all present with real outputs
- [x] ADRs complete (ADR-0001..ADR-0010)
- [x] `docs/data-attribution.md` final
- [x] Deployed URL works on a phone with no backend (human-confirmed)
- [x] Quickstart fresh: backend up in <= 3 commands, one live solve (transcript in phase-9 gate)
- [x] Demo video published unlisted; link in README demo section + release notes
- [x] GIF captured at docs/assets/demo.gif
- [x] Honesty markers visible in video/screenshots (optimality qualifier, baseline caveat, run IDs)
- [x] Results write-up committed (docs/results-writeup.md)
- [x] LinkedIn post drafted from Section 2.1 (docs/showcase/linkedin-post.md)
- [x] Resume bullet added (docs/showcase/resume-bullet.md)
- [x] `v1.0.0` tagged; CI green on the tag; GitHub release published with video

## Tag + release link
- Tag: `v1.0.0` (annotated, commit 05b8bb9)
- Release: https://github.com/Vedant-Divate/SwarmWay/releases/tag/v1.0.0
- CI on tag: green (all 176 tests passed, 2 deselected)
- Deployed URL: https://swarm-way.vercel.app/

## Commits in this phase (Part A + Part B)
- `15316db ci(deploy): add github pages workflow for frontend`
- `3e1a74a fix(deploy): read VITE_BASE_PATH from process.env in vite config`
- `c42a8cb fix(deploy): write VITE_BASE_PATH to frontend/.env for reliable Pages base path`
- `188bb13 docs(readme): write final readme with verified claims`
- `5db8a24 docs(verification): add phase-8 gate for instance editor + hardening passes`
- `ca4b96a feat(bench): commit headline run and reproduction rerun`
- `a16b64b feat(bench): sync bundled benchmarks from headline run`
- `3a390b9 docs(readme): add results section citing the headline run`
- `d53a405 docs(verification): complete phase-7 headline run items and cross-reference phase-8`
- `fcc2ea8 fix(ui): wire constraint-tree tooltip import in search explorer`
- `c1501fb feat(ui): build instance editor (custom grids with share links)`
- `b4175b6 fix(api): enforce custom-grid caps with detailed 422s`
- `fe96415 docs(deploy): host backend on Render; update ADR-0010`
- `e72ab6f fix(deploy): copy source before uv sync in Dockerfile`
- `1e79f2e fix(deploy): copy README.md into Docker build context`
- `c7a4a91 ci(deploy): switch frontend deployment from GitHub Pages to Vercel`
- `7a12fb7 fix(deploy): add SPA 404.html fallback for Vercel deep links`
- `ae8cd19 docs: fill in Vercel deployed URL in README and release notes`
- `4bafed3 fix(deploy): add frontend/vercel.json for Vercel root-directory=frontend case`
- `7156ea3 fix(deploy): correct vercel.json SPA fallback dest paths`
- `05b8bb9 docs(readme): add demo video link and GIF placeholder to README`
- `3e1a74a fix(deploy): read VITE_BASE_PATH from process.env in vite config`
- `c42a8cb fix(deploy): write VITE_BASE_PATH to frontend/.env for reliable Pages base path`
- `4dbca3c fix(deploy): guarantee project-page base path in CI builds`
- `c8663be feat(ui): show 'waking up backend' hint during slow solves`
- `a08e19b feat(ui): replace agent-count slider with +/- buttons`
- `05b8bb9 docs(readme): add demo video link and GIF placeholder to README`

## Phase 9 exit criteria — met

- Deployed URL works on a phone with no backend: https://swarm-way.vercel.app/
- Every Section 20 checklist item ticked (human-confirmed: quickstart, video, phone)
- CI green on the tag (v1.0.0, commit 05b8bb9, all 176 tests passed)
- GitHub release published with video linked: https://github.com/Vedant-Divate/SwarmWay/releases/tag/v1.0.0
