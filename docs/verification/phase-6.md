# Phase 6 verification — Search visualization and live compare (PARTIAL GATE — Part A / backend)

## What was built (Part A — backend, Sections 8.5, 8.10, 14 Task 2 + Task 4)

- `src/swarmway/solver/cbs.py` (modified): CBS high level gains `options.tie_break` in
  `{fifo, conflicts, depth}`, default `fifo`. The secondary heap key only reorders
  equal-SoC nodes, so optimality for sum-of-costs is untouched:
  - `fifo`: insertion order (previous behaviour).
  - `conflicts`: prefers nodes whose paths contain more conflicts.
  - `depth`: prefers deeper nodes.
  Ties inside a tie-break resolve by insertion order (deterministic, Section 8.4;
  no unsorted iteration; nodes are never compared against each other because
  `insertion_id` is unique).
- `src/swarmway/solver/__init__.py` (modified): registry runners thread an optional
  `TraceRecorder` through to `cbs.solve`; PP solvers ignore it and keep `search: []`.
- `src/swarmway/cli/main.py` (modified): `solve` gains `--tie-break` (validated;
  only applies to `cbs`). When `--emit-trace` is given, a `TraceRecorder` records the
  search events and the trace `search` block is populated (previously always `[]`).
- `src/swarmway/api/routes.py` (modified): `POST /api/solve` accepts
  `options.tie_break` (422 `invalid_options` on unknown values/options; default `fifo`);
  the seed travels inside `options` so the frozen v1 request shape is unchanged; search
  events are recorded for CBS.
- `src/swarmway/solver/trace.py`: unchanged (pure observer; event cap honored).

## Trace-v1 schema check

`SolverBlock.options` is `dict[str, Any]` (open object) in
`src/swarmway/domain/schemas.py` — `tie_break` flows through with **no schema change**;
the committed `docs/contracts/trace-v1.schema.json` stays valid and the schema-export
staleness test stays green.

## Commands run and output (real, not abbreviated)

```
$ uv run ruff check .
All checks passed!
$ uv run ruff format --check .
84 files already formatted
$ uv run mypy src/swarmway/domain src/swarmway/solver
Success: no issues found in 17 source files
$ uv run pytest tests/optimality tests/unit/solver/test_cbs.py -v
...
tests/optimality/test_optimality.py::test_optimality_per_tie_break[baseline-...-fifo] PASSED
...
tests/optimality/test_optimality.py::test_conflicts_reorders_equal_cost_frontier PASSED
tests/optimality/test_optimality.py::test_depth_reorders_equal_cost_frontier PASSED
tests/unit/solver/test_cbs.py::test_determinism_per_tie_break PASSED
tests/unit/solver/test_cbs.py::test_soc_identical_across_tie_breaks PASSED
============================= 25 passed in 16.08s ==============================
```

Full suite: `152 passed, 2 deselected`.

### Optimality per tie-break (Section 9.3)

`test_optimality_per_tie_break` runs 5 hand-crafted instances × 3 tie-breaks
(`fifo`, `conflicts`, `depth`) plus 15 deterministic random tiny instances × 3
tie-breaks. For every tie-break: `soc_cbs == soc_bruteforce` whenever brute force
finds a solution, and CBS solves whenever brute force does. Optimality is untouched
by tie-break choice.

### Tie-break reorders the equal-cost frontier (observable difference vs fifo, same SoC)

`test_conflicts_reorders_equal_cost_frontier` — 3×3 open grid,
agent0 `(1,1)->(1,0)`, agent1 `(0,0)->(2,0)`, SoC = 4 for all tie-breaks:
- `fifo` expands nodes `(1, 2)`
- `conflicts` expands nodes `(1, 2, 3, 4)`  ← different frontier order
- `depth` expands nodes `(1, 2)`  (same as fifo here)

`test_depth_reorders_equal_cost_frontier` — 3×3 open grid,
agent0 `(2,1)->(0,0)`, agent1 `(1,2)->(1,0)`, SoC = 6 for all tie-breaks:
- `fifo` expands `(1, 2, 3, 4)`
- `conflicts` expands `(1, 2, 3, 4, 5, 6)`
- `depth` expands `(1, 2, 3, 4, 5, 6)`  ← different frontier order

### Determinism per tie-break

`test_determinism_per_tie_break` — same `(instance, options)` twice for each
tie-break: identical paths, SoC, makespan, and all expansion stats (excluding
`runtime_ms`). `test_soc_identical_across_tie_breaks` — final SoC identical
(`{4}`) across all tie-breaks on the frontier-reorder instance.

### Default-options regression diff (empty apart from `runtime_ms`)

Re-emitted `frontend/public/traces/deep-tree-cbs.json` (random-32-32-10, 20 agents,
CBS, default `fifo`) with `--emit-trace` and diffed against the committed file:

```
regen runtime_ms: 566.5046000212897   committed: 554.1301999764983
identical apart from runtime_ms: True
soc: 436 436   events: 114 114
```

Outputs are unchanged from the Phase 5 solver except `runtime_ms`.

## Bundled traces (Section 11.5, Task 4)

Generated with `swarmway solve --emit-trace`, verified with `swarmway replay --check`
(all `VALIDITY: valid`), added through `scripts/bundle-traces.py`:

| trace | story | agents | soc | makespan | search events |
| --- | --- | --- | --- | --- | --- |
| `frontend/public/traces/deep-tree-cbs.json` | Deep constraint tree on random-32-32-10 | 20 | 436 | 46 | 114 |
| `frontend/public/traces/many-conflict-cbs.json` | Many conflicts on warehouse-10-20-10 | 20 | 1697 | 174 | 14 |

Timeout trace fixture (contract test only, **not** in `public/traces`):
- `tests/fixtures/timeout-trace.json`: `status: timeout`, `ct_expanded: 512`,
  `budget_ms: 100` (clamped), `VALIDITY: valid` on parse.

Updated bundled-trace list (with existing traces):

| trace | story |
| --- | --- |
| `corridor-yield-cbs.json` / `corridor-yield-pp.json` | corridor yield (CBS + PP) |
| `warehouse-aisles-cbs.json` / `warehouse-aisles-pp.json` | warehouse aisles (CBS + PP) |
| `pocket-deadlock-cbs.json` / `pocket-deadlock-pp-unsat.json` | pocket deadlock (PP honestly unsat) |
| `plaza-rotary-cbs.json` | plaza rotary (CBS only — no bundled PP trace) |
| `deep-tree-cbs.json` | deep constraint tree (NEW) |
| `many-conflict-cbs.json` | many conflicts (NEW) |

Note: `plaza-rotary` has no bundled PP trace (per Part B, show an honest
"no bundled PP trace for this map" rather than fake data).

## Deviations from PROJECT.md

None beyond ADR-0009 (frontend v2 built directly by the coding agent; AI Studio
tokens exhausted), committed as `8fae4b4`.

## Commits in this phase (Part A)

- `8fae4b4 docs(decisions): frontend v2 built by coding agent (ai studio unavailable)`
- `f10dab2 feat(solver): add deterministic tie-break options`
- `d60ba75 feat(scripts): add search-story curated traces`

## Stopped here

Part A is complete and pushed. Frontend work (Part B: Search tab tree explorer,
compare panel, tie-break selector, contract tests, phone-width check) is NOT
started, per the Part A instruction to stop after the partial gate.
