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

### Pending (headline run — skipped per decision)

The headline run (`make bench-default`, ~15–75 min wall clock, 24 cells × 3
arms at a 60 s budget) was NOT executed in this session. The following remain
before the Phase 7 gate is fully satisfied:

1. Run `uv run swarmway bench --config bench/default.yaml` and commit
   `data/results/<run-id>/` (config.yaml, environment.json, results.csv,
   summary.json, table.md).
2. Write `docs/verification/phase-7.md` with the real headline `table.md`, a
   `summary.json` excerpt, the environment record, and the re-run diff showing
   determinism of statuses/SoCs (runtimes may vary).
3. Run `scripts/sync-results.py` to copy the chosen run's artifacts into
   `frontend/public/benchmarks/`.

Part B (Benchmarks page frontend) builds on the synced `summary.json` and can
proceed once a headline run exists; until then the page renders from whatever
`summary.json` is bundled.
