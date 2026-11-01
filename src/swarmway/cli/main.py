"""``swarmway`` command line interface (Section 7.5).

I/O lives here: the CLI reads map/scen files from disk and hands the text
to the pure :mod:`swarmway.domain` parsers. Only ``cli/`` writes to
stdout; domain modules never print.

Exit codes: 0 success, 2 invalid input, 3 internal error.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from swarmway.domain import (
    Grid,
    MapError,
    ScenError,
    build_instance_from_lines,
    parse_map,
    parse_scen,
)
from swarmway.solver.cbs import solve
from swarmway.solver.validity import ValidityError, check

MAPS_INDEX = Path('data/maps/maps.index.json')


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


def _load_map_index() -> dict:
    try:
        return json.loads(MAPS_INDEX.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        print(f'error: cannot read map index {MAPS_INDEX}: {exc}', file=sys.stderr)
        sys.exit(2)


def run_solve(map_path: Path, scenario: str, agents: int, solver: str, budget_ms: int) -> int:
    if solver != 'cbs':
        print(f'error: unknown solver {solver!r}; only "cbs" is available', file=sys.stderr)
        return 2
    if scenario != 'even':
        print(f'error: unknown scenario {scenario!r}; only "even" is available', file=sys.stderr)
        return 2

    map_id = map_path.stem
    text = _read_text(map_path)
    try:
        grid = parse_map(text)
    except MapError as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 2

    index = _load_map_index()
    entry = None
    for m in index.get('maps', []):
        if m.get('id') == map_id:
            entry = m
            break
    if entry is None:
        print(f'error: map {map_id!r} not found in {MAPS_INDEX}', file=sys.stderr)
        return 2
    scenario_file = entry.get('scenario_file')
    if not scenario_file:
        print(f'error: no scenario file for map {map_id!r}', file=sys.stderr)
        return 2

    scen_text = _read_text(Path(scenario_file))
    try:
        scen_lines = parse_scen(scen_text)
    except ScenError as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 2
    if agents < 1 or agents > len(scen_lines):
        print(
            f'error: agent count {agents} out of range (1..{len(scen_lines)})',
            file=sys.stderr,
        )
        return 2

    instance, errors = build_instance_from_lines(grid, f'{map_id}.map', scen_lines, agents)
    if errors:
        for err in errors:
            where = f'agent {err.agent_id} ' if err.agent_id is not None else ''
            print(
                f'error: {where}{err.field}: {err.message}',
                file=sys.stderr,
            )
        return 2
    assert instance is not None

    t0 = time.perf_counter()
    outcome = solve(instance, budget_ms)
    runtime_ms = (time.perf_counter() - t0) * 1000.0

    print(f'status: {outcome.status}')
    print(f'agents: {len(instance.agents)}')
    if outcome.solution is not None:
        print(f'soc: {outcome.solution.soc}')
        print(f'makespan: {outcome.solution.makespan}')
        try:
            validity = check(outcome.solution, instance)
        except ValidityError as exc:
            print(f'VALIDITY: INVALID ({exc})', file=sys.stderr)
            return 3
        print(f'VALIDITY: {validity}')
    else:
        print('soc: -')
        print('makespan: -')
    print(f'runtime_ms: {runtime_ms:.1f}')
    print(f'ct_expanded: {outcome.stats.ct_expanded}')
    print(f'ct_generated: {outcome.stats.ct_generated}')
    print(f'low_level_expansions: {outcome.stats.low_level_expansions}')
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog='swarmway')
    sub = parser.add_subparsers(dest='command', required=True)

    p_parse = sub.add_parser('parse', help='parse a map and print a census')
    p_parse.add_argument('--map', required=True, help='path to a .map file')
    p_parse.add_argument('--scen', help='optional path to a .scen file')

    p_solve = sub.add_parser('solve', help='solve a map instance with CBS')
    p_solve.add_argument('--map', required=True, help='path to a .map file')
    p_solve.add_argument('--scenario', default='even', help='scenario family (only "even")')
    p_solve.add_argument(
        '--agents', required=True, type=int, help='number of agents (first k from scenario)'
    )
    p_solve.add_argument('--solver', default='cbs', help='solver to use (only "cbs")')
    p_solve.add_argument(
        '--budget-ms', type=int, default=10000, help='solve budget in milliseconds'
    )

    args = parser.parse_args(argv)

    if args.command == 'parse':
        return run_parse(Path(args.map), Path(args.scen) if args.scen else None)
    if args.command == 'solve':
        return run_solve(Path(args.map), args.scenario, args.agents, args.solver, args.budget_ms)

    parser.print_help(sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
