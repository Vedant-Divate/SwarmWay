"""Conflict types (Section 7.2).

Pure: no I/O, no printing. Frozen, hashable conflict records. A
VertexConflict at (agents, pos, t) means both agents occupy pos at t;
an EdgeConflict at (agents, u, v, t) means they traverse the edge u->v
between t-1 and t (the classic off-by-one edge indexing).
"""

from __future__ import annotations

from dataclasses import dataclass

from swarmway.domain.grid import Position


@dataclass(frozen=True)
class VertexConflict:
    agents: tuple[int, int]
    pos: Position
    t: int


@dataclass(frozen=True)
class EdgeConflict:
    agents: tuple[int, int]
    u: Position
    v: Position
    t: int
