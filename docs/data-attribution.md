# Data attribution — MovingAI MAPF benchmarks (ODC-BY)

## Source

- **Publisher:** Moving AI Lab (Nathan Sturtevant, University of Denver)
- **Page:** Multi-Agent Path-Finding (MAPF) Benchmarks
  https://movingai.com/benchmarks/mapf.html
- **Data sets:** "MAPF Benchmark Sets" — grids and scenario files
  https://movingai.com/benchmarks/mapf/mapf/index.html

## Licence

All data is made available under the **Open Data Commons Attribution License
(ODC-BY)**:
https://opendatacommons.org/licenses/by/1-0/

Per ODC-BY, Swarmway may copy, distribute, and use the database provided the
source is attributed. This file (plus per-file notices below) is that
attribution. Derived results (benchmark tables, traces) produced from this
data note the source in their artifact headers (Section 10.4/10.7).

## Academic citation

If you use these benchmarks in a paper, cite:

```
@article{stern2019mapf,
  title={Multi-Agent Pathfinding: Definitions, Variants, and Benchmarks},
  author={Roni Stern and Nathan R. Sturtevant and Ariel Felner and Sven Koenig
          and Hang Ma and Thayne T. Walker and Jiaoyang Li and Dor Atzmon and
          Liron Cohen and T. K. Satish Kumar and Eli Boyarski and Roman Bartak},
  journal={Symposium on Combinatorial Search (SoCS)},
  year={2019},
  pages={151--158}
}
```

## Vendored files (curated set, Section 10.1)

The following MovingAI files are vendored under `data/maps/` and
`data/scenarios/` (the `.map` file plus the first `even` scenario file
`-even-1.scen` for each map), as curated in Section 10.1:

| Map | Family | Dimensions | `data/maps/` | `data/scenarios/` |
| --- | --- | --- | --- | --- |
| empty-16-16 | empty | 16 x 16 | empty-16-16.map | empty-16-16-even-1.scen |
| random-32-32-10 | random | 32 x 32 | random-32-32-10.map | random-32-32-10-even-1.scen |
| random-32-32-20 | random | 32 x 32 | random-32-32-20.map | random-32-32-20-even-1.scen |
| maze-32-32-2 | maze | 32 x 32 | maze-32-32-2.map | maze-32-32-2-even-1.scen |
| room-32-32-4 | room | 32 x 32 | room-32-32-4.map | room-32-32-4-even-1.scen |
| warehouse-10-20-10-2-1 | warehouse | 161 x 63 | warehouse-10-20-10-2-1.map | warehouse-10-20-10-2-1-even-1.scen |
| ht_chantry | game (DAO) | 162 x 141 | ht_chantry.map | ht_chantry-even-1.scen |

## Per-file provenance

All files above were downloaded from
`https://movingai.com/benchmarks/mapf/mapf/` (bundled as `mapf-map.zip` and
`mapf-scen-even.zip`) on 2026-10-31. Map byte content is unchanged from the
source `.map` files; scenario files are the MovingAI `-even-1.scen` buckets.

## Game-map note

`ht_chantry` is a Dragon Age: Origins (DAO) game map distributed by the
Moving AI Lab for research. Per ODC-BY and the Moving AI Lab terms it is
attributed here; Swarmway is an educational/research artifact and makes no
claim on the underlying game IP.

## Licence text found

The MovingAI MAPF page links the Open Data Commons Attribution License
(ODC-BY) at https://opendatacommons.org/licenses/by/1-0/ and states "All data
is made available under the Open Data Commons Attribution License". No
additional per-file licence text was present on the download page.
