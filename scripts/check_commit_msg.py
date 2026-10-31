"""Enforce conventional commit subject lines (pre-commit commit-msg hook).

Usage: python scripts/check_commit_msg.py <commit-msg-file>
"""

from __future__ import annotations

import re
import sys

TYPES = 'build|ci|docs|feat|fix|perf|refactor|style|test|chore'
SCOPE = r'[a-z0-9-]+'
PATTERN = re.compile(rf'^({TYPES})\(({SCOPE})\): [^.\s].{{0,70}}$')


def main() -> int:
    if len(sys.argv) < 2:
        print('commit-msg: missing message file argument', file=sys.stderr)
        return 1
    with open(sys.argv[1], encoding='utf-8') as fh:
        lines = fh.read().strip().splitlines()
    subject = lines[0] if lines else ''
    if not PATTERN.match(subject):
        print(f'commit-msg: invalid subject: {subject!r}', file=sys.stderr)
        print(
            "commit-msg: expected '<type>(<scope>): <short imperative summary>' "
            '(<=72 chars, no trailing period)',
            file=sys.stderr,
        )
        print(f'commit-msg: valid types: {TYPES}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
