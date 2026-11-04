"""Tests for :mod:`swarmway.solver.cbs` (Section 8.2).

Hand-built cases with hand-computed expected sum-of-costs; each comment
shows the hand computation. CBS optimal (min SoC) is cross-checked
against the brute-force reference (Section 9.3) wherever brute force is
tractable.
"""

from __future__ import annotations

from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.solver.brute_force import brute_force_soc
from swarmway.solver.cbs import solve

AGENT_LIMIT_BUDGET_MS = 10000
_TIE_BREAKS = ('fifo', 'conflicts', 'depth')


def _inst(rows, pairs):
    grid = Grid(width=len(rows[0]), height=len(rows), rows=tuple(rows))
    agents = tuple(Agent(i, p[0], p[1]) for i, p in enumerate(pairs))
    return Instance(grid=grid, agents=agents)


def _soc(instance) -> int:
    outcome = solve(instance, AGENT_LIMIT_BUDGET_MS)
    assert outcome.status == 'solved', outcome.status
    assert outcome.solution is not None
    return outcome.solution.soc


def test_case1_unconstrained_baseline() -> None:
    # Hand computation: no conflict. agent0 (0,0)->(1,0) cost 1,
    # agent1 (3,0)->(2,0) cost 1. SoC = 1 + 1 = 2, makespan 1.
    instance = _inst(['....'], [((0, 0), (1, 0)), ((3, 0), (2, 0))])
    outcome = solve(instance, AGENT_LIMIT_BUDGET_MS)
    assert outcome.status == 'solved'
    assert outcome.solution.soc == 2
    assert outcome.solution.makespan == 1
    assert brute_force_soc(instance) == 2


def test_case2_plain_vertex_conflict() -> None:
    # Hand computation: agent0 (0,1)->(2,1) and agent1 (1,0)->(1,2) cross
    # at (1,1) at t=1. Individual costs 2+2=4 but they conflict, so one
    # agent waits one step: SoC = 3 + 2 = 5, makespan 3.
    instance = _inst(['...', '...', '...'], [((0, 1), (2, 1)), ((1, 0), (1, 2))])
    outcome = solve(instance, AGENT_LIMIT_BUDGET_MS)
    assert outcome.status == 'solved'
    assert outcome.solution.soc == 5
    assert outcome.solution.makespan == 3
    assert brute_force_soc(instance) == 5


def test_case3_target_goal_conflict() -> None:
    # Hand computation: agent0 (0,0)->(1,1) [goal], agent1 (2,2)->(0,0).
    # agent1 would pass through agent0's goal (1,1); resolve by agent1
    # detouring around it: agent0 cost 2, agent1 cost 4, SoC = 6.
    instance = _inst(['...', '...', '...'], [((0, 0), (1, 1)), ((2, 2), (0, 0))])
    outcome = solve(instance, AGENT_LIMIT_BUDGET_MS)
    assert outcome.status == 'solved'
    assert outcome.solution.soc == 6
    assert outcome.solution.makespan == 4
    assert brute_force_soc(instance) == 6


def test_case4_diagonal_cross_detour() -> None:
    # Hand computation: agent0 (0,0)->(2,2) and agent1 (2,0)->(0,2) would
    # cross at centre (1,1). Both detour around the edge: cost 4 each,
    # SoC = 8, makespan 4 (the SoC lower bound, sum of individual
    # shortest distances).
    instance = _inst(['...', '...', '...'], [((0, 0), (2, 2)), ((2, 0), (0, 2))])
    outcome = solve(instance, AGENT_LIMIT_BUDGET_MS)
    assert outcome.status == 'solved'
    assert outcome.solution.soc == 8
    assert outcome.solution.makespan == 4


def test_case5_obstacle_forced_detour() -> None:
    # Hand computation: obstacle at (1,0) blocks agent0's direct path
    # (0,0)->(2,0); detour (0,0)-(0,1)-(1,1)-(2,1)-(2,0) cost 4.
    # agent1 (0,2)->(2,2) cost 2. SoC = 4 + 2 = 6, makespan 4.
    instance = _inst(['.#.', '...', '...'], [((0, 0), (2, 0)), ((0, 2), (2, 2))])
    outcome = solve(instance, AGENT_LIMIT_BUDGET_MS)
    assert outcome.status == 'solved'
    assert outcome.solution.soc == 6
    assert outcome.solution.makespan == 4
    assert brute_force_soc(instance) == 6


def test_determinism_per_tie_break() -> None:
    """Same (instance, options) twice => identical paths/stats except
    runtime_ms, for every tie-break option."""
    instance = _inst(['...', '...', '...'], [((0, 0), (2, 2)), ((2, 0), (0, 2))])
    for tie_break in _TIE_BREAKS:
        r1 = solve(instance, AGENT_LIMIT_BUDGET_MS, tie_break=tie_break)
        r2 = solve(instance, AGENT_LIMIT_BUDGET_MS, tie_break=tie_break)
        assert r1.status == r2.status == 'solved'
        assert r1.solution is not None and r2.solution is not None
        assert r1.solution.paths == r2.solution.paths
        assert r1.solution.soc == r2.solution.soc
        assert r1.solution.makespan == r2.solution.makespan
        assert r1.stats.ct_expanded == r2.stats.ct_expanded
        assert r1.stats.ct_generated == r2.stats.ct_generated
        assert r1.stats.low_level_expansions == r2.stats.low_level_expansions


def test_soc_identical_across_tie_breaks() -> None:
    """Final SoC is identical across tie-break options (optimality
    untouched); only expansion count may differ."""
    instance = _inst(['...', '...', '...'], [((1, 1), (1, 0)), ((0, 0), (2, 0))])
    sos = set()
    for tie_break in _TIE_BREAKS:
        outcome = solve(instance, AGENT_LIMIT_BUDGET_MS, tie_break=tie_break)
        assert outcome.status == 'solved'
        assert outcome.solution is not None
        sos.add(outcome.solution.soc)
    assert sos == {4}
