"""Tests for :mod:`swarmway.domain.mapfile`.

Golden parses assert against the committed :data:`tests.fixtures.golden.GOLDEN`
record (derived once from the real vendored files), not against values
re-derived at runtime.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from swarmway.domain.grid import Grid
from swarmway.domain.mapfile import MapError, parse_map
from tests.fixtures import golden

FIXTURES = Path('tests/fixtures/malformed')
MAPS = Path('data/maps')


def _read(name: str) -> str:
    return (MAPS / f'{name}.map').read_text(encoding='utf-8')


@pytest.mark.parametrize('map_id', sorted(golden.GOLDEN))
def test_golden_parse_every_vendored_map(map_id: str) -> None:
    expected = golden.GOLDEN[map_id]
    width, height, passable_count, char_counts, _agents = expected
    grid = parse_map(_read(map_id))
    assert isinstance(grid, Grid)
    assert grid.width == width
    assert grid.height == height
    assert grid.passable_count() == passable_count
    assert grid.char_counts() == char_counts


def test_golden_round_trip_byte_identical_every_map() -> None:
    for map_id in sorted(golden.GOLDEN):
        text = _read(map_id)
        grid = parse_map(text)
        # The map data block is everything after the "map" separator line.
        data_block = '\n'.join(text.splitlines()[4:]) + '\n'
        assert grid.serialize() == data_block


def test_bad_header_rejected() -> None:
    text = (FIXTURES / 'bad_header.map').read_text(encoding='utf-8')
    with pytest.raises(MapError, match=r'bad .map header'):
        parse_map(text)


def test_short_row_rejected() -> None:
    text = (FIXTURES / 'short_row.map').read_text(encoding='utf-8')
    with pytest.raises(MapError, match='row 2 has length 3, expected 5'):
        parse_map(text)


def test_row_count_mismatch_rejected() -> None:
    text = (FIXTURES / 'row_count_mismatch.map').read_text(encoding='utf-8')
    with pytest.raises(MapError, match='declares height 5 but provides 2 row'):
        parse_map(text)


def test_unknown_character_rejected() -> None:
    text = (FIXTURES / 'unknown_char.map').read_text(encoding='utf-8')
    with pytest.raises(MapError, match="unknown character 'X'"):
        parse_map(text)


@given(
    width=st.integers(min_value=1, max_value=12),
    height=st.integers(min_value=1, max_value=12),
    rows=st.lists(
        st.text(
            alphabet=st.sampled_from(['.', '@', 'G', 'S', 'W', 'T', 'O']),
            min_size=1,
            max_size=12,
        ),
        min_size=1,
        max_size=12,
    ),
)
def test_hypothesis_round_trip_byte_identical(width: int, height: int, rows: list[str]) -> None:
    # Force every row to exactly `width` chars by truncating/padding.
    normalized = [(row[:width] + '.' * width)[:width] for row in rows[:height]]
    while len(normalized) < height:
        normalized.append('.' * width)
    text = f'type octile\nheight {height}\nwidth {width}\nmap\n' + '\n'.join(normalized) + '\n'
    grid = parse_map(text)
    assert grid.serialize() == '\n'.join(normalized) + '\n'
    assert grid.width == width
    assert grid.height == height
