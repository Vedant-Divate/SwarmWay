"""Conflict-Based Search (CBS) high-level planner (Section 8.2).

Pure apart from the deadline machinery: reads a monotonic clock
(Section 8.3) to enforce the solve budget — the only wall-clock read
in the solver. No RNG, no I/O, no printing.

CBS is a best-first search over a constraint tree. Each CT node holds
per-agent constrained-optimal low-level paths; the high level branches
on the first detected conflict. Low-level optimality + best-first
ordering over a tree that contains an optimal solution make the first
conflict-free pop minimal sum-of-costs (see docs/correctness-argument.md).
"""

from __future__ import annotations

import heapq
import time
from dataclasses import dataclass

from swarmway.domain.conflicts import EdgeConflict, VertexConflict
from swarmway.domain.constraints import Constraints
from swarmway.domain.grid import Position
from swarmway.domain.instance import Instance
from swarmway.domain.solution import Solution, SolveOutcome, SolveStats
from swarmway.solver.astar_space_time import plan
from swarmway.solver.astar_static import DistanceCache, horizon_guard

# Deadline is checked at least every this many high-level node expansions
# (Section 8.3: at least every 512 expansions in the CBS loop).
_DEADLINE_CHECK_INTERVAL = 512


@dataclass(frozen=True)
class CTNode:
    """A constraint-tree node.

    ``paths[i]`` is agent i's constrained-optimal path under
    ``constraints``; ``soc`` is the sum of path costs. Nodes are ordered
    by (soc, insertion_id) so the open list is a min-heap on SoC with
    FIFO tie-breaking (this phase; tie-break options arrive in Phase 6).
    """

    constraints: Constraints
    paths: tuple[tuple[Position, ...], ...]
    soc: int
    insertion_id: int


def _path_cost(path: tuple[Position, ...]) -> int:
    return len(path) - 1


def _padded_position(path: tuple[Position, ...], t: int) -> Position:
    """Agent position at timestep t with stay-at-goal padding."""
    return path[min(t, len(path) - 1)]


def find_first_conflict(
    instance: Instance, paths: tuple[tuple[Position, ...], ...]
) -> VertexConflict | EdgeConflict | None:
    """First conflict scanning timesteps increasingly, agent pairs
    lexicographically within a timestep; vertex before edge at each
    boundary. Fully deterministic (no unsorted dict/set iteration)."""
    makespan = max(len(p) - 1 for p in paths)
    for t in range(makespan + 1):
        # Vertex conflicts at timestep t, agent pairs lexicographic.
        for i in range(len(paths)):
            for j in range(i + 1, len(paths)):
                if _padded_position(paths[i], t) == _padded_position(paths[j], t):
                    return VertexConflict((i, j), _padded_position(paths[i], t), t)
        # Edge conflicts across boundary t -> t+1.
        if t < makespan:
            for i in range(len(paths)):
                for j in range(i + 1, len(paths)):
                    if _padded_position(paths[i], t) == _padded_position(
                        paths[j], t + 1
                    ) and _padded_position(paths[i], t + 1) == _padded_position(paths[j], t):
                        return EdgeConflict(
                            (i, j),
                            _padded_position(paths[i], t),
                            _padded_position(paths[j], t),
                            t + 1,
                        )
    return None


def _target_owner(instance: Instance, pos: Position, a_i: int, a_j: int) -> int | None:
    """Which of the two conflicting agents owns the goal at ``pos``, or None."""
    if instance.agents[a_i].goal == pos:
        return a_i
    if instance.agents[a_j].goal == pos:
        return a_j
    return None


def solve(instance: Instance, budget_ms: int = 10000) -> SolveOutcome:
    """Solve an instance with CBS.

    Returns a :class:`SolveOutcome` with status ``solved``, ``unsat``
    (open list exhausted), or ``timeout`` (budget expired). An invalid
    solution is never returned — CBS validates its own outcome.
    """
    grid = instance.grid
    agents = instance.agents
    cache = DistanceCache()
    max_timesteps = horizon_guard(grid, cache, agents)

    stats = SolveStats()

    # Root node: per-agent unconstrained shortest paths.
    root_paths: list[tuple[Position, ...]] = []
    for agent in agents:
        result = plan(
            grid,
            cache,
            agent.start,
            agent.goal,
            Constraints.empty(),
            agent.id,
            max_timesteps,
        )
        stats.low_level_expansions += result.expansions
        if not result.success:
            return SolveOutcome(status='unsat', solution=None, stats=stats)
        assert result.path is not None
        root_paths.append(result.path)
    root_paths_t = tuple(root_paths)
    root_soc = sum(_path_cost(p) for p in root_paths_t)

    deadline = time.monotonic() + budget_ms / 1000.0

    insertion_id = 0
    root = CTNode(Constraints.empty(), root_paths_t, root_soc, insertion_id)
    insertion_id += 1
    open_list: list[tuple[int, int, CTNode]] = [(root_soc, root.insertion_id, root)]
    stats.ct_generated = 1

    ct_expanded = 0
    while open_list:
        node = heapq.heappop(open_list)[2]
        ct_expanded += 1
        stats.ct_expanded = ct_expanded

        # Deadline check (Section 8.3): monotonic clock, only wall-clock
        # read in the solver. Checked at least every 512 expansions.
        # Short-circuit keeps the clock read off the hot path.
        if ct_expanded % _DEADLINE_CHECK_INTERVAL == 0 and time.monotonic() > deadline:
            return SolveOutcome(
                status='timeout',
                solution=None,
                stats=SolveStats(ct_expanded, stats.ct_generated, stats.low_level_expansions),
            )

        conflict = find_first_conflict(instance, node.paths)
        if conflict is None:
            # Conflict-free and each low level is constrained-optimal ->
            # minimal sum-of-costs (Section 8.2).
            makespan = max(len(p) - 1 for p in node.paths)
            solution = Solution(paths=node.paths, soc=node.soc, makespan=makespan)
            return SolveOutcome(status='solved', solution=solution, stats=stats)

        a_i, a_j = conflict.agents

        if isinstance(conflict, VertexConflict):
            pos, t = conflict.pos, conflict.t
            owner = _target_owner(instance, pos, a_i, a_j)
            for agent_id in (a_i, a_j):
                hold = owner is not None and agent_id == owner
                child_constraints = node.constraints.add_vertex(agent_id, pos, t, hold=hold)
                agent = agents[agent_id]
                result = plan(
                    grid,
                    cache,
                    agent.start,
                    agent.goal,
                    child_constraints,
                    agent.id,
                    max_timesteps,
                )
                stats.low_level_expansions += result.expansions
                if not result.success:
                    continue
                assert result.path is not None
                new_paths = list(node.paths)
                new_paths[agent_id] = result.path
                new_paths_t = tuple(new_paths)
                child_soc = sum(_path_cost(p) for p in new_paths_t)
                child = CTNode(child_constraints, new_paths_t, child_soc, insertion_id)
                insertion_id += 1
                heapq.heappush(open_list, (child_soc, child.insertion_id, child))
                stats.ct_generated += 1
        else:
            # Edge conflict: constrain each agent from traversing u->v
            # between t-1 and t.
            u, v, t = conflict.u, conflict.v, conflict.t
            for agent_id in (a_i, a_j):
                child_constraints = node.constraints.add_edge(agent_id, u, v, t)
                agent = agents[agent_id]
                result = plan(
                    grid,
                    cache,
                    agent.start,
                    agent.goal,
                    child_constraints,
                    agent.id,
                    max_timesteps,
                )
                stats.low_level_expansions += result.expansions
                if not result.success:
                    continue
                assert result.path is not None
                new_paths = list(node.paths)
                new_paths[agent_id] = result.path
                new_paths_t = tuple(new_paths)
                child_soc = sum(_path_cost(p) for p in new_paths_t)
                child = CTNode(child_constraints, new_paths_t, child_soc, insertion_id)
                insertion_id += 1
                heapq.heappush(open_list, (child_soc, child.insertion_id, child))
                stats.ct_generated += 1

    # Open list exhausted -> UNSAT, with node counts as exhaustion evidence.
    return SolveOutcome(status='unsat', solution=None, stats=stats)
