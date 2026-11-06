# ADR-0010: Backend hosting — hosted backend + static Vercel frontend

- Status: accepted
- Date: 2026-11-06
- Phase: 9

## Context

Phase 9 deploys the Swarmway frontend to Vercel (Section 14 task 1).
Originally the plan was a static-only public demo with the backend running
locally or via a tunnel. The human decided to **host the backend** so the
deployed site can do live solves without the user starting anything.

Recruiters, interviewers, and the human can now do a live solve against the
hosted backend. The frontend talks to `VITE_API_BASE_URL=<backend-url>`,
configured in the Vercel project settings. When no backend is reachable, the
frontend falls back to bundled traces with an honest offline badge
(Section 11.5).

## Decision

Host the FastAPI backend on **Render** (`render.yaml` + `Dockerfile` at repo
root), and point the Vercel frontend's `VITE_API_BASE_URL` at the Render
service URL.

Steps:
1. Push this repo to GitHub (done).
2. In Render: "New Web Service" → connect this repo → it auto-detects
   `render.yaml` → deploy (`Dockerfile` builds the image).
3. Note the Render service URL (e.g. `https://swarmway-backend.onrender.com`).
4. In Vercel project settings: add env var
   `VITE_API_BASE_URL=https://swarmway-backend.onrender.com`.
5. Redeploy the Vercel frontend so it picks up the backend URL.

Local development still works with the 3-command quickstart:
`uv sync` → `uv run uvicorn swarmway.api.app:app` →
`VITE_API_BASE_URL=http://localhost:8000 cd frontend && pnpm run dev`.

## Consequences

- The deployed Vercel site does live solves against the hosted backend when
  `VITE_API_BASE_URL` is set; falls back to bundled traces + honest offline
  badge when the backend is unreachable (never a spinner).
- Backend caps enforced server-side (`SWARMWAY_MAX_GRID_CELLS=262144`,
  `SWARMWAY_MAX_AGENTS=60`, `SWARMWAY_SOLVE_BUDGET_MS=10000` from
  `.env.example`), with detailed 422s (Phase 8).
- Render free tier may spin down after inactivity; first request after
  spin-down can take ~30–60 s (cold start) — normal, not a bug.
- No change to the API contract (Section 7.4) or caps.
