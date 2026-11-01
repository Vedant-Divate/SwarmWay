"""Optimality spot-checks (Section 9.3).

Fixed hand-crafted tiny instances plus generated random tiny ones. Assert
soc_cbs == soc_bruteforce whenever brute force finds a solution, and CBS
solves whenever brute force does. The Phase 2 low-level optimality
property stays green.
"""

from __future__ import annotations

from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.solver.brute_force import brute_force_soc
from swarmway.solver.cbs import solve

_BUDGET_MS = 10000


def _inst(rows, pairs):
    grid = Grid(width=len(rows[0]), height=len(rows), rows=tuple(rows))
    agents = tuple(Agent(i, p[0], p[1]) for i, p in enumerate(pairs))
    return Instance(grid=grid, agents=agents)


def _assert_cbs_matches_brute(instance, label) -> None:
    bf = brute_force_soc(instance)
    outcome = solve(instance, _BUDGET_MS)
    if bf is None:
        return
    assert outcome.status == 'solved', (label, outcome.status)
    assert outcome.solution is not None
    assert outcome.solution.soc == bf, (label, outcome.solution.soc, bf)


def test_baseline_no_conflict() -> None:
    # Two agents on a row, moving toward each other's former cells but not
    # crossing: no conflict. SoC = 1 + 1 = 2.
    instance = _inst(['....'], [((0, 0), (1, 0)), ((3, 0), (2, 0))])
    _assert_cbs_matches_brute(instance, 'baseline')


def test_vertex_conflict_cross() -> None:
    # agent0 (0,1)->(2,1) and agent1 (1,0)->(1,2) cross at (1,1) at t=1.
    # One agent waits: SoC = 3 + 2 = 5.
    instance = _inst(['...', '...', '...'], [((0, 1), (2, 1)), ((1, 0), (1, 2))])
    _assert_cbs_matches_brute(instance, 'vertex')


def test_target_goal_conflict() -> None:
    # agent0 (0,0)->(1,1) [goal], agent1 (2,2)->(0,0) passes near the goal.
    # agent1 detours around agent0's goal: SoC = 2 + 4 = 6.
    instance = _inst(['...', '...', '...'], [((0, 0), (1, 1)), ((2, 2), (0, 0))])
    _assert_cbs_matches_brute(instance, 'target')


def test_diagonal_cross_detour() -> None:
    # agent0 (0,0)->(2,2) and agent1 (2,0)->(0,2) would cross at centre.
    # Both detour around the edge: cost 4 each, SoC = 8 (the lower bound,
    # sum of individual shortest distances).
    instance = _inst(['...', '...', '...'], [((0, 0), (2, 2)), ((2, 0), (0, 2))])
    outcome = solve(instance, _BUDGET_MS)
    assert outcome.status == 'solved', outcome.status
    assert outcome.solution is not None
    assert outcome.solution.soc == 8, outcome.solution.soc


def test_obstacle_forced_detour() -> None:
    # Obstacle at (1,0) forces agent0 to detour: cost 4; agent1 cost 2.
    # SoC = 6.
    instance = _inst(['.#.', '...', '...'], [((0, 0), (2, 0)), ((0, 2), (2, 2))])
    _assert_cbs_matches_brute(instance, 'detour')


def test_random_tiny_instances() -> None:
    # Deterministic random tiny instances: 3x3 grids with a few obstacles,
    # 1-2 agents. Compare CBS vs brute force whenever brute force finds a
    # solution (bounded generation so the suite is not vacuous).
    import random

    rng = random.Random(20261031)
    checked = 0
    for trial in range(15):
        size = 3
        rows = [['.' for _ in range(size)] for _ in range(size)]
        for _ in range(rng.randint(0, 2)):
            rows[rng.randrange(size)][rng.randrange(size)] = '#'
        rows = [''.join(r) for r in rows]
        cells = [(x, y) for y in range(size) for x in range(size) if rows[y][x] == '.']
        if len(cells) < 4:
            continue
        n_agents = rng.randint(1, 2)
        chosen = rng.sample(cells, 2 * n_agents)
        pairs = [(chosen[2 * i], chosen[2 * i + 1]) for i in range(n_agents)]
        instance = _inst(rows, pairs)
        bf = brute_force_soc(instance)
        if bf is None:
            continue
        outcome = solve(instance, _BUDGET_MS)
        assert outcome.status == 'solved', (trial, rows, pairs, outcome.status)
        assert outcome.solution.soc == bf, (
            trial,
            rows,
            pairs,
            outcome.solution.soc,
            bf,
        )
        checked += 1
    assert checked > 0, 'no brute-force-solvable instances generated'
