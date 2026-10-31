# ADR-0007: Map passability set — `.` `G` `S` `W` passable, `@` `O` `T` blocked (resolves A-1)

- Status: accepted
- Date: 2026-10-31
- Phase: 0

## Context

Assumption A-1 (Section 4): MovingAI `.map` passable characters. Format page
says `.` `G` `S` (swamp) `W` (water) passable/traversable; `@` `O` `T`
blocked. Default: passable = {'.', 'G', 'S', 'W'}, blocked = {'@', 'O', 'T'},
configurable; verify by inspecting vendored maps (are `S`/`W` even present?)
and record in ADR-0007.

## Evidence

Character census over all 7 vendored curated maps:

| Map | dims | chars present | passable present | blocked present | other |
| --- | --- | --- | --- | --- | --- |
| empty-16-16 | 16x16 | `.` | `.` | none | none |
| random-32-32-10 | 32x32 | `.`, `@` | `.` | `@` | none |
| random-32-32-20 | 32x32 | `.`, `@`, `T` | `.` | `@`, `T` | none |
| maze-32-32-2 | 32x32 | `.`, `@` | `.` | `@` | none |
| room-32-32-4 | 32x32 | `.`, `@` | `.` | `@` | none |
| warehouse-10-20-10-2-1 | 161x63 | `.`, `T` | `.` | `T` | none |
| ht_chantry | 162x141 | `.`, `@`, `T` | `.` | `@`, `T` | none |

No map contains `G`, `S`, `W`, or `O`. `T` appears in three maps
(random-32-32-20, warehouse-10-20-10-2-1, ht_chantry). Total passable cells
per map recorded in `data/maps/maps.index.json`.

## Decision

Adopt the Section 4 default passability set:

- passable = {'.', 'G', 'S', 'W'}
- blocked = {'@', 'O', 'T'}
- any other character → loader error (not silently coerced), per Section 7.7

`T` is treated as blocked (consistent with warehouse racks / DAO trees being
non-traversable). Since `S`/`W`/`G`/`O` are absent from the vendored data,
the effective passable set in the curated maps is just `{'.'}`; the loader
keeps the full configurable set so later-added maps with `G`/`S`/`W` work
without code changes.

## Consequences

- `domain/grid.py` / `domain/mapfile.py` implement the passable/blocked sets
  as configurable constants keyed off this ADR.
- Parser rejects any character outside passable ∪ blocked (strict loading,
  Section 7.7).
