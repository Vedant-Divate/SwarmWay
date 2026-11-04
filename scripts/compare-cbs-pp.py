"""Phase-5 preview of the Phase-7 benchmark harness (Sections 10.1-10.4).

Runs three arms over the curated MovingAI cells of Section 10.1 and
prints a markdown comparison table:

    cbs          - CBS with default options (optimal for sum-of-costs)
    pp-fixed     - prioritized planning, agent-index order
    pp-best-of-8 - prioritized planning, 8 seeded shuffles, seed 42

This is a PREVIEW, not the final artifact: it writes NO files, creates
no ``bench/`` package and produces no run id. The printed table is
pasted into the Phase 5 verification gate (``docs/verification/phase-5.md``).

Honest reporting rules of Section 10.6 apply: timeouts are failures,
never dropped, and are counted next to the solved/unsat counts.

Usage:
    uv run python scripts/compare-cbs-pp.py           # two smallest rungs
    uv run python scripts/compare-cbs-pp.py --full    # whole Section 10.1 ladder
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from swarmway.domain import build_instance_from_lines, parse_map, parse_scen
from swarmway.solver import run_solver

MAPS_INDEX = Path('data/maps/maps.index.json')

# Section 10.1: curated benchmark set (map -> agent rungs, first-k of the
# "even" scenario).
CURATED_CELLS: tuple[tuple[str, tuple[int, ...]], ...] = (
    ('empty-16-16', (5, 10, 20, 40)),
    ('random-32-32-10', (5, 10, 20, 40)),
    ('random-32-32-20', (5, 10, 20)),
    ('maze-32-32-2', (5, 10, 20)),
    ('room-32-32-4', (5, 10, 20)),
    ('warehouse-10-20-10-2-1', (5, 10, 20, 40)),
    ('ht_chantry', (5, 10, 20)),
)

# The two smallest rungs of every curated map are the Phase-5 default.
DEFAULT_RUNGS = (5, 10)

BUDGET_MS = 60_000  # Section 10.1: 60 s per (instance, solver).

ARM_CBS = 'cbs'
ARM_PP_FIXED = 'pp-fixed'
ARM_PP_BEST = 'pp-best-of-8'
ARMS = (ARM_CBS, ARM_PP_FIXED, ARM_PP_BEST)


def _load_index() -> dict[str, dict[str, Any]]:
    data = json.loads(MAPS_INDEX.read_text(encoding='utf-8'))
    entries: dict[str, dict[str, Any]] = {}
    for entry in data.get('maps', []):
        entries[entry['id']] = entry
    return entries


def _load_instance(map_id: str, agents: int) -> Any:
    entry = _load_index()[map_id]
    grid = parse_map(Path(entry['map_file']).read_text(encoding='utf-8'))
    scen_lines = parse_scen(Path(entry['scenario_file']).read_text(encoding='utf-8'))
    instance, errors = build_instance_from_lines(grid, f'{map_id}.map', scen_lines, agents)
    if errors:
        msg = '; '.join(f'agent {e.agent_id}: {e.message}' for e in errors)
        raise SystemExit(f'error: invalid instance for {map_id} k={agents}: {msg}')
    assert instance is not None
    return instance


def _run_arm(arm: str, instance: Any) -> dict[str, Any]:
    """Run one arm on one instance; returns the measured row fields.

    ``runtime_ms`` times the solve loop only (Section 10.2), separately
    from validation and serialization.
    """
    if arm == ARM_CBS:
        solver_name, options, seed = 'cbs', {}, None
    elif arm == ARM_PP_FIXED:
        solver_name, options, seed = 'pp-fixed', {}, None
    else:
        solver_name, options, seed = 'pp-best-of-n', {'orderings': 8}, 42
    t0 = time.perf_counter()
    run = run_solver(solver_name, instance, BUDGET_MS, options=options, seed=seed)
    runtime_ms = (time.perf_counter() - t0) * 1000.0
    outcome = run.outcome
    solution = outcome.solution
    return {
        'status': outcome.status,
        'soc': solution.soc if solution is not None else None,
        'makespan': solution.makespan if solution is not None else None,
        'runtime_ms': runtime_ms,
    }


def _git_describe() -> str:
    try:
        proc = subprocess.run(
            ['git', 'describe', '--always', '--dirty'],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return 'unknown'
    return proc.stdout.strip() or 'unknown'


def _ram_gb() -> str:
    try:
        import ctypes

        class MemoryStatusEx(ctypes.Structure):
            _fields_ = [
                ('dwLength', ctypes.c_ulong),
                ('dwMemoryLoad', ctypes.c_ulong),
                ('ullTotalPhys', ctypes.c_ulonglong),
                ('ullAvailPhys', ctypes.c_ulonglong),
                ('ullTotalPageFile', ctypes.c_ulonglong),
                ('ullAvailPageFile', ctypes.c_ulonglong),
                ('ullTotalVirtual', ctypes.c_ulonglong),
                ('ullAvailVirtual', ctypes.c_ulonglong),
                ('ullAvailExtendedVirtual', ctypes.c_ulonglong),
            ]

        status = MemoryStatusEx()
        status.dwLength = ctypes.sizeof(MemoryStatusEx)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
        return f'{status.ullTotalPhys / 1e9:.1f} GB'
    except Exception:  # pragma: no cover - environment dependent
        return 'unknown'


def _environment_line() -> str:
    cpu = platform.processor() or os.environ.get('PROCESSOR_IDENTIFIER', 'unknown')
    return (
        f'environment: python {platform.python_implementation()} {platform.python_version()} | '
        f'platform {platform.platform()} | cpu {cpu} | ram {_ram_gb()} | '
        f'git {_git_describe()} | date {datetime.now(UTC).isoformat(timespec="seconds")} | '
        f'command {" ".join(sys.argv)}'
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog='compare-cbs-pp',
        description='Phase-5 preview: CBS vs prioritized planning on curated cells.',
    )
    parser.add_argument(
        '--full',
        action='store_true',
        help='run the whole Section 10.1 ladder (not required for the Phase 5 gate)',
    )
    args = parser.parse_args(argv)

    cells: list[tuple[str, int]] = []
    for map_id, rungs in CURATED_CELLS:
        selected = rungs if args.full else tuple(r for r in rungs if r in DEFAULT_RUNGS)
        for agents in selected:
            cells.append((map_id, agents))

    print(_environment_line())
    print(
        f'cells: {len(cells)} | arms: {", ".join(ARMS)} | '
        f'budget: {BUDGET_MS // 1000}s per (instance, solver) | scenario: even, first-k'
    )
    print()
    print('| map | agents | arm | status | soc | makespan | runtime_ms | soc gap vs CBS |')
    print('| --- | --- | --- | --- | --- | --- | --- | --- |')

    counts: dict[str, dict[str, int]] = {arm: {} for arm in ARMS}
    gap_violations = 0

    for map_id, agents in cells:
        instance = _load_instance(map_id, agents)
        cbs_row: dict[str, Any] | None = None
        for arm in ARMS:
            row = _run_arm(arm, instance)
            status_counts = counts[arm]
            status_counts[row['status']] = status_counts.get(row['status'], 0) + 1
            if arm == ARM_CBS:
                cbs_row = row
                gap = '-'
            else:
                gap = '-'
                if (
                    cbs_row is not None
                    and cbs_row['status'] == 'solved'
                    and row['status'] == 'solved'
                ):
                    gap = str(row['soc'] - cbs_row['soc'])
                    if row['soc'] < cbs_row['soc']:
                        gap_violations += 1
            print(
                f'| {map_id} | {agents} | {arm} | {row["status"]} | '
                f'{row["soc"] if row["soc"] is not None else "-"} | '
                f'{row["makespan"] if row["makespan"] is not None else "-"} | '
                f'{row["runtime_ms"]:.1f} | {gap} |'
            )

    print()
    print('Counts (timeouts are failures, never dropped):')
    print()
    print('| arm | solved | unsat | timeout | error | total | success rate |')
    print('| --- | --- | --- | --- | --- | --- | --- |')
    for arm in ARMS:
        arm_counts = counts[arm]
        solved = arm_counts.get('solved', 0)
        unsat = arm_counts.get('unsat', 0)
        timeout = arm_counts.get('timeout', 0)
        error = arm_counts.get('error', 0)
        total = solved + unsat + timeout + error
        rate = f'{solved / total * 100:.1f}%' if total else '-'
        print(f'| {arm} | {solved} | {unsat} | {timeout} | {error} | {total} | {rate} |')
    print()
    print(
        f'dominance check: {gap_violations} row(s) where PP SoC < CBS SoC '
        f'(must be 0 — CBS is optimal for sum-of-costs)'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
