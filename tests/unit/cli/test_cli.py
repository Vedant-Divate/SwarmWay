"""Tests for the ``swarmway`` CLI (Section 7.5).

Covers ``parse`` (unchanged from Phase 1) and the new ``solve`` subcommand.
main() returns exit codes; stdout/stderr are captured via pytest capsys.
"""

from __future__ import annotations

from swarmway.cli.main import main


def _run(args):
    return main(args)


def test_cli_solve_valid_instance(capsys) -> None:
    code = _run(
        [
            'solve',
            '--map',
            'data/maps/empty-16-16.map',
            '--scenario',
            'even',
            '--agents',
            '5',
            '--budget-ms',
            '10000',
        ]
    )
    assert code == 0
    out = capsys.readouterr().out
    assert 'status: solved' in out
    assert 'soc:' in out
    assert 'makespan:' in out
    assert 'VALIDITY: VALID' in out
    assert 'runtime_ms:' in out
    assert 'ct_expanded:' in out


def test_cli_solve_unknown_solver_exit_2(capsys) -> None:
    code = _run(
        [
            'solve',
            '--map',
            'data/maps/empty-16-16.map',
            '--scenario',
            'even',
            '--agents',
            '5',
            '--solver',
            'pp',
        ]
    )
    assert code == 2


def test_cli_solve_agent_count_out_of_range_exit_2(capsys) -> None:
    code = _run(
        [
            'solve',
            '--map',
            'data/maps/empty-16-16.map',
            '--scenario',
            'even',
            '--agents',
            '99999',
        ]
    )
    assert code == 2


def test_cli_parse_unchanged(capsys) -> None:
    code = _run(
        [
            'parse',
            '--map',
            'data/maps/random-32-32-10.map',
        ]
    )
    assert code == 0
    out = capsys.readouterr().out
    assert 'id: random-32-32-10' in out
    assert 'total passable cells:' in out
