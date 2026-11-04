"""Bench harness unit tests (Section 10, Phase 7 task 6).

Zero real solves: the fake solver returns canned outcomes in milliseconds.
Covers run-id formatting, artifact shapes (results.csv / summary.json /
table.md), timeout counting in success-rate denominators, skip-row
behaviour, the validity-abort path (fake solver returns an invalid
solution once), and the CSV diff utility (identical statuses pass, a
changed SoC fails, runtime differences ignored).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from swarmway.bench import runner as runner_mod
from swarmway.bench.artifacts import environment_record, run_id_from, write_run
from swarmway.bench.metrics import aggregate_arm, aggregate_cell, diff_csv
from swarmway.bench.runner import ArmSpec, CellResult, RunResult, run_config
from swarmway.domain import Agent, Grid, Instance
from swarmway.domain.solution import Solution, SolveOutcome, SolveStats
from swarmway.solver import SolverRun


def _fake_instance() -> Instance:
    """2-cell grid, one agent (0,0)->(1,0)."""
    grid = Grid(width=2, height=1, rows=('..',))
    return Instance(grid=grid, agents=(Agent(0, (0, 0), (1, 0)),))


def _valid_solution() -> Solution:
    """Valid single-agent solution: cost 1, makespan 1, padded to 2."""
    return Solution(paths=(((0, 0), (1, 0)),), soc=1, makespan=1)


def _invalid_solution() -> Solution:
    """Solved with a lie: soc 5 on a cost-1 path (fails V-SOC)."""
    return Solution(paths=(((0, 0), (1, 0)),), soc=5, makespan=1)


def _fake_solver(status='solved', soc=1, makespan=1):
    def fake(name, instance, budget_ms, options, seed, recorder=None):
        solution = None
        if status == 'solved':
            solution = Solution(paths=(((0, 0), (1, 0)),), soc=soc, makespan=makespan)
        return SolverRun(
            outcome=SolveOutcome(
                status=status,
                solution=solution,
                stats=SolveStats(ct_expanded=1, ct_generated=1, low_level_expansions=1),
            ),
            notes=(),
            seed=None,
            options={},
        )

    return fake


def _cell_result(
    solver='cbs',
    status='solved',
    soc=1,
    makespan=1,
    runtime_ms=10.0,
    validity='valid',
    map_id='empty-16-16',
    agents=5,
) -> CellResult:
    return CellResult(
        map_id=map_id,
        agents=agents,
        solver=solver,
        status=status,
        soc=soc,
        makespan=makespan,
        runtime_ms=runtime_ms,
        ct_expanded=1,
        ct_generated=1,
        low_level_expansions=1,
        validity=validity,
    )


# ---------------------------------------------------------------------------
# run_id
# ---------------------------------------------------------------------------


def test_run_id_format() -> None:
    rid = run_id_from('headline')
    assert rid.endswith('-headline'), rid
    prefix = rid[: -len('-headline')]
    date, time_, rest = prefix.split('-', 2)
    assert len(date) == 8 and date.isdigit()
    assert len(time_) == 4 and time_.isdigit()
    assert rest  # git describe short-sha (may include -dirty suffix)


# ---------------------------------------------------------------------------
# aggregate / metrics
# ---------------------------------------------------------------------------


def test_aggregate_arm_success_rate_counts_timeout_in_denominator() -> None:
    rows = [
        _cell_result(status='solved', soc=10),
        _cell_result(status='timeout'),
        _cell_result(status='timeout'),
        _cell_result(status='unsat'),
    ]
    agg = aggregate_arm(rows)
    assert agg.total == 4
    assert agg.solved == 1
    assert agg.timeout == 2
    assert agg.unsat == 1
    assert agg.success_rate == pytest.approx(0.25)
    assert agg.median_soc == 10.0
    assert agg.median_soc_solved_count == 1


def test_aggregate_arm_median_excludes_unsolved_and_prints_count() -> None:
    rows = [
        _cell_result(status='solved', soc=5, runtime_ms=1.0),
        _cell_result(status='solved', soc=9, runtime_ms=3.0),
        _cell_result(status='timeout'),
        _cell_result(status='unsat'),
    ]
    agg = aggregate_arm(rows)
    assert agg.median_soc == 7.0
    assert agg.median_soc_solved_count == 2
    assert agg.median_runtime_ms == 2.0
    assert agg.median_runtime_solved_count == 2


def test_aggregate_arm_all_unsolved_median_none() -> None:
    rows = [_cell_result(status='timeout'), _cell_result(status='unsat')]
    agg = aggregate_arm(rows)
    assert agg.solved == 0
    assert agg.success_rate == 0.0
    assert agg.median_soc is None
    assert agg.median_soc_solved_count == 0
    assert agg.median_runtime_ms is None
    assert agg.median_runtime_solved_count == 0


def test_aggregate_cell_groups_by_solver() -> None:
    rows = [
        _cell_result(solver='cbs', status='solved', soc=10),
        _cell_result(solver='pp-fixed', status='timeout'),
    ]
    agg = aggregate_cell(rows)
    assert set(agg) == {'cbs', 'pp-fixed'}
    assert agg['cbs'].solved == 1
    assert agg['pp-fixed'].timeout == 1


# ---------------------------------------------------------------------------
# diff_csv
# ---------------------------------------------------------------------------


def _write_csv(tmp_path: Path, name: str, text: str) -> Path:
    p = tmp_path / name
    p.write_text(text, encoding='utf-8')
    return p


def test_diff_csv_identical_ignores_runtime_and_run_id(tmp_path) -> None:
    base = (
        'run_id,map,agents,solver,status,soc,makespan,runtime_ms,'
        'ct_expanded,ct_generated,low_level_expansions,validity,reason\n'
        'RUN-A,empty-16-16,5,cbs,solved,66,22,999.0,1,1,71,valid,\n'
    )
    a = _write_csv(tmp_path, 'a.csv', base)
    b = _write_csv(
        tmp_path,
        'b.csv',
        base.replace('RUN-A', 'RUN-B').replace('999.0', '42.0'),
    )
    identical, messages = diff_csv(str(a), str(b))
    assert identical is True
    assert messages == []


def test_diff_csv_changed_soc_fails(tmp_path) -> None:
    base = (
        'run_id,map,agents,solver,status,soc,makespan,runtime_ms,'
        'ct_expanded,ct_generated,low_level_expansions,validity,reason\n'
        'RUN-A,empty-16-16,5,cbs,solved,66,22,1.0,1,1,71,valid,\n'
    )
    a = _write_csv(tmp_path, 'a.csv', base)
    b = _write_csv(
        tmp_path,
        'b.csv',
        base.replace('solved,66,22', 'solved,67,22'),
    )
    identical, messages = diff_csv(str(a), str(b))
    assert identical is False
    assert any('soc' in m or '67' in m for m in messages)


# ---------------------------------------------------------------------------
# run_config end-to-end (fake solver)
# ---------------------------------------------------------------------------


def _install_fakes(monkeypatch, solver_status='solved', soc=1, makespan=1):
    monkeypatch.setattr(
        runner_mod,
        '_load_instance',
        lambda map_id, agents, scenario: _fake_instance(),
    )
    monkeypatch.setattr(
        runner_mod,
        'run_solver',
        _fake_solver(solver_status, soc, makespan),
    )


def test_run_config_writes_all_artifacts(tmp_path, monkeypatch) -> None:
    _install_fakes(monkeypatch)
    config = {
        'label': 'smoke',
        'budget_ms': 1000,
        'scenario': 'even',
        'arms': [
            {'name': 'cbs', 'options': {}, 'seed': None},
            {'name': 'pp-fixed', 'options': {}, 'seed': None},
        ],
        'cells': [{'map': 'empty-16-16', 'agents': [5]}],
    }
    run_result = run_config(config)
    results = run_result.results
    aborted = run_result.aborted
    assert aborted is False
    assert len(results) == 2
    assert all(r.status == 'solved' for r in results)
    assert all(r.soc == 1 for r in results)

    run_dir = tmp_path / 'run'
    write_run(
        run_dir,
        config,
        environment_record('swarmway bench'),
        RunResult(results=tuple(results), aborted=False),
    )
    names = {p.name for p in run_dir.iterdir()}
    assert {'config.yaml', 'environment.json', 'results.csv', 'summary.json', 'table.md'} <= names

    csv_text = (run_dir / 'results.csv').read_text(encoding='utf-8')
    lines = [line for line in csv_text.splitlines() if line.strip()]
    assert len(lines) == 3  # header + 2 rows
    summary = json.loads((run_dir / 'summary.json').read_text(encoding='utf-8'))
    assert summary['run_id'] == 'run'
    assert summary['aborted'] is False
    assert len(summary['cells']) == 1
    assert summary['cells'][0]['map'] == 'empty-16-16'
    assert summary['cells'][0]['agents'] == 5
    assert summary['cells'][0]['arms']['cbs']['solved'] == 1
    assert summary['cells'][0]['arms']['cbs']['success_rate'] == 1.0
    assert summary['cells'][0]['arms']['cbs']['median_soc'] == 1.0
    table = (run_dir / 'table.md').read_text(encoding='utf-8')
    assert '| map | agents | arm | status | soc | makespan | runtime_ms |' in table


def test_run_config_aborts_on_invalid_solution(tmp_path, monkeypatch) -> None:
    _install_fakes(monkeypatch, solver_status='solved', soc=5, makespan=1)
    config = {
        'label': 'abort',
        'budget_ms': 1000,
        'scenario': 'even',
        'arms': [{'name': 'cbs', 'options': {}, 'seed': None}],
        'cells': [{'map': 'empty-16-16', 'agents': [5]}],
    }
    run_result = run_config(config)
    results = run_result.results
    aborted = run_result.aborted
    assert aborted is True
    assert any(r.status == 'aborted' for r in results)
    assert any('invalid solution' in r.reason for r in results)


def test_run_config_skip_row_for_missing_map(monkeypatch) -> None:
    monkeypatch.setattr(
        runner_mod,
        '_load_instance',
        lambda map_id, agents, scenario: (_ for _ in ()).throw(
            KeyError(f'map {map_id!r} not in data/maps/maps.index.json')
        ),
    )
    config = {
        'label': 'skip',
        'budget_ms': 1000,
        'scenario': 'even',
        'arms': [{'name': 'cbs', 'options': {}, 'seed': None}],
        'cells': [{'map': 'no-such-map', 'agents': [5]}],
    }
    run_result = run_config(config)
    results = run_result.results
    aborted = run_result.aborted
    assert aborted is False
    assert len(results) == 1
    assert results[0].status == 'skipped'
    assert results[0].reason
    assert 'no-such-map' in results[0].reason


def test_environment_record_shape() -> None:
    env = environment_record('swarmway bench --config bench/default.yaml')
    assert env['python_implementation']
    assert env['python_version']
    assert env['platform']
    assert env['cpu']
    assert env['git_describe']
    assert env['date_utc']
    assert env['command_line'] == 'swarmway bench --config bench/default.yaml'


def test_arm_spec_defaults() -> None:
    arm = ArmSpec(name='cbs')
    assert arm.options == {}
    assert arm.seed is None
