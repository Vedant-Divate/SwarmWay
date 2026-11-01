"""A-10 check (Section 14 Phase 1 task 7 / Phase 3 task 7).

Run CBS over the Section 10.1 curated cells with a 60 s budget per cell,
printing a table: map, agents, status, soc, makespan, runtime_ms,
ct_expanded. Excluded from the default run (slow marker). This is the
baseline measurement for Phase 3 expectations; no optimization is
performed here. Cells that time out are reported honestly (status
``timeout``); agent counts are NOT adjusted to make them pass.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from swarmway.domain.instance import Agent, Instance
from swarmway.domain.mapfile import parse_map
from swarmway.domain.scenfile import parse_scen
from swarmway.solver.cbs import solve

MAPS_DIR = Path('data/maps')
SCEN_DIR = Path('data/scenarios')
BUDGET_MS = 60000

# Section 10.1 curated cells: map -> agent counts.
CELLS = {
    'empty-16-16': [5, 10, 20, 40],
    'random-32-32-10': [5, 10, 20, 40],
    'random-32-32-20': [5, 10, 20],
    'maze-32-32-2': [5, 10, 20],
    'room-32-32-4': [5, 10, 20],
    'warehouse-10-20-10-2-1': [5, 10, 20, 40],
    'ht_chantry': [5, 10, 20],
}


def _load_map(map_id):
    return parse_map((MAPS_DIR / f'{map_id}.map').read_text(encoding='utf-8'))


@pytest.mark.slow
def test_curated_cells_a10() -> None:
    print()
    print('A-10 check: CBS over curated cells (60 s budget per cell)')
    print('=' * 78)
    print(
        f'{"map":<26} {"agents":<7} {"status":<9} {"soc":<6} {"makespan":<9} '
        f'{"runtime_ms":<11} {"ct_expanded":<11}'
    )
    print('-' * 78)
    for map_id, agent_counts in CELLS.items():
        grid = _load_map(map_id)
        scen = parse_scen((SCEN_DIR / f'{map_id}-even-1.scen').read_text(encoding='utf-8'))
        for agents in agent_counts:
            instance = Instance(
                grid=grid,
                agents=tuple(
                    Agent(i, (s.start_x, s.start_y), (s.goal_x, s.goal_y))
                    for i, s in enumerate(scen[:agents])
                ),
            )
            t0 = time.perf_counter()
            outcome = solve(instance, BUDGET_MS)
            runtime_ms = (time.perf_counter() - t0) * 1000.0
            if outcome.solution is None:
                soc = makespan = '-'
            else:
                soc = outcome.solution.soc
                makespan = outcome.solution.makespan
            print(
                f'{map_id:<26} {agents:<7} {outcome.status:<9} {soc:<6} '
                f'{makespan:<9} {runtime_ms:<11.1f} '
                f'{outcome.stats.ct_expanded:<11}'
            )
    print('=' * 78)
    assert True  # benchmark only; timing recorded in docs/verification/phase-3.md
