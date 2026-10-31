"""Micro-benchmark: unconstrained space-time A* over the curated maps.

Excluded from the default test run (slow marker). For each of the 7
Section 10.1 curated maps, take the first 5 start/goal pairs from its
vendored even scenario and run unconstrained space-time A*, printing a
table of cost, expansions, and wall-time ms. This is the honest baseline
number for Phase 3 expectations — no optimization this phase, just
measurement.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from swarmway.domain.constraints import Constraints
from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent
from swarmway.domain.mapfile import parse_map
from swarmway.domain.scenfile import parse_scen
from swarmway.solver.astar_space_time import INF, plan
from swarmway.solver.astar_static import DistanceCache, horizon_guard

MAPS_DIR = Path('data/maps')
SCEN_DIR = Path('data/scenarios')
AGENT = 0
PAIRS = 5  # first 5 scenario pairs per map


def _load_map(map_id: str) -> Grid:
    text = (MAPS_DIR / f'{map_id}.map').read_text(encoding='utf-8')
    return parse_map(text)


@pytest.mark.slow
def test_micro_benchmark_curated_maps() -> None:
    map_ids = [
        'empty-16-16',
        'random-32-32-10',
        'random-32-32-20',
        'maze-32-32-2',
        'room-32-32-4',
        'warehouse-10-20-10-2-1',
        'ht_chantry',
    ]
    print()
    print('Micro-benchmark: unconstrained space-time A* over curated maps')
    print('=' * 72)
    print(f'{"map":<28} {"pair":<5} {"cost":<6} {"expansions":<11} {"wall_ms":<8}')
    print('-' * 72)
    for map_id in map_ids:
        grid = _load_map(map_id)
        scen = parse_scen((SCEN_DIR / f'{map_id}-even-1.scen').read_text(encoding='utf-8'))
        cache = DistanceCache()
        constraints = Constraints.empty()
        for i, line in enumerate(scen[:PAIRS]):
            start = (line.start_x, line.start_y)
            goal = (line.goal_x, line.goal_y)
            agent = Agent(id=AGENT, start=start, goal=goal)
            max_t = horizon_guard(grid, cache, (agent,))
            t0 = time.perf_counter()
            result = plan(grid, cache, start, goal, constraints, AGENT, max_t)
            wall_ms = (time.perf_counter() - t0) * 1000.0
            cost = result.cost if result.success else INF
            print(f'{map_id:<28} {i:<5} {cost:<6} {result.expansions:<11} {wall_ms:<8.2f}')
    print('=' * 72)
    assert True  # benchmark only; timing recorded in docs/verification/phase-2.md
