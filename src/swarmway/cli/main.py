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
from typing import Any, cast

from swarmway.domain import (
    Agent,
    Grid,
    Instance,
    MapError,
    ScenError,
    build_instance_from_lines,
    parse_map,
    parse_scen,
)
from swarmway.domain.schemas import TraceV1
from swarmway.solver import SolverError, TraceRecorder, run_solver, solver_names
from swarmway.solver.validity import ValidityError, check

MAPS_INDEX = Path('data/maps/maps.index.json')
DEFAULT_PP_ORDERINGS = 8


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


def _scen_census(lines: tuple[Any, ...], grid: Grid, map_id: str) -> list[str]:
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


def _load_map_index() -> dict[str, Any]:
    try:
        data = json.loads(MAPS_INDEX.read_text(encoding='utf-8'))
        return cast(dict[str, Any], data)
    except (OSError, json.JSONDecodeError) as exc:
        print(f'error: cannot read map index {MAPS_INDEX}: {exc}', file=sys.stderr)
        sys.exit(2)


def run_solve(
    map_path: Path,
    scenario: str,
    agents: int,
    solver: str,
    budget_ms: int,
    emit_trace: Path | None,
    orderings: int = DEFAULT_PP_ORDERINGS,
    seed: int | None = None,
    tie_break: str = 'fifo',
) -> int:
    if solver not in solver_names():
        print(
            f'error: unknown solver {solver!r}; available: {", ".join(solver_names())}',
            file=sys.stderr,
        )
        return 2
    if scenario != 'even':
        print(f'error: unknown scenario {scenario!r}; only "even" is available', file=sys.stderr)
        return 2
    if tie_break not in ('fifo', 'conflicts', 'depth'):
        print(
            f'error: tie-break {tie_break!r} must be one of fifo, conflicts, depth',
            file=sys.stderr,
        )
        return 2
    if solver != 'cbs' and tie_break != 'fifo':
        print(
            'error: --tie-break only applies to the cbs solver',
            file=sys.stderr,
        )
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

    options: dict[str, Any] = {}
    if solver == 'cbs':
        options = {'tie_break': tie_break}
    elif solver == 'pp-best-of-n':
        options = {'orderings': orderings}
    recorder = TraceRecorder() if emit_trace is not None else None
    t0 = time.perf_counter()
    try:
        run = run_solver(solver, instance, budget_ms, options=options, seed=seed, recorder=recorder)
    except SolverError as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 2
    outcome = run.outcome
    runtime_ms = (time.perf_counter() - t0) * 1000.0
    search = recorder.finish() if recorder is not None else []

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

    if emit_trace is not None:
        from swarmway.domain.schemas import (
            AgentRef,
            ExecutionBlock,
            InstanceBlock,
            MapInfo,
            ResultBlock,
            SolverBlock,
        )

        if outcome.solution is not None:
            sol = outcome.solution
            map_block = MapInfo(
                id=map_id,
                name=map_id,
                width=instance.grid.width,
                height=instance.grid.height,
                rows=list(instance.grid.rows),
                source='movingai',
            )
            agent_blocks = [AgentRef(id=a.id, start=a.start, goal=a.goal) for a in instance.agents]
            instance_block = InstanceBlock(map=map_block, agents=agent_blocks)
            result_block = ResultBlock(
                status=outcome.status,  # type: ignore[arg-type]  # outcome.status is solved/unsat/timeout
                soc=sol.soc,
                makespan=sol.makespan,
                runtime_ms=runtime_ms,
                budget_ms=budget_ms,
                ct_expanded=outcome.stats.ct_expanded,
                ct_generated=outcome.stats.ct_generated,
                low_level_expansions=outcome.stats.low_level_expansions,
                validity='valid',
                notes=list(run.notes),
            )
            execution_block = ExecutionBlock(
                makespan=sol.makespan,
                paths=[list(p) for p in sol.paths],
            )
            trace = TraceV1(
                solver=SolverBlock(
                    name=solver,
                    options=run.options,
                    package_version='0.1.0',
                    seed=run.seed,
                ),
                instance=instance_block,
                result=result_block,
                search=search,
                execution=execution_block,
            )
        else:
            map_block = MapInfo(
                id=map_id,
                name=map_id,
                width=instance.grid.width,
                height=instance.grid.height,
                rows=list(instance.grid.rows),
                source='movingai',
            )
            agent_blocks = [AgentRef(id=a.id, start=a.start, goal=a.goal) for a in instance.agents]
            instance_block = InstanceBlock(map=map_block, agents=agent_blocks)
            result_block = ResultBlock(
                status=outcome.status,  # type: ignore[arg-type]  # outcome.status is solved/unsat/timeout
                soc=0,
                makespan=0,
                runtime_ms=runtime_ms,
                budget_ms=budget_ms,
                ct_expanded=outcome.stats.ct_expanded,
                ct_generated=outcome.stats.ct_generated,
                low_level_expansions=outcome.stats.low_level_expansions,
                validity='valid',
                notes=list(run.notes),
            )
            execution_block = ExecutionBlock(makespan=0, paths=[[]])
            trace = TraceV1(
                solver=SolverBlock(
                    name=solver,
                    options=run.options,
                    package_version='0.1.0',
                    seed=run.seed,
                ),
                instance=instance_block,
                result=result_block,
                search=search,
                execution=execution_block,
            )

        emit_trace.write_text(trace.model_dump_json(indent=2), encoding='utf-8')
        print(f'trace emitted: {emit_trace}')

    return 0


def run_replay(trace_path: Path, check_validity: bool) -> int:
    text = _read_text(trace_path)
    try:
        trace = TraceV1.model_validate_json(text)
    except Exception as exc:
        print(f'error: cannot parse trace {trace_path}: {exc}', file=sys.stderr)
        return 2

    # Rebuild the Instance from the embedded map rows + agents
    map_info = trace.instance.map
    grid = Grid(
        width=map_info.width,
        height=map_info.height,
        rows=tuple(map_info.rows),
    )
    agents = tuple(Agent(id=a.id, start=a.start, goal=a.goal) for a in trace.instance.agents)
    instance = Instance(grid=grid, agents=agents)

    if check_validity:
        # Re-run the independent validity checker on execution.paths
        from swarmway.domain.solution import Solution

        solution = Solution(
            paths=tuple(tuple(p) for p in trace.execution.paths),
            soc=trace.result.soc,
            makespan=trace.result.makespan,
        )
        try:
            validity = check(solution, instance)
        except ValidityError as exc:
            print(f'VALIDITY: INVALID ({exc})', file=sys.stderr)
            return 3
        print(f'VALIDITY: {validity}')

    print(f'trace: {trace_path}')
    print(f'status: {trace.result.status}')
    print(f'soc: {trace.result.soc}')
    print(f'makespan: {trace.result.makespan}')
    print(f'agents: {len(instance.agents)}')
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog='swarmway')
    sub = parser.add_subparsers(dest='command', required=True)

    p_parse = sub.add_parser('parse', help='parse a map and print a census')
    p_parse.add_argument('--map', required=True, help='path to a .map file')
    p_parse.add_argument('--scen', help='optional path to a .scen file')

    p_solve = sub.add_parser('solve', help='solve a map instance with CBS or prioritized planning')
    p_solve.add_argument('--map', required=True, help='path to a .map file')
    p_solve.add_argument('--scenario', default='even', help='scenario family (only "even")')
    p_solve.add_argument(
        '--agents', required=True, type=int, help='number of agents (first k from scenario)'
    )
    p_solve.add_argument(
        '--solver',
        default='cbs',
        help='solver to use (cbs, pp-fixed, pp-best-of-n)',
    )
    p_solve.add_argument(
        '--budget-ms', type=int, default=10000, help='solve budget in milliseconds'
    )
    p_solve.add_argument('--emit-trace', type=Path, help='write trace v1 JSON to this file')
    p_solve.add_argument(
        '--orderings',
        type=int,
        default=DEFAULT_PP_ORDERINGS,
        help='number of seeded orderings for pp-best-of-n (1..64)',
    )
    p_solve.add_argument(
        '--seed',
        type=int,
        default=None,
        help='seed for pp-best-of-n orderings (default 42)',
    )
    p_solve.add_argument(
        '--tie-break',
        default='fifo',
        help='CBS tie-break order for equal-cost nodes: fifo, conflicts, depth',
    )

    p_replay = sub.add_parser('replay', help='replay and validate a trace file')
    p_replay.add_argument('--trace', required=True, type=Path, help='path to trace JSON file')
    p_replay.add_argument(
        '--check', action='store_true', help='re-run the independent validity checker'
    )

    args = parser.parse_args(argv)

    if args.command == 'parse':
        return run_parse(Path(args.map), Path(args.scen) if args.scen else None)
    if args.command == 'solve':
        return run_solve(
            Path(args.map),
            args.scenario,
            args.agents,
            args.solver,
            args.budget_ms,
            args.emit_trace,
            orderings=args.orderings,
            seed=args.seed,
            tie_break=args.tie_break,
        )
    if args.command == 'replay':
        return run_replay(Path(args.trace), args.check)

    parser.print_help(sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
