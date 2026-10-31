# ADR-0003: Frontend generated in Google AI Studio; ZIP-export sync workflow

- Status: accepted
- Date: 2026-10-31
- Phase: 0

## Context

Section 0.4 ("the two-workspace reality") assigns the React frontend to
Google AI Studio Build mode, with the repo as the single source of truth.
Assumption A-5 (Section 4) was unresolved: "Google AI Studio export:
'Download as ZIP' and GitHub sync both exist; ZIP → replace frontend/ →
commit works." The export mechanics had to be proven end-to-end while
everything was still trivial (a 7×7 grid, 2 agents), per Phase 0 task 8.

Two alternatives were considered for getting AI Studio output into the
repo:

1. **GitHub sync** (rejected): AI Studio Build mode can push to a GitHub
   repo. Rejected because it pushes to the repo root (bypassing the
   `frontend/` boundary), does not run the repo's verify gates
   (ruff/mypy/pytest), and couples the export to a specific branch flow
   that complicates per-feature commits (Section 13.3).

2. **ZIP download → replace frontend/ → commit** (chosen): Download as
   ZIP from AI Studio, extract outside `frontend/`, clean to the G.1
   whitelist (Appendix G.1), move into `frontend/`, run
   `pnpm install/typecheck/test/build`, then commit (Section 13.5).
   Proven end-to-end in Phase 0 task 8.

## Decision

- The frontend is generated in Google AI Studio Build mode from the
  prompt pack in Appendix G and exported as a ZIP.
- The ZIP is cleaned to the G.1 whitelist (no `.aistudio/`,
  `metadata.json`, `.env.example`, `bun.lock`; whitelisted
  `package.json`; no server-side code, no API keys, no `fetch`/network
  in `src/`).
- The cleaned export replaces `frontend/` wholesale; `frontend/package.json`
  must exist directly (no nested folder); the ZIP itself is never
  committed.
- Before committing: `pnpm -C frontend install`, `typecheck`, `test`
  (8 tests), `build` must all pass — a broken frontend build is never
  committed (Section 13.5).
- The repo copy of `frontend/` is authoritative. If AI Studio loses
  state, re-import from GitHub (AI Studio Build mode supports importing
  a GitHub repo) or re-export and re-clean.

## Consequences

- CI's frontend job (`.github/workflows/ci.yml`) skips gracefully while
  `frontend/` has no `package.json` and un-skips automatically once one
  appears — now proven with a real `package.json` present.
- The `pnpm-lock.yaml` is committed so CI can install `--frozen-lockfile`
  (Section 17.2).
- Future AI Studio sessions follow Section 13.5: export → replace
  `frontend/` → build → commit with message
  `feat(ui): sync frontend from google ai studio — <what changed>`.
- This ADR closes assumption A-5: the ZIP path is proven end-to-end.
