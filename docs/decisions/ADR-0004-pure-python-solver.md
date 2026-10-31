# ADR-0004: Pure-Python solver, no C extensions in MVP; PyPy compatibility maintained

- Status: accepted
- Date: 2026-10-31
- Phase: 1

## Context

Section 5.1 (Notes and constraints) states: "Pure Python: `heapq`,
`dataclasses`. No C extensions in MVP" and "solver/ + domain/ must never
import fastapi, pydantic, or do network I/O, so the benchmark CLI can run
under PyPy unchanged if CPython is too slow." Section 6.3 lists ADR-0004
as a Phase 0/1 decision to record.

## Decision

The solver (`src/swarmway/solver/`) and domain (`src/swarmway/domain/`)
packages remain pure-Python with zero framework dependencies:

- Standard library only (`heapq`, `dataclasses`, `functools`, etc.).
- No C extensions, no NumPy, no native modules in MVP (Section 5.1).
- No imports of fastapi/pydantic-HTTP/uvicorn, no network I/O
  (Sections 0.2, 6.1). Grids are lists of strings; distance tables are
  lists of ints.
- All solver/domain modules import `domain` only (solver → domain;
  domain → nothing from solver/api/frontend).

This keeps `domain/` and `solver/` importable under CPython and PyPy with
no installation beyond the standard library, which is what makes the
benchmark harness and any future Wasm/PyPy build possible.

## Consequences

- Performance work stays algorithmic (better data structures, not native
  code); any future C/Rust core requires a new ADR (Section 5.1).
- `mypy --strict` is enforced on `domain/` and `solver/` (Section 13.2).
- The FastAPI API (`api/`) and CLI/bench may import `solver`/`domain`
  and own all framework + I/O concerns.
