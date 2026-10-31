"""``swarmway`` command line interface (Section 7.5).

I/O lives here: the CLI reads map/scen files from disk and hands the text
to the pure :mod:`swarmway.domain` parsers. Only ``cli/`` writes to
stdout; domain modules never print.

Exit codes: 0 success, 2 invalid input, 3 internal error.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from swarmway.domain import (
    Grid,
    MapError,
    ScenError,
    build_instance_from_lines,
    parse_map,
    parse_scen,
)


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding='utf-8')
    except OSError as exc:
        print(f'error: cannot read {path}: {exc}', file=sys.stderr)
        sys.exit(2)


def _census(grid: Grid, map_id: str, origin: str) -> list[str]:
    lines: list[str] = []
    lines.append(f'map: {origin}')
    lines.append(f'id: {map_id}')
    lines.append(f'width x height: {grid.width} x {grid.height}')
    lines.append(f'total passable cells: {grid.passable_count()}')
    counts = ', '.join(f'{ch}: {n}' for ch, n in sorted(grid.char_counts().items()))
    lines.append(f'per-character counts: {counts}')
    return lines


def _scen_census(lines, grid: Grid, map_id: str) -> list[str]:
    out: list[str] = []
    out.append(f'scenario rows: {len(lines)}')
    out.append('first 5 agent pairs:')
    for line in lines[:5]:
        start = (line.start_x, line.start_y)
        goal = (line.goal_x, line.goal_y)
        out.append(f'  {start} -> {goal}')
    return out


def run_parse(map_path: Path, scen_path: Path | None) -> int:
    map_id = map_path.stem
    text = _read_text(map_path)
    try:
        grid = parse_map(text)
    except MapError as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 2

    for line in _census(grid, map_id, str(map_path)):
        print(line)

    if scen_path is not None:
        scen_text = _read_text(scen_path)
        try:
            scen_lines = parse_scen(scen_text)
        except ScenError as exc:
            print(f'error: {exc}', file=sys.stderr)
            return 2
        map_name = f'{map_id}.map'
        instance, errors = build_instance_from_lines(grid, map_name, scen_lines, len(scen_lines))
        if errors:
            for err in errors:
                where = f'agent {err.agent_id} ' if err.agent_id is not None else ''
                print(
                    f'error: {where}{err.field}: {err.message}',
                    file=sys.stderr,
                )
            return 2
        assert instance is not None
        for line in _scen_census(scen_lines, grid, map_id):
            print(line)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog='swarmway')
    sub = parser.add_subparsers(dest='command', required=True)

    p_parse = sub.add_parser('parse', help='parse a map and print a census')
    p_parse.add_argument('--map', required=True, help='path to a .map file')
    p_parse.add_argument('--scen', help='optional path to a .scen file')

    args = parser.parse_args(argv)

    if args.command == 'parse':
        return run_parse(Path(args.map), Path(args.scen) if args.scen else None)

    parser.print_help(sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
