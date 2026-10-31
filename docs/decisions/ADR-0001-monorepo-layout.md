# ADR-0001: Monorepo layout — Python package `swarmway` plus `frontend/`

- Status: accepted
- Date: 2026-10-31
- Phase: 0

## Context

PROJECT.md Section 12 defines a monorepo with a Python package
`swarmway` (`domain/`, `solver/`, `api/`, `cli/`, `bench/`) and a
`frontend/` React SPA generated in Google AI Studio. The dependency rule
(Section 6.1) requires `domain/` to import nothing from `solver/`,
`api/`, or `frontend/`, and `solver/` to import only `domain/`.

## Decision

Adopt the Section 12 structure exactly:

- `src/swarmway/domain/`, `src/swarmway/solver/`, `src/swarmway/api/`,
  `src/swarmway/cli/`, `src/swarmway/bench/`
- `frontend/` for the AI Studio-generated SPA
- `data/maps/`, `data/scenarios/`, `data/results/` for vendored data
- `docs/{decisions,verification,contracts}/`, `scripts/`, `tests/`

`pyproject.toml` uses a src layout; the `swarmway` console script maps to
`swarmway:main` (skeleton only in Phase 0).

## Consequences

- Purity is checkable by import boundaries and mypy on `domain/` and
  `solver/`.
- Later phases add modules under these directories only; no new
  top-level source roots without an ADR.
