# ADR-0005: Trace JSON v1 is the frontend contract; bundled traces make the static site fully usable

- Status: accepted
- Date: 2026-10-31
- Phase: 1

## Context

Section 7.3 defines Trace JSON v1 as the versioned frontend contract,
with Pydantic models in `domain/schemas.py` as its single definition.
Section 11.5 makes static/offline mode a P0 property: `frontend/public/traces/*.json`
ships ≥ 6 curated traces so the site works with no backend running.
Section 6.3 lists ADR-0005 as a Phase 0/1 decision to record.

`domain/schemas.py` itself is a Phase 4 deliverable, but the contract
decision is recorded here so later phases (domain parsers, solver, API)
can evolve toward a single schema source.

## Decision

- Trace JSON v1 (Section 7.3) is the frozen frontend contract; breaking
  changes bump `trace_version`, require an ADR, and regenerate all
  bundled traces + Appendix G prompt pack + frontend, in the same PR
  (Section 7.6).
- `domain/schemas.py` (Phase 4) is the single schema source; the OpenAPI
  schema embeds it for AI Studio (Section 7.3).
- Bundled traces (`frontend/public/traces/`) and bundled results
  (`frontend/public/benchmarks/`) make the static site fully usable
  offline — live solving is an enhancement, never a dependency
  (Sections 0.4 rule 3, 11.5).
- Every public number traces to a committed run ID (Section 10.7).

## Consequences

- Later phases must not hand-type numbers into the frontend Benchmarks
  page or README; they render `summary.json` (Sections 10.5, 11.2).
- Trace schema changes are coordinated across API, CLI, frontend, and
  Appendix G in one commit.
