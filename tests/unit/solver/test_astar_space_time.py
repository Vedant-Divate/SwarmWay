"""Tests for :mod:`swarmway.solver.astar_space_time` (Section 8.1).

Five hand-built cases on a 1-wide corridor grid, each asserting the exact
expected cost. Geometry is hand-computed so every expectation is verifiable
by drawing the grid:

Corridor (x axis, (0,0) is top-left, start left, goal right)::

    (0,0)  (1,0)  (2,0)  (3,0)  (4,0)
     S  ->  .  ->  .  ->  .  ->  G

Unconstrained optimal cost C = 4 (one move per timestep, no waits).
"""

from __future__ import annotations

from swarmway.domain.constraints import Constraints
from swarmway.domain.grid import Grid
from swarmway.solver.astar_space_time import INF, plan
from swarmway.solver.astar_static import DistanceCache

AGENT = 0


def _row_grid(n: int) -> Grid:
    return Grid(width=n, height=1, rows=('.' * n,))


def _plan(grid: Grid, start, goal, constraints, max_timesteps: int):
    cache = DistanceCache()
    return plan(grid, cache, start, goal, constraints, AGENT, max_timesteps)


def test_case1_unconstrained_baseline() -> None:
    # Hand computation: shortest path along the corridor is one move per
    # timestep, no waits. Cost = number of moves = 4.
    #   (0,0)t0 -> (1,0)t1 -> (2,0)t2 -> (3,0)t3 -> (4,0)t4  cost 4
    grid = _row_grid(5)
    result = _plan(grid, (0, 0), (4, 0), Constraints.empty(), 100)
    assert result.success
    assert result.path == ((0, 0), (1, 0), (2, 0), (3, 0), (4, 0))
    assert result.cost == 4
    assert not result.horizon_exceeded


def test_case2_vertex_constraint_forces_wait() -> None:
    # Hand computation: the only shortest path passes through (2,0) at t=2.
    # A vertex constraint on (2,0) at t=2 blocks it, so the agent waits one
    # step at (1,0):
    #   (0,0)t0 -> (1,0)t1 -> (1,0)t2(wait) -> (2,0)t3 -> (3,0)t4 -> (4,0)t5
    # Cost = 5 = C + 1. No cost-4 path exists (it would occupy (2,0) at t=2).
    grid = _row_grid(5)
    constraints = Constraints.empty().add_vertex(AGENT, (2, 0), 2)
    result = _plan(grid, (0, 0), (4, 0), constraints, 100)
    assert result.success
    assert result.cost == 5
    assert result.path[2] == (1, 0)  # the wait
    assert not result.horizon_exceeded


def test_case3_edge_constraint_blocks_direct_move() -> None:
    # Hand computation: the direct path occupies (1,0) at t=1 and (2,0) at
    # t=2, which the edge constraint <(1,0),(2,0),2> forbids. The cheapest
    # resolution is a one-step wait at the start:
    #   (0,0)t0 -> (0,0)t1(wait) -> (1,0)t2 -> (2,0)t3 -> (3,0)t4 -> (4,0)t5
    # Cost = 5 = C + 1. No cost-4 path exists (it violates the edge
    # constraint: at (1,0)t1 and (2,0)t2).
    grid = _row_grid(5)
    constraints = Constraints.empty().add_edge(AGENT, (1, 0), (2, 0), 2)
    result = _plan(grid, (0, 0), (4, 0), constraints, 100)
    assert result.success
    assert result.cost == 5
    assert not result.horizon_exceeded


def test_case4_goal_hold_arrive_later() -> None:
    # Hand computation: a vertex constraint on the goal (4,0) at t=4 means
    # the goal is blocked from t=4 onward (goal-hold). The direct arrival at
    # t=4 is invalid, so the agent waits one step at (3,0):
    #   (0,0)t0 -> (1,0)t1 -> (2,0)t2 -> (3,0)t3 -> (3,0)t4(wait) -> (4,0)t5
    # Cost = 5 = C + 1. Arrival at t=5 is after the block, so it is accepted.
    grid = _row_grid(5)
    constraints = Constraints.empty().add_vertex(AGENT, (4, 0), 4)
    result = _plan(grid, (0, 0), (4, 0), constraints, 100)
    assert result.success
    assert result.cost == 5
    assert result.path[-2] == (3, 0)  # the wait before the goal
    assert result.path[-1] == (4, 0)
    assert not result.horizon_exceeded


def test_case5_horizon_guard_binds() -> None:
    # Hand computation: true distance (0,0)->(4,0) is 4, but the horizon
    # guard is set to 2 timesteps, so the goal can never be reached. The
    # low level must fail with horizon_exceeded=True rather than silently
    # returning a wrong answer.
    grid = _row_grid(5)
    result = _plan(grid, (0, 0), (4, 0), Constraints.empty(), 2)
    assert not result.success
    assert result.path is None
    assert result.cost == INF
    assert result.horizon_exceeded
    assert result.expansions > 0  # the search did work before pruning
