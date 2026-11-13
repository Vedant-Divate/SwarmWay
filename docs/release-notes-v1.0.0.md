# Swarmway v1.0.0 — release notes (DRAFT)

Do NOT tag yet. Tag `v1.0.0` only after the demo video link exists and CI is
green on the release-head commit. Publish the GitHub release with the video
linked; then confirm CI green on the tag.

## Highlights (per-phase)

- **Phase 1–5:** Pure-Python CBS solver (two-level constraint tree, space-time
  A* low level, exact true-distance heuristic), Prioritized Planning baseline,
  independent validity checker, brute-force optimality spot-checks, property
  suite (hypothesis), FastAPI + uvicorn API, config-driven benchmark harness
  with committed artifacts (`data/results/<run-id>/`).
- **Phase 6–8 (frontend, ADR-0009 route):** React/TypeScript + Vite SPA —
  3D playback (React Three Fiber), search tree explorer with seq scrubber and
  node cards, CBS-vs-Prioritized compare panel, benchmarks page from bundled
  `summary.json`, instance editor with custom grids, RLE+base64url share
  links, honest error/offline/timeout/unsat panels, accessibility (keyboard,
  focus rings, tooltips, reduced motion), trace-schema contract tests (ajv,
  dev-only).
- **Phase 8 closing:** Headline benchmark run committed
  (`20261105-1754-5db8a24-dirty-headline`, 24 cells × 3 arms, 60 s budget)
  plus reproduction rerun; benchmarks synced to `frontend/public/benchmarks/`;
  README results section citing the run ID.
- **Phase 9 (this release):** Vercel deployment (offline-first,
  `VITE_API_BASE_URL` empty; 404.html SPA fallback; `/SwarmWay/` subpath
  routing), ADR-0010 (static site is the public demo; backend local/tunnel),
  final README (12 sections, verified claims), results write-up
  (`docs/results-writeup.md`), MIT LICENSE.

## Headline numbers (run ID `20261105-1754-5db8a24-dirty-headline`)

| arm | solved | timeout | unsat | success rate | median SoC (solved) | median runtime ms (solved) |
| --- | --- | --- | --- | --- | --- | --- |
| CBS (optimal) | 13 / 24 | 11 | 0 | 0.54 | 226 | 24.4 |
| Prioritized (baseline) | 20 / 24 | 3 | 1 | 0.83 | 336.5 | 982.6 |
| Prioritized best-of-8 | 15 / 24 | 9 | 0 | 0.62 | 242 | 5714.2 |

Timeouts are failures and stay in the denominators; medians are over solved
runs only with the solved-count shown. Artifacts are per-environment only
(Windows 11, CPython 3.12.15, 16.5 GB RAM) and not comparable across machines.
Full table: `data/results/20261105-1754-5db8a24-dirty-headline/table.md`.

## Demo video

Placeholder — human records and publishes (unlisted YouTube or equivalent),
then links here:

**[Demo video: https://youtu.be/No3Ur-CroiA]** — deployed site, warehouse-10-20-10-2-1 @ 20
agents, Solve (CBS) → play/scrub → Search tab conflict branching → Compare
with Prioritized → Benchmarks page with run ID. One live solve against a
locally running backend, clearly labelled on screen.

**[GIF: `docs/assets/demo.gif`]** — 10–20 s clip of the warehouse solve (captured alongside the demo video).

## Honest claims (everything here is inside what the artifacts support)

- CBS is optimal for sum-of-costs under the stated movement model where it
  solves (backed by validity checker + brute-force cross-checks + property
  suite — see `docs/correctness-argument.md`).
- Prioritized Planning is faster but incomplete (can be unsat on solvable
  instances, slower/costlier when it solves).
- The deployed site works with the backend OFF (bundled traces +
  benchmarks, honest offline badge).
- No number in these notes is hand-typed; every figure cites a committed run
  ID.

## Install & run

```bash
uv sync                              # backend env
uv run uvicorn swarmway.api.app:app  # :8000 (or use offline mode)
cd frontend && pnpm run dev          # VITE_API_BASE_URL=http://localhost:8000
```

Deployed site: https://swarm-way.vercel.app/
