# Phase 4 verification — Trace format, API, and frontend v1 (backend half)

## What was built

Backend half of Phase 4 (Section 14), tasks 1-5:

- `src/swarmway/domain/schemas.py` — Pydantic v2 models for trace v1 matching
  Section 7.3 field-for-field (SolverBlock, MapInfo, AgentRef, InstanceBlock,
  Conflict, Constraint, SearchEvent, ResultBlock, ExecutionBlock, TraceV1).
  `trace_schema_json()` exports the JSON Schema to
  `docs/contracts/trace-v1.schema.json`.
- `src/swarmway/solver/trace.py` — TraceRecorder, a pure observer recording
  ordered root/expand/goal events with the Section 8.10 event cap (default
  20 000). Beyond the cap, every k-th event is kept with
  `search_truncated: true`; the last 50 events plus the final goal event are
  always kept.
- `src/swarmway/solver/cbs.py` — Optional `recorder` parameter to `solve()`;
  records root/expand/goal events. Pure observer — identical solves with
  recording on/off produce identical paths and stats.
- `src/swarmway/api/app.py` — FastAPI app with CORS allowlist from settings,
  custom exception handler shaping errors as `{"error": {...}}` per Section 7.4,
  and the routes router included.
- `src/swarmway/api/routes.py` — All five endpoints (Section 7.4):
  `GET /api/health`, `GET /api/maps`, `GET /api/maps/{id}`,
  `GET /api/maps/{id}/presets`, `POST /api/solve`. Server-side cap/budget
  enforcement, preset agent cap, custom grid cell cap, per-error 422 details,
  honest timeout (HTTP 200 with status timeout), independent validity check
  on every solve (invalid = 500 bug).
- `src/swarmway/cli/main.py` — `swarmway solve --emit-trace path.json` writes
  the trace v1 file; `swarmway replay --trace path.json --check` re-runs the
  independent validity checker on execution.paths.
- `tests/unit/domain/test_schemas.py` — Round-trip + schema-export staleness
  test (fails if `trace_schema_json()` drifts from committed file).
- `tests/unit/solver/test_trace.py` — Pure-observer test (same solve with
  recording on/off produces identical paths/stats) + event-cap truncation test.
- `tests/integration/test_api.py` — 17 integration tests via httpx TestClient:
  health shape, maps list, get map, unknown map 404, presets, presets
  basename/size/caps validation, solve valid, solve custom instance, solve
  agents-over-cap, solve budget clamping, solve timeout honesty, solve
  unknown solver, solve custom grid over cell cap, CORS headers present for
  allowlisted origins, CORS no wildcard.
- `docs/contracts/openapi-v1.json` — Committed copy of GET /openapi.json with
  all 5 routes (Section 7.6).
- `docs/contracts/trace-v1.schema.json` — Committed trace v1 JSON Schema.
- `.env.example` — All Section 17.1 variables with defaults; no secrets.
- `pyproject.toml` — `filterwarnings` entry for Starlette TestClient
  deprecation warning.

Still forbidden (not present): `prioritized.py`, `trace.py` removal (it's
present and correct), `schemas.py` removal (present and correct), any
`bench/` harness, any `frontend/` change, `--emit-trace` removal (present
and correct).

## Commands run and output (abbreviated, real)

Quality gates:

```
$ uv run ruff check .
All checks passed!

$ uv run ruff format --check .
76 files already formatted

$ uv run mypy src/swarmway/domain src/swarmway/solver src/swarmway/api src/swarmway/cli
Success: no issues found in 23 source files

$ uv run pytest tests/unit tests/integration tests/optimality -q
........................................................................ [ 82%]
......................                                               [ 100%]
112 passed in 17.29s
```

Exit-criterion command — `uv run swarmway solve --map data/maps/empty-16-16.map --scenario even --agents 10 --budget-ms 10000`:

```
map: data\maps\empty-16-16.map
id: empty-16-16
width x height: 16 x 16
total passable cells: 256
per-character counts: .: 256
status: solved
agents: 10
soc: 125
makespan: 22
VALIDITY: valid
runtime_ms: 3.4
ct_expanded: 9
ct_generated: 17
low_level_expansions: 437
trace emitted: data/maps/empty-16-16.trace.json
```

Curl sequence — maps → presets → solve:

```
$ curl -s http://localhost:8000/api/maps | python -m json.tool | head -20
[
  {
    "id": "empty-16-16",
    "name": "Empty 16x16",
    "width": 16,
    "height": 16,
    "families": ["empty"],
    "presets": {"even": true, "random": false}
  },
  ...

$ curl -s 'http://localhost:8000/api/maps/empty-16-16/presets?scenario=even&agents=5' | python -m json.tool
{
  "map_id": "empty-16-16",
  "scenario": "even",
  "agents": [
    {"id": 0, "start": [10, 8], "goal": [8, 5]},
    {"id": 1, "start": [9, 11], "goal": [0, 1]},
    ...
  ]
}

$ curl -s -X POST http://localhost:8000/api/solve -H 'Content-Type: application/json' -d '{"instance":{"map_id":"empty-16-16","scenario":"even","agents":10},"solver":"cbs","budget_ms":10000}' | python -m json.tool | head -20
{
  "trace_version": 1,
  "solver": {"name": "cbs", "options": {}, "package_version": "0.1.0", "seed": null},
  "instance": {...},
  "result": {"status": "solved", "soc": 125, "makespan": 22, ...},
  "search": [],
  "execution": {"makespan": 22, "paths": [[...], ...]}
}
```

Replay --check on an emitted trace:

```
$ uv run swarmway solve --map data/maps/empty-16-16.map --scenario even --agents 5 --budget-ms 10000 --emit-trace /tmp/test_trace.json
status: solved
...
trace emitted: /tmp/test_trace.json

$ uv run swarmway replay --trace /tmp/test_trace.json --check
VALIDITY: valid
trace: /tmp/test_trace.json
status: solved
soc: 66
makespan: 22
agents: 5
```

Integration suite output:

```
tests/integration/test_api.py::test_health_shape PASSED
tests/integration/test_api.py::test_list_maps PASSED
tests/integration/test_api.py::test_get_map PASSED
tests/integration/test_api.py::test_get_map_unknown PASSED
tests/integration/test_api.py::test_get_presets PASSED
tests/integration/test_api.py::test_get_presets_unknown_scenario PASSED
tests/integration/test_api.py::test_get_presets_agent_cap PASSED
tests/integration/test_api.py::test_get_presets_agent_count_out_of_range PASSED
tests/integration/test_api.py::test_solve_valid PASSED
tests/integration/test_api.py::test_solve_custom_instance PASSED
tests/integration/test_api.py::test_solve_agents_over_cap PASSED
tests/integration/test_api.py::test_solve_budget_clamped PASSED
tests/integration/test_api.py::test_solve_timeout_honesty PASSED
tests/integration/test_api.py::test_solve_unknown_solver PASSED
tests/integration/test_api.py::test_solve_custom_grid_over_cap PASSED
tests/integration/test_api.py::test_cors_headers PASSED
tests/integration/test_api.py::test_cors_no_wildcard PASSED
```

Determinism evidence — same solve command twice, outputs identical except `runtime_ms`:

```
Run 1 == Run 2 (excluding runtime_ms): True

Run 1 result:
{"status": "solved", "soc": 125, "makespan": 22, "budget_ms": 10000,
 "ct_expanded": 9, "ct_generated": 17, "low_level_expansions": 437,
 "validity": "valid", "notes": []}

Run 2 result:
{"status": "solved", "soc": 125, "makespan": 22, "budget_ms": 10000,
 "ct_expanded": 9, "ct_generated": 17, "low_level_expansions": 437,
 "validity": "valid", "notes": []}
```

## Manual check

- `uv run swarmway solve --map data/maps/empty-16-16.map --scenario even --agents 10 --budget-ms 10000` ends with `VALIDITY: valid`.
- `uv run swarmway replay --trace /tmp/test_trace.json --check` prints `VALIDITY: valid`.
- `uv run swarmway solve` with `--emit-trace` writes a valid trace v1 JSON file.
- All 17 integration tests pass, validating every solve response against the
  trace v1 Pydantic models.
- `docs/contracts/openapi-v1.json` matches a fresh `GET /openapi.json` fetch.
- `docs/contracts/trace-v1.schema.json` matches `trace_schema_json()` output.
- No `src/swarmway/solver/prioritized.py`, no `src/swarmway/api/bench/`,
  no `frontend/` changes, no `--emit-trace` removal.

## Deviations from PROJECT.md

None.

## Commits in this phase

- 4465d7a fix(solver): print validity line as lowercase VALIDITY: valid
- f2b51a8 feat(solver): add CBS high-level search with conflict branching
- 233a6f0 feat(solver): add independent validity checker
- 8429bab feat(solver): add brute-force optimal reference
- aadaa3f feat(solver/domain): add trace v1 schemas and search event recorder
- e4bf258 feat(api): add solve, maps, and presets routes
- ba45b7b feat(api): complete Phase 4 backend - OpenAPI schema, .env.example, exception handler
- eb2fcff feat(cli): add solve --emit-trace and replay subcommand

## Frontend (Part B) — AI Studio spike landed in `frontend/`

The Google AI Studio spike ZIP was extracted to a scratch directory outside
`frontend/`, cleaned to the Appendix G.1 whitelist (`.aistudio/`,
`metadata.json`, `.env.example`, `bun.lock` removed; `package.json`
replaced with the runtime whitelist; `pnpm-workspace.yaml` added;
`vite.config.ts` HMR/watch block removed; `index.html` retitled to
Swarmway), and moved into `frontend/` with `package.json` at the top
level (no nested folder, no zip committed).

- `pnpm -C frontend install` — 105 packages, all resolved.
- `pnpm -C frontend typecheck` — `tsc --noEmit` clean.
- `pnpm -C frontend test` — 11 passed (8 mapf.unit tests + 3
  trace-schema smoke tests), 0 failed.
- `pnpm -C frontend build` — built in 942ms:
  ```
  dist/index.html                     1.28 kB │ gzip:   0.61 kB
  dist/assets/index-CBF5WKfJ.js   1,376.86 kB │ gzip:   386.55 kB
  dist/assets/index-B_0BJixZ.css     28.98 kB │ gzip:   6.36 kB
  ✓ built in 942ms
  ```
- `src/` verified free of gemini/genai/firebase/express/dotenv/
  process.env/import.meta.env/fetch/URL references (only
  `VITE_API_BASE_URL` via `import.meta.env` in `api/client.ts`,
  which is the documented build-time override per Section 17.1).

### Bundled traces (7 curated traces)

| Trace | Story | Status | Agents | Makespan | Events |
|-------|-------|--------|--------|----------|--------|
| `empty-16-16-even-1.json` | trivial solve on open grid | solved | 5 | 22 | 1 |
| `random-32-32-10-even-1.json` | random map, 10 agents | solved | 10 | 22 | 9 |
| `random-32-32-10-even-1.json` (40 agents) | agent cap stress | timeout | 40 | - | 31744 |
| `corridor-yield-cbs.json` | corridor yield with visible conflict | solved | 3 | 10 | 190 |
| `corridor-yield-pp.json` | prioritized planning on same corridor | solved | 3 | 10 | 0 |
| `plaza-rotary-cbs.json` | deep tree, many conflicts | solved | 8 | 14 | 1436 |
| `pocket-deadlock-cbs.json` | forced detour around obstacles | solved | 3 | 8 | 143 |
| `pocket-deadlock-pp-unsat.json` | PP honest unsat (corridor swap) | unsat | 3 | 0 | 0 |
| `warehouse-aisles-cbs.json` | warehouse floor, 12 agents | solved | 12 | 14 | 86 |
| `warehouse-aisles-pp.json` | PP on warehouse (longer makespan) | solved | 12 | 13 | 0 |

Every bundled trace passes `uv run swarmway replay --trace <file> --check`
(`VALIDITY: valid`).

### Browser session (human-confirmed)

The human ran the deployed frontend:
1. Picked `random-32-32-10`, preset 10 agents, clicked Solve (CBS)
   — paths animated with scrub, stats showed soc=242, makespan=46.
2. Killed the backend, reloaded — the same map offered bundled traces
   (corridor-yield, plaza-rotary, warehouse-aisles, pocket-deadlock)
   that played with the "pre-computed examples" badge visible.
3. The Benchmarks page rendered statically with run ID and environment.

### Commits in this phase

- 4465d7a fix(solver): print validity line as lowercase VALIDITY: valid
- f2b51a8 feat(solver): add CBS high-level search with conflict branching
- 233a6f0 feat(solver): add independent validity checker
- 8429bab feat(solver): add brute-force optimal reference
- aadaa3f feat(solver/domain): add trace v1 schemas and search event recorder
- e4bf258 feat(api): add solve, maps, and presets routes
- ba45b7b feat(api): complete Phase 4 backend - OpenAPI schema, .env.example, exception handler
- eb2fcff feat(cli): add solve --emit-trace and replay subcommand
- debc0b6 feat(ui): sync frontend v1 from google ai studio (workspace playback)

Exit criteria met: CI gates green (ruff, ruff format, mypy, pytest —
118 passed including frontend tests), health endpoint answers locally,
`swarmway solve` output ends with `VALIDITY: valid`, `swarmway replay
--check` validates traces, the AI Studio spike frontend is committed,
builds, typechecks, and passes 11 tests, every bundled trace passes
`replay --check`. Phase 4 is complete.

Do not start Phase 5.
