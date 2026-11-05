# Swarmway

Interactive 3D workbench for optimal multi-agent path finding (CBS) — pure-Python
solver, FastAPI API, React frontend, and config-driven benchmarking.

## Results (headline benchmark)

Numbers below are generated from `data/results/<run-id>/table.md` and every one
cites the committed run ID. No figure is hand-typed (Sections 10.6/10.7).

**Run ID:** `20261105-1754-5db8a24-dirty-headline`
**Config:** `bench/default.yaml` — 24 cells (empty-16-16 / random-32-32-10 /
random-32-32-20 / maze-32-32-2 / room-32-32-4 / warehouse-10-20-10-2-1 /
ht_chantry; even scenario; first-k agents), 3 arms (CBS `tie_break=fifo`,
Prioritized fixed, Prioritized best-of-8 seed 42), 60 s budget per solve.
**Environment:** Windows 11, CPython 3.12.15, 16.5 GB RAM (see
`frontend/public/benchmarks/environment.json`).

| arm | solved | timeout | unsat | success rate | median SoC (solved) | median runtime ms (solved) |
| --- | --- | --- | --- | --- | --- | --- |
| CBS (optimal) | 13 / 24 | 11 | 0 | 0.54 | 226 | 24.4 |
| Prioritized (baseline) | 20 / 24 | 3 | 1 | 0.83 | 336.5 | 982.6 |
| Prioritized best-of-8 | 15 / 24 | 9 | 0 | 0.62 | 242 | 5714.2 |
| **All arms** | **48 / 72** | **23** | **1** | — | — | — |

Honesty notes (verbatim from `strings.ts`, Sections 1.6 / 10.6):
- Timeouts are failures and stay in the success-rate denominators — never dropped.
- Medians are computed over solved runs only, with the solved-count shown next to each median.
- Artifacts are not comparable across machines — per-environment tables only (Section 10.4).
- Every number on this page cites the committed run ID above; no figure is hand-typed (Section 10.7).

Timeouts are visible and not hidden: CBS times out on 11 of 24 cells
(empty-16-16 @ 20/40, random-32-32-10 @ 40, random-32-32-20 @ 20, maze-32-32-2
@ 10/20, room-32-32-4 @ 10/20, warehouse-10-20-10-2-1 @ 40, ht_chantry @ 10/20).
Prioritized proves one instance unsatisfiable (maze-32-32-2 @ 20) and times out
on three more. Full per-cell rows: `data/results/20261105-1754-5db8a24-dirty-headline/table.md`.

Reproduce:
```
uv run swarmway bench --config bench/default.yaml
```
A second ("rerun") execution confirms statuses/SoCs/makespans are reproducible
(runtimes vary); see `data/results/20261105-1835-5db8a24-dirty-rerun/` and the
`swarmway bench --diff` output recorded in `docs/verification/phase-8.md`.

The Benchmarks page renders `frontend/public/benchmarks/summary.json` (synced
from this run via `scripts/sync-results.py`) with no backend required.

## Getting started

```
uv run swarmway bench --config bench/default.yaml   # headline benchmark
uv run uvicorn swarmway.api.app:app                 # live solver API (port 8000)
cd frontend && pnpm run dev                         # dev workspace (VITE_API_BASE_URL=http://localhost:8000)
```

See `docs/verification/` for phase gates and `docs/benchmark-protocol.md` for the
run/reproduce/quote procedure.
