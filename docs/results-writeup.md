# Swarmway — Results write-up

Paper-style summary of the headline benchmark. **Every number below is
generated from the committed artifact**
`data/results/20261105-1754-5db8a24-dirty-headline/` (run ID
`20261105-1754-5db8a24-dirty-headline`; config `bench/default.yaml`; 60 s
budget per solve). None is hand-typed. A second ("rerun") execution at
`data/results/20261105-1835-5db8a24-dirty-rerun/` confirms reproducibility of
statuses/SoCs/makespans (runtimes vary, as expected).

Environment record: CPython 3.12.15, Windows 11, 16.5 GB RAM,
`git describe: 5db8a24-dirty`, `2026-11-05T17:54:21+00:00`
(`frontend/public/benchmarks/environment.json`). Artifacts are **not
comparable across machines** — per-environment tables only.

## Method

**Solvers.**

- **CBS** (`tie_break=fifo`, default options): two-level Conflict-Based
  Search. Low level: space-time A* returning the constrained-optimal path for
  one agent (exact true-distance heuristic via reverse BFS). High level:
  best-first over a constraint tree that branches on vertex/edge conflicts.
  Optimal for sum-of-costs under 4-connected unit-time movement with wait and
  stay-at-goal (Sharon et al. 2015, §3.1).
- **Prioritized Planning, fixed order (`pp-fixed`)**: agents planned
  sequentially; earlier trajectories treated as moving obstacles. Fast, not
  optimal, not complete.
- **Prioritized Planning, best-of-8 (`pp-best-of-n`, seed 42)**: 8 seeded
  priority orderings, best sum-of-costs kept. Stronger baseline, still
  incomplete.

**Metrics (Section 10.2).** Per solve: status, sum-of-costs (SoC), makespan,
runtime_ms (solve loop only — validity checking and serialization are outside
the timed region), CT expanded/generated, low-level A* expansions, validity.
Per cell: success rate with **timeouts in the denominator — never dropped**,
median SoC and median runtime over solved runs **with the solved-count shown**.
Every solved row is re-checked by the independent validity checker before
recording; an invalid solution aborts the run.

**Correctness machinery.** Independent validity checker, brute-force
optimality spot-checks (`tests/optimality/`), property suite
(validity, dominance, determinism, unsat-honesty, parser round-trip, heuristic
admissibility — run locally at `max_examples=200`, all green).

## Headline results

Config `bench/default.yaml`: 24 cells across 7 MovingAI MAPF maps
(empty-16-16, random-32-32-10, random-32-32-20, maze-32-32-2, room-32-32-4,
warehouse-10-20-10-2-1, ht_chantry), even scenario, first-k agents, 3 arms.
72 solves total.

### By arm (aggregate)

| arm | solved | timeout | unsat | success rate | median SoC (solved) | median runtime ms (solved) |
| --- | --- | --- | --- | --- | --- | --- |
| CBS (optimal) | 13 / 24 | 11 | 0 | 0.54 | 226 | 24.4 |
| Prioritized (baseline) | 20 / 24 | 3 | 1 | 0.83 | 336.5 | 982.6 |
| Prioritized best-of-8 | 15 / 24 | 9 | 0 | 0.62 | 242 | 5714.2 |
| **All arms** | **48 / 72** | **23** | **1** | — | — | — |

Interpretation: CBS is optimal where it solves (median SoC 226) but times out
on 11 of 24 cells — optimal search is exponential in the worst case.
Prioritized solves more cells (20/24) but at higher cost (median SoC 336.5,
1.49× CBS's solved median) and proves one instance unsatisfiable falsely
(maze-32-32-2 @ 20). Best-of-8 splits the difference (15/24 solved, median
SoC 242) but is slow (median 5.7 s). Timeouts count as failures — they are
in the denominators, never dropped.

### CBS vs Prioritized: sum-of-costs on cells both solved

On the 11 cells where both CBS and pp-fixed solved, pp-fixed's SoC is >=
CBS's in every case (CBS optimal), and strictly higher on 6 of them. This is
the optimality gap users pay for baseline speed.

### Full per-cell table

Embedded from `data/results/20261105-1754-5db8a24-dirty-headline/table.md`:

| map | agents | arm | status | soc | makespan | runtime_ms |
| --- | --- | --- | --- | --- | --- | --- |
(empty-16-16, 5): cbs solved 66/22/1.2 · pp-fixed solved 66/22/13.7 · pp-best-of-n solved 66/22/108.7
(empty-16-16, 10): cbs solved 125/22/10.7 · pp-fixed solved 125/22/106.7 · pp-best-of-n solved 126/22/838.9
(empty-16-16, 20): cbs timeout · pp-fixed solved 255/22/2053.2 · pp-best-of-n solved 246/22/15046.7
(empty-16-16, 40): cbs timeout · pp-fixed solved 563/25/18204.3 · pp-best-of-n timeout
(random-32-32-10, 5): cbs solved 97/39/3.4 · pp-fixed solved 97/39/40.6 · pp-best-of-n solved 97/39/331.6
(random-32-32-10, 10): cbs solved 242/46/37.8 · pp-fixed solved 242/46/429.5 · pp-best-of-n solved 242/46/4194.7
(random-32-32-10, 20): cbs solved 436/46/521.1 · pp-fixed solved 436/46/3554.6 · pp-best-of-n solved 436/46/29960.7
(random-32-32-10, 40): cbs timeout · pp-fixed solved 903/46/43987.1 · pp-best-of-n timeout
(random-32-32-20, 5): cbs solved 102/37/10.2 · pp-fixed solved 102/37/66.3 · pp-best-of-n solved 102/37/673.5
(random-32-32-20, 10): cbs solved 200/37/24.4 · pp-fixed solved 200/37/686.1 · pp-best-of-n solved 200/37/7022.7
(random-32-32-20, 20): cbs timeout · pp-fixed solved 415/43/6358.7 · pp-best-of-n solved 411/43/51440.6
(maze-32-32-2, 5): cbs solved 226/69/3.8 · pp-fixed solved 226/69/85.5 · pp-best-of-n solved 226/69/705.3
(maze-32-32-2, 10): cbs timeout · pp-fixed solved 468/100/1262.1 · pp-best-of-n solved 467/99/13470.5
(maze-32-32-2, 20): cbs timeout · pp-fixed unsat · pp-best-of-n timeout
(room-32-32-4, 5): cbs solved 159/44/4.1 · pp-fixed solved 159/44/63.9 · pp-best-of-n solved 159/44/540.7
(room-32-32-4, 10): cbs timeout · pp-fixed solved 258/46/703.1 · pp-best-of-n solved 256/46/6086.6
(room-32-32-4, 20): cbs timeout · pp-fixed solved 574/52/9617.3 · pp-best-of-n timeout
(warehouse-10-20-10-2-1, 5): cbs solved 456/159/27.8 · pp-fixed solved 456/159/702.6 · pp-best-of-n solved 456/159/5714.2
(warehouse-10-20-10-2-1, 10): cbs solved 869/174/80.5 · pp-fixed solved 869/174/6654.4 · pp-best-of-n timeout
(warehouse-10-20-10-2-1, 20): cbs solved 1697/174/1579.3 · pp-fixed timeout · pp-best-of-n timeout
(warehouse-10-20-10-2-1, 40): cbs timeout · pp-fixed timeout · pp-best-of-n timeout
(ht_chantry, 5): cbs solved 619/195/67.4 · pp-fixed solved 621/195/2341.0 · pp-best-of-n solved 619/195/11433.0
(ht_chantry, 10): cbs timeout · pp-fixed solved 1258/195/19088.8 · pp-best-of-n timeout
(ht_chantry, 20): cbs timeout · pp-fixed timeout · pp-best-of-n timeout

(Full machine-readable rows: `data/results/20261105-1754-5db8a24-dirty-headline/results.csv` and `summary.json`, synced to `frontend/public/benchmarks/`.)

## Honest limitations

- **CPython speed.** The solver is pure Python with no C extensions; the 60 s
  budget is hit on hard cells. A compiled core would move the timeout
  frontier, but that is future scope, not part of this release.
- **PP incompleteness.** Prioritized Planning is not complete: it reports
  unsat on solvable instances (maze-32-32-2 @ 20) and can time out where CBS
  solves (warehouse @ 40, ht_chantry @ 10/20). It is a baseline, not a
  replacement for CBS.
- **Trace event cap.** CBS search traces are capped (`SWARMWAY_TRACE_EVENT_CAP`
  default 20,000) to bound memory; deep trees are truncated honestly (the
  frontend reports truncation).
- **Machine-specific runtimes.** All runtime numbers are from one machine
  (Windows 11, CPython 3.12.15, 16.5 GB RAM) and are **not comparable across
  machines** (Section 10.4). Per-environment tables only; cross-machine
  comparisons are forbidden.
- **Budgets are clamped.** Client-requested `budget_ms` is clamped to
  [100, `SWARMWAY_SOLVE_BUDGET_MS`] = [100, 10000] server-side; rejections
  carry per-error details (field/limit/received).

## Reproducibility

```
uv run swarmway bench --config bench/default.yaml
# -> data/results/<new-run-id>/
uv run swarmway bench --diff \
  data/results/20261105-1754-5db8a24-dirty-headline/results.csv \
  data/results/<new-run-id>/results.csv
```
Same config + same machine ⇒ identical statuses/SoCs/makespans; runtimes may
differ (observed ratio 0.39–2.07×, median 1.07× between run and rerun).
Commit artifacts, never edit an old artifact directory (new maps ⇒ new
run-id). Sync to the frontend: `scripts/sync-results.py`.

*Generated from committed artifacts only; no figure is hand-typed.*
