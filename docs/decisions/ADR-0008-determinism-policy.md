# ADR-0008: Determinism policy — seeded RNG only, sorted iteration, wall-clock never affects search

- Status: accepted
- Date: 2026-10-31
- Phase: 2

## Context

Section 8.4 states the determinism policy. Phase 2 is where it becomes
load-bearing: the low-level space-time A* must be fully deterministic so
that CBS (Phase 3) is deterministic, and so that identical (instance,
solver, options, seed) produces byte-identical traces except runtime_ms
(Section 7.3). The policy must be recorded before the low-level code that
depends on it.

## Decision

Adopt the Section 8.4 determinism policy exactly:

- No iteration over unsorted dicts/sets anywhere in `domain/` or
  `solver/` code — sort explicitly or use ordered structures.
- The only RNG in the codebase is PP ordering shuffles (Phase 5), drawn
  from `random.Random(seed)` with the seed recorded in the trace. No RNG
  in Phase 2 at all.
- Wall-clock (`runtime_ms`) is measured and reported but never read by
  the solver, except the deadline check (Phase 3) which only produces
  the `timeout` outcome. Phase 2 adds no deadline parameter and no
  wall-clock reads.
- Tie-breaking uses explicit insertion counters so the open-list order
  is reproducible; no dependence on hash order.

## Consequences

- mypy --strict is enforced on `domain/` and `solver/` (Section 13.2);
  ruff flags unsorted iteration where detectable.
- Any future code path that reads wall-clock for search decisions
  requires a new ADR superseding this one.
- Tests assert determinism by running identical inputs twice in-process
  and comparing paths and expansion stats (excluding runtime).
