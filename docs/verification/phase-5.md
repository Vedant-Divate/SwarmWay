# Phase 5 verification — Prioritized planning baseline

## What was built

Section 8.6 prioritized-planning baseline (Phase 5, Tasks 1–5):

- `src/swarmway/solver/prioritized.py` (new): agents planned sequentially in a
  given order; each agent solved by the existing space-time A* low level
  (`swarmway/solver/astar_space_time.py`) treating earlier agents' paths as
  moving obstacles (occupied cell per timestep, stay-at-goal tails to the
  horizon). Horizon policy (Section 8.6 default, not pinned by PROJECT.md,
  recorded in `docs/questions.md`):
  H = max(arrival times of earlier agents) + (width + height) per sequential
  plan; an agent that cannot reach its goal within H makes that ordering fail
  (honest incompleteness).
- Variants per A-9: `pp-fixed` (agent-index order; options empty; seed null)
  and `pp-best-of-n` (n seeded shuffles via `random.Random(seed)`, min-SoC
  success kept; options `{"orderings": 8}` default, validated 1..64; seed
  defaults to 42 and is recorded in the trace).
- Same trace contract as CBS: `search` is exactly `[]`, the solver block
  records name/options/seed, result notes state the orderings tried, which
  ordering won, and per-ordering outcomes; every path padded to makespan + 1
  (stay-at-goal repetition, V-PAD satisfied).
- Same validity enforcement as CBS: the independent checker runs on every
  solve (CLI + API) before anything is returned or emitted; an invalid PP
  solution is a bug. CLI prints the lowercase `VALIDITY: valid` line.
- `src/swarmway/solver/__init__.py` (modified): one solver registry, shared
  by CLI and API (`run_solver`, `solver_names`); `GET /api/health` lists
  solvers from the registry automatically.
- `src/swarmway/cli/main.py` (modified): `--solver pp-fixed|pp-best-of-n`
  with `--orderings` and `--seed` plumbed through.
- `src/swarmway/api/routes.py` (modified): `POST /api/solve` accepts the two
  new names via the registry, with all existing clamps (budget clamp, agent
  cap, honest 200 timeout); seed carried inside `options` so the frozen v1
  request shape is unchanged.
- `tests/integration/test_api.py` (modified): one pp-best-of-n solve through
  the API, response validated against the trace v1 Pydantic models.
- `scripts/compare-cbs-pp.py` (new): Phase-5 preview of the Phase-7 harness
  (three arms over the Section 10.1 cells, 60 s budget per cell, honest
  timeouts, no artifacts written).
- Crafted tests in `tests/unit/solver/test_prioritized.py` (Task 5):
  corridor swap where pp-fixed fails but CBS solves, strictly costlier PP
  case, best-of-n rescue / all-orderings-fail, per-seed determinism, timeout
  honesty on both variants.
- `tests/properties/test_dominance.py` (new, commit 2): Hypothesis property
  #2 (soc_cbs <= soc_pp when both solve), grids up to 12x12, up to 6 agents,
  fast profile; skipped (one side did not solve) counts reported, never
  swallowed.
- `docs/questions.md` (modified): horizon policy line; pp-best-of-n options
  key alias line ("n" from PROJECT.md 7.4 vs "orderings" from Phase 5 prompt
  -> both accepted, "orderings" canonical).

## Commands run and output (real, not abbreviated)

```
$ uv run ruff check .
All checks passed!
$ uv run ruff format --check .
81 files already formatted
$ uv run mypy src/swarmway/domain src/swarmway/solver
Success: no issues found in 17 source files
$ uv run pytest -q
132 passed, 2 deselected in 76.81s
```

## Manual check

Comparison table (Section 10.1 cells, `even` scenario first-k, two smallest
rungs 5 and 10 agents; budget 60 s per (instance, solver)):

```
environment: python CPython 3.12.15 | platform Windows-11-10.0.26300-SP0 |
cpu Intel64 Family 6 Model 197 Stepping 2, GenuineIntel | ram 16.5 GB |
git 1b4bcb8-dirty | date 2026-11-04T15:18:41+00:00 |
command scripts/compare-cbs-pp.py
cells: 14 | arms: cbs, pp-fixed, pp-best-of-8 | budget: 60s per
(instance, solver) | scenario: even, first-k

| map | agents | arm | status | soc | makespan | runtime_ms | soc gap vs CBS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| empty-16-16 | 5 | cbs | solved | 66 | 22 | 4.5 | - |
| empty-16-16 | 5 | pp-fixed | solved | 66 | 22 | 36.8 | 0 |
| empty-16-16 | 5 | pp-best-of-8 | solved | 66 | 22 | 232.6 | 0 |
| empty-16-16 | 10 | cbs | solved | 125 | 22 | 12.1 | - |
| empty-16-16 | 10 | pp-fixed | solved | 125 | 22 | 343.3 | 0 |
| empty-16-16 | 10 | pp-best-of-8 | solved | 126 | 22 | 2934.2 | 1 |
| random-32-32-10 | 5 | cbs | solved | 97 | 39 | 12.6 | - |
| random-32-32-10 | 5 | pp-fixed | solved | 97 | 39 | 133.2 | 0 |
| random-32-32-10 | 5 | pp-best-of-8 | solved | 97 | 39 | 1077.9 | 0 |
| random-32-32-10 | 10 | cbs | solved | 242 | 46 | 77.2 | - |
| random-32-32-10 | 10 | pp-fixed | solved | 242 | 46 | 1372.3 | 0 |
| random-32-32-10 | 10 | pp-best-of-8 | solved | 242 | 46 | 13074.9 | 0 |
| random-32-32-20 | 5 | cbs | solved | 102 | 37 | 12.4 | - |
| random-32-32-20 | 5 | pp-fixed | solved | 102 | 37 | 113.0 | 0 |
| random-32-32-20 | 5 | pp-best-of-8 | solved | 102 | 37 | 1040.9 | 0 |
| random-32-32-20 | 10 | cbs | solved | 200 | 37 | 38.0 | - |
| random-32-32-20 | 10 | pp-fixed | solved | 200 | 37 | 1034.5 | 0 |
| random-32-32-20 | 10 | pp-best-of-8 | solved | 200 | 37 | 9800.9 | 0 |
| maze-32-32-2 | 5 | cbs | solved | 226 | 69 | 12.0 | - |
| maze-32-32-2 | 5 | pp-fixed | solved | 226 | 69 | 274.1 | 0 |
| maze-32-32-2 | 5 | pp-best-of-8 | solved | 226 | 69 | 2168.4 | 0 |
| maze-32-32-2 | 10 | cbs | timeout | - | - | 60498.3 | - |
| maze-32-32-2 | 10 | pp-fixed | solved | 468 | 100 | 3202.4 | - |
| maze-32-32-2 | 10 | pp-best-of-8 | solved | 467 | 99 | 26850.6 | - |
| room-32-32-4 | 5 | cbs | solved | 159 | 44 | 12.4 | - |
| room-32-32-4 | 5 | pp-fixed | solved | 159 | 44 | 206.0 | 0 |
| room-32-32-4 | 5 | pp-best-of-8 | solved | 159 | 44 | 1431.2 | 0 |
| room-32-32-4 | 10 | cbs | timeout | - | - | 64401.2 | - |
| room-32-32-4 | 10 | pp-fixed | solved | 258 | 46 | 1398.1 | - |
| room-32-32-4 | 10 | pp-best-of-8 | solved | 256 | 46 | 11351.4 | - |
| warehouse-10-20-10-2-1 | 5 | cbs | solved | 456 | 159 | 75.7 | - |
| warehouse-10-20-10-2-1 | 5 | pp-fixed | solved | 456 | 159 | 1852.8 | 0 |
| warehouse-10-20-10-2-1 | 5 | pp-best-of-8 | solved | 456 | 159 | 14676.5 | 0 |
| warehouse-10-20-10-2-1 | 10 | cbs | solved | 869 | 174 | 146.5 | - |
| warehouse-10-20-10-2-1 | 10 | pp-fixed | solved | 869 | 174 | 17494.3 | 0 |
| warehouse-10-20-10-2-1 | 10 | pp-best-of-8 | timeout | - | - | 60466.5 | - |
| ht_chantry | 5 | cbs | solved | 619 | 195 | 63.1 | - |
| ht_chantry | 5 | pp-fixed | solved | 621 | 195 | 3215.9 | 2 |
| ht_chantry | 5 | pp-best-of-8 | solved | 619 | 195 | 24129.7 | 0 |
| ht_chantry | 10 | cbs | timeout | - | - | 112124.0 | - |
| ht_chantry | 10 | pp-fixed | solved | 1258 | 195 | 34702.2 | - |
| ht_chantry | 10 | pp-best-of-8 | timeout | - | - | 69267.5 | - |

Counts (timeouts are failures, never dropped):

| arm | solved | unsat | timeout | error | total | success rate |
| --- | --- | --- | --- | --- | --- | --- |
| cbs | 11 | 0 | 3 | 0 | 14 | 78.6% |
| pp-fixed | 14 | 0 | 0 | 0 | 14 | 100.0% |
| pp-best-of-8 | 12 | 0 | 2 | 0 | 14 | 85.7% |

dominance check: 0 row(s) where PP SoC < CBS SoC
```

Every row where both arms solved satisfies `soc_cbs <= soc_pp` — dominance
holds empirically, matching the property suite.

Crafted-case outputs:

```
$ uv run pytest tests/unit/solver/test_prioritized.py -v -k
"corridor or costlier or rescues or all_orderings or timeout or basic"
...
tests/unit/solver/test_prioritized.py::test_pp_corridor_swap_pp_fails_cbs_solves PASSED
tests/unit/solver/test_prioritized.py::test_pp_costlier_than_cbs PASSED
tests/unit/solver/test_prioritized.py::test_pp_best_of_n_rescues_failing_fixed_ordering PASSED
tests/unit/solver/test_prioritized.py::test_pp_best_of_n_all_orderings_fail PASSED
tests/unit/solver/test_prioritized.py::test_pp_timeout_honesty PASSED
6 passed, 4 deselected in 1.12s
```

The corridor swap fixture (`..#.. / ..#.. / ..... / ..#.. / ..#..`,
agent 0 parks on link `(2, 2)`): pp-fixed -> unsat (honest incompleteness),
CBS -> solved (soc 11, validity valid). pp-best-of-n (seed 42) recovers with
ordering `[1, 0]`, notes name the winning ordering. The strict-inequality
fixture (`....` x4, agent 0 `(0,0)->(1,1)`, agent 1 `(2,0)->(1,0)`):
CBS soc 3 < PP soc 4 — PP's greedy low level routes agent 0 through
agent 1's goal cell.

Property suite output:

```
$ uv run pytest tests/properties/test_dominance.py -v
...
dominance property: 42 comparable pair(s) (soc_cbs <= soc_pp asserted),
8 skipped pair(s) (one side did not solve)
2 passed in 11.01s
```

Determinism check (two `pp-best-of-4 --seed 7` solves on
`empty-16-16` with 5 agents, byte comparison of emitted traces):

```
t1 runtime_ms: 168.74660001485609
t2 runtime_ms: 138.86300000012852
identical apart from runtime_ms: True
solver block: {'name': 'pp-best-of-n', 'options': {'orderings': 4},
'package_version': '0.1.0', 'seed': 7}
search: []
result notes: ['pp-best-of-4 (seed=7): 4 orderings tried',
'ordering [4, 0, 3, 1, 2]: solved (SoC=66)',
'ordering [2, 3, 1, 4, 0]: solved (SoC=66)',
'ordering [3, 2, 0, 1, 4]: solved (SoC=66)',
'ordering [1, 2, 0, 4, 3]: solved (SoC=66)',
'best ordering: [4, 0, 3, 1, 2] (SoC=66)']
```

Scope sanity: no `bench/`, no `data/results/`, no `frontend/` change, no new
solver file beyond `prioritized.py`.

## Deviations from PROJECT.md

None beyond the documented defaults recorded in `docs/questions.md`
(horizon policy; pp-best-of-n options key alias).

## Commits in this phase

- 80eef7e feat(solver): add prioritized planning baseline with seeded orderings
- 1b4bcb8 test(properties): add cbs dominance over prioritized planning
- 4404a4a feat(cli): expose pp solvers and comparison preview
