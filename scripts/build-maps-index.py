"""Build the curated map registry ``data/maps/maps.index.json``.

Deterministic output, sorted by map id. Reads the vendored maps under
``data/maps/`` and their paired scenario files under ``data/scenarios/``.

This adds ``scripts/build-maps-index.py`` (under ``scripts/``) and
regenerates ``data/maps/maps.index.json`` (under ``data/maps/``); both
locations are implied by the Section 12 folder structure, so no
docs/decisions addendum is required.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import TypedDict

MAPS_DIR = Path('data/maps')
SCEN_DIR = Path('data/scenarios')
OUT = MAPS_DIR / 'maps.index.json'


class MapEntry(TypedDict):
    id: str
    name: str
    family: str
    width: int
    height: int
    map_file: str
    scenario_file: str | None
    scenario_count: int | None


class Registry(TypedDict):
    version: int
    maps: list[MapEntry]


FAMILY_BY_PREFIX = {
    'empty': 'empty',
    'random': 'random',
    'maze': 'maze',
    'room': 'room',
    'warehouse': 'warehouse',
    'ht_': 'game',
}

HUMAN_NAMES = {
    'empty-16-16': 'Empty 16x16',
    'random-32-32-10': 'Random 32x32 (density 10)',
    'random-32-32-20': 'Random 32x32 (density 20)',
    'maze-32-32-2': 'Maze 32x32',
    'room-32-32-4': 'Room 32x32',
    'warehouse-10-20-10-2-1': 'Warehouse 10-20-10 (2-1)',
    'ht_chantry': 'ht_chantry (DAO game map)',
}


def family_for(map_id: str) -> str:
    for prefix, family in FAMILY_BY_PREFIX.items():
        if map_id.startswith(prefix):
            return family
    return 'unknown'


def build() -> Registry:
    map_entries: list[MapEntry] = []
    for map_path in sorted(MAPS_DIR.glob('*.map')):
        map_id = map_path.stem
        scen_files = sorted(SCEN_DIR.glob(f'{map_id}-even-*.scen'))
        scenario_file: str | None = None
        scenario_count: int | None = None
        if scen_files:
            scenario_file = f'data/scenarios/{scen_files[0].name}'
            scenario_count = len(scen_files)
        # First line of the .map is 'type octile'; second 'height'; third
        # 'width'. Parse them directly to avoid importing domain here.
        header = map_path.read_text(encoding='utf-8').splitlines()
        height_match = re.search(r'\d+', header[1])
        width_match = re.search(r'\d+', header[2])
        if height_match is None or width_match is None:
            msg = f'cannot parse dimensions from {map_path}'
            raise ValueError(msg)
        height = int(height_match.group())
        width = int(width_match.group())
        map_entries.append(
            MapEntry(
                id=map_id,
                name=HUMAN_NAMES.get(map_id, map_id),
                family=family_for(map_id),
                width=width,
                height=height,
                map_file=f'data/maps/{map_path.name}',
                scenario_file=scenario_file,
                scenario_count=scenario_count,
            )
        )
    map_entries.sort(key=lambda m: m['id'])
    return Registry(version=1, maps=map_entries)


def main() -> int:
    registry = build()
    OUT.write_text(json.dumps(registry, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {OUT} with {len(registry["maps"])} maps')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
