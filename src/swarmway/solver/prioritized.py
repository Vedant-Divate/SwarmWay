"""Prioritized planning baseline (Section 8.6).

Pure apart from the deadline machinery: reads a monotonic clock to
enforce the shared budget deadline across orderings. No I/O, no
printing. The ONLY RNG in the codebase lives here: pp-best-of-n uses
random.Random(seed) for seeded shuffles of the agent order.
Deterministic given (instance, options, seed).

Agents are planned sequentially in a given order; each agent is solved
by the existing space-time A* low level, treating earlier agents' paths
as moving obstacles (occupied cell per timestep, including stay-at-goal
tails to the horizon).

Variants per A-9:
- ``pp-fixed``: agent-index order; options empty; solver.seed = null
- ``pp-best-of-n``: n seeded shuffles of the agent order via
  random.Random(seed), keep the min-SoC success; options
  {"orderings": 8} default, validated 1..64; seed defaults to 42,
  recorded in the trace.

Incomplete: an ordering failure tries the next ordering (best-of-n
only); if ALL orderings fail -> status unsat with per-ordering failure
evidence in notes. The budget deadline is SHARED across orderings —
running out mid-way is an honest status timeout, never silently treated
as failure-or-exclusion.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass

from swarmway.domain.constraints import Constraints
from swarmway.domain.grid import Grid, Position
from swarmway.domain.instance import Agent, Instance
from swarmway.domain.solution import Solution, SolveOutcome, SolveStats
from swarmway.solver.astar_space_time import plan
from swarmway.solver.astar_static import DistanceCache

DEFAULT_PP_BEST_OF_N = 8
DEFAULT_PP_SEED = 42
MIN_PP_BEST_OF_N = 1
MAX_PP_BEST_OF_N = 64


@dataclass(frozen=True)
class PPResult:
    """Result of one prioritized-planning ordering attempt."""

    status: str  # "solved" | "unsat" | "timeout"
    paths: list[tuple[Position, ...]] | None
    soc: int | None
    makespan: int | None
    low_level_expansions: int
    notes: tuple[str, ...]


def _build_constraints_from_paths(
    agent_id: int,
    paths: list[tuple[Position, ...]],
    horizon: int,
) -> Constraints:
    """Build Constraints from earlier agents' paths as moving obstacles.

    Vertex constraints on occupied cells at each timestep, plus
    stay-at-goal tails (the agent occupies its goal from arrival onwards
    up to the horizon). Edge constraints prevent swapping with an
    earlier agent's move: for an earlier agent moving u -> v between
    t-1 and t, the current agent may not move v -> u over that same
    boundary.
    """
    constraints = Constraints.empty()
    for path in paths:
        # Vertex constraints: occupied cells at each timestep.
        for t, pos in enumerate(path):
            constraints = constraints.add_vertex(agent_id, pos, t)
        # Stay-at-goal: the agent occupies its goal from arrival onwards.
        goal = path[-1]
        for t in range(len(path), horizon + 1):
            constraints = constraints.add_vertex(agent_id, goal, t)
        # Edge constraints: prevent swapping with an earlier agent's move.
        for t in range(1, len(path)):
            if path[t - 1] != path[t]:
                constraints = constraints.add_edge(agent_id, path[t], path[t - 1], t)
    return constraints


def _plan_ordering(
    grid: Grid,
    cache: DistanceCache,
    agents: tuple[Agent, ...],
    order: tuple[int, ...],
    deadline: float | None = None,
) -> PPResult:
    """Plan agents sequentially in the given order.

    Horizon per sequential plan: H = max(arrival times of earlier
    agents) + (width + height). For the first agent (no earlier agents)
    H = width + height. If any agent cannot reach its goal within H,
    the ordering fails (honest incompleteness per Section 8.6).

    The returned paths are indexed by AGENT ID (not by planning order),
    matching the Solution contract of Section 7.2.
    """
    paths: list[tuple[Position, ...]] = []
    paths_by_agent: dict[int, tuple[Position, ...]] = {}
    low_level_expansions = 0
    max_arrival = 0
    notes: list[str] = []

    for agent_id in order:
        agent = agents[agent_id]
        width = grid.width
        height = grid.height
        horizon = max_arrival + width + height

        # Deadline check (Section 8.3): the only wall-clock read in the
        # solver; it can only produce the honest timeout outcome.
        if deadline is not None and time.monotonic() >= deadline:
            notes.append(f'budget exhausted before planning agent {agent_id}')
            return PPResult(
                status='timeout',
                paths=None,
                soc=None,
                makespan=None,
                low_level_expansions=low_level_expansions,
                notes=tuple(notes),
            )

        constraints = _build_constraints_from_paths(agent.id, paths, horizon)
        result = plan(grid, cache, agent.start, agent.goal, constraints, agent.id, horizon)
        low_level_expansions += result.expansions

        if result.path is None:
            notes.append(
                f'agent {agent_id} failed within horizon {horizon} '
                f'(horizon_exceeded={result.horizon_exceeded})'
            )
            return PPResult(
                status='unsat',
                paths=None,
                soc=None,
                makespan=None,
                low_level_expansions=low_level_expansions,
                notes=tuple(notes),
            )

        assert result.path is not None
        paths.append(result.path)
        paths_by_agent[agent.id] = result.path
        arrival = len(result.path) - 1
        max_arrival = max(max_arrival, arrival)
        notes.append(f'agent {agent_id} planned (arrival t={arrival})')

    ordered_paths = [paths_by_agent[agent.id] for agent in agents]
    soc = sum(len(p) - 1 for p in ordered_paths)
    makespan = max(len(p) - 1 for p in ordered_paths)
    return PPResult(
        status='solved',
        paths=ordered_paths,
        soc=soc,
        makespan=makespan,
        low_level_expansions=low_level_expansions,
        notes=tuple(notes),
    )


def _pad_paths(
    paths: list[tuple[Position, ...]], makespan: int
) -> tuple[tuple[Position, ...], ...]:
    """Pad paths to makespan + 1 entries with stay-at-goal repetition.

    Section 7.3: every path in the execution block has exactly
    makespan + 1 positions, the goal repeated after arrival.
    """
    padded = []
    for path in paths:
        last = path[-1]
        padded.append(path + (last,) * (makespan + 1 - len(path)))
    return tuple(padded)


def solve_pp(
    instance: Instance,
    order: tuple[int, ...] | None = None,
    budget_ms: int | None = None,
    notes: list[str] | None = None,
) -> SolveOutcome:
    """Solve with prioritized planning using a given agent order.

    If order is None, uses agent index order (pp-fixed). ``notes``, if
    given, receives the ordering evidence (Section 8.6).
    """
    grid = instance.grid
    agents = instance.agents
    cache = DistanceCache()
    stats = SolveStats()

    n = len(agents)
    if order is None:
        order = tuple(range(n))
    elif sorted(order) != list(range(n)):
        raise ValueError(f'order must be a permutation of 0..{n - 1}, got {list(order)}')

    deadline = None
    if budget_ms is not None:
        deadline = time.monotonic() + budget_ms / 1000.0

    result = _plan_ordering(grid, cache, agents, order, deadline)

    stats.low_level_expansions = result.low_level_expansions
    stats.ct_generated = 1
    stats.ct_expanded = 1

    if notes is not None:
        notes.append(f'pp-fixed: agent order {list(order)}')
        notes.extend(result.notes)
        if result.status == 'unsat':
            notes.append('ordering failed -> unsat')

    if result.status != 'solved':
        return SolveOutcome(status=result.status, solution=None, stats=stats)

    assert result.paths is not None and result.soc is not None and result.makespan is not None
    solution = Solution(
        paths=_pad_paths(result.paths, result.makespan),
        soc=result.soc,
        makespan=result.makespan,
    )
    return SolveOutcome(status='solved', solution=solution, stats=stats)


def solve_pp_best_of_n(
    instance: Instance,
    n: int = DEFAULT_PP_BEST_OF_N,
    seed: int = DEFAULT_PP_SEED,
    budget_ms: int | None = None,
    notes: list[str] | None = None,
) -> SolveOutcome:
    """Run pp-best-of-n: n seeded shuffles, keep min-SoC success.

    The budget deadline is SHARED across orderings: if the wall-clock
    budget runs out mid-way, the honest status timeout is returned with
    partial stats — never silently treated as failure-or-exclusion.
    """
    if not MIN_PP_BEST_OF_N <= n <= MAX_PP_BEST_OF_N:
        raise ValueError(f'orderings must be in {MIN_PP_BEST_OF_N}..{MAX_PP_BEST_OF_N}, got {n}')

    grid = instance.grid
    agents = instance.agents
    cache = DistanceCache()
    stats = SolveStats()

    n_agents = len(agents)
    best_solution: Solution | None = None
    best_soc: int | None = None
    best_ordering: tuple[int, ...] | None = None
    ordering_notes: list[str] = []
    rng = random.Random(seed)

    base_order = list(range(n_agents))
    orderings: list[tuple[int, ...]] = []
    for _ in range(n):
        shuffled = list(base_order)
        rng.shuffle(shuffled)
        orderings.append(tuple(shuffled))

    deadline = None
    if budget_ms is not None:
        deadline = time.monotonic() + budget_ms / 1000.0

    for idx, order in enumerate(orderings):
        # Deadline check before each ordering (Section 8.3): the budget is
        # shared across orderings, never reset per ordering.
        if deadline is not None and time.monotonic() >= deadline:
            ordering_notes.append(f'budget exhausted after {idx} orderings tried')
            if notes is not None:
                notes.append(f'pp-best-of-{n} (seed={seed}): {n} orderings tried')
                notes.extend(ordering_notes)
            return SolveOutcome(
                status='timeout',
                solution=None,
                stats=SolveStats(
                    ct_expanded=stats.ct_expanded,
                    ct_generated=stats.ct_generated,
                    low_level_expansions=stats.low_level_expansions,
                ),
            )

        result = _plan_ordering(grid, cache, agents, order, deadline)
        stats.low_level_expansions += result.low_level_expansions
        stats.ct_generated += 1
        stats.ct_expanded += 1

        if result.status == 'timeout':
            ordering_notes.append(f'ordering {list(order)}: budget exhausted')
            if notes is not None:
                notes.append(f'pp-best-of-{n} (seed={seed}): {n} orderings tried')
                notes.extend(ordering_notes)
            return SolveOutcome(
                status='timeout',
                solution=None,
                stats=SolveStats(
                    ct_expanded=stats.ct_expanded,
                    ct_generated=stats.ct_generated,
                    low_level_expansions=stats.low_level_expansions,
                ),
            )

        if result.status == 'solved':
            ordering_notes.append(f'ordering {list(order)}: solved (SoC={result.soc})')
            if result.soc is not None and (best_soc is None or result.soc < best_soc):
                best_soc = result.soc
                assert result.paths is not None and result.makespan is not None
                best_solution = Solution(
                    paths=_pad_paths(result.paths, result.makespan),
                    soc=result.soc,
                    makespan=result.makespan,
                )
                best_ordering = order
        else:
            ordering_notes.append(f'ordering {list(order)}: failed')
            ordering_notes.extend(f'  {note}' for note in result.notes)

    if notes is not None:
        notes.append(f'pp-best-of-{n} (seed={seed}): {n} orderings tried')
        notes.extend(ordering_notes)

    if best_solution is not None:
        assert best_ordering is not None
        if notes is not None:
            notes.append(f'best ordering: {list(best_ordering)} (SoC={best_soc})')
        return SolveOutcome(
            status='solved',
            solution=best_solution,
            stats=SolveStats(
                ct_expanded=stats.ct_expanded,
                ct_generated=stats.ct_generated,
                low_level_expansions=stats.low_level_expansions,
            ),
        )

    if notes is not None:
        notes.append('all orderings failed -> unsat')
    return SolveOutcome(
        status='unsat',
        solution=None,
        stats=SolveStats(
            ct_expanded=stats.ct_expanded,
            ct_generated=stats.ct_generated,
            low_level_expansions=stats.low_level_expansions,
        ),
    )
