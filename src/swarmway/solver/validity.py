"""Independent solution validity checker (Section 9.1).

Deliberately re-implements the Section 7.1 collision/continuity semantics
from scratch, importing only the domain types — it never imports
cbs.py or astar_*. check() returns ``VALID`` or the first violated rule
with agent indices and timestep (the debuggability feature).
"""

from __future__ import annotations

from swarmway.domain.grid import Position
from swarmway.domain.instance import Instance
from swarmway.domain.solution import Solution


class ValidityError(ValueError):
    """A solution violated a specific validity rule."""


def check(solution: Solution, instance: Instance) -> str:
    """Return ``"VALID"`` or the first violated rule with agent/timestep.

    Rules checked in order: V-BOUNDS, V-PASSABLE, V-CONTINUITY, V-START,
    V-GOAL, V-VERTEX, V-EDGE, V-PAD, V-SOC.
    """
    paths = solution.paths
    agents = instance.agents
    grid = instance.grid
    makespan = solution.makespan
    n = len(agents)

    # V-PAD: every path padded to makespan + 1.
    for i in range(n):
        if len(paths[i]) != makespan + 1:
            raise ValidityError(
                f'V-PAD: agent {i} path length {len(paths[i])} != makespan + 1 = {makespan + 1}'
            )

    # Precompute padded positions for all agents up to makespan.
    padded: list[list[Position]] = []
    for i in range(n):
        path = paths[i]
        last = len(path) - 1
        padded.append([path[min(t, last)] for t in range(makespan + 1)])

    for i, agent in enumerate(agents):
        path = paths[i]
        # V-BOUNDS: every position inside the grid.
        for t in range(makespan + 1):
            x, y = padded[i][t]
            if not (0 <= x < grid.width and 0 <= y < grid.height):
                raise ValidityError(f'V-BOUNDS: agent {i} at {padded[i][t]} out of bounds at t={t}')
        # V-PASSABLE: every position passable.
        for t in range(makespan + 1):
            if not grid.passable(padded[i][t]):
                raise ValidityError(f'V-PASSABLE: agent {i} at {padded[i][t]} blocked at t={t}')
        # V-CONTINUITY: consecutive positions equal (wait) or 4-adjacent.
        for t in range(len(path) - 1):
            a, b = path[t], path[t + 1]
            dx = abs(a[0] - b[0])
            dy = abs(a[1] - b[1])
            if not ((dx == 0 and dy == 0) or (dx + dy == 1)):
                raise ValidityError(
                    f'V-CONTINUITY: agent {i} {a} -> {b} at t={t} not wait/4-adjacent'
                )
        # V-START: paths[i][0] == start_i.
        if path[0] != agent.start:
            raise ValidityError(f'V-START: agent {i} path starts {path[0]} != start {agent.start}')
        # V-GOAL: last distinct position (arrival) == goal_i; padded tail
        # is all goal_i (enforced by V-PAD padding in this checker).
        if path[-1] != agent.goal:
            raise ValidityError(f'V-GOAL: agent {i} arrives {path[-1]} != goal {agent.goal}')

        # padded tail after arrival all goal (padding repeats the last cell).

    # V-VERTEX: no two agents occupy the same cell at the same timestep.
    for t in range(makespan + 1):
        for i in range(n):
            for j in range(i + 1, n):
                if padded[i][t] == padded[j][t]:
                    raise ValidityError(f'V-VERTEX: agents {i} and {j} at {padded[i][t]} at t={t}')

    # V-EDGE: no swap conflict across any boundary.
    for t in range(makespan):
        for i in range(n):
            for j in range(i + 1, n):
                if padded[i][t] == padded[j][t + 1] and padded[i][t + 1] == padded[j][t]:
                    raise ValidityError(
                        f'V-EDGE: agents {i} and {j} swap {padded[i][t]}<->{padded[j][t]} at t={t}'
                    )

    # V-SOC: reported SoC/makespan recomputed from paths match the header.
    # Each agent's cost is its arrival time (first time at its goal); paths
    # are padded to makespan + 1 with stay-at-goal repetition, so len - 1 is
    # not the agent's cost.
    arrivals = []
    for i, agent in enumerate(agents):
        arrivals.append(paths[i].index(agent.goal))
    recomputed_soc = sum(arrivals)
    recomputed_makespan = max(arrivals)
    if solution.soc != recomputed_soc:
        raise ValidityError(f'V-SOC: reported soc {solution.soc} != recomputed {recomputed_soc}')
    if solution.makespan != recomputed_makespan:
        raise ValidityError(
            f'V-SOC: reported makespan {solution.makespan} != recomputed {recomputed_makespan}'
        )

    return 'valid'
