"""Tests for :mod:`swarmway.domain.instance`.

Validation returns per-error details (agent id, position, field, message),
never a single boolean. Cross-validation ties a .scen line to a loaded map.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from swarmway.domain.grid import Grid
from swarmway.domain.instance import (
    Agent,
    Instance,
    ValidationError,
    build_instance_from_lines,
    validate_instance,
)
from swarmway.domain.mapfile import parse_map
from swarmway.domain.scenfile import parse_scen

MAPS = Path('data/maps')
SCEN = Path('data/scenarios')


def _grid(map_id: str) -> Grid:
    return parse_map((MAPS / f'{map_id}.map').read_text(encoding='utf-8'))


def test_valid_instance_passes() -> None:
    g = _grid('empty-16-16')
    inst = Instance(
        grid=g,
        agents=(Agent(id=0, start=(0, 0), goal=(1, 1)), Agent(id=1, start=(2, 2), goal=(3, 3))),
    )
    assert validate_instance(inst) == ()


def test_out_of_bounds_start_and_goal() -> None:
    g = _grid('empty-16-16')
    inst = Instance(grid=g, agents=(Agent(id=0, start=(-1, 0), goal=(16, 5)),))
    errs = validate_instance(inst)
    assert len(errs) == 2
    assert errs[0] == ValidationError(
        agent_id=0,
        position=(-1, 0),
        field='start',
        message='agent 0 start (-1, 0) is out of bounds for 16x16 grid',
    )
    assert errs[1] == ValidationError(
        agent_id=0,
        position=(16, 5),
        field='goal',
        message='agent 0 goal (16, 5) is out of bounds for 16x16 grid',
    )


def test_start_on_blocked_cell() -> None:
    g = Grid(width=3, height=3, rows=('...', '.@.', '...'))
    inst = Instance(grid=g, agents=(Agent(id=0, start=(1, 1), goal=(0, 0)),))
    errs = validate_instance(inst)
    assert len(errs) == 1
    assert errs[0].field == 'start'
    assert errs[0].position == (1, 1)
    assert 'blocked cell' in errs[0].message


def test_duplicate_starts() -> None:
    g = _grid('empty-16-16')
    inst = Instance(
        grid=g,
        agents=(
            Agent(id=0, start=(1, 1), goal=(5, 5)),
            Agent(id=1, start=(1, 1), goal=(6, 6)),
        ),
    )
    errs = validate_instance(inst)
    assert any(e.field == 'start' and e.agent_id == 1 for e in errs)


def test_start_equals_goal_of_another_agent_is_allowed() -> None:
    # Cross-agent start==goal is normal in MAPF benchmarks; validation only
    # requires starts distinct among themselves and goals distinct among
    # themselves.
    g = _grid('empty-16-16')
    inst = Instance(
        grid=g,
        agents=(
            Agent(id=0, start=(1, 1), goal=(2, 2)),
            Agent(id=1, start=(3, 3), goal=(1, 1)),
        ),
    )
    assert validate_instance(inst) == ()


def test_build_instance_from_lines_first_k() -> None:
    g = _grid('empty-16-16')
    lines = parse_scen((SCEN / 'empty-16-16-even-1.scen').read_text(encoding='utf-8'))
    inst, errs = build_instance_from_lines(g, 'empty-16-16.map', lines, 3)
    assert errs == ()
    assert inst is not None
    assert [a.id for a in inst.agents] == [0, 1, 2]
    assert inst.agents[0].start == (10, 8)
    assert inst.agents[0].goal == (8, 5)


def test_build_instance_scen_basename_mismatch() -> None:
    g = _grid('empty-16-16')
    lines = parse_scen('version 1\n0\tother.map\t16\t16\t10\t8\t8\t5\t1.0\n')
    inst, errs = build_instance_from_lines(g, 'empty-16-16.map', lines, 1)
    assert inst is None
    assert any(e.field == 'map-path' for e in errs)


def test_build_instance_scen_dims_mismatch() -> None:
    g = _grid('empty-16-16')
    lines = parse_scen('version 1\n0\tempty-16-16.map\t8\t8\t10\t8\t8\t5\t1.0\n')
    inst, errs = build_instance_from_lines(g, 'empty-16-16.map', lines, 1)
    assert inst is None
    fields = {e.field for e in errs}
    assert 'map-width' in fields and 'map-height' in fields


def test_build_instance_scen_start_on_blocked_cell() -> None:
    g = Grid(width=3, height=3, rows=('...', '.@.', '...'))
    lines = parse_scen('version 1\n0\tm.map\t3\t3\t1\t1\t0\t0\t1.0\n')
    inst, errs = build_instance_from_lines(g, 'm.map', lines, 1)
    assert inst is None
    assert any(e.field == 'start' and 'blocked cell' in e.message for e in errs)


@pytest.mark.parametrize('map_id', ['empty-16-16', 'ht_chantry', 'random-32-32-10'])
def test_first_k_instance_validates_for_all_k(map_id: str) -> None:
    """Every first-k instance validates for all k up to the scen row count."""
    g = _grid(map_id)
    lines = parse_scen((SCEN / f'{map_id}-even-1.scen').read_text(encoding='utf-8'))
    for k in range(1, len(lines) + 1):
        inst, errs = build_instance_from_lines(g, f'{map_id}.map', lines, k)
        assert errs == (), f'{map_id} k={k} errors: {errs}'
        assert inst is not None
        assert len(inst.agents) == k


@given(
    width=st.integers(min_value=2, max_value=8),
    height=st.integers(min_value=2, max_value=8),
    n_agents=st.integers(min_value=1, max_value=6),
)
def test_hypothesis_random_instance_validation(width, height, n_agents) -> None:
    rows = tuple('.' * width for _ in range(height))
    g = Grid(width=width, height=height, rows=rows)
    seen: set[tuple[int, int]] = set()
    agents: list[Agent] = []
    for i in range(n_agents):
        start = (i % width, i % height)
        goal = ((i + 1) % width, (i + 1) % height)
        if start == goal or start in seen or goal in seen:
            continue
        seen.add(start)
        seen.add(goal)
        agents.append(Agent(id=i, start=start, goal=goal))
    inst = Instance(grid=g, agents=tuple(agents))
    errs = validate_instance(inst)
    assert errs == ()
