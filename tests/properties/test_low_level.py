"""Property-based tests for the low-level planner (Sections 9.2, 9.3).

Uses the hypothesis fast profile (max_examples=25 per Section 15.1).
"""

from __future__ import annotations

from collections import deque

from hypothesis import assume, given
from hypothesis import strategies as st

from swarmway.domain.constraints import Constraints
from swarmway.domain.grid import Grid
from swarmway.solver.astar_space_time import plan
from swarmway.solver.astar_static import INF, DistanceCache, reverse_bfs_distances

AGENT = 0
_ACTIONS = ((0, 0), (-1, 0), (1, 0), (0, -1), (0, 1))
MAX_T = 24  # horizon bound used by both the planner and the reference BFS


def _random_grid(width: int, height: int, rows: str) -> Grid:
    return Grid(
        width=width,
        height=height,
        rows=tuple(rows[i * width : (i + 1) * width] for i in range(height)),
    )


def _bfs_optimal(
    grid: Grid,
    start,
    goal,
    constraints: Constraints,
    agent: int,
) -> int:
    """Independent exhaustive BFS over the time-expanded graph.

    Obviously correct: uniform-cost search over (position, timestep)
    states with no pruning except the horizon bound. Returns the minimum
    timestep at which the goal is reached satisfying the goal test, or
    INF if unreachable within MAX_T.
    """
    queue: deque[tuple[tuple[int, int], int]] = deque([(start, 0)])
    visited = {(start, 0)}
    # The start state itself must satisfy the vertex constraint at t=0,
    # matching the planner (you cannot start on a constrained cell).
    if any(vc.pos == start and vc.t == 0 for vc in constraints.vertex_for(agent)):
        return INF
    while queue:
        pos, t = queue.popleft()
        if pos == goal and not constraints.is_goal_blocked_at_or_after(agent, goal, t):
            return t
        if t >= MAX_T:
            continue
        nt = t + 1
        for dx, dy in _ACTIONS:
            npos = (pos[0] + dx, pos[1] + dy)
            if not grid.passable(npos):
                continue
            if any(vc.pos == npos and vc.t == nt for vc in constraints.vertex_for(agent)):
                continue
            if any(
                ec.u == pos and ec.v == npos and ec.t == nt for ec in constraints.edge_for(agent)
            ):
                continue
            key = (npos, nt)
            if key in visited:
                continue
            visited.add(key)
            queue.append(key)
    return INF


PositionType = tuple[int, int]


def _random_constraints(width: int, height: int) -> Constraints:
    c = Constraints.empty()
    # A few deterministic random constraints drawn from the grid cells.
    for t in range(0, min(width, height), 2):
        c = c.add_vertex(AGENT, (t % width, t % height), t)
        if t + 1 < width:
            c = c.add_edge(AGENT, (t % width, t % height), ((t + 1) % width, t % height), t + 1)
    return c


@given(
    width=st.integers(min_value=3, max_value=6),
    height=st.integers(min_value=3, max_value=6),
    seed=st.integers(min_value=0, max_value=1000),
)
def test_low_level_optimality_matches_exhaustive_bfs(width: int, height: int, seed: int) -> None:
    import random

    rng = random.Random(seed)
    chars = [rng.choice(['.', '@']) for _ in range(width * height)]
    rows = ''.join(chars)
    grid = _random_grid(width, height, rows)
    start = (rng.randrange(width), rng.randrange(height))
    goal = (rng.randrange(width), rng.randrange(height))
    assume(grid.passable(start) and grid.passable(goal))
    constraints = _random_constraints(width, height)
    cache = DistanceCache()

    result = plan(grid, cache, start, goal, constraints, AGENT, MAX_T)
    reference = _bfs_optimal(grid, start, goal, constraints, AGENT)

    assert (result.cost == INF) == (reference == INF)
    if result.success:
        assert result.cost == reference


@given(
    width=st.integers(min_value=3, max_value=8),
    height=st.integers(min_value=3, max_value=8),
    seed=st.integers(min_value=0, max_value=1000),
)
def test_distance_table_admissible(width: int, height: int, seed: int) -> None:
    import random

    rng = random.Random(seed)
    chars = [rng.choice(['.', '@']) for _ in range(width * height)]
    rows = ''.join(chars)
    grid = _random_grid(width, height, rows)
    goal = (rng.randrange(width), rng.randrange(height))
    assume(grid.passable(goal))
    table = reverse_bfs_distances(grid, goal)

    # BFS for the true optimal distance from every cell to the goal.
    dist: dict[tuple[int, int], int] = {goal: 0}
    queue: deque[tuple[int, int]] = deque([goal])
    while queue:
        x, y = queue.popleft()
        d = dist[(x, y)]
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            nxt = (nx, ny)
            if nxt in dist or not grid.passable(nxt):
                continue
            dist[nxt] = d + 1
            queue.append(nxt)

    for cell, expected in dist.items():
        assert table.dist.get(cell, INF) <= expected, (
            f'table not admissible at {cell}: {table.dist.get(cell)} > {expected}'
        )
    # Unreachable cells are absent from both tables.
    for cell in table.dist:
        assert cell in dist


@given(
    width=st.integers(min_value=3, max_value=6),
    height=st.integers(min_value=3, max_value=6),
    seed=st.integers(min_value=0, max_value=1000),
)
def test_determinism_identical_inputs_twice(width: int, height: int, seed: int) -> None:
    import random

    rng = random.Random(seed)
    chars = [rng.choice(['.', '@']) for _ in range(width * height)]
    rows = ''.join(chars)
    grid = _random_grid(width, height, rows)
    start = (rng.randrange(width), rng.randrange(height))
    goal = (rng.randrange(width), rng.randrange(height))
    assume(grid.passable(start) and grid.passable(goal))
    constraints = _random_constraints(width, height)
    cache = DistanceCache()

    r1 = plan(grid, cache, start, goal, constraints, AGENT, MAX_T)
    r2 = plan(grid, cache, start, goal, constraints, AGENT, MAX_T)

    assert r1.path == r2.path
    assert r1.cost == r2.cost
    assert r1.expansions == r2.expansions
    assert r1.horizon_exceeded == r2.horizon_exceeded
