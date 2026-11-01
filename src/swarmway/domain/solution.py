"""Core solution types (Section 7.2).

Pure: no I/O, no printing. Frozen solution outcome types. Note the
placement decision recorded in docs/decisions/: these core types live
in swarmway.domain, while CTNode (a CBS search artifact) lives in
solver/cbs.py.
"""

from __future__ import annotations

from dataclasses import dataclass

from swarmway.domain.grid import Position


@dataclass(frozen=True)
class Solution:
    paths: tuple[tuple[Position, ...], ...]
    soc: int
    makespan: int


@dataclass(frozen=True)
class SolveOutcome:
    status: str  # "solved" | "unsat" | "timeout" | "error"
    solution: Solution | None
    stats: SolveStats


@dataclass
class SolveStats:
    ct_expanded: int = 0
    ct_generated: int = 0
    low_level_expansions: int = 0
