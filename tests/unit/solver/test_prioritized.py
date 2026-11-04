"""Tests for :mod:`swarmway.solver.prioritized` (Section 8.6).

Crafted cases: basic solve, corridor incompleteness (PP honestly reports
unsat where CBS succeeds), dominance (CBS SoC <= PP SoC), a strictly
costlier PP case, best-of-n behavior (a shuffled ordering rescues a
failing fixed ordering; all orderings failing), per-seed determinism,
timeout honesty, and validity of PP solutions.
"""

from __future__ import annotations

import pytest

from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.solver.cbs import solve as cbs_solve
from swarmway.solver.prioritized import solve_pp, solve_pp_best_of_n
from swarmway.solver.validity import check


def _inst(rows, pairs):
    grid = Grid(width=len(rows[0]), height=len(rows), rows=tuple(rows))
    agents = tuple(Agent(i, p[0], p[1]) for i, p in enumerate(pairs))
    return Instance(grid=grid, agents=agents)


def _chokepoint_instance() -> Instance:
    """A dead-end corridor: the only link between the two halves is (2, 2).

    Agent 0 parks on that link (it is agent 0's goal), so the agent
    planned second cannot pass it in time: pp-fixed fails honestly.
    CBS solves it by letting agent 0 wait before entering the link.
    """
    return _inst(
        ['..#..', '..#..', '.....', '..#..', '..#..'],
        [((0, 2), (2, 2)), ((1, 0), (4, 4))],
    )


def test_pp_fixed_basic_solve() -> None:
    """PP solves a simple instance where agents don't conflict."""
    instance = _inst(['....'], [((0, 0), (1, 0)), ((3, 0), (2, 0))])
    outcome = solve_pp(instance)
    assert outcome.status == 'solved'
    assert outcome.solution is not None
    assert outcome.solution.soc == 2
    # PP solution passes the independent validity checker.
    assert check(outcome.solution, instance) == 'valid'


def test_pp_corridor_swap_pp_fails_cbs_solves() -> None:
    """Corridor swap: pp-fixed honestly reports unsat where CBS solves.

    The first planner parks on the only link between the two halves of
    the map; the second agent cannot yield within the horizon. CBS
    re-plans the first agent (it waits) and solves the instance.
    """
    instance = _chokepoint_instance()

    pp_outcome = solve_pp(instance)
    assert pp_outcome.status == 'unsat'
    assert pp_outcome.solution is None

    cbs_outcome = cbs_solve(instance, 10000)
    assert cbs_outcome.status == 'solved'
    assert cbs_outcome.solution is not None
    assert check(cbs_outcome.solution, instance) == 'valid'


def test_pp_notes_state_ordering_and_failure() -> None:
    """pp-fixed notes state the ordering tried and why it failed."""
    instance = _chokepoint_instance()
    notes: list[str] = []
    outcome = solve_pp(instance, notes=notes)
    assert outcome.status == 'unsat'
    assert any('pp-fixed: agent order [0, 1]' in note for note in notes)
    assert any('agent 1 failed within horizon' in note for note in notes)
    assert any('ordering failed -> unsat' in note for note in notes)


def test_pp_costlier_than_cbs() -> None:
    """PP solves but with strictly greater SoC than CBS (Section 9.2 #2).

    The greedy low level routes agent 0 through agent 1's goal cell, so
    agent 1 has to wait one extra step. CBS re-plans agent 0 and is
    strictly cheaper.
    """
    instance = _inst(['....'] * 4, [((0, 0), (1, 1)), ((2, 0), (1, 0))])

    cbs_outcome = cbs_solve(instance, 10000)
    assert cbs_outcome.status == 'solved'
    assert cbs_outcome.solution is not None

    pp_outcome = solve_pp(instance)
    assert pp_outcome.status == 'solved'
    assert pp_outcome.solution is not None

    assert cbs_outcome.solution.soc < pp_outcome.solution.soc, (
        cbs_outcome.solution.soc,
        pp_outcome.solution.soc,
    )
    assert check(cbs_outcome.solution, instance) == 'valid'
    assert check(pp_outcome.solution, instance) == 'valid'


def test_pp_dominance_on_crossing() -> None:
    """CBS SoC <= PP SoC on a crossing instance (dominance, Section 9.2 #2).

    On this simple fixture, PP and CBS may give the same SoC because the
    space-time A* within PP is optimal given constraints. The strict
    dominance property is tested on random instances in
    tests/properties/test_dominance.py.
    """
    instance = _inst(['...', '...', '...'], [((0, 1), (2, 1)), ((1, 0), (1, 2))])
    cbs_outcome = cbs_solve(instance, 10000)
    assert cbs_outcome.status == 'solved'
    assert cbs_outcome.solution is not None
    cbs_soc = cbs_outcome.solution.soc

    pp_outcome = solve_pp(instance)
    assert pp_outcome.status == 'solved'
    assert pp_outcome.solution is not None
    pp_soc = pp_outcome.solution.soc

    # Dominance: CBS SoC <= PP SoC (equality allowed).
    assert cbs_soc <= pp_soc, (cbs_soc, pp_soc)

    # Both solutions are valid.
    assert check(cbs_outcome.solution, instance) == 'valid'
    assert check(pp_outcome.solution, instance) == 'valid'


def test_pp_best_of_n_rescues_failing_fixed_ordering() -> None:
    """pp-fixed fails, but a seeded shuffle solves the same instance."""
    instance = _chokepoint_instance()

    fixed = solve_pp(instance)
    assert fixed.status == 'unsat'

    notes: list[str] = []
    outcome = solve_pp_best_of_n(instance, n=8, seed=42, notes=notes)
    assert outcome.status == 'solved'
    assert outcome.solution is not None
    assert check(outcome.solution, instance) == 'valid'

    # The notes name the winning ordering and every ordering's outcome.
    assert any('best ordering: [1, 0]' in note for note in notes)
    assert any('ordering [0, 1]: failed' in note for note in notes)
    assert any('ordering [1, 0]: solved' in note for note in notes)


def test_pp_best_of_n_all_orderings_fail() -> None:
    """All orderings fail on a 1-wide corridor swap -> unsat.

    In a 1-wide corridor the agents physically cannot pass each other,
    so no ordering can succeed. The notes list every failure.
    """
    instance = _inst(['...'], [((0, 0), (2, 0)), ((2, 0), (0, 0))])

    notes: list[str] = []
    outcome = solve_pp_best_of_n(instance, n=8, seed=42, notes=notes)
    assert outcome.status == 'unsat'
    assert outcome.solution is None
    failures = [note for note in notes if 'ordering [' in note and ': failed' in note]
    assert len(failures) == 8, failures
    assert any('all orderings failed -> unsat' in note for note in notes)


def test_pp_best_of_n_determinism() -> None:
    """Same (instance, seed) twice => identical paths and stats
    (excluding runtime)."""
    instance = _inst(['...', '...', '...'], [((0, 0), (2, 0)), ((2, 0), (0, 0))])

    r1 = solve_pp_best_of_n(instance, n=8, seed=42)
    r2 = solve_pp_best_of_n(instance, n=8, seed=42)

    assert r1.status == r2.status
    if r1.status == 'solved' and r1.solution is not None and r2.solution is not None:
        assert r1.solution.paths == r2.solution.paths
        assert r1.solution.soc == r2.solution.soc
        assert r1.solution.makespan == r2.solution.makespan
    assert r1.stats.low_level_expansions == r2.stats.low_level_expansions
    assert r1.stats.ct_expanded == r2.stats.ct_expanded
    assert r1.stats.ct_generated == r2.stats.ct_generated


def test_pp_best_of_n_rejects_out_of_range_orderings() -> None:
    """The orderings option is validated to 1..64 (A-9)."""
    instance = _inst(['....'], [((0, 0), (1, 0)), ((3, 0), (2, 0))])
    with pytest.raises(ValueError):
        solve_pp_best_of_n(instance, n=0)
    with pytest.raises(ValueError):
        solve_pp_best_of_n(instance, n=65)


def test_pp_timeout_honesty() -> None:
    """A tiny budget_ms on both variants => status timeout, partial
    stats present."""
    size = 30
    pairs = [((0, i), (size - 1, size - 1 - i)) for i in range(6)]
    instance = _inst(['.' * size for _ in range(size)], pairs)

    fixed = solve_pp(instance, budget_ms=1)
    assert fixed.status == 'timeout'
    assert fixed.solution is None
    assert fixed.stats.low_level_expansions > 0

    notes: list[str] = []
    best = solve_pp_best_of_n(instance, n=8, seed=42, budget_ms=1, notes=notes)
    assert best.status == 'timeout'
    assert best.solution is None
    assert best.stats.low_level_expansions > 0
    assert any('budget exhausted' in note for note in notes)
