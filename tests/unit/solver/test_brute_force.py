"""Tests for :mod:`swarmway.solver.brute_force` (Section 8.8).

Tests-only reference (never called from cbs.py or the CLI). Exponential
--- only tiny fixtures.
"""

from __future__ import annotations

from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.solver.brute_force import brute_force_soc
from swarmway.solver.cbs import solve

_AGENT_LIMIT = 3
_GRID_LIMIT = 6


def _inst(rows, pairs):
    grid = Grid(width=len(rows[0]), height=len(rows), rows=tuple(rows))
    agents = tuple(Agent(i, p[0], p[1]) for i, p in enumerate(pairs))
    return Instance(grid=grid, agents=agents)


def test_single_agent_known_cost() -> None:
    # (0,0)->(2,2) on 3x3: Manhattan distance 4.
    instance = _inst(['...', '...', '...'], [((0, 0), (2, 2))])
    assert brute_force_soc(instance) == 4


def test_two_agent_no_conflict() -> None:
    instance = _inst(['...', '...', '...'], [((0, 0), (2, 0)), ((0, 2), (2, 2))])
    assert brute_force_soc(instance) == 4


def test_unreachable_goal_returns_none() -> None:
    grid = Grid(width=3, height=3, rows=('...', '###', '...'))
    instance = Instance(grid=grid, agents=(Agent(0, (0, 0), (0, 2)),))
    assert brute_force_soc(instance) is None


def test_too_many_agents_raises() -> None:
    grid = Grid(width=3, height=3, rows=('...', '...', '...'))
    agents = tuple(Agent(i, (0, 0), (1, 1)) for i in range(_AGENT_LIMIT + 1))
    instance = Instance(grid=grid, agents=agents)
    try:
        brute_force_soc(instance)
    except ValueError:
        return
    raise AssertionError('agent limit not enforced')


def test_too_large_grid_raises() -> None:
    grid = Grid(
        width=_GRID_LIMIT + 1, height=_GRID_LIMIT, rows=('.' * (_GRID_LIMIT + 1),) * _GRID_LIMIT
    )
    instance = Instance(grid=grid, agents=(Agent(0, (0, 0), (1, 1)),))
    try:
        brute_force_soc(instance)
    except ValueError:
        return
    raise AssertionError('grid limit not enforced')


def test_cbs_matches_brute_force_on_tiny_instances() -> None:
    cases = [
        (['...', '...', '...'], [((0, 0), (2, 2))]),
        (['...', '...', '...'], [((0, 0), (2, 0)), ((0, 2), (2, 2))]),
        (['.#.', '...', '...'], [((0, 0), (2, 0)), ((0, 2), (2, 2))]),
    ]
    for rows, pairs in cases:
        instance = _inst(rows, pairs)
        bf = brute_force_soc(instance)
        outcome = solve(instance, 10000)
        if bf is None:
            continue  # brute force found nothing within horizon
        assert outcome.status == 'solved', (rows, pairs, outcome.status)
        assert outcome.solution is not None
        assert outcome.solution.soc == bf, (rows, pairs, outcome.solution.soc, bf)
