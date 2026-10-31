"""On-demand fetcher for the full MovingAI MAPF benchmark sets.

Curated maps + first even scenario are vendored in `data/` (Phase 0, task 4).
This script fetches the remaining sets on demand:

  uv run python scripts/fetch-maps.py            # everything (maps + even scen)
  uv run python scripts/fetch-maps.py --maps     # all .map files only
  uv run python scripts/fetch-maps.py --scen     # all even .scen files only

Sources:
  https://movingai.com/benchmarks/mapf/mapf-map.zip            (all maps, ~73K)
  https://movingai.com/benchmarks/mapf/mapf-scen-even.zip      (all even scen, ~9.9M)

Writes into `data/maps/` and `data/scenarios/`, skipping files that already
exist so re-runs are cheap. See docs/data-attribution.md for licence/attribution.
"""

from __future__ import annotations

import argparse
import io
import os
import zipfile
from urllib.request import Request, urlopen

BASE = 'https://movingai.com/benchmarks/mapf/'

MAPS_ZIP = BASE + 'mapf-map.zip'
SCEN_EVEN_ZIP = BASE + 'mapf-scen-even.zip'

MAPS_DIR = os.path.join('data', 'maps')
SCEN_DIR = os.path.join('data', 'scenarios')


def fetch(url: str) -> bytes:
    req = Request(url, headers={'User-Agent': 'swarmway-fetch-maps/1.0'})
    with urlopen(req, timeout=120) as resp:
        return resp.read()


def extract_zip(url: str, dest: str, suffix: str, only_missing: bool = True) -> int:
    os.makedirs(dest, exist_ok=True)
    data = fetch(url)
    count = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            base = os.path.basename(name)
            if not base.endswith(suffix):
                continue
            out = os.path.join(dest, base)
            if only_missing and os.path.exists(out):
                continue
            with open(out, 'wb') as f:
                f.write(z.read(name))
            count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description='Fetch MovingAI MAPF data on demand')
    parser.add_argument('--maps', action='store_true', help='fetch all .map files only')
    parser.add_argument('--scen', action='store_true', help='fetch all even .scen files only')
    args = parser.parse_args()

    want_maps = args.maps or not (args.maps or args.scen)
    want_scen = args.scen or not (args.maps or args.scen)

    total = 0
    if want_maps:
        total += extract_zip(MAPS_ZIP, MAPS_DIR, '.map')
    if want_scen:
        total += extract_zip(SCEN_EVEN_ZIP, SCEN_DIR, '-even.scen')
    print(f'fetched {total} files')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
