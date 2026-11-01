"""Tests for :mod:`swarmway.solver.validity` (Section 9.1).

Every rule has at least two tests: one where it fires and one where it
does not. The checker is deliberately independent of the solver.
"""

from __future__ import annotations

from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.domain.solution import Solution
from swarmway.solver.validity import ValidityError, check

_GRID = Grid(width=3, height=3, rows=('...', '...', '...'))


def _solution(*agent_paths, soc, makespan):
    return Solution(paths=tuple(agent_paths), soc=soc, makespan=makespan)


def _two_agent_valid() -> Instance:
    return Instance(
        grid=_GRID,
        agents=(Agent(0, (0, 0), (1, 0)), Agent(1, (0, 2), (1, 2))),
    )


def test_valid_solution_passes() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'


def test_v_bounds_fires() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (3, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    try:
        check(sol, inst)
    except ValidityError as exc:
        assert 'V-BOUNDS' in str(exc)
        assert 'agent 0' in str(exc)
    else:
        raise AssertionError('V-BOUNDS did not fire')


def test_v_bounds_does_not_fire() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'


def test_v_passable_fires() -> None:
    grid = Grid(width=3, height=3, rows=('.#.', '...', '...'))
    inst = Instance(grid=grid, agents=(Agent(0, (0, 0), (1, 0)), Agent(1, (0, 2), (1, 2))))
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    try:
        check(sol, inst)
    except ValidityError as exc:
        assert 'V-PASSABLE' in str(exc)
    else:
        raise AssertionError('V-PASSABLE did not fire')


def test_v_passable_does_not_fire() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'


def test_v_continuity_fires() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (2, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    try:
        check(sol, inst)
    except ValidityError as exc:
        assert 'V-CONTINUITY' in str(exc)
    else:
        raise AssertionError('V-CONTINUITY did not fire')


def test_v_continuity_does_not_fire() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'


def test_v_start_fires() -> None:
    inst = Instance(
        grid=_GRID,
        agents=(Agent(0, (2, 2), (1, 0)), Agent(1, (0, 2), (1, 2))),
    )
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    try:
        check(sol, inst)
    except ValidityError as exc:
        assert 'V-START' in str(exc)
    else:
        raise AssertionError('V-START did not fire')


def test_v_start_does_not_fire() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'


def test_v_goal_fires() -> None:
    inst = Instance(
        grid=_GRID,
        agents=(Agent(0, (0, 0), (2, 2)), Agent(1, (0, 2), (1, 2))),
    )
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    try:
        check(sol, inst)
    except ValidityError as exc:
        assert 'V-GOAL' in str(exc)
    else:
        raise AssertionError('V-GOAL did not fire')


def test_v_goal_does_not_fire() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'


def test_v_vertex_fires() -> None:
    inst = Instance(
        grid=_GRID,
        agents=(Agent(0, (0, 0), (2, 0)), Agent(1, (2, 0), (0, 0))),
    )
    sol = _solution(
        [(0, 0), (1, 0), (2, 0)],
        [(2, 0), (1, 0), (0, 0)],
        soc=4,
        makespan=2,
    )
    try:
        check(sol, inst)
    except ValidityError as exc:
        assert 'V-VERTEX' in str(exc)
        assert 'agents 0 and 1' in str(exc)
    else:
        raise AssertionError('V-VERTEX did not fire')


def test_v_vertex_does_not_fire() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'


def test_v_edge_fires() -> None:
    inst = Instance(
        grid=_GRID,
        agents=(Agent(0, (0, 0), (1, 0)), Agent(1, (1, 0), (0, 0))),
    )
    sol = _solution([(0, 0), (1, 0)], [(1, 0), (0, 0)], soc=1, makespan=1)
    try:
        check(sol, inst)
    except ValidityError as exc:
        assert 'V-EDGE' in str(exc)
    else:
        raise AssertionError('V-EDGE did not fire')


def test_v_edge_does_not_fire() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'


def test_v_pad_fires() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0)], [(0, 2), (1, 2)], soc=0, makespan=1)
    try:
        check(sol, inst)
    except ValidityError as exc:
        assert 'V-PAD' in str(exc)
    else:
        raise AssertionError('V-PAD did not fire')


def test_v_pad_does_not_fire() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'


def test_v_soc_fires() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=99, makespan=1)
    try:
        check(sol, inst)
    except ValidityError as exc:
        assert 'V-SOC' in str(exc)
    else:
        raise AssertionError('V-SOC did not fire')


def test_v_soc_does_not_fire() -> None:
    inst = _two_agent_valid()
    sol = _solution([(0, 0), (1, 0)], [(0, 2), (1, 2)], soc=2, makespan=1)
    assert check(sol, inst) == 'valid'
