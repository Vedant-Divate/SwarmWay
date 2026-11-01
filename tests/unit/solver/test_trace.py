"""Tests for :mod:`swarmway.solver.trace` (Section 8.10).

The recorder is a *pure observer*: solving with recording on or off
produces identical paths and stats. Tests also cover the event cap
(truncation keeps every k-th event plus the last 50 + final goal).
"""

from __future__ import annotations

from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.solver.cbs import solve
from swarmway.solver.trace import TraceRecorder


def _make_instance() -> Instance:
    grid = Grid(width=3, height=1, rows=('...',))
    agents = (Agent(0, (0, 0), (2, 0)),)
    return Instance(grid=grid, agents=agents)


def test_recorder_is_pure_observer() -> None:
    instance = _make_instance()
    off = solve(instance, 10000)
    recorder = TraceRecorder()
    on = solve(instance, 10000, recorder=recorder)
    # Identical paths and stats regardless of recording.
    assert off.status == on.status
    if off.solution is not None and on.solution is not None:
        assert off.solution.paths == on.solution.paths
        assert off.solution.soc == on.solution.soc
        assert off.solution.makespan == on.solution.makespan
    assert off.stats.ct_expanded == on.stats.ct_expanded
    assert off.stats.ct_generated == on.stats.ct_generated
    assert off.stats.low_level_expansions == on.stats.low_level_expansions
    # Recorder saw root (and goal when solved).
    events = recorder.finish()
    kinds = [e['event'] for e in events]
    assert 'root' in kinds
    assert all('seq' in e for e in events)


def test_event_cap_truncation() -> None:
    recorder = TraceRecorder(cap=5)
    for i in range(20):
        recorder.record_root(i, i)
    events = recorder.finish()
    # With 20 events and a cap of 5, every kept event keeps its own seq
    # re-sequenced from 0; events whose original index >= cap carry the
    # truncation flag.
    assert [e['seq'] for e in events] == list(range(len(events)))
    truncated = [e for e in events if e.get('search_truncated')]
    assert truncated, 'expected truncation with a tiny cap'
    assert all(e.get('note') for e in truncated)
    assert all(e['seq'] >= 5 for e in truncated)  # only beyond-cap events
