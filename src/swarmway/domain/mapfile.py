"""MovingAI `.map` parser (Section 7.7).

Pure: accepts the file text (str) and returns a Grid. No I/O, no
printing. Raises :class:`MapError` with a precise message on any
structural problem.
"""

from __future__ import annotations

from swarmway.domain.grid import (
    DEFAULT_BLOCKED_CHARS,
    DEFAULT_PASSABLE_CHARS,
    Grid,
)


class MapError(ValueError):
    """Raised when a `.map` file is structurally invalid."""


def _parse_header_line(lines: list[str], index: int, prefix: str) -> int:
    if index >= len(lines):
        msg = f"missing header line '{prefix} <value>'"
        raise MapError(msg)
    line = lines[index]
    if not line.startswith(prefix + ' '):
        msg = f"expected header line '{prefix} <value>', got {line!r}"
        raise MapError(msg)
    try:
        return int(line.split()[1])
    except (IndexError, ValueError) as exc:
        msg = f'invalid {prefix} value in header line {line!r}'
        raise MapError(msg) from exc


def parse_map(
    text: str,
    passable_chars: frozenset[str] = DEFAULT_PASSABLE_CHARS,
    blocked_chars: frozenset[str] = DEFAULT_BLOCKED_CHARS,
) -> Grid:
    """Parse `.map` text into a :class:`Grid`.

    Expected layout::

        type octile
        height <h>
        width <w>
        map
        <h rows of w ASCII characters>

    Any character outside ``passable_chars | blocked_chars`` is a loader
    error (never silently coerced).

    Read normalization: the text is split with :meth:`str.splitlines`,
    which handles CRLF and drops a trailing newline, so every vendored
    ``.map`` file (which ends with a single ``\\n``) round-trips
    byte-identically through :meth:`Grid.serialize`.
    """
    lines = text.splitlines()
    if len(lines) < 4:
        msg = f'.map file too short: {len(lines)} line(s), need header + map'
        raise MapError(msg)
    if lines[0] != 'type octile':
        msg = f"bad .map header: expected 'type octile', got {lines[0]!r}"
        raise MapError(msg)
    if lines[3] != 'map':
        msg = f"bad .map header: expected 'map' separator, got {lines[3]!r}"
        raise MapError(msg)

    height = _parse_header_line(lines, 1, 'height')
    width = _parse_header_line(lines, 2, 'width')

    rows = lines[4 : 4 + height]
    if len(rows) != height:
        msg = f'.map declares height {height} but provides {len(rows)} row(s)'
        raise MapError(msg)

    allowed = passable_chars | blocked_chars
    for y, row in enumerate(rows):
        if len(row) != width:
            msg = f'.map row {y} has length {len(row)}, expected {width}'
            raise MapError(msg)
        for x, ch in enumerate(row):
            if ch not in allowed:
                msg = (
                    f'.map row {y} col {x}: unknown character {ch!r}; '
                    f'passable={sorted(passable_chars)}, blocked={sorted(blocked_chars)}'
                )
                raise MapError(msg)

    return Grid(
        width=width,
        height=height,
        rows=tuple(rows),
        passable_chars=passable_chars,
        blocked_chars=blocked_chars,
    )
