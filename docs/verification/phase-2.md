# Phase 2 verification — Low-level planning: true distances and space-time A*

## What was built

New files this phase, exactly as Phase 2 specifies (nothing more):

- `src/swarmway/solver/__init__.py` (pre-existing placeholder, untouched)
- `src/swarmway/solver/astar_static.py` — reverse-BFS true-distance tables,
  one per distinct goal, cached per instance (`DistanceCache` keyed by
  `(grid, goal)`); `true_distance` with `INF` for unreachable cells; the
  Section 8.1 horizon guard (`sum of true distances + 8 * n_agents`).
- `src/swarmway/solver/astar_space_time.py` — space-time A* low-level
  planner per Section 8.1: `(position, timestep)` states, `g = timestep`,
  `h = true distance`, 4 moves + wait, vertex/edge constraints
  (edge indexing `u->v` between `t-1` and `t`), stay-at-goal goal test
  via the `Constraints` goal-blocked summary, `(f, h, insertion-counter)`
  tie-breaking, horizon guard returning a structured failure with a stat
  counter. Deterministic: fixed action order, sorted constraint
  iteration, no hash-order dependence, no wall-clock/RNG.
- `src/swarmway/domain/constraints.py` — `VertexConstraint`,
  `EdgeConstraint`, `Constraints` (frozen/hashable, sorted iteration,
  derived goal-blocked-until summary per agent/position).

No `cbs.py`, `prioritized.py`, `validity.py`, `trace.py`, no
`domain/conflicts.py` or `domain/schemas.py`, no API/CLI changes beyond
the existing `parse` command, and `swarmway solve` is still absent by
design (confirmed below).

Tests: `tests/unit/solver/`, `tests/properties/`, `tests/slow/`.

## Commands run and output (abbreviated, real)

Quality gates:

```
$ uv run ruff check .
All checks passed!

$ uv run ruff format --check .
51 files already formatted

$ uv run mypy src/swarmway/domain src/swarmway/solver
Success: no issues found in 9 source files

$ uv run pytest -q
......................................................                   [100%]
54 passed, 1 deselected in 1.30s
```

(The 1 deselected is the `slow` micro-benchmark, run separately below.)

Full test run (`pytest -v`):

```
============================= test session starts =============================
platform win32 -- Python 3.12.15, pytest-9.2.0, pluggy-1.7.0
rootdir: C:\Users\Vedant\Desktop\Github\SwarmWay
configfile: pyproject.toml
testpaths: tests
plugins: anyio-4.15.1, hypothesis-6.170.14, ...
collecting ... collected 55 items / 1 deselected / 54 selected

tests/properties/test_low_level.py::test_low_level_optimality_matches_exhaustive_bfs PASSED [  1%]
tests/properties/test_low_level.py::test_distance_table_admissible PASSED [  3%]
tests/properties/test_low_level.py::test_determinism_identical_inputs_twice PASSED [  5%]
...
tests/unit/solver/test_astar_space_time.py::test_case1_unconstrained_baseline PASSED [ 83%]
tests/unit/solver/test_astar_space_time.py::test_case2_vertex_constraint_forces_wait PASSED [ 85%]
tests/unit/solver/test_astar_space_time.py::test_case3_edge_constraint_blocks_direct_move PASSED [ 87%]
tests/unit/solver/test_astar_space_time.py::test_case4_goal_hold_arrive_later PASSED [ 88%]
tests/unit/solver/test_astar_space_time.py::test_case5_horizon_guard_binds PASSED [ 90%]
tests/unit/solver/test_astar_static.py::test_reverse_bfs_empty_grid PASSED [ 92%]
tests/unit/solver/test_astar_static.py::test_reverse_bfs_obstacle_blocks_unreachable PASSED [ 94%]
tests/unit/solver/test_astar_static.py::test_cache_shares_table_per_goal PASSED [ 96%]
tests/unit/solver/test_astar_static.py::test_true_distance_unreachable_is_inf PASSED [ 98%]
...
====================== 54 passed, 1 deselected in 1.31s =======================
```

Optimality spot-check (low-level, Section 9.3) passes: on random small
grids with random start/goal and random constraint sets, space-time A*
cost equals an independent exhaustive BFS over the time-expanded graph.
Admissibility (Section 9.2 #6) passes: `true_dist[cell] <=` actual
optimal path length cross-checked against BFS. Determinism passes:
identical inputs run twice in-process give identical path, cost,
expansions, and horizon flag.

## Five hand-built constraint cases — expected vs actual

Corridor grid (x axis, `(0,0)` top-left, start left, goal right)::

    (0,0)  (1,0)  (2,0)  (3,0)  (4,0)
     S  ->  .  ->  .  ->  .  ->  G

Unconstrained optimal cost C = 4 (one move per timestep, no waits).

| # | Case | Geometry / constraint (hand computation) | Expected cost | Actual cost | Pass |
|---|------|------------------------------------------|---------------|-------------|------|
| 1 | Unconstrained baseline | One move per timestep, no waits:<br>`(0,0)t0 -> (1,0)t1 -> (2,0)t2 -> (3,0)t3 -> (4,0)t4` | 4 | 4 | yes |
| 2 | Vertex constraint on the only shortest path | Constraint on `(2,0)` at t=2 blocks the only shortest path; wait one step at `(1,0)`:<br>`(0,0)t0 -> (1,0)t1 -> (1,0)t2(wait) -> (2,0)t3 -> (3,0)t4 -> (4,0)t5`<br>No cost-4 path exists (it occupies `(2,0)` at t=2). | 5 (= C+1) | 5 | yes |
| 3 | Edge constraint forcing detour | Constraint `<(1,0),(2,0),2>` forbids occupying `(1,0)` at t=1 AND `(2,0)` at t=2, which the direct path does; cheapest resolution is a one-step wait at the start:<br>`(0,0)t0 -> (0,0)t1(wait) -> (1,0)t2 -> (2,0)t3 -> (3,0)t4 -> (4,0)t5`<br>No cost-4 path exists (it violates the edge constraint). | 5 (= C+1) | 5 | yes |
| 4 | Goal-hold: arrive later | Constraint on goal `(4,0)` at t=4 (goal blocked from t=4 onward); direct arrival at t=4 is invalid, wait one step at `(3,0)`:<br>`(0,0)t0 -> (1,0)t1 -> (2,0)t2 -> (3,0)t3 -> (3,0)t4(wait) -> (4,0)t5`<br>Arrival at t=5 is after the block, so accepted. | 5 (= C+1) | 5 | yes |
| 5 | Horizon guard binds | True distance (0,0)->(4,0) is 4 but horizon guard = 2 timesteps; goal unreachable.<br>Low level must fail with `horizon_exceeded=True`, never a silent wrong answer. | failure | failure | yes |

All five cases pass; expected and actual costs match.

## Slow micro-benchmark (excluded from default run)

`uv run pytest tests/slow -q -m slow -s` — unconstrained space-time A*
over the 7 curated maps, first 5 scenario start/goal pairs each,
printing cost, expansions, and wall-time ms:

```
Micro-benchmark: unconstrained space-time A* over curated maps
========================================================================
map                          pair  cost   expansions  wall_ms 
------------------------------------------------------------------------
empty-16-16                  0     5      6           0.05
empty-16-16                  1     19     20          0.09
empty-16-16                  2     6      7           0.05
empty-16-16                  3     22     23          0.11
empty-16-16                  4     14     15          0.07
random-32-32-10              0     11     12          0.06
random-32-32-10              1     11     12          0.06
random-32-32-10              2     29     30          0.15
random-32-32-10              3     39     40          0.20
random-32-32-10              4     7      8           0.03
random-32-32-20              0     4      5           0.05
random-32-32-20              1     7      8           0.05
random-32-32-20              2     18     19          0.14
random-32-32-20              3     37     38          0.19
random-32-32-20              4     36     37          0.15
maze-32-32-2                 0     15     16          0.09
maze-32-32-2                 1     35     36          0.17
maze-32-32-2                 2     69     70          0.38
maze-32-32-2                 3     58     59          0.28
maze-32-32-2                 4     49     50          0.22
room-32-32-4                 0     44     45          0.37
room-32-32-4                 1     39     40          0.25
room-32-32-4                 2     11     12          0.07
room-32-32-4                 3     24     25          0.11
room-32-32-4                 4     41     42          0.18
warehouse-10-20-10-2-1       0     98     99          0.47
warehouse-10-20-10-2-1       1     120    121         0.54
warehouse-10-20-10-2-1       2     69     70          0.27
warehouse-10-20-10-2-1       3     159    160         0.75
warehouse-10-20-10-2-1       4     10     11          0.78
ht_chantry                   0     174    175         1.17
ht_chantry                   1     76     77          0.46
ht_chantry                   2     29     30          0.26
ht_chantry                   3     145    146         0.93
ht_chantry                   4     195    196         1.09
========================================================================
```

All runs complete in under 1.2 ms; expansions equal cost + 1 (the
admissible true-distance heuristic drives A* straight along the optimal
path). This is the honest baseline measurement for Phase 3 — no
optimization was performed this phase.

## Manual check

- `swarmway solve` is still absent by design: `uv run swarmway solve`
  reports `invalid choice: 'solve' (choose from parse)`; only `parse`
  exists. No CBS, no validity checker, no brute force, no `solve`
  command — those arrive in later phases.
- `src/swarmway/solver/` contains only `__init__.py`,
  `astar_static.py`, `astar_space_time.py` (no `cbs.py`,
  `prioritized.py`, `validity.py`, `trace.py`).
- `src/swarmway/domain/` contains `grid.py`, `mapfile.py`, `scenfile.py`,
  `instance.py`, `constraints.py` (no `conflicts.py` or `schemas.py`).
- `docs/questions.md` has no unresolved entries.

## Deviations from PROJECT.md

None.

## Commits in this phase

- 1af08fc chore(repo): keep ground-truth docs local
- 924c7d5 docs(decisions): add ADR-0008 determinism policy
- 6dfb61b feat(domain): add constraint model with goal-blocked summary
- 3dc13b7 feat(solver): add reverse-BFS true-distance tables with per-instance cache
- 439482f feat(solver): add space-time A* low-level planner
- 0bae16a test(solver): add space-time A* unit, optimality, admissibility, and determinism tests
- 9292663 test(slow): add unconstrained space-time A* micro-benchmark over curated maps

Exit criteria met: every constraint-case test passes, the optimality
spot-check suite is green, `swarmway solve` is still absent by design,
and this verification file is written. Do not start Phase 3.
