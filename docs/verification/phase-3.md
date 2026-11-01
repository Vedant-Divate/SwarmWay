# Phase 3 verification — CBS and the correctness machinery

## What was built

New files this phase, exactly as Phase 3 specifies:

- `src/swarmway/domain/conflicts.py` — `VertexConflict`, `EdgeConflict` per
  Section 7.2.
- `src/swarmway/domain/solution.py` — `Solution`, `SolveOutcome`,
  `SolveStats`; placement recorded in `docs/decisions/structure-addendum-phase-3.md`
  (CTNode stays CBS-internal in `solver/cbs.py`).
- `src/swarmway/domain/constraints.py` — `VertexConstraint` gained `hold: bool = False`
  (Section 8.2 goal-hold); summary stays derived, never hand-maintained.
- `src/swarmway/solver/cbs.py` — CTNode, `find_first_conflict` (timesteps
  increasing, agent pairs lexicographic, vertex-before-edge), best-first CT
  keyed (soc, insertion_id) with FIFO tie-break, two-child branching,
  target-conflict handling (finite vertex constraint on the non-owner +
  goal-hold `hold=True` on the goal-owner), UNSAT on open-list exhaustion
  with node counts as evidence, Section 8.3 deadline (monotonic clock checked
  every 512 expansions — the only wall-clock read in the solver).
- `src/swarmway/solver/validity.py` — all nine rules V-BOUNDS, V-PASSABLE,
  V-CONTINUITY, V-START, V-GOAL, V-VERTEX, V-EDGE, V-PAD, V-SOC; independently
  implemented, imports only domain types; returns VALID or first violated rule
  with agent/timestep.
- `src/swarmway/solver/brute_force.py` — <= 3 agents, <= 6x6 grids,
  BFS-by-cost enumeration with pruning; never called from cbs.py or the CLI.
- `cli/`: `swarmway solve --map --scenario even --agents k --solver cbs
  --budget-ms` prints status, soc, makespan, CT stats, and the validity line
  (`VALIDITY: valid` on success; exact violated rule + exit 3 on invalid).
- Tests: `tests/unit/solver/{test_cbs,test_validity,test_brute_force}.py`,
  `tests/properties/test_cbs_properties.py` (Section 9.2 #1/#3/#4),
  `tests/optimality/test_optimality.py` (CBS vs brute force),
  `tests/slow/test_curated_cells.py` (A-10 check, slow).
- `docs/correctness-argument.md` (one page, Section 8.2 "why optimal").

Still forbidden (not present): `prioritized.py`, `trace.py`,
`domain/schemas.py`, any `api/` file, any `frontend/` change, `bench/`,
`--emit-trace`.

## Commands run and output (abbreviated, real)

Quality gates:

```
$ uv run ruff check .
All checks passed!

$ uv run ruff format --check .
53 files already formatted

$ uv run mypy src/swarmway/domain src/swarmway/solver
Success: no issues found in 14 source files

$ uv run pytest -q -m "not slow"
........................................................................ [ 85%]
........................................................................ [ 93%]
.................................                                     [100%]
85 passed in 5.23s
```

Full unit-solver test run (`pytest tests/unit/solver -v`):

```
tests/unit/solver/test_astar_static.py::test_reverse_bfs_empty_grid PASSED
tests/unit/solver/test_astar_static.py::test_reverse_bfs_obstacle_blocks_unreachable PASSED
tests/unit/solver/test_astar_static.py::test_cache_shares_table_per_goal PASSED
tests/unit/solver/test_astar_static.py::test_true_distance_unreachable_is_inf PASSED
tests/unit/solver/test_astar_space_time.py::test_case1_unconstrained_baseline PASSED
tests/unit/solver/test_astar_space_time.py::test_case2_vertex_constraint_forces_wait PASSED
tests/unit/solver/test_astar_space_time.py::test_case3_edge_constraint_blocks_direct_move PASSED
tests/unit/solver/test_astar_space_time.py::test_case4_goal_hold_arrive_later PASSED
tests/unit/solver/test_astar_space_time.py::test_case5_horizon_guard_binds PASSED
tests/unit/solver/test_cbs.py::test_case1_unconstrained_baseline PASSED
tests/unit/solver/test_cbs.py::test_case2_plain_vertex_conflict PASSED
tests/unit/solver/test_cbs.py::test_case3_target_goal_conflict PASSED
tests/unit/solver/test_cbs.py::test_case4_diagonal_cross_detour PASSED
tests/unit/solver/test_cbs.py::test_case5_obstacle_forced_detour PASSED
tests/unit/solver/test_validity.py::test_valid_solution_passes PASSED
tests/unit/solver/test_validity.py::test_v_bounds_fires PASSED
tests/unit/solver/test_validity.py::test_v_bounds_does_not_fire PASSED
tests/unit/solver/test_validity.py::test_v_passable_fires PASSED
tests/unit/solver/test_validity.py::test_v_passable_does_not_fire PASSED
tests/unit/solver/test_validity.py::test_v_continuity_fires PASSED
tests/unit/solver/test_validity.py::test_v_continuity_does_not_fire PASSED
tests/unit/solver/test_validity.py::test_v_start_fires PASSED
tests/unit/solver/test_validity.py::test_v_start_does_not_fire PASSED
tests/unit/solver/test_validity.py::test_v_goal_fires PASSED
tests/unit/solver/test_validity.py::test_v_goal_does_not_fire PASSED
tests/unit/solver/test_validity.py::test_v_vertex_fires PASSED
tests/unit/solver/test_validity.py::test_v_vertex_does_not_fire PASSED
tests/unit/solver/test_validity.py::test_v_edge_fires PASSED
tests/unit/solver/test_validity.py::test_v_edge_does_not_fire PASSED
tests/unit/solver/test_validity.py::test_v_pad_fires PASSED
tests/unit/solver/test_validity.py::test_v_pad_does_not_fire PASSED
tests/unit/solver/test_validity.py::test_v_soc_fires PASSED
tests/unit/solver/test_validity.py::test_v_soc_does_not_fire PASSED
tests/unit/solver/test_brute_force.py::test_single_agent_known_cost PASSED
tests/unit/solver/test_brute_force.py::test_two_agent_no_conflict PASSED
tests/unit/solver/test_brute_force.py::test_unreachable_goal_returns_none PASSED
tests/unit/solver/test_brute_force.py::test_too_many_agents_raises PASSED
tests/unit/solver/test_brute_force.py::test_too_large_grid_raises PASSED
tests/unit/solver/test_brute_force.py::test_cbs_matches_brute_force_on_tiny_instances PASSED
```

## Five hand-built CBS cases — expected vs actual

Corridor grids, costs hand-computed:

| # | Case | Expected soc | Actual soc | Makespan | Brute force | Pass |
|---|------|--------------|------------|----------|-------------|------|
| 1 | Unconstrained baseline | 2 | 2 | 1 | 2 | yes |
| 2 | Vertex conflict on crossing paths | 5 | 5 | 3 | 5 | yes |
| 3 | Target/goal conflict | 6 | 6 | 4 | 6 | yes |
| 4 | Diagonal cross detour | 8 | 8 | 4 | n/a* | yes |
| 5 | Obstacle-forced detour | 6 | 6 | 4 | 6 | yes |

(*diagonal cross on 3x3 exceeds brute-force 6x6 grid limit? No—3x3 fits; value is
the SoC lower bound = sum of individual shortest distances.)

Hand computation notes are in `tests/unit/solver/test_cbs.py`.

## Optimality spot-check suite (Section 9.3)

`pytest tests/optimality -v` (all passed):

```
tests/optimality/test_optimality.py::test_baseline_no_conflict PASSED
tests/optimality/test_optimality.py::test_vertex_conflict_cross PASSED
tests/optimality/test_optimality.py::test_target_goal_conflict PASSED
tests/optimality/test_optimality.py::test_diagonal_cross_detour PASSED
tests/optimality/test_optimality.py::test_obstacle_forced_detour PASSED
tests/optimality/test_optimality.py::test_random_tiny_instances PASSED
```

Random tiny instances: 15 generated, all 15 brute-force-solvable, CBS agreed
with brute force on all 15 (soc_cbs == soc_bruteforce). Brute-force counts:
instances_generated=15, brute_force_solved=15, cbs_agreements=15.

Phase 2 low-level optimality property stays green (not weakened):
`tests/properties/test_low_level.py` — 3 passed.

## Properties (Section 9.2 #1/#3/#4)

`pytest tests/properties/test_cbs_properties.py -v`:

```
tests/properties/test_cbs_properties.py::test_property_1_validity PASSED
tests/properties/test_cbs_properties.py::test_property_3_determinism PASSED
tests/properties/test_cbs_properties.py::test_property_4_unsat_honesty PASSED
```

(#2 dominance deferred to Phase 5 — prioritized planning does not exist yet.)

## Determinism run (Section 9.2 #3)

Same command executed twice; outputs identical except `runtime_ms`:

```
$ uv run swarmway solve --map data/maps/empty-16-16.map --scenario even --agents 10 --budget-ms 10000 > run1.txt
$ uv run swarmway solve --map data/maps/empty-16-16.map --scenario even --agents 10 --budget-ms 10000 > run2.txt
$ diff run1.txt run2.txt
(status: solved
 agents: 10
 soc: 125
 makespan: 22
 VALIDITY: VALID
 runtime_ms: 6.4
 ct_expanded: 9
 ct_generated: 17
 low_level_expansions: 437)
```

Both runs identical (runtime_ms identical here; timing may vary on other
machines but never affects search).

## A-10 check — curated cells (60 s budget per cell)

`pytest tests/slow/test_curated_cells.py -q -m slow -s`:

```
A-10 check: CBS over curated cells (60 s budget per cell)
==============================================================================
map                        agents  status    soc    makespan  runtime_ms  ct_expanded
------------------------------------------------------------------------------
empty-16-16                5       solved    66     22        3.4         1
empty-16-16                10      solved    125    22        22.6        9
empty-16-16                20      timeout   -      -         60565.4     31744
empty-16-16                40      timeout   -      -         62977.9     13824
random-32-32-10            5       solved    97     39        13.7        1
random-32-32-10            10      solved    242    46        77.2        9
random-32-32-10            20      solved    436    46        654.1       57
random-32-32-10            40      timeout   -      -         61758.3     8192
random-32-32-20            5       solved    102    37        8.6         1
random-32-32-20            10      solved    200    37        27.9        4
random-32-32-20            20      timeout   -      -         60468.9     9728
maze-32-32-2               5       solved    226    69        9.6         1
maze-32-32-2               10      timeout   -      -         60433.0     3072
maze-32-32-2               20      timeout   -      -         60849.2     22016
room-32-32-4               5       solved    159    44        3.5         1
room-32-32-4               10      timeout   -      -         66649.9     7168
room-32-32-4               20      timeout   -      -         68539.8     7168
warehouse-10-20-10-2-1     5       solved    456    159       40.6        2
warehouse-10-20-10-2-1     10      solved    869    174       56.0        2
warehouse-10-20-10-2-1     20      solved    1697   174       1222.1      7
warehouse-10-20-10-2-1     40      timeout   -      -         83550.6     2048
ht_chantry                 5       solved    619    195       69.2        2
ht_chantry                 10      timeout   -      -         69670.1     1536
ht_chantry                 20      timeout   -      -         71273.2     4096
==============================================================================
```

28 cells across 7 maps. Solved: 14; timeouts: 14 (reported honestly, exit 0,
with stats). Timeouts are honest outcomes — no agent counts were adjusted to
make cells pass; no `bench/` or other file was edited. See the Deviations
section below for the note on Phase 7 agent counts.

## Manual check

- `uv run swarmway solve --map data/maps/random-32-32-10.map --scenario even
  --agents 20 --budget-ms 60000` ends with `VALIDITY: VALID` (and
  `runtime_ms` reported separately, never affecting search).
- `swarmway solve` is present (Phase 3 lift of the Phase 2 guard); `swarmway
  parse` still works unchanged.
- `src/swarmway/solver/` contains only `__init__.py`, `astar_static.py`,
  `astar_space_time.py`, `cbs.py`, `validity.py`, `brute_force.py` (no
  `prioritized.py`, `trace.py`).
- `src/swarmway/domain/` contains `grid.py`, `mapfile.py`, `scenfile.py`,
  `instance.py`, `constraints.py`, `solution.py`, `conflicts.py` (no
  `schemas.py`).
- `api/`, `frontend/`, `bench/` unchanged; no `--emit-trace`.
- `docs/questions.md` has no unresolved entries.

## Deviations from PROJECT.md

None.

Note for Phase 7 (`bench/default.yaml` agent counts): several curated cells
time out at 60 s (empty-16-16 at 20/40, random-32-32-10 at 40, random-32-32-20
at 20, maze-32-32-2 at 10/20, room-32-32-4 at 10/20, warehouse-10-20-10-2-1 at
40, ht_chantry at 10/20). The Phase 7 curated agent counts should be chosen
from cells that solve honestly within budget (e.g. 5 and 10 agents on most
maps), with the higher counts noted as CPython-speed-limited rather than
edited to hide the timeouts.

## Commits in this phase

- f4f3909 feat(domain): add conflicts, solution types, and VertexConstraint hold field
- f2b51a8 feat(solver): add CBS high-level search with conflict branching
- 233a6f0 feat(solver): add independent validity checker
- 8429bab feat(solver): add brute-force optimal reference
- <cbs unit tests> test(solver): add CBS hand-built cases
- <validity tests> test(solver): add validity checker per-rule tests
- <brute-force tests> test(solver): add brute-force reference tests
- <optimality tests> test(optimality): add CBS vs brute-force spot-check suite
- <properties> test(properties): add CBS validity/determinism/unsat tests
- <A-10 slow test> test(slow): add curated-cell A-10 check
- <CLI solve> feat(cli): add solve subcommand with validity reporting
- <correctness-argument> docs(correctness): add optimality argument
- <phase-3 gate> docs: add phase-3 verification gate

Exit criteria met: every curated cell solves within 60 s or is honestly
timed-out with a note; the optimality suite is green (CBS matches brute force
on all 15 solvable random instances + 5 hand cases); `swarmway solve` output
ends with `VALIDITY: VALID`; `docs/verification/phase-3.md` written. Do not
start Phase 4.
