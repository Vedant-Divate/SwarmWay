"""Trace JSON v1 Pydantic models (Section 7.3).

This module is the *single schema source* for trace v1: every field name
and type matches Section 7.3 exactly. The FastAPI API returns instances
of these models, and :func:`trace_schema_json` emits the committed
JSON Schema used by the frontend contract tests and AI Studio prompt
pack.

Pure: no I/O, no printing, no network. ``package_version`` is read from
the installed package metadata (falling back to pyproject's version).
"""

from __future__ import annotations

import importlib.metadata
import json
from typing import Any, Literal

from pydantic import BaseModel, Field

try:  # pragma: no cover - depends on installed package metadata
    PACKAGE_VERSION = importlib.metadata.version('swarmway')
except Exception:  # pragma: no cover
    PACKAGE_VERSION = '0.1.0'


class SolverBlock(BaseModel):
    """``solver`` block of trace v1 (Section 7.3)."""

    name: Literal['cbs', 'pp-fixed', 'pp-best-of-n'] = 'cbs'
    options: dict[str, Any] = Field(default_factory=dict)
    package_version: str = PACKAGE_VERSION
    seed: int | None = None


class MapInfo(BaseModel):
    """Map identity + full grid, self-contained (Section 7.3)."""

    id: str
    name: str
    width: int
    height: int
    rows: list[str]
    source: str = 'movingai'


class AgentRef(BaseModel):
    """One agent of an instance (Section 7.3)."""

    id: int
    start: tuple[int, int]
    goal: tuple[int, int]


class InstanceBlock(BaseModel):
    """``instance`` block of trace v1 (Section 7.3)."""

    map: MapInfo
    agents: list[AgentRef]


class Conflict(BaseModel):
    """A conflict payload (Section 7.3 search event)."""

    type: Literal['vertex', 'edge']
    agents: list[int]
    pos: tuple[int, int] | None = None  # vertex conflict position
    u: tuple[int, int] | None = None  # edge conflict: u->v
    v: tuple[int, int] | None = None
    t: int


class Constraint(BaseModel):
    """A constraint payload (Section 7.3 search event)."""

    agent: int
    type: Literal['vertex', 'edge']
    pos: tuple[int, int] | None = None
    u: tuple[int, int] | None = None
    v: tuple[int, int] | None = None
    t: int


class SearchEvent(BaseModel):
    """One ordered search event (Section 7.3 ``search`` array)."""

    seq: int
    event: Literal['root', 'expand', 'goal']
    node: int
    cost: int
    parent: int | None = None
    conflict: Conflict | None = None
    constraint: Constraint | None = None
    replanned_agent: int | None = None
    replanned_cost: int | None = None


class ResultBlock(BaseModel):
    """``result`` block of trace v1 (Section 7.3)."""

    status: Literal['solved', 'unsat', 'timeout', 'error']
    soc: int
    makespan: int
    runtime_ms: float
    budget_ms: int
    ct_expanded: int
    ct_generated: int
    low_level_expansions: int
    validity: str  # "valid" on success; rule name on failure
    notes: list[str] = Field(default_factory=list)


class ExecutionBlock(BaseModel):
    """``execution`` block of trace v1 (Section 7.3)."""

    makespan: int
    # per agent: exactly makespan + 1 positions, stay-at-goal padded
    paths: list[list[tuple[int, int]]]


class TraceV1(BaseModel):
    """Trace JSON v1 — the complete replayable artifact (Section 7.3)."""

    trace_version: Literal[1] = 1
    solver: SolverBlock
    instance: InstanceBlock
    result: ResultBlock
    search: list[SearchEvent] = Field(default_factory=list)
    execution: ExecutionBlock


def trace_schema_json() -> str:
    """The JSON Schema for trace v1, as committed to
    ``docs/contracts/trace-v1.schema.json``."""
    return json.dumps(TraceV1.model_json_schema(), indent=2)
