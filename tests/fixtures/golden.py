"""Committed golden expectations for the seven Section 10.1 curated maps.

Derived once from the real vendored files under ``data/`` and hardcoded
here so golden tests assert against a fixed record rather than re-deriving
expectations at runtime (Section 14 Phase 1 test requirements).
"""

from __future__ import annotations

from typing import Final

_Golden = tuple[
    int,  # width
    int,  # height
    int,  # passable cell count
    dict[str, int],  # per-character counts
    tuple[tuple[int, int, int, int], ...],  # first three (sx, sy, gx, gy)
]

GOLDEN: Final[dict[str, _Golden]] = {
    'empty-16-16': (
        16,
        16,
        256,
        {'.': 256},
        ((10, 8, 8, 5), (9, 11, 0, 1), (13, 10, 8, 11)),
    ),
    'random-32-32-10': (
        32,
        32,
        922,
        {'.': 922, '@': 102},
        ((30, 5, 28, 14), (23, 18, 23, 27), (16, 6, 1, 20)),
    ),
    'random-32-32-20': (
        32,
        32,
        819,
        {'.': 819, '@': 204, 'T': 1},
        ((20, 5, 22, 3), (12, 14, 14, 19), (9, 1, 14, 14)),
    ),
    'maze-32-32-2': (
        32,
        32,
        666,
        {'.': 666, '@': 358},
        ((17, 21, 15, 16), (23, 23, 10, 19), (1, 20, 8, 2)),
    ),
    'room-32-32-4': (
        32,
        32,
        682,
        {'.': 682, '@': 342},
        ((9, 1, 29, 21), (31, 22, 5, 23), (17, 6, 17, 1)),
    ),
    'warehouse-10-20-10-2-1': (
        161,
        63,
        5699,
        {'.': 5699, 'T': 4444},
        ((69, 39, 139, 11), (57, 7, 147, 37), (120, 43, 58, 36)),
    ),
    'ht_chantry': (
        162,
        141,
        7461,
        {'.': 7461, '@': 13750, 'T': 1631},
        ((91, 31, 72, 124), (127, 62, 89, 100), (74, 25, 45, 25)),
    ),
}
