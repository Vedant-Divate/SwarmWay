"""Tests for :mod:`swarmway.domain.schemas` (trace v1).

Round-trip: every :class:`TraceV1` serializes to JSON and parses back
identically. The committed :func:`trace_schema_json` export must match
``docs/contracts/trace-v1.schema.json`` byte-for-byte — this test fails
if the export goes stale (regenerate-and-compare).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from swarmway.domain.schemas import (
    AgentRef,
    ExecutionBlock,
    InstanceBlock,
    MapInfo,
    ResultBlock,
    SearchEvent,
    SolverBlock,
    TraceV1,
    trace_schema_json,
)

SCHEMA_PATH = Path('docs/contracts/trace-v1.schema.json')


def _minimal_trace() -> TraceV1:
    return TraceV1(
        solver=SolverBlock(
            name='cbs', options={'tie_break': 'fifo'}, package_version='0.1.0', seed=None
        ),
        instance=InstanceBlock(
            map=MapInfo(
                id='empty-16-16',
                name='Empty 16x16',
                width=16,
                height=16,
                rows=['................'] * 16,
                source='movingai',
            ),
            agents=[AgentRef(id=0, start=(0, 0), goal=(1, 0))],
        ),
        result=ResultBlock(
            status='solved',
            soc=1,
            makespan=1,
            runtime_ms=1.5,
            budget_ms=10000,
            ct_expanded=1,
            ct_generated=1,
            low_level_expansions=1,
            validity='valid',
            notes=[],
        ),
        search=[
            SearchEvent(seq=0, event='root', node=0, cost=1),
            SearchEvent(seq=1, event='goal', node=0, cost=1),
        ],
        execution=ExecutionBlock(makespan=1, paths=[[(0, 0), (1, 0)], [(1, 0), (0, 0)]]),
    )


def test_trace_v1_round_trip() -> None:
    trace = _minimal_trace()
    dumped = trace.model_dump()
    reloaded = TraceV1.model_validate(dumped)
    assert reloaded == trace
    # JSON serialization is stable.
    assert TraceV1.model_validate_json(trace.model_dump_json()) == trace


def test_schema_export_matches_committed_file() -> None:
    """The committed schema file is the single source of truth; this test
    fails if someone edits the model without regenerating the file."""
    if not SCHEMA_PATH.exists():
        pytest.skip(f'{SCHEMA_PATH} not yet committed')
    committed = SCHEMA_PATH.read_text(encoding='utf-8')
    assert json.loads(committed) == json.loads(trace_schema_json())
