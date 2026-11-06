# ADR-0010: Backend hosting — static site is the public demo; backend runs locally or via tunnel

- Status: accepted
- Date: 2026-11-06
- Phase: 9

## Context

Phase 9 deploys the Swarmway frontend to Vercel (Section 14 task 1).
The static site is offline-first: `VITE_API_BASE_URL` is empty on Pages, so
the public experience uses bundled traces and bundled benchmarks with an
honest offline badge (Section 11.5). No solver backend runs on Pages.

Recruiters, interviewers, and the human may still want to run a live solve
against their own backend (the Phase 8 frontend talks to
`VITE_API_BASE_URL=http://localhost:8000`). The question is whether Swarmway
provides a hosted backend as part of the public demo.

## Decision

Default stands — the public demo is the static Vercel site only.
There is no hosted Swarmway backend. A live solver runs locally
(`uv run uvicorn swarmway.api.app:app`, port 8000) or behind a temporary
tunnel (e.g. cloudflared/ngrok) for interviews. The README documents
"run the solver yourself in 3 commands":

1. `uv sync` (or `pip install .`)
2. `uv run uvicorn swarmway.api.app:app`
3. point the frontend at `VITE_API_BASE_URL=http://localhost:8000` (or use
   the bundled offline mode with no backend at all)

## Consequences

- Zero hosting cost and zero ongoing ops for the public demo; the deployed
  URL works with the backend OFF (recruiter experience: phone, no backend,
  bundled traces + benchmarks play fine).
- Live-solving demos require the human to start a local backend or a tunnel;
  this is documented, not automatic.
- No change to the API contract (Section 7.4) or caps (`.env.example`):
  `SWARMWAY_MAX_GRID_CELLS=262144`, `SWARMWAY_MAX_AGENTS=60`,
  `SWARMWAY_SOLVE_BUDGET_MS=10000` remain server-side defaults.
- The deployed frontend gracefully degrades to bundled traces when no
  backend is reachable (honest offline badge, never a spinner).
