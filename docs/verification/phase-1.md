# Phase 1 verification — Domain layer: maps, grids, scenarios

## What was built

`src/swarmway/domain/` scope exactly as Phase 1 specifies (nothing more):

- `grid.py` — immutable `Grid(width, height, rows)` with configurable
  passable/blocked character sets (ADR-0007 defaults: passable
  `{'.', 'G', 'S', 'W'}`, blocked `{'@', 'O', 'T'}`), passability
  queries, char counts, serialization.
- `mapfile.py` — strict MovingAI `.map` parser (header `type octile` /
  `height` / `width` / `map`, exact row count/length, unknown-character
  loader error).
- `scenfile.py` — `.scen` parser (`version 1` header, 9 tab-separated
  fields, `bucket` ignored, `optimal_length` treated as cross-check only).
- `instance.py` — `Agent`, `Instance`, per-error `ValidationError`
  validation (out of bounds, blocked cell, duplicate starts/goals, start
  != goal), and first-k instance construction with `.scen` cross-validation
  (map-path basename, map-width/height, start/goal passability).
- `domain/__init__.py` — public exports only (no `conflicts.py`,
  `constraints.py`, `schemas.py` — those belong to later phases).

Tests under `tests/unit/domain/` mirroring `src/swarmway/domain/`, plus
golden/malformed fixtures under `tests/fixtures/`.

Map registry: `scripts/build-maps-index.py` regenerates
`data/maps/maps.index.json` (versioned schema, sorted by id) for all 7
Section 10.1 curated maps.

CLI: `swarmway parse --map <path> [--scen <path>]` printing the census
(map id, dims, passable cells, per-character counts; plus scenario row
count and first 5 agent pairs with `--scen`).

## Commands run and output (abbreviated, real)

Quality gates (the `make verify` steps run directly via `uv run`; `make`
is unavailable on this Windows workstation):

```
$ uv run ruff check .
All checks passed!

$ uv run ruff format --check .
43 files already formatted

$ uv run mypy src/swarmway/domain src/swarmway/solver
Success: no issues found in 6 source files

$ uv run pytest -q
.................................................... [100%]
42 passed in 0.59s
```

(The default profile excludes `tests/slow/`; no `.skip`/`.left`.)

Exit-criterion command — `uv run swarmway parse --map
data/maps/random-32-32-10.map`:

```
map: data\maps\random-32-32-10.map
id: random-32-32-10
width x height: 32 x 32
total passable cells: 922
per-character counts: .: 922, @: 102
```

ht_chantry census (closes the A-1 evidence trail, showing its `T` count;
no `W`/`S` present):

```
map: data\maps\ht_chantry.map
id: ht_chantry
width x height: 162 x 141
total passable cells: 7461
per-character counts: .: 7461, @: 13750, T: 1631
```

Full test run (`pytest -v`, domain suite):

```
============================= test session starts =============================
platform win32 -- Python 3.12.15, pytest-9.2.0, pluggy-1.7.0
rootdir: C:\Users\Vedant\Desktop\Github\SwarmWay
configfile: pyproject.toml
plugins: anyio-4.15.1, hypothesis-6.170.14, ...
collecting ... collected 41 items
tests/unit/domain/test_grid.py::test_grid_defaults PASSED                [  2%]
tests/unit/domain/test_grid.py::test_grid_passable_blocked PASSED        [  4%]
tests/unit/domain/test_grid.py::test_grid_passable_count_and_char_counts PASSED [  7%]
tests/unit/domain/test_grid.py::test_grid_serialization_round_trip PASSED [  9%]
tests/unit/domain/test_grid.py::test_grid_rejects_bad_dimensions PASSED  [ 12%]
tests/unit/domain/test_grid.py::test_grid_rejects_wrong_row_count PASSED [ 14%]
tests/unit/domain/test_grid.py::test_grid_rejects_wrong_row_length PASSED [ 17%]
tests/unit/domain/test_grid.py::test_grid_rejects_overlapping_passable_blocked PASSED [ 19%]
tests/unit/domain/test_instance.py::test_valid_instance_passes PASSED    [ 21%]
tests/unit/domain/test_instance.py::test_out_of_bounds_start_and_goal PASSED [ 24%]
tests/unit/domain/test_instance.py::test_start_on_blocked_cell PASSED    [ 26%]
tests/unit/domain/test_instance.py::test_duplicate_starts PASSED        [ 29%]
tests/unit/domain/test_instance.py::test_start_equals_goal_of_another_agent_is_allowed PASSED [ 31%]
tests/unit/domain/test_instance.py::test_build_instance_from_lines_first_k PASSED [ 34%]
tests/unit/domain/test_instance.py::test_build_instance_scen_basename_mismatch PASSED [ 36%]
tests/unit/domain/test_instance.py::test_build_instance_scen_dims_mismatch PASSED [ 39%]
tests/unit/domain/test_instance.py::test_build_instance_scen_start_on_blocked_cell PASSED [ 41%]
tests/unit/domain/test_instance.py::test_first_k_instance_validates_for_all_k[empty-16-16] PASSED [ 43%]
tests/unit/domain/test_instance.py::test_first_k_instance_validates_for_all_k[ht_chantry] PASSED [ 46%]
tests/unit/domain/test_instance.py::test_first_k_instance_validates_for_all_k[random-32-32-10] PASSED [ 48%]
tests/unit/domain/test_instance.py::test_hypothesis_random_instance_validation PASSED [ 51%]
tests/unit/domain/test_mapfile.py::test_golden_parse_every_vendored_map[empty-16-16] PASSED [ 53%]
tests/unit/domain/test_mapfile.py::test_golden_parse_every_vendored_map[ht_chantry] PASSED [ 56%]
tests/unit/domain/test_mapfile.py::test_golden_parse_every_vendored_map[maze-32-32-2] PASSED [ 58%]
tests/unit/domain/test_mapfile.py::test_golden_parse_every_vendored_map[random-32-32-10] PASSED [ 60%]
tests/unit/domain/test_mapfile.py::test_golden_parse_every_vendored_map[random-32-32-20] PASSED [ 63%]
tests/unit/domain/test_mapfile.py::test_golden_parse_every_vendored_map[room-32-32-4] PASSED [ 65%]
tests/unit/domain/test_mapfile.py::test_golden_parse_every_vendored_map[warehouse-10-20-10-2-1] PASSED [ 68%]
tests/unit/domain/test_mapfile.py::test_golden_round_trip_byte_identical_every_map PASSED [ 70%]
tests/unit/domain/test_mapfile.py::test_bad_header_rejected PASSED       [ 73%]
tests/unit/domain/test_mapfile.py::test_short_row_rejected PASSED       [ 75%]
tests/unit/domain/test_mapfile.py::test_row_count_mismatch_rejected PASSED [ 78%]
tests/unit/domain/test_mapfile.py::test_unknown_character_rejected PASSED [ 80%]
tests/unit/domain/test_mapfile.py::test_hypothesis_round_trip_byte_identical PASSED [ 82%]
tests/unit/domain/test_scenfile.py::test_parse_scen_header_and_fields[empty-16-16] PASSED [ 85%]
tests/unit/domain/test_scenfile.py::test_parse_scen_header_and_fields[ht_chantry] PASSED [ 87%]
tests/unit/domain/test_scenfile.py::test_parse_scen_header_and_fields[random-32-32-10] PASSED [ 90%]
tests/unit/domain/test_scenfile.py::test_scen_bad_header_rejected PASSED [ 92%]
tests/unit/domain/test_scenfile.py::test_scen_empty_rejected PASSED      [ 95%]
tests/unit/domain/test_scenfile.py::test_scen_wrong_field_count_rejected PASSED [ 97%]
tests/unit/domain/test_scenfile.py::test_scen_non_numeric_field_rejected PASSED [100%]

============================= 41 passed in 0.58s ==============================
```

Round-trip property (parse -> serialize byte-identical, hypothesis fast
profile `max_examples=25`) passes on generated grids and on every vendored
map (`test_hypothesis_round_trip_byte_identical`,
`test_golden_round_trip_byte_identical_every_map`).

Every first-k instance validates for all k up to each vendored scen file's
row count (`test_first_k_instance_validates_for_all_k` for
empty-16-16, ht_chantry, random-32-32-10).

## maps.index.json contents

```json
{
  "version": 1,
  "maps": [
    {
      "id": "empty-16-16",
      "name": "Empty 16x16",
      "family": "empty",
      "width": 16,
      "height": 16,
      "map_file": "data/maps/empty-16-16.map",
      "scenario_file": "data/scenarios/empty-16-16-even-1.scen",
      "scenario_count": 1
    },
    {
      "id": "ht_chantry",
      "name": "ht_chantry (DAO game map)",
      "family": "game",
      "width": 162,
      "height": 141,
      "map_file": "data/maps/ht_chantry.map",
      "scenario_file": "data/scenarios/ht_chantry-even-1.scen",
      "scenario_count": 1
    },
    {
      "id": "maze-32-32-2",
      "name": "Maze 32x32",
      "family": "maze",
      "width": 32,
      "height": 32,
      "map_file": "data/maps/maze-32-32-2.map",
      "scenario_file": "data/scenarios/maze-32-32-2-even-1.scen",
      "scenario_count": 1
    },
    {
      "id": "random-32-32-10",
      "name": "Random 32x32 (density 10)",
      "family": "random",
      "width": 32,
      "height": 32,
      "map_file": "data/maps/random-32-32-10.map",
      "scenario_file": "data/scenarios/random-32-32-10-even-1.scen",
      "scenario_count": 1
    },
    {
      "id": "random-32-32-20",
      "name": "Random 32x32 (density 20)",
      "family": "random",
      "width": 32,
      "height": 32,
      "map_file": "data/maps/random-32-32-20.map",
      "scenario_file": "data/scenarios/random-32-32-20-even-1.scen",
      "scenario_count": 1
    },
    {
      "id": "room-32-32-4",
      "name": "Room 32x32",
      "family": "room",
      "width": 32,
      "height": 32,
      "map_file": "data/maps/room-32-32-4.map",
      "scenario_file": "data/scenarios/room-32-32-4-even-1.scen",
      "scenario_count": 1
    },
    {
      "id": "warehouse-10-20-10-2-1",
      "name": "Warehouse 10-20-10 (2-1)",
      "family": "warehouse",
      "width": 161,
      "height": 63,
      "map_file": "data/maps/warehouse-10-20-10-2-1.map",
      "scenario_file": "data/scenarios/warehouse-10-20-10-2-1-even-1.scen",
      "scenario_count": 1
    }
  ]
}
```

## Manual check

- `uv run swarmway parse --map data/maps/random-32-32-10.map` prints the
  census (exit criterion met).
- `uv run swarmway parse --map data/maps/ht_chantry.map` reports
  `per-character counts: .: 7461, @: 13750, T: 1631` — this is the final
  A-1 evidence: `ht_chantry` contains `T` (blocked), and no `W`/`S`/`G`/`O`
  appear in any curated map. **A-1 is closed.**
- No `src/swarmway/solver/`, no `domain/schemas.py`,
  `domain/constraints.py`, or `domain/conflicts.py` were created (all
  belong to later phases).
- `api/` unchanged beyond the existing health endpoint; `frontend/`
  unchanged beyond the Part A spike.

## Deviations from PROJECT.md

- `scripts/build-maps-index.py` and the regenerated
  `data/maps/maps.index.json` use a schema with `version`/`maps` entries
  including `map_file`/`scenario_file`/`scenario_count` (the Phase 1
  prompt's schema). Both `scripts/` and `data/maps/` are implied by the
  Section 12 structure, so no docs/decisions addendum is required per the
  Section 12 structure-only rule.
- `uv run swarmway` now dispatches to `swarmway.cli.main:main` (entry
  point moved from `swarmway:main`); `swarmway/__init__.py::main`
  delegates to it.
- No docs/questions.md entries were needed during Phase 1; all parsing and
  validation behavior is settled by Sections 7.2/7.7 and ADR-0007.

## Commits in this phase

- 8928cf9 docs(decisions): add ADR-0004 (pure-Python solver) and ADR-0005 (trace v1 contract)
- 63a6055 feat(domain): add grid, mapfile, scenfile, and instance models
- a6dfb5e test(domain): add golden, malformed, and property tests
- 33f3226 feat(data): add build-maps-index script and regenerate maps.index.json
- f6ad935 feat(cli): add parse command with map census

Exit criteria met: `uv run swarmway parse --map
data/maps/random-32-32-10.map` prints the census; all tests green (42
passed); A-1 evidence closed via ht_chantry's `T: 1631` count.
docs/verification/phase-1.md written. Do not start Phase 2.
