"""True-distance tables via reverse BFS (Section 8.1).

Pure: no I/O, no printing, no wall-clock reads. Builds one exact
true-distance table per distinct goal over the 4-connected passable
grid; tables are cached per instance so agents sharing a goal share a
table. Exact on unit-cost 4-connected grids and dominates Manhattan,
so it is an admissible heuristic for space-time A* (Section 9.2 #6).

(0,0) is top-left; x = column, y = row.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

from swarmway.domain.grid import Grid, Position
from swarmway.domain.instance import Agent

# Sentinel for "unreachable / infinity"; larger than any reachable
# distance on the grid.
INF = 10**9


@dataclass(frozen=True)
class TrueDistanceTable:
    goal: Position
    # distance from each reachable cell to goal; unreachable cells are
    # absent (treated as infinity by callers).
    dist: dict[Position, int] = field(default_factory=dict)


class DistanceCache:
    """Caches true-distance tables keyed by (grid, goal)."""

    def __init__(self) -> None:
        self._cache: dict[tuple[Grid, Position], TrueDistanceTable] = {}

    def get(self, grid: Grid, goal: Position) -> TrueDistanceTable:
        key = (grid, goal)
        table = self._cache.get(key)
        if table is None:
            table = reverse_bfs_distances(grid, goal)
            self._cache[key] = table
        return table

    def clear(self) -> None:
        self._cache.clear()


def reverse_bfs_distances(grid: Grid, goal: Position) -> TrueDistanceTable:
    """Reverse BFS from ``goal`` over the passable 4-connected grid.

    Returns a :class:`TrueDistanceTable` mapping every reachable cell to
    its true distance (in timesteps) to ``goal``. Cells that cannot
    reach ``goal`` are absent (distance infinity).
    """
    if not grid.passable(goal):
        return TrueDistanceTable(goal=goal, dist={})

    dist: dict[Position, int] = {goal: 0}
    queue: deque[Position] = deque([goal])
    while queue:
        x, y = queue.popleft()
        d = dist[(x, y)]
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            nxt = (nx, ny)
            if nxt in dist:
                continue
            if not grid.passable(nxt):
                continue
            dist[nxt] = d + 1
            queue.append(nxt)
    return TrueDistanceTable(goal=goal, dist=dist)


def true_distance(grid: Grid, cache: DistanceCache, cell: Position, goal: Position) -> int:
    """True distance from ``cell`` to ``goal``, or INF if unreachable."""
    table = cache.get(grid, goal)
    return table.dist.get(cell, INF)


def horizon_guard(grid: Grid, cache: DistanceCache, agents: tuple[Agent, ...]) -> int:
    """MAX_TIMESTEPS = sum of true distances + 8 * n_agents (Section 8.1)."""
    total = 0
    for agent in agents:
        total += true_distance(grid, cache, agent.start, agent.goal)
    return total + 8 * len(agents)
