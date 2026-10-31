"""Tests for :mod:`swarmway.domain.scenfile`."""

from __future__ import annotations

from pathlib import Path

import pytest

from swarmway.domain.scenfile import ScenError, parse_scen

SCEN = Path('data/scenarios')
FIXTURES = Path('tests/fixtures/malformed')


def _read_scen(name: str) -> str:
    return (SCEN / f'{name}-even-1.scen').read_text(encoding='utf-8')


@pytest.mark.parametrize('map_id', ['empty-16-16', 'ht_chantry', 'random-32-32-10'])
def test_parse_scen_header_and_fields(map_id: str) -> None:
    records = parse_scen(_read_scen(map_id))
    assert len(records) > 0
    first = records[0]
    assert first.map_path == f'{map_id}.map'
    assert isinstance(first.bucket, int)
    assert isinstance(first.optimal_length, float)


def test_scen_bad_header_rejected() -> None:
    with pytest.raises(ScenError, match=r'bad .scen header'):
        parse_scen('not a version\n')


def test_scen_empty_rejected() -> None:
    with pytest.raises(ScenError, match='empty'):
        parse_scen('')


def test_scen_wrong_field_count_rejected() -> None:
    text = 'version 1\n0\temptymap\t16\t16\t10\t8\t8\n'
    with pytest.raises(ScenError, match='expected 9 tab-separated'):
        parse_scen(text)


def test_scen_non_numeric_field_rejected() -> None:
    text = 'version 1\n0\tm.map\t16\t16\tten\t8\t8\t5\t1.0\n'
    with pytest.raises(ScenError, match='non-numeric field'):
        parse_scen(text)
