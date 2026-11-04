"""Bundle curated solver traces into the frontend (Section 11.5).

Copies trace JSON files into ``frontend/public/traces/`` so the static SPA
can replay them offline. Idempotent: re-running only copies when the
destination differs from the source, and never touches frontend source
code.

Each curated trace carries a one-line story label (Section 11.1 gallery
style), printed by this script.

Usage:
    uv run python scripts/bundle-traces.py                    # print the curated manifest
    uv run python scripts/bundle-traces.py path/to/trace.json # bundle one trace
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

TRACES_DIR = Path('frontend/public/traces')

# One-line story labels for the curated bundled traces (Section 11.1).
STORIES: dict[str, str] = {
    'deep-tree-cbs.json': (
        'Deep constraint tree on random-32-32-10 (20 agents): CBS expands '
        'many nodes resolving corridor contention before reaching the goal.'
    ),
    'many-conflict-cbs.json': (
        'Many conflicts on warehouse-10-20-10 (20 agents): repeated '
        'contention forces several constraint-tree replans.'
    ),
}


def main(argv: list[str] | None = None) -> int:
    TRACES_DIR.mkdir(parents=True, exist_ok=True)
    sources = list(argv or sys.argv[1:])
    if not sources:
        sources = [str(TRACES_DIR / name) for name in STORIES]
    copied: list[str] = []
    for src in sources:
        src_path = Path(src)
        if not src_path.exists():
            print(f'error: source trace not found: {src_path}', file=sys.stderr)
            return 2
        dst = TRACES_DIR / src_path.name
        if not dst.exists() or dst.read_bytes() != src_path.read_bytes():
            shutil.copy2(src_path, dst)
            copied.append(dst.name)
    print(f'bundled {len(copied)} trace(s) into {TRACES_DIR}')
    for name in sorted(STORIES):
        if (TRACES_DIR / name).exists():
            print(f'  {name}: {STORIES[name]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
