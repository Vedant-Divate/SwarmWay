# ADR-0006: Movement model — 4-connected + wait, unit costs, stay-at-goal (resolves A-2)

- Status: accepted
- Date: 2026-10-31
- Phase: 0

## Context

Assumption A-2 (Section 4): movement model — 4-connected moves + wait,
unit costs, simultaneous steps, agents stay at goal. Default from Section 4:
"4-connected + wait + stay-at-goal. Verify against the Stern et al.
benchmark paper and by sanity-checking `.scen` distances (Manhattan-like
⇒ 4-connected)".

## Evidence

Ran a character/distance census over the vendored curated maps and their
first `even` scenario files (see `data/maps/` and `data/scenarios/`):

- `.scen` files use the standard 9-column format with a `version 1` header
  (confirms A-3 as well): `bucket  map-path  map-width  map-height  start-x
  start-y  goal-x  goal-y  optimal-length`. map-path basename and dimensions
  match the map being loaded; "instance with k agents" = first k data lines.

- The MovingAI `optimal-length` column equals the **octile** distance on open
  ground (e.g. `empty-16-16` line 0: start (10,8) → goal (8,5), octile
  3.828 == optimal-length 3.82842712). This is expected: MovingAI's
  single-agent benchmark length uses 8-connected movement. It does **not**
  contradict our model: per Section 7.7, `optimal-length` is a cross-check of
  our distance tables only and must not be treated as a MAPF bound.

- On obstacle maps the `optimal-length` exceeds the octite lower bound
  (e.g. `random-32-32-10` line 6: octile 20.80 vs optimal-length 24.31),
  consistent with blocked cells forcing detours.

## Decision

Adopt the Section 7.1 default as the solver's movement model:

- 4-connected moves (up/down/left/right) + wait in place, all actions cost 1
- simultaneous steps, discrete time
- agents stay at goal after arrival (goal blocks the cell for `t >= T_i`)
- objective: minimize sum-of-costs

True-distance tables (`solver/astar_static.py`) are reverse BFS over the
4-connected passable grid — exact and admissible under this model. The
`.scen` octite `optimal-length` is used only as a loose sanity cross-check in
tests (Section 9.2 #6), never as a bound.

## Consequences

- CBS optimality claim is "min sum-of-costs under 4-connected unit-time
  movement with wait + stay-at-goal" — stated with that qualifier everywhere
  (Section 1.6).
- `.scen` `optimal-length` values will not match our 4-connected true
  distances on open ground; tests must account for this (documented in the
  test comments).
