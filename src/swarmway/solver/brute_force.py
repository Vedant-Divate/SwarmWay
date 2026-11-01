"""Brute-force optimal reference (Section 8.8), tests only.

Enumerates, for <= 3 agents and <= 6x6 grids, all valid paths per agent up
to a generous horizon, takes the cross-product with pruning, and returns the
minimum-SoC conflict-free combination. Exponential — test fixture sizes
only. Never called from cbs.py or the CLI.

Horizon: sum of the agents' true distances plus a slack of 8 timesteps.
Since SoC >= sum of true distances (each agent's path is at least its own
shortest distance) and the optimal solution on tiny instances incurs only a
small conflict overhead, slack=8 is generous enough to capture the optimum
on test fixtures while keeping the enumeration bounded.
"""

from __future__ import annotations

from swarmway.domain.grid import Grid, Position
from swarmway.domain.instance import Instance
from swarmway.solver.astar_static import INF, DistanceCache, true_distance

_AGENT_LIMIT = 3
_GRID_LIMIT = 6
_HORIZON_SLACK = 8


def _is_conflict_free(paths: list[tuple[Position, ...]]) -> bool:
    """Check vertex + edge conflicts with stay-at-goal padding."""
    makespan = max(len(p) - 1 for p in paths)
    padded: list[list[Position]] = []
    for path in paths:
        last = len(path) - 1
        padded.append([path[min(t, last)] for t in range(makespan + 1)])
    n = len(paths)
    for t in range(makespan + 1):
        for i in range(n):
            for j in range(i + 1, n):
                if padded[i][t] == padded[j][t]:
                    return False
    for t in range(makespan):
        for i in range(n):
            for j in range(i + 1, n):
                if padded[i][t] == padded[j][t + 1] and padded[i][t + 1] == padded[j][t]:
                    return False
    return True


def _agent_paths(
    grid: Grid,
    cache: DistanceCache,
    start: Position,
    goal: Position,
    max_cost: int,
    cap: int = 4000,
) -> list[tuple[Position, ...]]:
    """All valid paths from start to goal with cost <= max_cost.

    DFS over the time-expanded graph (wait or move each step), bounded by
    max_cost and a path cap so enumeration stays tractable on tiny fixtures.
    """
    if not grid.passable(start) or not grid.passable(goal):
        return []
    results: list[tuple[Position, ...]] = []

    def dfs(path: tuple[Position, ...], t: int) -> None:
        if len(results) >= cap:
            return
        pos = path[-1]
        if pos == goal:
            results.append(path)
            # Do not extend past the goal (stay-at-goal handled by padding).
            return
        if t >= max_cost:
            return
        x, y = pos
        # Moves first (4-connected), so short paths are enumerated before
        # longer wait-heavy ones.
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            nxt = (nx, ny)
            if not grid.passable(nxt):
                continue
            if nxt != pos and nxt in path:  # no cycles; wait-in-place allowed
                continue
            dfs((*path, nxt), t + 1)
        # Wait in place, explored last so it does not crowd out short paths.
        dfs((*path, pos), t + 1)

    dfs((start,), 0)
    return results


def brute_force_soc(instance: Instance) -> int | None:
    """Minimum-SoC conflict-free combination, or None if no solution within
    the horizon. Exponential — only for <= 3 agents on <= 6x6 grids."""
    grid = instance.grid
    agents = instance.agents
    if len(agents) > _AGENT_LIMIT:
        raise ValueError(f'brute force supports <= {_AGENT_LIMIT} agents')
    if grid.width > _GRID_LIMIT or grid.height > _GRID_LIMIT:
        raise ValueError(f'brute force supports <= {_GRID_LIMIT}x{_GRID_LIMIT} grids')

    cache = DistanceCache()
    total_true = 0
    for agent in agents:
        d = true_distance(grid, cache, agent.start, agent.goal)
        if d == INF:
            return None  # some agent's goal is unreachable
        total_true += d
    horizon = total_true + _HORIZON_SLACK

    per_agent: list[list[tuple[Position, ...]]] = []
    for agent in agents:
        paths = _agent_paths(grid, cache, agent.start, agent.goal, horizon)
        if not paths:
            return None  # this agent cannot reach its goal at all
        per_agent.append(paths)

    best: int | None = None
    n = len(agents)

    def cross(idx: int, chosen: list[tuple[Position, ...]], cost_so_far: int) -> None:
        nonlocal best
        if best is not None and cost_so_far >= best:
            return  # prune: cannot beat best
        if idx == n:
            if _is_conflict_free(chosen):
                total = sum(len(p) - 1 for p in chosen)
                if best is None or total < best:
                    best = total
            return
        for path in per_agent[idx]:
            cross(idx + 1, [*chosen, path], cost_so_far + (len(path) - 1))

    cross(0, [], 0)
    return best
