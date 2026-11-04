"""Optimality spot-checks (Section 9.3).

Fixed hand-crafted tiny instances plus generated random tiny ones. Assert
soc_cbs == soc_bruteforce whenever brute force finds a solution, and CBS
solves whenever brute force does. The suite runs for every tie-break
option (Section 8.5): tie-breaks only reorder equal-cost nodes, so
optimality is untouched.
"""

from __future__ import annotations

import random

import pytest

from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.solver.brute_force import brute_force_soc
from swarmway.solver.cbs import solve

_BUDGET_MS = 10000
_TIE_BREAKS = ('fifo', 'conflicts', 'depth')


def _inst(rows, pairs):
    grid = Grid(width=len(rows[0]), height=len(rows), rows=tuple(rows))
    agents = tuple(Agent(i, p[0], p[1]) for i, p in enumerate(pairs))
    return Instance(grid=grid, agents=agents)


def _assert_cbs_matches_brute(instance, tie_break) -> None:
    bf = brute_force_soc(instance)
    outcome = solve(instance, _BUDGET_MS, tie_break=tie_break)
    if bf is None:
        return
    assert outcome.status == 'solved', (tie_break, outcome.status)
    assert outcome.solution is not None
    assert outcome.solution.soc == bf, (
        tie_break,
        outcome.solution.soc,
        bf,
    )


_INSTANCES = [
    # label, rows, pairs
    (
        'baseline',
        ['....'],
        [((0, 0), (1, 0)), ((3, 0), (2, 0))],
    ),
    (
        'vertex_conflict_cross',
        ['...', '...', '...'],
        [((0, 1), (2, 1)), ((1, 0), (1, 2))],
    ),
    (
        'target_goal_conflict',
        ['...', '...', '...'],
        [((0, 0), (1, 1)), ((2, 2), (0, 0))],
    ),
    (
        'diagonal_cross_detour',
        ['...', '...', '...'],
        [((0, 0), (2, 2)), ((2, 0), (0, 2))],
    ),
    (
        'obstacle_forced_detour',
        ['.#.', '...', '...'],
        [((0, 0), (2, 0)), ((0, 2), (2, 2))],
    ),
]


@pytest.mark.parametrize('tie_break', _TIE_BREAKS)
@pytest.mark.parametrize(
    'label,rows,pairs', [(label, rows, pairs) for label, rows, pairs in _INSTANCES]
)
def test_optimality_per_tie_break(tie_break, label, rows, pairs) -> None:
    """CBS matches brute force for every tie-break option."""
    instance = _inst(rows, pairs)
    _assert_cbs_matches_brute(instance, tie_break)


def test_random_tiny_instances() -> None:
    """Deterministic random tiny instances, compared per tie-break."""
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
        for tie_break in _TIE_BREAKS:
            bf = brute_force_soc(instance)
            if bf is None:
                continue
            outcome = solve(instance, _BUDGET_MS, tie_break=tie_break)
            assert outcome.status == 'solved', (trial, tie_break, rows, pairs, outcome.status)
            assert outcome.solution.soc == bf, (
                trial,
                tie_break,
                rows,
                pairs,
                outcome.solution.soc,
                bf,
            )
            checked += 1
    assert checked > 0, 'no brute-force-solvable instances generated'


def _expansion_sequence(instance, tie_break):
    """Return the ordered list of expanded CT node ids for a tie-break."""
    from swarmway.solver.trace import TraceRecorder

    recorder = TraceRecorder()
    outcome = solve(instance, _BUDGET_MS, recorder=recorder, tie_break=tie_break)
    assert outcome.status == 'solved'
    return tuple(ev['node'] for ev in recorder.finish() if ev['event'] == 'expand')


def test_conflicts_reorders_equal_cost_frontier() -> None:
    """``conflicts`` reorders equal-SoC frontier nodes vs fifo without
    changing the final SoC (observable: different expansion sequence)."""
    instance = _inst(['...', '...', '...'], [((1, 1), (1, 0)), ((0, 0), (2, 0))])
    seqs = {tb: _expansion_sequence(instance, tb) for tb in _TIE_BREAKS}
    assert len({seqs[tb] for tb in _TIE_BREAKS}) == 2, seqs
    assert seqs['conflicts'] != seqs['fifo']
    assert seqs['depth'] == seqs['fifo']
    for tb in _TIE_BREAKS:
        outcome = solve(instance, _BUDGET_MS, tie_break=tb)
        assert outcome.solution.soc == 4, (tb, outcome.solution.soc)


def test_depth_reorders_equal_cost_frontier() -> None:
    """``depth`` reorders equal-SoC frontier nodes vs fifo without
    changing the final SoC (observable: different expansion sequence)."""
    instance = _inst(['...', '...', '...'], [((2, 1), (0, 0)), ((1, 2), (1, 0))])
    seqs = {tb: _expansion_sequence(instance, tb) for tb in _TIE_BREAKS}
    assert seqs['depth'] != seqs['fifo']
    assert seqs['depth'] == seqs['conflicts']
    for tb in _TIE_BREAKS:
        outcome = solve(instance, _BUDGET_MS, tie_break=tb)
        assert outcome.solution.soc == 6, (tb, outcome.solution.soc)
