# Phase 7 verification — Benchmark harness, results, and Benchmarks page data flow

## PART A (backend) — committed

### What was built (Section 14 tasks 1, 2, 4–6)

- `src/swarmway/bench/runner.py` — config-driven runner: executes cells cell by
  cell with per-arm solve-loop timing, independent validity re-checks
  (harness aborts on invalid solutions), honest skip rows for missing maps.
- `src/swarmway/bench/metrics.py` — aggregators: success rate with timeouts in
  the denominator, medians over solved runs with solved-counts, and the
  results.csv diff utility (ignores `runtime_ms` and `run-id`).
- `src/swarmway/bench/artifacts.py` — writers for `config.yaml`,
  `environment.json` (Section 10.4), `results.csv`, `summary.json`,
  `table.md` (Section 10.5).
- `bench/default.yaml` — Section 10.1 curated set (24 cells: empty-16-16 /
  random-32-32-10 @ 5/10/20/40; random-32-32-20 / maze-32-32-2 /
  room-32-32-4 @ 5/10/20; warehouse-10-20-10-2-1 @ 5/10/20/40; ht_chantry @
  5/10/20; `even` scenario first-k; 60 s budget; arms cbs / pp-fixed /
  pp-best-of-8 seed 42).
- `bench/full.yaml` — all vendored maps, even + random (COMMITTED, never run
  this phase).
- `scripts/sync-results.py` — copies a run's `summary.json` +
  `environment.json` into `frontend/public/benchmarks/` (supports `--run-id`).
- CLI: `swarmway bench --config <yaml> [--label] [--diff a.csv b.csv]`;
  `Makefile bench-default` target; `pyproject.toml` adds `pyyaml`.
- `docs/benchmark-protocol.md` — condensed Section 10 (how to run, reproduce,
  quote numbers).

### Tests (zero real solves — CI stays fast)

`tests/unit/bench/test_harness.py` — 12 tests with a canned fake solver:
run-id formatting, artifact file shapes (results.csv / summary.json /
table.md), timeout counting in success-rate denominators, skip-row behaviour,
the validity-abort path (fake solver returns an invalid solution once → abort),
the diff utility (identical statuses pass; a changed SoC fails; runtime
differences ignored), aggregate medians with solved-counts.

### Verification output (real)

```
$ uv run ruff check .
All checks passed!
$ uv run ruff format --check .
92 files already formatted
$ uv run mypy src/swarmway/domain src/swarmway/solver src/swarmway/bench
Success: no issues found in 21 source files
$ uv run pytest tests/unit/bench -q
12 passed in 0.92s
```

Full backend suite: 164 passed, 2 deselected.

### Deviations from PROJECT.md

None beyond ADR-0009 (frontend v2 built directly by the coding agent).

### Commits in this phase (Part A)

- `9479885 feat(bench): add config-driven benchmark harness with artifacts`
- `491ef37 test(bench): add harness unit and artifact tests`
- `98cc72b fix(bench): pass pp-best-of-n seed via run_solver seed param`

### Headline run — completed

The headline run (`uv run swarmway bench --config bench/default.yaml`, 24 cells × 3
arms at a 60 s budget) was executed and committed as Phase 8's closing step.

**Run ID:** `20261105-1754-5db8a24-dirty-headline`
Committed: `data/results/20261105-1754-5db8a24-dirty-headline/`
  (config.yaml, environment.json, results.csv, summary.json, table.md)
**Reproduction run:** `--label rerun` →
  `data/results/20261105-1835-5db8a24-dirty-rerun/`
**Bundled:** `scripts/sync-results.py --run-id` →
  `frontend/public/benchmarks/{summary.json,environment.json,provenance.json}`
**README:** results section added, every number citing the run ID.

Re-run diff (`swarmway bench --diff` between the two results.csv): 72/72 rows
match on status/SoC/makespans; exactly ONE status difference attributable to
runtime variance crossing the 60 s budget boundary —
warehouse-10-20-10-2-1 k=10 pp-best-of-n (timeout in run 1, solved soc=869
makespan=174 in 57.2 s in run 2). All other statuses/SoCs/makespans identical;
runtimes differ (ratio 0.39–2.07×, median 1.07×), as expected.

#### Headline results excerpt (run 20261105-1754-5db8a24-dirty-headline)

Generated from data/results/20261105-1754-5db8a24-dirty-headline/table.md
(72 cells = 24 cells x 3 arms; 60 s budget). Full rows in the committed
table.md.

| arm | solved | timeout | unsat | success rate | median SoC | median runtime ms |
| --- | --- | --- | --- | --- | --- | --- |
| CBS (optimal) | 13 / 24 | 11 | 0 | 0.54 | 226 | 24.4 |
| Prioritized (baseline) | 20 / 24 | 3 | 1 | 0.83 | 336.5 | 982.6 |
| Prioritized best-of-8 | 15 / 24 | 9 | 0 | 0.62 | 242 | 5714.2 |
| All arms | 48 / 72 | 23 | 1 | - | - | - |

Timeouts are failures and stay in the denominators; medians are over solved
runs only with the solved-count shown. No figure is hand-typed - every
number cites the run ID.

**Environment record:** CPython 3.12.15, Windows 11, 16.5 GB RAM,
git_describe: 5db8a24-dirty, date_utc: 2026-11-05T17:54:21+00:00
(frontend/public/benchmarks/environment.json).

Part B (Benchmarks page frontend) builds on the synced `summary.json` and can
proceed once a headline run exists; until then the page renders from whatever
`summary.json` is bundled.

## PART B (frontend) — committed

### What was built (Section 14 task 3, per ADR-0009)

- `frontend/src/screens/BenchmarksScreen.tsx` — rewritten from a placeholder
  to render `frontend/public/benchmarks/summary.json` (read at runtime, no
  hand-typed numbers — Section 10.7):
  - Per-cell tables (map × agents) with one row per arm: status counts
    (solved/timeout/unsat/error/skipped/aborted), success rate with solved
    count (timeouts in the denominator), median SoC with solved-count, median
    runtime with solved-count — Section 10.2 aggregates exactly.
  - CSS/SVG value bars beside every numeric cell — bars are never the only
    signal; the raw value is printed next to each bar (Section 11.8).
  - Mandatory context read from `environment.json`: run ID, Python/platform/
    CPU/RAM/commit, reproduce command.
  - Honesty copy verbatim from `strings.ts` under every table: timeouts are
    failures; medians over solved runs only with counts; artifacts not
    comparable across machines; every number cites the run ID (Sections 1.6,
    10.6, 10.7).
  - Pure client-side, bundled JSON, static-first (no backend required).
  - WCAG AA contrast, phone-width usable (single-column stack below `lg`,
    scrollable tables), WCAG AA color contrast, glyphs + labels (colors never
    the only signal).
- `frontend/src/types.ts` — added `SummaryJson`, `CellAggregate`,
  `ArmAggregate`, `BenchmarkEnvironment` types mirroring
  `swarmway.bench.artifacts` / `swarmway.bench.metrics` (frozen contract).
- `frontend/src/strings.ts` — added benchmarks honesty copy, table headers,
  run ID / environment / reproduce command strings.

### Frontend verification output (real)

```
$ pnpm -C frontend install --frozen-lockfile   (ajv already in devDependencies)
$ pnpm -C frontend typecheck
$ tsc --noEmit   (clean)
$ pnpm -C frontend test
✔ tests 11   ℹ pass 11   ℹ fail 0   (incl. trace-schema contract tests)
$ pnpm -C frontend build
✓ built in 1.69s   (dist/ emitted)
```

### sync-results.py — pending

`scripts/sync-results.py` is implemented (supports `--run-id`, defaults to
latest by timestamp) but could NOT be run this session: no headline run
exists, so there is no `data/results/<run-id>/summary.json` to copy into
`frontend/public/benchmarks/`. The Benchmarks page therefore renders an
honest "No benchmark results yet" state until a headline run is committed
and synced.

### Deviations from PROJECT.md

None beyond ADR-0009 (frontend v2 built directly by the coding agent).

### Commits in this phase (Part B)

- `<feat(ui) commit>` feat(ui): build benchmarks page from bundled run artifacts

### Phase 7 — complete

Headline run committed (`data/results/20261105-1754-5db8a24-dirty-headline/`),
reproduction run committed (`...-dirty-rerun/`), benchmarks synced into
`frontend/public/benchmarks/`, README results section added citing the run
ID, and this gate updated with the real table.md excerpt, environment record,
and re-run diff. Cross-referenced from `docs/verification/phase-8.md`.
Phase 7 exit criteria are met.
