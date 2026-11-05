# Swarmway Benchmark Protocol (condensed Section 10)

## Purpose

One command (`swarmway bench --config bench/default.yaml`) produces every
number the project will ever quote. Benchmark numbers are produced locally,
committed as artifacts under `data/results/<run-id>/`, and never re-derived in
CI (CI stays fast — zero real solves; see Section 15).

## Config-driven run

Everything about a run lives in the YAML: maps, agent rungs, scenario family,
budget, arms + seeds, label.

Example (`bench/default.yaml`, the Section 10.1 curated set):

```yaml
label: headline
budget_ms: 60000          # 60 s per (instance, solver)
scenario: even            # first-k agents from the vendored scenario file
arms:
  - name: cbs
    options: {tie_break: fifo}
    seed: null
  - name: pp-fixed
    options: {}
    seed: null
  - name: pp-best-of-n
    options: {orderings: 8}
    seed: 42
cells:
  - map: empty-16-16
    agents: [5, 10, 20, 40]
  ...
```

Arms per Section 10.3 / A-9: `cbs` (default options, tie_break=fifo),
`pp-fixed`, `pp-best-of-8` (seed 42). CBS options fixed at defaults — the
shipped product is what is measured. All seeds recorded in config + artifacts.

## Run-id

`YYYYMMDD-HHMM-<short-sha>-<label>` (Section 10.5), derived from
`git describe --always --dirty`. One run-id per committed artifact directory.
Adding maps later means a NEW run-id, never editing an old artifact directory
(Section 10.6 #2).

## Artifacts per run (Section 10.5)

`data/results/<run-id>/`:

| file | contents |
|------|----------|
| `config.yaml` | frozen copy of the effective config |
| `environment.json` | Section 10.4 environment record |
| `results.csv` | one row per run |
| `summary.json` | aggregates per cell |
| `table.md` | markdown table for README embedding |

## Environment recording (Section 10.4)

Python implementation + version, platform, CPU model, RAM, `git describe
--always --dirty`, date, command line. Artifacts are **not comparable across
machines** — per-environment tables only, cross-machine comparisons forbidden.

## Metrics (Section 10.2)

Per (map, agents, solver): `status`, `soc`, `makespan`, `runtime_ms`
(solve loop only — validity checking and serialization are **outside** the
timed region, per Section 8.9), `ct_expanded`, `ct_generated`,
`low_level_expansions`, `validity`.

Aggregates per cell: success rate (timeouts **in** the denominator — never
dropped), median SoC over solved, median runtime over solved — every median
printed **with its solved-count next to it** (Section 10.6 #3).

## Honest reporting rules (Section 10.6)

1. Timeouts are failures, counted in success-rate denominators — never dropped.
2. No cherry-picking: the committed config is the whole story.
3. Missing maps / un-vendored scenarios are explicit skip rows with a reason
   — never silent omissions.
4. Every solved row is re-checked by the independent validity checker before
   recording; an invalid solution aborts the run (harness bug).
5. Retiring a cell is a commit with a reason — artifact history keeps it visible.

## Diff utility (determinism, Section 10.3)

`swarmway bench --diff a/results.csv b/results.csv` compares two results files
ignoring `runtime_ms` and `run-id`. Same config + same machine ⇒ identical
statuses, SoCs and makespans; runtimes vary and that is expected.

## CLI

```
uv run swarmway bench --config bench/default.yaml [--label LABEL]
uv run swarmway bench --diff a/results.csv b/results.csv
```

Writes `data/results/<run-id>/` and prints the table path at the end.
`make bench-default` wraps the default config run.

## Commit plan

1. `feat(bench): add config-driven benchmark harness with artifacts`
   (incl. sync-results.py)
2. `test(bench): add harness unit and artifact tests`
3. `feat(bench): add curated default config and committed headline run`
   (`bench/default.yaml` + `data/results/<run-id>/`)
4. `docs(bench): add benchmark protocol document`
