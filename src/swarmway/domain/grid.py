"""Grid model and passability (Section 7.2).

Pure: no I/O, no printing. Takes geometry + rows in, answers passability
queries. (0,0) is top-left; x = column, y = row.
"""

from __future__ import annotations

from dataclasses import dataclass, field

Position = tuple[int, int]

DEFAULT_PASSABLE_CHARS = frozenset({'.', 'G', 'S', 'W'})
DEFAULT_BLOCKED_CHARS = frozenset({'@', 'O', 'T'})


@dataclass(frozen=True)
class Grid:
    width: int
    height: int
    rows: tuple[str, ...]
    passable_chars: frozenset[str] = field(default_factory=lambda: DEFAULT_PASSABLE_CHARS)
    blocked_chars: frozenset[str] = field(default_factory=lambda: DEFAULT_BLOCKED_CHARS)

    def __post_init__(self) -> None:
        if self.width <= 0 or self.height <= 0:
            msg = f'grid dimensions must be positive, got {self.width}x{self.height}'
            raise ValueError(msg)
        if len(self.rows) != self.height:
            msg = f'grid declares height {self.height} but has {len(self.rows)} rows'
            raise ValueError(msg)
        for y, row in enumerate(self.rows):
            if len(row) != self.width:
                msg = f'row {y} has length {len(row)}, expected {self.width}'
                raise ValueError(msg)
        overlap = self.passable_chars & self.blocked_chars
        if overlap:
            msg = f'characters cannot be both passable and blocked: {sorted(overlap)}'
            raise ValueError(msg)

    def passable(self, p: Position) -> bool:
        """True if p is in-bounds and its cell char is in the passable set."""
        x, y = p
        if not (0 <= x < self.width and 0 <= y < self.height):
            return False
        return self.rows[y][x] in self.passable_chars

    def blocked(self, p: Position) -> bool:
        """True if p is out-of-bounds or its cell char is in the blocked set."""
        x, y = p
        if not (0 <= x < self.width and 0 <= y < self.height):
            return True
        return self.rows[y][x] in self.blocked_chars

    def char_at(self, p: Position) -> str:
        x, y = p
        return self.rows[y][x]

    def passable_count(self) -> int:
        return sum(1 for row in self.rows for ch in row if ch in self.passable_chars)

    def char_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for row in self.rows:
            for ch in row:
                counts[ch] = counts.get(ch, 0) + 1
        return counts

    def serialize(self) -> str:
        """Canonical text: rows joined by ``\\n`` with a trailing ``\\n``.

        Parsers normalize on read via :meth:`str.splitlines` (handles CRLF
        and strips a trailing newline), so ``parse_map(text).serialize()``
        is byte-identical to any vendored ``.map`` file, which all end with
        a single ``\\n``.
        """
        return '\n'.join(self.rows) + '\n'
