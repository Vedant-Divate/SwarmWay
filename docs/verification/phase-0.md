# Phase 0 verification — Foundations and assumption resolution

## What was built

- `swarmway` Python package under `src/swarmway/` with the Section 12
  layout (placeholders for `domain/`, `solver/`, `api/`, `cli/`,
  `bench/`); `pyproject.toml`, `uv.lock`, `.python-version`.
- Quality-tooling: ruff (lint + format), mypy (strict on `domain/` and
  `solver/`), pytest (default profile excludes `tests/slow/`),
  pre-commit with a commit-msg hook enforcing conventional commits.
- `docs/{decisions,verification,contracts}/` initialized;
  `docs/questions.md` initialized.
- ADR-0001 (monorepo layout), ADR-0002 (exact tool/dependency versions).
- Vendored MovingAI MAPF curated data: 7 `.map` files + first `even`
  `.scen` file each under `data/maps/` and `data/scenarios/`,
  `data/maps/maps.index.json`, `docs/data-attribution.md`
  (ODC-BY), `scripts/fetch-maps.py` for on-demand fetch of the rest.
- ADR-0006 (movement model: 4-connected + wait + stay-at-goal,
  resolves A-2) and ADR-0007 (passability: `.` `G` `S` `W` passable,
  `@` `O` `T` blocked, resolves A-1), both written from the census
  evidence below (A-3 also confirmed: `.scen` = `version 1` + 9
  tab columns).
- FastAPI skeleton: `GET /api/health` only, CORS allowlist and resource
  caps from env; `scripts/export_openapi.py` → committed
  `docs/contracts/openapi-v1.json`.
- `.github/workflows/ci.yml`: backend job (ruff/mypy/pytest) + frontend
  job that skips gracefully while `frontend/` has no `package.json` and
  un-skips once one appears.
- `frontend/README.md` placeholder: "AI Studio spike lands here
  (human task, Section 14 Phase 0 task 8)" — the spike React app is the
  human's job in Google AI Studio, not implemented here.

## Commands run and output (abbreviated, real)

`make` is not available on this Windows workstation, so the `make verify`
gates (defined in `Makefile`) were run directly via `uv run`, exactly as
the Makefile specifies:

```
$ uv run ruff check .
All checks passed!

$ uv run ruff format --check .
22 files already formatted

$ uv run mypy src/swarmway/domain src/swarmway/solver
Success: no issues found in 2 source files

$ uv run pytest -q
.                                                                        [100%]
1 passed in 0.22s
```

Health endpoint (exit criterion: `curl localhost:8000/api/health`):

```
$ python -c "import urllib.request; r=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8000/api/health')); print(r.status); print(r.read().decode())"
HTTP 200
{"status":"ok","version":"0.1.0","solvers":["cbs","pp-fixed","pp-best-of-n"],"caps":{"max_agents":60,"max_grid_cells":262144,"solve_budget_ms":10000,"trace_event_cap":20000}}
```
(uvicorn `swarmway.api.app:app` was started on `127.0.0.1:8000`, the
health endpoint polled with Python urllib since PowerShell
`Invoke-WebRequest` is unavailable in NonInteractive mode, then the
server was stopped.)

Map character census (A-1/A-2/A-3 evidence):

```
== CHARACTER CENSUS (curated maps) ==
map                        family     dims         chars present
empty-16-16                empty      16x16         passable=['.'] blocked=[] other=[]
                                                     .:256
random-32-32-10            random     32x32         passable=['.'] blocked=['@'] other=[]
                                                     .:922, @:102
random-32-32-20            random     32x32         passable=['.'] blocked=['@', 'T'] other=[]
                                                     .:819, @:204, T:1
maze-32-32-2               maze       32x32         passable=['.'] blocked=['@'] other=[]
                                                     .:666, @:358
room-32-32-4               room       32x32         passable=['.'] blocked=['@'] other=[]
                                                     .:682, @:342
warehouse-10-20-10-2-1     warehouse  161x63         passable=['.'] blocked=['T'] other=[]
                                                     .:5699, T:4444
ht_chantry                 game       162x141        passable=['.'] blocked=['@', 'T'] other=[]
                                                     .:7461, @:13750, T:1631

== .SCEN SANITY (first even scen, first 3 lines) ==
empty-16-16: 128 problem lines; header='version 1'
    ['0', 'empty-16-16.map', '16', '16', '10', '8', '8', '5', '3.82842712']
    ['3', 'empty-16-16.map', '16', '16', '9', '11', '0', '1', '13.72792206']
    ['1', 'empty-16-16.map', '16', '16', '13', '10', '8', '11', '5.41421356']
...
ht_chantry: 460 problem lines; header='version 1'
    ['41', 'ht_chantry.map', '162', '141', '91', '31', '72', '124', '166.95331879']
    ['15', 'ht_chantry.map', '162', '141', '127', '62', '89', '100', '63.11269836']
    ['7', 'ht_chantry.map', '162', '141', '74', '25', '45', '25', '29.00000000']

== DISTANCE SANITY (start->goal vs optimal-length) ==
empty-16-16   line 0   (10, 8) -> (8, 5)   manhattan 5.0   octile 3.828   optimal-len 3.82842712
random-32-32-10 line 6 (16, 6) -> (1, 20)  manhattan 29.0  octile 20.799  optimal-len 24.31370850
maze-32-32-2  line 16  (1, 20) -> (8, 2)   manhattan 25.0  octile 20.899  optimal-len 64.89949493
warehouse-... line 17  (120, 43) -> (58, 36) manhattan 69.0 octile 64.899 optimal-len 69.00000000
```

Network access is available, so Task 4 was completed fully (real data
downloaded from movingai.com) rather than taking the no-network
`DATA_NEEDED.md` path.

## Manual check

- `uv run swarmway --help` is not yet implemented (CLI skeleton arrives
  Phase 1/4); `uv run swarmway` prints the skeleton banner via logging
  (no `print()` in `src/`, per rule 5).
- `docs/contracts/openapi-v1.json` contains exactly one path: `/api/health`.
- CI workflow frontend job: `check-frontend` step tests
  `[ -f frontend/package.json ]`; install/build steps run only when true,
  so the job skips gracefully now and un-skips once the AI Studio export
  adds `package.json`.

## Deviations from PROJECT.md

- PROJECT.md, AGENTS.md, and Swarmway_PHASE0_PROMPT.md exist at the repo
  root (prerequisites done by the human) but are intentionally NOT
  committed per the user's instruction; the Section 14 commit example
  `docs(project): add PROJECT.md and AGENTS.md` is therefore omitted.
- `make verify` gates run directly via `uv run` on this Windows machine
  (`make` unavailable); the `Makefile` is present and identical for
  CI/Linux/macOS.
- The `.scen` `optimal-length` column matches octite distance on open
  ground (benchmark single-agent lengths use 8-connected movement), but
  per Section 7.7 it is a cross-check only, not a MAPF bound; the solver
  uses 4-connected movement per ADR-0006. Noted in ADR-0006.

## Spike report — Phase 0 task 8 (AI Studio spike landed)

The AI Studio spike was exported as `kinetic-grid-agents.zip` and landed
in `frontend/` following the ZIP path of ADR-0003 (proven end-to-end).

Export contents (raw AI Studio ZIP): `index.html`, `package.json`,
`tsconfig.json`, `vite.config.ts`, `README.md`, `.gitignore`, `.env.example`,
`bun.lock`, `metadata.json`, `src/` (App.tsx, main.tsx, index.css,
types.ts, logic/{gridNavigation.ts, gridNavigation.test.ts},
components/{CanvasScene, ExtrudedGrid, AgentSpectra, AgentApex, AgentTrail,
HudOverlay}.tsx), and `.aistudio/` (artifact/media storage).

Stripped per G.1 whitelist: `.aistudio/` directory, `metadata.json`,
`.env.example`, `bun.lock`. Replaced `package.json` with the runtime
whitelist (react, react-dom, three, @react-three/fiber, @react-three/drei,
@tailwindcss/vite, tailwindcss, @vitejs/plugin-react, tsx, typescript,
@types/*, three-stdlib). Removed unused AI Studio injections
(@google/genai, express, dotenv, lucide-react, motion, @types/express,
autoprefixer). Created `pnpm-workspace.yaml`
(`onlyBuiltDependencies: [esbuild]`). Removed the HMR/watch `server:`
block from `vite.config.ts`. Retitled `index.html` to "Swarmway".
Replaced `.gitignore` with the whitelist
(`node_modules/`, `dist/`, `coverage/`, `.DS_Store`, `*.log`, `.env*`).
Verified `src/` has no gemini/genai/firebase/express/dotenv/
process.env/import.meta.env/fetch/URL references.

Real output of the A5 build steps:

```
$ pnpm -C frontend install
Progress: resolved 105, reused 39, downloaded 66, added 105, done
dependencies:
+ @react-three/drei 10.7.9
+ @react-three/fiber 9.8.2
+ react 19.3.1
+ react-dom 19.3.1
+ three 0.187.0
devDependencies:
+ @tailwindcss/vite 4.3.3
...
+ typescript 5.9.3
+ vite 8.3.5
Packages: +105
(esbuild postinstall approved via `pnpm approve-builds esbuild`)

$ pnpm -C frontend typecheck
$ tsc --noEmit
(clean, no errors)

$ pnpm -C frontend test
$ tsx --test src/logic/gridNavigation.test.ts
✔ gridToWorld centers grid correctly
✔ manhattanDistance calculates correct distance
✔ isValidCell respects grid boundaries
✔ getNeighbors returns only valid orthogonal neighbors
✔ chooseNextCell navigates towards destination
✔ chooseNextCell avoids occupied cells when alternative paths exist
✔ smoothStep clamps and eases progress
✔ interpolateAgentPosition yields smooth movement and arc
ℹ tests 8   ℹ pass 8   ℹ fail 0   ℹ duration_ms 549.7104

$ pnpm -C frontend build
✓ 577 modules transformed.
dist/index.html                     0.86 kB │ gzip:   0.41 kB
dist/assets/index-B11CORXP.js   1,183.95 kB │ gzip: 323.23 kB
✓ built in 745ms
```
(The `__dirname` Vite config warning is a notice, not an error, and was
left as-is; it does not fail the build.)

Two scale learnings carried into Phase 5:
1. Per-cell `useFrame` + per-frame `setState` in `CanvasScene` re-render
   every agent every frame → replace with instanced meshes + ref-driven
   rendering before 100-agent traces at 60 fps.
2. Offline-first with hardcoded demo data; real traces arrive in Phase 4+.

## Commits in this phase

- f859c76 chore(repo): init uv package with ruff mypy pytest pre-commit
- 42a66e8 docs(decisions): add ADR-0001 and ADR-0002
- 60142a7 feat(data): vendor curated movingai maps and scenarios with attribution
- a888528 docs(decisions): add ADR-0006 (movement model) and ADR-0007 (map passability)
- 64b35cd feat(api): add health endpoint with cors and openapi export
- b5f272b ci(github): add backend and frontend jobs
- 370dc65 chore(ui): add frontend README placeholder (AI Studio spike lands here)
- cadbb65 feat(ui): add ai studio spike frontend (3d grid render)
- <closeout> docs(decisions): record spike report and ADR-0003, close phase 0

Exit criteria met: CI gates green locally (backend job runs on push/PR;
frontend job now runs for real with `frontend/package.json` present);
health endpoint answers locally (`HTTP 200`); the AI Studio spike is
committed, builds, and passes 8 tests; ADR-0003 closes assumption A-5;
every Section 4 row (A-1..A-10) is either resolved with an ADR
(ADR-0006/0007 for A-1/A-2; A-3 confirmed by census; A-4/A-5/A-6/A-7/A-8
recorded in ADR-0002/docs/ADR-0003; A-9/A-10 deferred to later phases per
Section 4) or explicitly using the documented default.

Phase 0 closed. Do not start Phase 1 until this gate is reviewed.
