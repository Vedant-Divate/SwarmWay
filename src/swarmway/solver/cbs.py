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
from typing import Any

from swarmway.domain.conflicts import EdgeConflict, VertexConflict
from swarmway.domain.constraints import Constraints
from swarmway.domain.grid import Position
from swarmway.domain.instance import Instance
from swarmway.domain.solution import Solution, SolveOutcome, SolveStats
from swarmway.solver.astar_space_time import plan
from swarmway.solver.astar_static import INF, DistanceCache, horizon_guard, true_distance
from swarmway.solver.trace import TraceRecorder

# Deadline is checked at least every this many high-level node expansions
# (Section 8.3: at least every 512 expansions in the CBS loop).
_DEADLINE_CHECK_INTERVAL = 512


@dataclass(frozen=True)
class CTNode:
    """A constraint-tree node.

    ``paths[i]`` is agent i's constrained-optimal path under
    ``constraints``; ``soc`` is the sum of path costs. Nodes are ordered
    by (soc, <tie-break key>, insertion_id) so the open list is a
    min-heap on SoC with a deterministic secondary key (FIFO by default;
    tie-break options arrive in Phase 6). The secondary key only
    reorders equal-cost nodes — optimality is untouched.
    """

    constraints: Constraints
    paths: tuple[tuple[Position, ...], ...]
    soc: int
    insertion_id: int
    depth: int = 0
    conflict_count: int = 0


def _path_cost(path: tuple[Position, ...]) -> int:
    return len(path) - 1


def _conflict_count(instance: Instance, paths: tuple[tuple[Position, ...], ...]) -> int:
    """Total vertex + edge conflicts in ``paths`` (tie-break heuristic)."""
    makespan = max(len(p) - 1 for p in paths)
    count = 0
    for t in range(makespan + 1):
        for i in range(len(paths)):
            for j in range(i + 1, len(paths)):
                if _padded_position(paths[i], t) == _padded_position(paths[j], t):
                    count += 1
    for t in range(makespan):
        for i in range(len(paths)):
            for j in range(i + 1, len(paths)):
                if _padded_position(paths[i], t) == _padded_position(
                    paths[j], t + 1
                ) and _padded_position(paths[i], t + 1) == _padded_position(paths[j], t):
                    count += 1
    return count


def _open_key(node: CTNode, tie_break: str) -> tuple[int, ...]:
    """Heap key for a CT node under the given tie-break.

    Only equal-SoC nodes are reordered; insertion_id keeps every key
    unique so nodes are never compared against each other.
    """
    if tie_break == 'fifo':
        return (node.soc, node.insertion_id)
    if tie_break == 'conflicts':
        # Prefer nodes whose paths contain more conflicts.
        return (node.soc, -node.conflict_count, node.insertion_id)
    # tie_break == 'depth': prefer deeper nodes.
    return (node.soc, -node.depth, node.insertion_id)


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


def solve(
    instance: Instance,
    budget_ms: int = 10000,
    recorder: TraceRecorder | None = None,
    tie_break: str = 'fifo',
) -> SolveOutcome:
    """Solve an instance with CBS.

    ``tie_break`` selects the deterministic secondary key used to order
    equal-SoC nodes in the open list (Section 8.5): ``fifo`` (insertion
    order), ``conflicts`` (more conflicts first), or ``depth`` (deeper
    nodes first). It only reorders equal-cost nodes, so optimality is
    untouched.
    """
    if tie_break not in ('fifo', 'conflicts', 'depth'):
        raise ValueError(f'unknown tie_break {tie_break!r}')
    grid = instance.grid
    agents = instance.agents
    cache = DistanceCache()
    stats = SolveStats()

    # If any agent's goal is unreachable even unconstrained, the instance
    # is unsat immediately (the root low level cannot plan a path).
    for agent in agents:
        if true_distance(grid, cache, agent.start, agent.goal) == INF:
            return SolveOutcome(status='unsat', solution=None, stats=stats)

    max_timesteps = horizon_guard(grid, cache, agents)

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
    root = CTNode(
        Constraints.empty(),
        root_paths_t,
        root_soc,
        insertion_id,
        depth=0,
        conflict_count=_conflict_count(instance, root_paths_t),
    )
    insertion_id += 1
    open_list: list[Any] = [(*_open_key(root, tie_break), root)]
    stats.ct_generated = 1
    if recorder is not None:
        recorder.record_root(root.insertion_id, root_soc)

    ct_expanded = 0
    while open_list:
        node = heapq.heappop(open_list)[-1]
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
            # minimal sum-of-costs (Section 8.2). Pad paths to makespan + 1
            # with stay-at-goal repetition (Section 7.3 / Section 7.2).
            makespan = max(len(p) - 1 for p in node.paths)
            padded = []
            for path in node.paths:
                last = path[-1]
                padded.append(path + (last,) * (makespan + 1 - len(path)))
            solution = Solution(paths=tuple(padded), soc=node.soc, makespan=makespan)
            if recorder is not None:
                recorder.record_goal(node.insertion_id, node.soc)
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
                child = CTNode(
                    child_constraints,
                    new_paths_t,
                    child_soc,
                    insertion_id,
                    depth=node.depth + 1,
                    conflict_count=_conflict_count(instance, new_paths_t),
                )
                insertion_id += 1
                if recorder is not None:
                    recorder.record_expand(
                        child.insertion_id,
                        node.insertion_id,
                        child_soc,
                        conflict,
                        agent_id,
                        conflict.pos,
                        None,
                        None,
                        conflict.t,
                        agent_id,
                        child_soc,
                    )
                heapq.heappush(open_list, (*_open_key(child, tie_break), child))
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
                child = CTNode(
                    child_constraints,
                    new_paths_t,
                    child_soc,
                    insertion_id,
                    depth=node.depth + 1,
                    conflict_count=_conflict_count(instance, new_paths_t),
                )
                insertion_id += 1
                if recorder is not None:
                    recorder.record_expand(
                        child.insertion_id,
                        node.insertion_id,
                        child_soc,
                        conflict,
                        agent_id,
                        None,
                        conflict.u,
                        conflict.v,
                        conflict.t,
                        agent_id,
                        child_soc,
                    )
                heapq.heappush(open_list, (*_open_key(child, tie_break), child))
                stats.ct_generated += 1

    # Open list exhausted -> UNSAT, with node counts as exhaustion evidence.
    return SolveOutcome(status='unsat', solution=None, stats=stats)
