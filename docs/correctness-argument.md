# Correctness argument: why CBS returns optimal sum-of-costs

This document is the interview answer: on a single page, why Conflict-Based
Search (CBS, Section 8.2) returns a minimal sum-of-costs (SoC) solution under
the Section 7.1 movement model (4-connected unit-time movement with wait,
simultaneous steps, stay-at-goal), given that the low-level planner is
constrained-optimal.

## The two-level structure

CBS is a two-level search (Sharon et al. 2015, *Conflict-Based Search For
Optimal Multi-Agent Pathfinding*, Artificial Intelligence 219, Section 3):

* **Low level** (`solver/astar_space_time.py`): space-time A* returns, for one
  agent under a set of vertex/edge constraints, the *shortest* path that obeys
  them. Time-expanded state (position, timestep); g = timestep; h = exact
  true distance (reverse BFS, `solver/astar_static.py`). Goal test enforces
  stay-at-goal: arriving at goal is accepted only when no goal-hold constraint
  blocks it at t' >= t. Section 8.1.

* **High level** (`solver/cbs.py`): best-first search over a *constraint tree*.
  Each node holds per-agent constrained-optimal paths. The root has no
  constraints. The high level pops the minimum-SoC node, finds the first
  conflict, and branches into two children, each adding a constraint that
  forbids one agent from causing that conflict.

## The invariant

**Invariant:** every CT node contains, for each agent, the constrained-optimal
path under its constraint set (low level returns constrained-optimal), and SoC
is the sum of those path costs. Best-first ordering means the open list always
pops the minimum-SoC node first.

**Why this implies optimality:**
1. Every leaf (conflict-free node) is a valid solution.
2. The tree contains every conflict-free solution among its leaves: taking any
   solution, if an agent's path violates a constraint that would be added along
   some path down the tree, that agent can be re-planned to satisfy it; because
   the low level is constrained-optimal, following that chain never increases
   cost. So some leaf is optimal.
3. Best-first over a tree whose leaves include an optimal solution means the
   first conflict-free node popped has minimal SoC.

This is the argument in Sharon et al. (2015), Section 3.1: CBS's completeness
and optimality rest on low-level optimality and best-first expansion.

## Evidence backing each step

* Low-level optimality is tested: `tests/properties/test_low_level.py`
  asserts space-time A* cost equals an independent exhaustive BFS over the
  time-expanded graph on random small grids with random constraint sets.
* Distance-table admissibility is tested (`tests/properties/test_low_level.py`:
  true distance <= optimal path length cross-checked against BFS).
* CBS-vs-brute-force optimality is tested on hand-crafted corridors, swaps,
  forced detours, and random tiny instances (`tests/optimality/test_optimality.py`),
  asserting soc_cbs == soc_bruteforce whenever brute force finds a solution.
* Determinism (same instance => identical paths and stats) is tested so the
  "first conflict-free pop" is well-defined (`tests/properties/test_low_level.py`).
* Validity of every returned solution is checked by the independent
  `solver/validity.py` (Section 9.1) before `solve()` returns — an invalid
  solution is treated as a bug.

## What "optimal" means here

Optimal = minimal sum-of-costs under 4-connected unit-time movement with wait
and stay-at-goal (Section 7.1). Makespan is recorded but never optimized.
CBS's optimality claim does not extend to anything broader (time, fuel, or
other objectives).
