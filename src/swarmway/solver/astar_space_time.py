"""Space-time A* low-level planner (Section 8.1).

Pure: no I/O, no printing, no wall-clock reads, no RNG. Plans a single
agent's shortest path from start to goal under vertex/edge constraints,
with (position, timestep) states, g = timestep, h = true distance from
astar_static, and (f, h, insertion-counter) tie-breaking.

The goal test enforces stay-at-goal correctness: arriving at goal at
time t is accepted only when no vertex constraint blocks the goal at
any t' >= t (Sharon et al. 2015, target-conflict / goal-hold handling).

If the horizon guard (MAX_TIMESTEPS = sum of true distances + 8*n_agents,
supplied by the caller) binds, the low level fails for that node --
treated as pruning with a stat counter, never a silent wrong answer.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass

from swarmway.domain.constraints import Constraints
from swarmway.domain.grid import Grid, Position
from swarmway.solver.astar_static import INF, DistanceCache, true_distance

# Fixed neighbour order for deterministic expansion (wait first, then
# the four cardinal moves). Never depends on hash order.
_ACTIONS: tuple[tuple[int, int], ...] = (
    (0, 0),  # wait
    (-1, 0),  # left
    (1, 0),  # right
    (0, -1),  # up
    (0, 1),  # down
)


@dataclass(frozen=True)
class LowLevelResult:
    path: tuple[Position, ...] | None
    cost: int
    expansions: int
    horizon_exceeded: bool

    @property
    def success(self) -> bool:
        return self.path is not None


def plan(
    grid: Grid,
    cache: DistanceCache,
    start: Position,
    goal: Position,
    constraints: Constraints,
    agent: int,
    max_timesteps: int,
) -> LowLevelResult:
    """Shortest constrained path from start to goal, or a structured failure.

    ``max_timesteps`` is the horizon guard (Section 8.1); successors at
    timestep > max_timesteps are pruned. If every route is pruned by the
    horizon, the result reports ``horizon_exceeded=True`` with no path.
    """
    start_h = true_distance(grid, cache, start, goal)
    counter = 0
    # open heap entries: (f, h, counter, position, timestep, g)
    open_list: list[tuple[int, int, int, Position, int, int]] = []
    heapq.heappush(open_list, (start_h, start_h, counter, start, 0, 0))
    counter += 1

    best_g: dict[tuple[Position, int], int] = {(start, 0): 0}
    parent: dict[tuple[Position, int], tuple[Position, int]] = {}

    expansions = 0
    horizon_exceeded = False

    while open_list:
        _f, _h, _c, pos, t, g = heapq.heappop(open_list)
        # Skip stale entries.
        if best_g.get((pos, t), INF) < g:
            continue
        # A vertex constraint on this state makes it invalid; never expand.
        if any(vc.pos == pos and vc.t == t for vc in constraints.vertex_for(agent)):
            continue
        expansions += 1

        # Goal test: at goal and the goal is not blocked at or after t.
        # With stay-at-goal semantics, being at the goal at a blocked time
        # (goal-hold) is forbidden, so we neither return nor expand from it.
        if pos == goal:
            if constraints.is_goal_blocked_at_or_after(agent, goal, t):
                continue
            path = _reconstruct(parent, start, goal, t)
            return LowLevelResult(
                path=path,
                cost=g,
                expansions=expansions,
                horizon_exceeded=horizon_exceeded,
            )

        next_t = t + 1
        if next_t > max_timesteps:
            horizon_exceeded = True
            continue

        for dx, dy in _ACTIONS:
            next_pos = (pos[0] + dx, pos[1] + dy)
            if not grid.passable(next_pos):
                continue
            # Vertex constraint <next_pos, next_t> forbids being there.
            if any(vc.pos == next_pos and vc.t == next_t for vc in constraints.vertex_for(agent)):
                continue
            # Edge constraint <pos, next_pos, next_t> forbids pos->next_pos
            # between t and next_t (being at pos at t and next_pos at next_t).
            if any(
                ec.u == pos and ec.v == next_pos and ec.t == next_t
                for ec in constraints.edge_for(agent)
            ):
                continue
            next_g = next_t
            key = (next_pos, next_t)
            if best_g.get(key, INF) <= next_g:
                continue
            best_g[key] = next_g
            parent[key] = (pos, t)
            next_h = true_distance(grid, cache, next_pos, goal)
            heapq.heappush(
                open_list,
                (next_g + next_h, next_h, counter, next_pos, next_t, next_g),
            )
            counter += 1

    return LowLevelResult(
        path=None,
        cost=INF,
        expansions=expansions,
        horizon_exceeded=horizon_exceeded,
    )


def _reconstruct(
    parent: dict[tuple[Position, int], tuple[Position, int]],
    start: Position,
    goal: Position,
    arrival_t: int,
) -> tuple[Position, ...]:
    path: list[Position] = []
    node: tuple[Position, int] = (goal, arrival_t)
    while node != (start, 0):
        path.append(node[0])
        node = parent[node]
    path.append(start)
    path.reverse()
    return tuple(path)


def low_level_cost(
    grid: Grid,
    cache: DistanceCache,
    start: Position,
    goal: Position,
    constraints: Constraints,
    agent: int,
    max_timesteps: int,
) -> int:
    """Cost of the shortest constrained path, or INF if none within horizon."""
    result = plan(grid, cache, start, goal, constraints, agent, max_timesteps)
    return result.cost if result.success else INF
