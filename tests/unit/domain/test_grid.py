"""Tests for :mod:`swarmway.domain.grid`."""

from __future__ import annotations

import pytest

from swarmway.domain.grid import (
    DEFAULT_BLOCKED_CHARS,
    DEFAULT_PASSABLE_CHARS,
    Grid,
)


def test_grid_defaults() -> None:
    g = Grid(width=3, height=2, rows=('...', '.@.'))
    assert g.width == 3
    assert g.height == 2
    assert g.rows == ('...', '.@.')
    assert g.passable_chars == DEFAULT_PASSABLE_CHARS
    assert g.blocked_chars == DEFAULT_BLOCKED_CHARS


def test_grid_passable_blocked() -> None:
    g = Grid(width=3, height=3, rows=('...', '.@.', '...'))
    assert g.passable((0, 0)) is True
    assert g.passable((1, 1)) is False  # '@' blocked
    assert g.blocked((1, 1)) is True
    assert g.passable((3, 0)) is False  # out of bounds
    assert g.blocked((3, 0)) is True  # out of bounds counts as blocked


def test_grid_passable_count_and_char_counts() -> None:
    g = Grid(width=3, height=3, rows=('...', '.@.', 'S..'))
    assert g.passable_count() == 8  # seven '.' + one 'S'
    assert g.char_counts() == {'.': 7, '@': 1, 'S': 1}


def test_grid_serialization_round_trip() -> None:
    g = Grid(width=2, height=2, rows=('..', '@.'))
    assert g.serialize() == '..\n@.\n'


def test_grid_rejects_bad_dimensions() -> None:
    with pytest.raises(ValueError, match='positive'):
        Grid(width=0, height=3, rows=('', '', ''))


def test_grid_rejects_wrong_row_count() -> None:
    with pytest.raises(ValueError, match='height 3 but has 2 rows'):
        Grid(width=2, height=3, rows=('..', '..'))


def test_grid_rejects_wrong_row_length() -> None:
    with pytest.raises(ValueError, match='row 0 has length 3, expected 2'):
        Grid(width=2, height=2, rows=('...', '..'))


def test_grid_rejects_overlapping_passable_blocked() -> None:
    with pytest.raises(ValueError, match='both passable and blocked'):
        Grid(
            width=1,
            height=1,
            rows=('.'),
            passable_chars={'.', '@'},
            blocked_chars={'@', 'T'},
        )
