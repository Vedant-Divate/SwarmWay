"""Constraint model (Section 7.2).

Pure: no I/O, no printing. Frozen, hashable constraint types and a
per-agent constraint container. Iteration over constraints is always
sorted so behaviour is deterministic.

Edge-constraint indexing (the classic off-by-one): an
``EdgeConstraint(agent, u, v, t)`` forbids the agent being at ``u`` at
timestep ``t-1`` AND at ``v`` at timestep ``t`` — i.e. it forbids
traversing the edge u->v between t-1 and t.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from swarmway.domain.grid import Position


@dataclass(frozen=True)
class VertexConstraint:
    agent: int
    pos: Position
    t: int
    hold: bool = False
    """If True, this is a goal-hold constraint <goal, t, hold=True>
    (Section 8.2): the agent occupies its goal from timestep t onward
    and may not arrive at or pass through it at any t' >= t. With the
    summary-based goal test, a hold constraint on the goal cell raises
    the same "arrival must come after the blocked time" bound as a
    plain vertex constraint on the goal, because the agent occupies
    its goal from arrival onward."""


@dataclass(frozen=True)
class EdgeConstraint:
    agent: int
    u: Position
    v: Position
    t: int


@dataclass(frozen=True)
class Constraints:
    """Per-agent frozen sets of vertex/edge constraints.

    Each agent maps to sorted tuples of (vertex_constraints,
    edge_constraints). The goal-blocked summary is derived from the
    vertex-constraint set: for each agent and position, the latest
    timestep at which that position is vertex-constrained. Blocked times
    are finite and the condition is monotone in t, so this derived
    "goal-blocked-until" bound is sufficient to answer "is any t' >= t
    blocked on position p" efficiently; it is recomputed from the
    constraint set, never hand-maintained.
    """

    vertex: dict[int, tuple[VertexConstraint, ...]] = field(default_factory=dict)
    edge: dict[int, tuple[EdgeConstraint, ...]] = field(default_factory=dict)
    # agent -> pos -> max timestep vertex-constraining that position
    _goal_blocked_until: dict[int, dict[Position, int]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            'vertex',
            {
                agent: tuple(sorted(vcs, key=lambda c: (c.pos, c.t)))
                for agent, vcs in sorted(self.vertex.items())
            },
        )
        object.__setattr__(
            self,
            'edge',
            {
                agent: tuple(sorted(ecs, key=lambda c: (c.u, c.v, c.t)))
                for agent, ecs in sorted(self.edge.items())
            },
        )
        derived: dict[int, dict[Position, int]] = {}
        for agent, vcs in self.vertex.items():
            pos_to_t: dict[Position, int] = {}
            for vc in vcs:
                prev = pos_to_t.get(vc.pos, -1)
                if vc.t > prev:
                    pos_to_t[vc.pos] = vc.t
            derived[agent] = pos_to_t
        object.__setattr__(self, '_goal_blocked_until', derived)

    @classmethod
    def empty(cls) -> Constraints:
        return cls()

    def vertex_for(self, agent: int) -> tuple[VertexConstraint, ...]:
        return self.vertex.get(agent, ())

    def edge_for(self, agent: int) -> tuple[EdgeConstraint, ...]:
        return self.edge.get(agent, ())

    def goal_blocked_until(self, agent: int, pos: Position) -> int:
        """Latest timestep at which `pos` is vertex-constrained for agent,
        or -1 if never."""
        return self._goal_blocked_until.get(agent, {}).get(pos, -1)

    def is_goal_blocked_at_or_after(self, agent: int, pos: Position, t: int) -> bool:
        """True if any vertex constraint blocks `pos` for agent at t' >= t."""
        return self.goal_blocked_until(agent, pos) >= t

    def add_vertex(self, agent: int, pos: Position, t: int, hold: bool = False) -> Constraints:
        new_vertex = dict(self.vertex)
        new_vertex[agent] = tuple(
            sorted(
                [*list(self.vertex.get(agent, ())), VertexConstraint(agent, pos, t, hold)],
                key=lambda c: (c.pos, c.t),
            )
        )
        return Constraints(
            vertex=new_vertex,
            edge=self.edge,
        )

    def add_edge(self, agent: int, u: Position, v: Position, t: int) -> Constraints:
        new_edge = dict(self.edge)
        new_edge[agent] = tuple(
            sorted(
                [*list(self.edge.get(agent, ())), EdgeConstraint(agent, u, v, t)],
                key=lambda c: (c.u, c.v, c.t),
            )
        )
        return Constraints(
            vertex=self.vertex,
            edge=new_edge,
        )
