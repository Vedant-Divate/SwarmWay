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


@dataclass(frozen=True)
class SolveStats:
    ct_expanded: int = 0
    ct_generated: int = 0
    low_level_expansions: int = 0

    def __post_init__(self) -> None:
        object.__setattr__(self, 'ct_expanded', self.ct_expanded)
        object.__setattr__(self, 'ct_generated', self.ct_generated)
        object.__setattr__(self, 'low_level_expansions', self.low_level_expansions)
