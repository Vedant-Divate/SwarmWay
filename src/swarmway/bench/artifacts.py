"""Benchmark artifact writers (Section 10.5).

Writes, per run directory ``data/results/<run-id>/``:

* ``config.yaml``   — frozen copy of the effective config
* ``environment.json`` — Section 10.4 environment record
* ``results.csv``   — one row per run
* ``summary.json``  — aggregates (success rate, medians with counts)
* ``table.md``      — markdown table for README embedding
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import yaml  # type: ignore[import-untyped]

from swarmway.bench.metrics import aggregate_cell, results_csv_text
from swarmway.bench.runner import CellResult, RunResult


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
    except Exception:  # pragma: no cover - platform dependent
        return 'unknown'


def environment_record(command_line: str) -> dict[str, Any]:
    """Section 10.4 environment record."""
    cpu = platform.processor() or os.environ.get('PROCESSOR_IDENTIFIER', 'unknown')
    return {
        'python_implementation': platform.python_implementation(),
        'python_version': platform.python_version(),
        'platform': platform.platform(),
        'cpu': cpu,
        'ram_gb': _ram_gb(),
        'git_describe': _git_describe(),
        'date_utc': datetime.now(UTC).isoformat(timespec='seconds'),
        'command_line': command_line,
    }


def run_id_from(label: str) -> str:
    """Section 10.5 run-id: YYYYMMDD-HHMM-<short-sha>-<label>."""
    now = datetime.now(UTC)
    sha = _git_describe()
    return f'{now:%Y%m%d-%H%M}-{sha}-{label}'


def _table_md(run_id: str, results: list[CellResult]) -> str:
    lines = [
        f'# Benchmark results — run {run_id}',
        '',
        '| map | agents | arm | status | soc | makespan | runtime_ms |',
        '| --- | --- | --- | --- | --- | --- | --- |',
    ]
    for row in results:
        lines.append(
            f'| {row.map_id} | {row.agents} | {row.solver} | {row.status} | '
            f'{row.soc if row.soc is not None else "-"} | '
            f'{row.makespan if row.makespan is not None else "-"} | '
            f'{row.runtime_ms:.1f} |'
        )
    return '\n'.join(lines) + '\n'


def _summary_json(
    run_id: str,
    label: str,
    config: dict[str, Any],
    environment: dict[str, Any],
    aborted: bool,
    cells: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        'run_id': run_id,
        'label': label,
        'aborted': aborted,
        'config': config,
        'environment': environment,
        'cells': cells,
    }


def write_run(
    run_dir: Path,
    config: dict[str, Any],
    environment: dict[str, Any],
    run_result: RunResult,
) -> None:
    """Write all artifacts for a run into ``run_dir``."""
    run_dir.mkdir(parents=True, exist_ok=True)
    results = list(run_result.results)
    run_id = run_dir.name
    label = config.get('label', 'run')

    # config.yaml — frozen copy
    (run_dir / 'config.yaml').write_text(
        json.dumps(config, indent=2, sort_keys=True) + '\n', encoding='utf-8'
    )
    # NOTE: config.yaml is YAML by name but written as JSON here for
    # dependency-free output; the bench config loader accepts either.

    # environment.json
    (run_dir / 'environment.json').write_text(
        json.dumps(environment, indent=2) + '\n', encoding='utf-8'
    )

    # results.csv
    (run_dir / 'results.csv').write_text(results_csv_text(run_id, results), encoding='utf-8')

    # summary.json — aggregates per cell
    cell_agg: list[dict[str, Any]] = []
    by_cell: dict[tuple[str, int], list[CellResult]] = {}
    for row in results:
        by_cell.setdefault((row.map_id, row.agents), []).append(row)
    for (map_id, agents), rows in sorted(by_cell.items()):
        cell_agg.append(
            {
                'map': map_id,
                'agents': agents,
                'arms': {
                    solver: {
                        'status_counts': agg.status_counts,
                        'solved': agg.solved,
                        'unsat': agg.unsat,
                        'timeout': agg.timeout,
                        'error': agg.error,
                        'skipped': agg.skipped,
                        'aborted': agg.aborted,
                        'total': agg.total,
                        'success_rate': agg.success_rate,
                        'median_soc': agg.median_soc,
                        'median_soc_solved_count': agg.median_soc_solved_count,
                        'median_runtime_ms': agg.median_runtime_ms,
                        'median_runtime_solved_count': agg.median_runtime_solved_count,
                    }
                    for solver, agg in aggregate_cell(rows).items()
                },
            }
        )
    summary = _summary_json(run_id, label, config, environment, run_result.aborted, cell_agg)
    (run_dir / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')

    # table.md
    (run_dir / 'table.md').write_text(_table_md(run_id, results), encoding='utf-8')


def load_config(path: Path) -> dict[str, Any]:
    """Load a bench config YAML (JSON is also accepted)."""
    text = path.read_text(encoding='utf-8')
    return cast(dict[str, Any], yaml.safe_load(text))
