"""Benchmark harness (Section 10).

Config-driven benchmarking of the CBS and prioritized-planning solvers over
curated MovingAI cells. Pure where possible: the runner imports only
``domain/``, ``solver/`` and the standard library, does no printing of its
own (progress lines go through a caller-supplied sink), and writes artifacts
through :mod:`swarmway.bench.artifacts`.

Public entry point: :func:`run_config`.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from swarmway.domain import Instance, build_instance_from_lines, parse_map, parse_scen
from swarmway.solver import SolverError, run_solver
from swarmway.solver.validity import ValidityError, check

MAPS_INDEX = Path('data/maps/maps.index.json')
DEFAULT_BUDGET_MS = 60_000  # Section 10.1: 60 s per (instance, solver).


@dataclass(frozen=True)
class ArmSpec:
    """One solver arm: name + options + seed (Section 10.3)."""

    name: str
    options: dict[str, Any] = field(default_factory=dict)
    seed: int | None = None


@dataclass(frozen=True)
class CellSpec:
    """One benchmark cell: a map + a list of agent counts (first-k)."""

    map_id: str
    agents: tuple[int, ...]


@dataclass(frozen=True)
class CellResult:
    """One (cell, arm) run outcome."""

    map_id: str
    agents: int
    solver: str
    status: str  # solved | unsat | timeout | error | aborted | skipped
    soc: int | None
    makespan: int | None
    runtime_ms: float
    ct_expanded: int
    ct_generated: int
    low_level_expansions: int
    validity: str  # 'valid' when solved, '' otherwise
    reason: str = ''  # skip/abort/error detail


@dataclass(frozen=True)
class RunResult:
    """One full run over a config: all cell results + abort flag."""

    results: tuple[CellResult, ...]
    aborted: bool


def _load_index() -> dict[str, dict[str, Any]]:
    data = json.loads(MAPS_INDEX.read_text(encoding='utf-8'))
    entries: dict[str, dict[str, Any]] = {}
    for entry in data.get('maps', []):
        entries[entry['id']] = entry
    return entries


def _load_instance(map_id: str, agents: int, scenario: str) -> Instance:
    """Build an Instance (first-k agents) from a vendored map + scenario."""
    index = _load_index()
    if map_id not in index:
        raise KeyError(f'map {map_id!r} not in {MAPS_INDEX}')
    entry = index[map_id]
    scenario_file = entry.get('scenario_file')
    if not scenario_file:
        raise KeyError(f'no scenario file for map {map_id!r}')
    grid = parse_map(Path(entry['map_file']).read_text(encoding='utf-8'))
    scen_lines = parse_scen(Path(scenario_file).read_text(encoding='utf-8'))
    instance, errors = build_instance_from_lines(grid, f'{map_id}.map', scen_lines, agents)
    if errors:
        msg = '; '.join(f'agent {e.agent_id}: {e.message}' for e in errors)
        raise ValueError(f'invalid instance for {map_id} k={agents}: {msg}')
    assert instance is not None
    return instance


def _arm_options(arm: ArmSpec) -> dict[str, Any]:
    options = dict(arm.options)
    if arm.name == 'pp-best-of-n':
        options.setdefault('orderings', 8)
        if arm.seed is not None:
            options['seed'] = arm.seed
    return options


def run_cell(
    instance: Instance,
    arms: tuple[ArmSpec, ...],
    budget_ms: int,
    sink: Callable[[str], None] = print,
) -> tuple[tuple[CellResult, ...], bool]:
    """Run every arm on one cell.

    Returns ``(results, aborted)``. ``aborted`` is True when a solved
    solution failed the independent validity check — a harness bug; the
    caller must stop the run and persist whatever partial state exists.
    """
    results: list[CellResult] = []
    for arm in arms:
        solver_name = arm.name
        options = _arm_options(arm)
        seed = arm.seed
        sink(f'  {solver_name} ... ')
        t0 = time.perf_counter()
        try:
            run = run_solver(solver_name, instance, budget_ms, options=options, seed=seed)
        except SolverError as exc:
            runtime_ms = (time.perf_counter() - t0) * 1000.0
            results.append(
                CellResult(
                    map_id='',
                    agents=0,
                    solver=solver_name,
                    status='error',
                    soc=None,
                    makespan=None,
                    runtime_ms=runtime_ms,
                    ct_expanded=0,
                    ct_generated=0,
                    low_level_expansions=0,
                    validity='',
                    reason=str(exc),
                )
            )
            sink(f'error ({exc})\n')
            continue
        runtime_ms = (time.perf_counter() - t0) * 1000.0
        outcome = run.outcome
        solution = outcome.solution
        stats = outcome.stats

        if outcome.status == 'solved' and solution is not None:
            # Independent validity check OUTSIDE the timed region (Section 8.9).
            try:
                check(solution, instance)
            except ValidityError as exc:
                # Harness bug: an invalid solution must never be recorded.
                results.append(
                    CellResult(
                        map_id='',
                        agents=0,
                        solver=solver_name,
                        status='aborted',
                        soc=None,
                        makespan=None,
                        runtime_ms=runtime_ms,
                        ct_expanded=stats.ct_expanded,
                        ct_generated=stats.ct_generated,
                        low_level_expansions=stats.low_level_expansions,
                        validity='',
                        reason=f'invalid solution: {exc}',
                    )
                )
                sink(f'ABORTED (invalid solution: {exc})\n')
                return tuple(results), True
            validity_str = 'valid'
        else:
            validity_str = ''

        results.append(
            CellResult(
                map_id='',
                agents=0,
                solver=solver_name,
                status=outcome.status,
                soc=solution.soc if solution is not None else None,
                makespan=solution.makespan if solution is not None else None,
                runtime_ms=runtime_ms,
                ct_expanded=stats.ct_expanded,
                ct_generated=stats.ct_generated,
                low_level_expansions=stats.low_level_expansions,
                validity=validity_str,
            )
        )
        sink(f'{outcome.status} ({runtime_ms:.0f} ms)\n')
    return tuple(results), False


def run_config(config: dict[str, Any], sink: Callable[[str], None] = print) -> RunResult:
    """Run one full benchmark config cell by cell.

    ``config`` keys:
      label, budget_ms, scenario, arms (list of ArmSpec dicts),
      cells (list of {map, agents: [...]})
    """
    budget_ms = int(config.get('budget_ms', DEFAULT_BUDGET_MS))
    scenario = config.get('scenario', 'even')
    arms = tuple(ArmSpec(**a) for a in config.get('arms', []))
    cells_cfg = config.get('cells', [])

    all_results: list[CellResult] = []
    aborted = False

    for cell_cfg in cells_cfg:
        map_id = cell_cfg['map']
        agent_counts = tuple(int(a) for a in cell_cfg.get('agents', []))
        cell_scenario = cell_cfg.get('scenario', scenario)
        for agents in agent_counts:
            sink(f'{map_id} k={agents}:')
            try:
                instance = _load_instance(map_id, agents, cell_scenario)
            except (KeyError, ValueError) as exc:
                # Explicit skip row — never a silent omission (Section 10.6 #2).
                for arm in arms:
                    all_results.append(
                        CellResult(
                            map_id=map_id,
                            agents=agents,
                            solver=arm.name,
                            status='skipped',
                            soc=None,
                            makespan=None,
                            runtime_ms=0.0,
                            ct_expanded=0,
                            ct_generated=0,
                            low_level_expansions=0,
                            validity='',
                            reason=str(exc),
                        )
                    )
                sink(f'  skipped ({exc})\n')
                continue

            cell_results, cell_aborted = run_cell(instance, arms, budget_ms, sink=sink)
            # Tag results with cell identity.
            tagged = [
                CellResult(
                    map_id=map_id,
                    agents=agents,
                    solver=r.solver,
                    status=r.status,
                    soc=r.soc,
                    makespan=r.makespan,
                    runtime_ms=r.runtime_ms,
                    ct_expanded=r.ct_expanded,
                    ct_generated=r.ct_generated,
                    low_level_expansions=r.low_level_expansions,
                    validity=r.validity,
                    reason=r.reason,
                )
                for r in cell_results
            ]
            all_results.extend(tagged)
            if cell_aborted:
                aborted = True
                sink(f'aborting run after cell {map_id} k={agents}\n')
                return RunResult(results=tuple(all_results), aborted=True)

    return RunResult(results=tuple(all_results), aborted=aborted)
