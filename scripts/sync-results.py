"""Copy a benchmark run's summary + environment into the frontend (Section 10.5).

Copies ``data/results/<run-id>/summary.json`` and
``data/results/<run-id>/environment.json`` into
``frontend/public/benchmarks/`` so the static Benchmarks page can render
them with no backend. Defaults to the latest run by timestamp; use
``--run-id`` to pick a specific run. Prints what it copied.

Usage:
    uv run python scripts/sync-results.py                 # latest run
    uv run python scripts/sync-results.py --run-id <run-id>
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

RESULTS_DIR = Path('data/results')
FRONTEND_BENCHMARKS = Path('frontend/public/benchmarks')


def _run_id_mtime(run_dir: Path) -> float:
    return run_dir.stat().st_mtime


def _latest_run_id() -> str | None:
    if not RESULTS_DIR.exists():
        return None
    dirs = [d for d in RESULTS_DIR.iterdir() if d.is_dir() and (d / 'summary.json').exists()]
    if not dirs:
        return None
    return max(dirs, key=_run_id_mtime).name


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog='sync-results',
        description='Sync a benchmark run summary + environment into the frontend.',
    )
    parser.add_argument(
        '--run-id',
        help='run-id to sync (default: latest by timestamp)',
    )
    args = parser.parse_args(argv)

    run_id = args.run_id or _latest_run_id()
    if run_id is None:
        print('error: no benchmark runs found in data/results/', file=sys.stderr)
        return 2

    run_dir = RESULTS_DIR / run_id
    summary_src = run_dir / 'summary.json'
    env_src = run_dir / 'environment.json'
    if not summary_src.exists():
        print(f'error: {summary_src} not found', file=sys.stderr)
        return 2
    if not env_src.exists():
        print(f'error: {env_src} not found', file=sys.stderr)
        return 2

    FRONTEND_BENCHMARKS.mkdir(parents=True, exist_ok=True)
    shutil.copy2(summary_src, FRONTEND_BENCHMARKS / 'summary.json')
    shutil.copy2(env_src, FRONTEND_BENCHMARKS / 'environment.json')

    # A small provenance file so the frontend can show the reproduce context.
    provenance = {
        'run_id': run_id,
        'synced_utc': datetime.now(UTC).isoformat(timespec='seconds'),
        'source': str(run_dir),
    }
    (FRONTEND_BENCHMARKS / 'provenance.json').write_text(
        json.dumps(provenance, indent=2) + '\n', encoding='utf-8'
    )

    print(f'synced run {run_id} -> {FRONTEND_BENCHMARKS}/')
    print('  summary.json')
    print('  environment.json')
    print('  provenance.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
