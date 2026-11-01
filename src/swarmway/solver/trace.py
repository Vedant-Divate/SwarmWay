"""Search-event recorder (Section 8.10).

A *pure observer*: it records the ordered root/expand/goal events that CBS
produces, but never influences search, paths, or stats. Identical solves
with recording on or off produce identical results.

The recorder caps the event stream at ``SWARMWAY_TRACE_EVENT_CAP`` (default
20 000). Beyond it, every k-th event is kept with ``search_truncated: true``
and a note, and the last 50 events plus the final goal event are always
kept.
"""

from __future__ import annotations

from typing import Any

from swarmway.domain.conflicts import EdgeConflict, VertexConflict

# Default cap, overridable via the ``cap`` argument (read from the
# ``SWARMWAY_TRACE_EVENT_CAP`` environment variable in the API layer).
DEFAULT_EVENT_CAP = 20_000
# Always keep this many trailing events plus the final goal event.
_TAIL_KEEP = 50


class TraceRecorder:
    """Records ordered search events for one solve."""

    def __init__(self, cap: int = DEFAULT_EVENT_CAP) -> None:
        self.cap = cap
        self._events: list[dict[str, Any]] = []

    # -- recording -----------------------------------------------------

    def record_root(self, node: int, cost: int) -> None:
        self._emit('root', node=node, cost=cost)

    def record_expand(
        self,
        node: int,
        parent: int,
        cost: int,
        conflict: VertexConflict | EdgeConflict,
        constraint_agent: int,
        constraint_pos: tuple[int, int] | None,
        constraint_u: tuple[int, int] | None,
        constraint_v: tuple[int, int] | None,
        constraint_t: int,
        replanned_agent: int,
        replanned_cost: int,
    ) -> None:
        if isinstance(conflict, VertexConflict):
            conflict_payload: dict[str, Any] = {
                'type': 'vertex',
                'agents': list(conflict.agents),
                'pos': list(conflict.pos),
                't': conflict.t,
            }
        else:
            conflict_payload = {
                'type': 'edge',
                'agents': list(conflict.agents),
                'u': list(conflict.u),
                'v': list(conflict.v),
                't': conflict.t,
            }
        if constraint_pos is not None:
            assert constraint_pos is not None
            constraint_payload: dict[str, Any] = {
                'agent': constraint_agent,
                'type': 'vertex',
                'pos': list(constraint_pos),
                't': constraint_t,
            }
        else:
            assert constraint_u is not None and constraint_v is not None
            constraint_payload = {
                'agent': constraint_agent,
                'type': 'edge',
                'u': list(constraint_u),
                'v': list(constraint_v),
                't': constraint_t,
            }
        self._emit(
            'expand',
            node=node,
            parent=parent,
            cost=cost,
            conflict=conflict_payload,
            constraint=constraint_payload,
            replanned_agent=replanned_agent,
            replanned_cost=replanned_cost,
        )

    def record_goal(self, node: int, cost: int) -> None:
        self._emit('goal', node=node, cost=cost)

    def _emit(self, event: str, **fields: Any) -> None:
        self._events.append({'seq': len(self._events), 'event': event, **fields})

    # -- finish --------------------------------------------------------

    def finish(self) -> list[dict[str, Any]]:
        """Return the recorded events, applying the event cap if needed.

        Beyond the cap, every k-th event is kept with
        ``search_truncated: true`` and a note; the last 50 events plus the
        final goal event are always kept. Events are re-sequenced
        sequentially from 0.
        """
        events = list(self._events)
        n = len(events)
        if n <= self.cap:
            for i, ev in enumerate(events):
                ev['seq'] = i
            return events

        keep_indices: set[int] = set(range(max(0, n - _TAIL_KEEP), n))
        for i in range(n - 1, -1, -1):
            if events[i]['event'] == 'goal':
                keep_indices.add(i)
                break
        for i in range(0, n, max(1, n // (self.cap - _TAIL_KEEP - 1))):
            keep_indices.add(i)

        kept: list[dict[str, Any]] = []
        for i in sorted(keep_indices):
            ev = dict(events[i])
            if i >= self.cap:
                ev['search_truncated'] = True
                ev['note'] = 'trace truncated: every k-th event kept'
            kept.append(ev)
        for i, ev in enumerate(kept):
            ev['seq'] = i
        return kept
