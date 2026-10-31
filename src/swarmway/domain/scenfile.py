"""MovingAI `.scen` parser (Section 7.7).

Pure: accepts the file text (str) and returns scenario records. No I/O,
no printing. Raises :class:`ScenError` with a precise message on any
structural problem.

Cross-validation (map-path basename, map-width/height, start/goal
passability against a loaded :class:`Grid`) is performed by
:mod:`swarmway.domain.instance` once the map is available.
"""

from __future__ import annotations

from dataclasses import dataclass

FIELD_COUNT = 9


@dataclass(frozen=True)
class ScenarioLine:
    bucket: int
    map_path: str
    map_width: int
    map_height: int
    start_x: int
    start_y: int
    goal_x: int
    goal_y: int
    optimal_length: float


class ScenError(ValueError):
    """Raised when a `.scen` file is structurally invalid."""


def parse_scen(text: str) -> tuple[ScenarioLine, ...]:
    """Parse `.scen` text into a tuple of :class:`ScenarioLine`.

    Layout::

        version 1
        <bucket>\t<map-path>\t<map-width>\t<map-height>\t<start-x>\t<start-y>
        \t<goal-x>\t<goal-y>\t<optimal-length>
        ...

    The `bucket` field is ignored by the loader (it is the scenario's
    distance bucket, not an agent id). `optimal_length` is a single-agent
    shortest-path length used only as a cross-check of distance tables;
    it is never stored on an :class:`Agent` or treated as a MAPF bound.
    """
    lines = [ln for ln in text.splitlines() if ln.strip() != '']
    if not lines:
        msg = ".scen file is empty; expected a 'version 1' header"
        raise ScenError(msg)
    if lines[0] != 'version 1':
        msg = f"bad .scen header: expected 'version 1', got {lines[0]!r}"
        raise ScenError(msg)

    records: list[ScenarioLine] = []
    for lineno, line in enumerate(lines[1:], start=2):
        fields = line.split('\t')
        if len(fields) != FIELD_COUNT:
            msg = (
                f'.scen line {lineno}: expected {FIELD_COUNT} tab-separated '
                f'fields, got {len(fields)}: {line!r}'
            )
            raise ScenError(msg)
        try:
            bucket = int(fields[0])
            map_path = fields[1]
            map_width = int(fields[2])
            map_height = int(fields[3])
            start_x = int(fields[4])
            start_y = int(fields[5])
            goal_x = int(fields[6])
            goal_y = int(fields[7])
            optimal_length = float(fields[8])
        except ValueError as exc:
            msg = f'.scen line {lineno}: non-numeric field in {line!r}'
            raise ScenError(msg) from exc
        records.append(
            ScenarioLine(
                bucket=bucket,
                map_path=map_path,
                map_width=map_width,
                map_height=map_height,
                start_x=start_x,
                start_y=start_y,
                goal_x=goal_x,
                goal_y=goal_y,
                optimal_length=optimal_length,
            )
        )
    return tuple(records)
