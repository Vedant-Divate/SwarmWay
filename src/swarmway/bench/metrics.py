"""Benchmark aggregation and diff utilities (Sections 10.2, 10.6).

Aggregates per (map, agents, solver) cell row into success rates and medians,
with timeouts counted in denominators and medians computed over solved runs
only, each carrying its solved-count. Provides the CSV diff used to prove
determinism across re-runs (Section 10.3).
"""

from __future__ import annotations

import csv
import io
import statistics
from dataclasses import dataclass
from typing import Any

from swarmway.bench.runner import CellResult


@dataclass(frozen=True)
class ArmAggregate:
    """Aggregated metrics for one arm on one cell."""

    status_counts: dict[str, int]
    solved: int
    unsat: int
    timeout: int
    error: int
    skipped: int
    aborted: int
    total: int
    success_rate: float  # solved / total, timeouts in denominator
    median_soc: float | None
    median_soc_solved_count: int
    median_runtime_ms: float | None
    median_runtime_solved_count: int


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    return float(statistics.median(values))


def aggregate_arm(rows: list[CellResult]) -> ArmAggregate:
    """Aggregate one arm's rows (one per cell) into summary metrics."""
    status_counts: dict[str, int] = {}
    solved_socs: list[float] = []
    solved_runtimes: list[float] = []
    for row in rows:
        status_counts[row.status] = status_counts.get(row.status, 0) + 1
        if row.status == 'solved' and row.soc is not None:
            solved_socs.append(float(row.soc))
            solved_runtimes.append(float(row.runtime_ms))
    solved = status_counts.get('solved', 0)
    unsat = status_counts.get('unsat', 0)
    timeout = status_counts.get('timeout', 0)
    error = status_counts.get('error', 0)
    skipped = status_counts.get('skipped', 0)
    aborted = status_counts.get('aborted', 0)
    total = solved + unsat + timeout + error + skipped + aborted
    success_rate = solved / total if total else 0.0
    return ArmAggregate(
        status_counts=dict(sorted(status_counts.items())),
        solved=solved,
        unsat=unsat,
        timeout=timeout,
        error=error,
        skipped=skipped,
        aborted=aborted,
        total=total,
        success_rate=success_rate,
        median_soc=_median(solved_socs),
        median_soc_solved_count=len(solved_socs),
        median_runtime_ms=_median(solved_runtimes),
        median_runtime_solved_count=len(solved_runtimes),
    )


def aggregate_cell(rows: list[CellResult]) -> dict[str, ArmAggregate]:
    """Aggregate all arms' rows for one cell."""
    by_solver: dict[str, list[CellResult]] = {}
    for row in rows:
        by_solver.setdefault(row.solver, []).append(row)
    return {solver: aggregate_arm(rs) for solver, rs in by_solver.items()}


@dataclass(frozen=True)
class CsvRow:
    run_id: str
    map_id: str
    agents: int
    solver: str
    status: str
    soc: int | None
    makespan: int | None
    runtime_ms: float
    ct_expanded: int
    ct_generated: int
    low_level_expansions: int
    validity: str
    reason: str


def _diff_ignored(row: CsvRow) -> tuple[Any, ...]:
    """Key used for diff comparison: everything except runtime_ms and run-id."""
    return (
        row.map_id,
        row.agents,
        row.solver,
        row.status,
        row.soc,
        row.makespan,
        row.ct_expanded,
        row.ct_generated,
        row.low_level_expansions,
        row.validity,
        row.reason,
    )


def diff_csv(path_a: str, path_b: str) -> tuple[bool, list[str]]:
    """Compare two results.csv files ignoring ``runtime_ms`` and ``run_id``.

    Returns ``(identical, messages)``. ``messages`` lists each differing row
    plus summary counts. Used to prove determinism across re-runs:
    statuses and SoCs must match, runtimes may drift.
    """
    rows_a = _read_csv(path_a)
    rows_b = _read_csv(path_b)
    messages: list[str] = []
    if len(rows_a) != len(rows_b):
        messages.append(f'row count differs: {len(rows_a)} vs {len(rows_b)}')
    keyed_a = {_diff_ignored(r): r for r in rows_a}
    keyed_b = {_diff_ignored(r): r for r in rows_b}
    only_a = sorted(set(keyed_a) - set(keyed_b))
    only_b = sorted(set(keyed_b) - set(keyed_a))
    for key in only_a:
        messages.append(f'in A only: {key}')
    for key in only_b:
        messages.append(f'in B only: {key}')
    identical = not messages
    return identical, messages


def _read_csv(path: str) -> list[CsvRow]:
    rows: list[CsvRow] = []
    with open(path, newline='', encoding='utf-8') as fh:
        reader = csv.DictReader(fh)
        for record in reader:
            rows.append(
                CsvRow(
                    run_id=record['run_id'],
                    map_id=record['map'],
                    agents=int(record['agents']),
                    solver=record['solver'],
                    status=record['status'],
                    soc=_opt_int(record['soc']),
                    makespan=_opt_int(record['makespan']),
                    runtime_ms=float(record['runtime_ms']),
                    ct_expanded=int(record['ct_expanded']),
                    ct_generated=int(record['ct_generated']),
                    low_level_expansions=int(record['low_level_expansions']),
                    validity=record['validity'],
                    reason=record['reason'],
                )
            )
    return rows


def _opt_int(value: str) -> int | None:
    if value == '' or value is None:
        return None
    return int(value)


def results_csv_text(run_id: str, results: list[CellResult]) -> str:
    """Render results.csv text (one row per run)."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator='\n')
    writer.writerow(
        [
            'run_id',
            'map',
            'agents',
            'solver',
            'status',
            'soc',
            'makespan',
            'runtime_ms',
            'ct_expanded',
            'ct_generated',
            'low_level_expansions',
            'validity',
            'reason',
        ]
    )
    for row in results:
        writer.writerow(
            [
                run_id,
                row.map_id,
                row.agents,
                row.solver,
                row.status,
                '' if row.soc is None else row.soc,
                '' if row.makespan is None else row.makespan,
                f'{row.runtime_ms:.3f}',
                row.ct_expanded,
                row.ct_generated,
                row.low_level_expansions,
                row.validity,
                row.reason,
            ]
        )
    return out.getvalue()
