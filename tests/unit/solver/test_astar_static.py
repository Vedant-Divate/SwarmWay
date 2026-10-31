"""Tests for :mod:`swarmway.solver.astar_static`.

Reverse-BFS true-distance tables: exact on unit-cost 4-connected grids,
one table per distinct goal, cached per instance.
"""

from __future__ import annotations

from swarmway.domain.grid import Grid
from swarmway.solver.astar_static import INF, DistanceCache, reverse_bfs_distances, true_distance


def _grid(rows: tuple[str, ...]) -> Grid:
    return Grid(width=len(rows[0]), height=len(rows), rows=rows)


def test_reverse_bfs_empty_grid() -> None:
    g = _grid(('....', '....', '....'))
    table = reverse_bfs_distances(g, (2, 2))
    # Manhattan-ish distances on the open 4-connected grid equal true
    # distance (no obstacles). Goal itself is 0.
    assert table.dist[(2, 2)] == 0
    assert table.dist[(0, 0)] == 4
    assert table.dist[(2, 0)] == 2
    assert table.dist[(0, 2)] == 2


def test_reverse_bfs_obstacle_blocks_unreachable() -> None:
    # Middle column blocked; left side cannot reach right side.
    g = _grid(('.@.', '.@.', '.@.'))
    table = reverse_bfs_distances(g, (2, 0))
    assert (0, 0) not in table.dist  # unreachable -> treated as INF
    assert table.dist[(2, 0)] == 0
    assert table.dist[(2, 1)] == 1
    assert table.dist[(2, 2)] == 2


def test_cache_shares_table_per_goal() -> None:
    g = _grid(('....', '....'))
    cache = DistanceCache()
    t1 = cache.get(g, (1, 1))
    t2 = cache.get(g, (1, 1))
    assert t1 is t2  # same goal -> same table object
    assert cache.get(g, (0, 0)) is not t1  # different goal -> new table


def test_true_distance_unreachable_is_inf() -> None:
    g = _grid(('.@.', '.@.', '.@.'))
    cache = DistanceCache()
    assert true_distance(g, cache, (0, 0), (2, 0)) == INF
    assert true_distance(g, cache, (2, 2), (2, 0)) == 2
