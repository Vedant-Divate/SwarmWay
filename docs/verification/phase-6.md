# Phase 6 verification — Search visualization and live compare (PARTIAL GATE — Part A / backend)

## What was built (Part A — backend, Sections 8.5, 8.10, 14 Task 2 + Task 4)

- `src/swarmway/solver/cbs.py` (modified): CBS high level gains `options.tie_break` in
  `{fifo, conflicts, depth}`, default `fifo`. The secondary heap key only reorders
  equal-SoC nodes, so optimality for sum-of-costs is untouched:
  - `fifo`: insertion order (previous behaviour).
  - `conflicts`: prefers nodes whose paths contain more conflicts.
  - `depth`: prefers deeper nodes.
  Ties inside a tie-break resolve by insertion order (deterministic, Section 8.4;
  no unsorted iteration; nodes are never compared against each other because
  `insertion_id` is unique).
- `src/swarmway/solver/__init__.py` (modified): registry runners thread an optional
  `TraceRecorder` through to `cbs.solve`; PP solvers ignore it and keep `search: []`.
- `src/swarmway/cli/main.py` (modified): `solve` gains `--tie-break` (validated;
  only applies to `cbs`). When `--emit-trace` is given, a `TraceRecorder` records the
  search events and the trace `search` block is populated (previously always `[]`).
- `src/swarmway/api/routes.py` (modified): `POST /api/solve` accepts
  `options.tie_break` (422 `invalid_options` on unknown values/options; default `fifo`);
  the seed travels inside `options` so the frozen v1 request shape is unchanged; search
  events are recorded for CBS.
- `src/swarmway/solver/trace.py`: unchanged (pure observer; event cap honored).

## Trace-v1 schema check

`SolverBlock.options` is `dict[str, Any]` (open object) in
`src/swarmway/domain/schemas.py` — `tie_break` flows through with **no schema change**;
the committed `docs/contracts/trace-v1.schema.json` stays valid and the schema-export
staleness test stays green.

## Commands run and output (real, not abbreviated)

```
$ uv run ruff check .
All checks passed!
$ uv run ruff format --check .
84 files already formatted
$ uv run mypy src/swarmway/domain src/swarmway/solver
Success: no issues found in 17 source files
$ uv run pytest tests/optimality tests/unit/solver/test_cbs.py -v
...
tests/optimality/test_optimality.py::test_optimality_per_tie_break[baseline-...-fifo] PASSED
...
tests/optimality/test_optimality.py::test_conflicts_reorders_equal_cost_frontier PASSED
tests/optimality/test_optimality.py::test_depth_reorders_equal_cost_frontier PASSED
tests/unit/solver/test_cbs.py::test_determinism_per_tie_break PASSED
tests/unit/solver/test_cbs.py::test_soc_identical_across_tie_breaks PASSED
============================= 25 passed in 16.08s ==============================
```

Full suite: `152 passed, 2 deselected`.

### Optimality per tie-break (Section 9.3)

`test_optimality_per_tie_break` runs 5 hand-crafted instances × 3 tie-breaks
(`fifo`, `conflicts`, `depth`) plus 15 deterministic random tiny instances × 3
tie-breaks. For every tie-break: `soc_cbs == soc_bruteforce` whenever brute force
finds a solution, and CBS solves whenever brute force does. Optimality is untouched
by tie-break choice.

### Tie-break reorders the equal-cost frontier (observable difference vs fifo, same SoC)

`test_conflicts_reorders_equal_cost_frontier` — 3×3 open grid,
agent0 `(1,1)->(1,0)`, agent1 `(0,0)->(2,0)`, SoC = 4 for all tie-breaks:
- `fifo` expands nodes `(1, 2)`
- `conflicts` expands nodes `(1, 2, 3, 4)`  ← different frontier order
- `depth` expands nodes `(1, 2)`  (same as fifo here)

`test_depth_reorders_equal_cost_frontier` — 3×3 open grid,
agent0 `(2,1)->(0,0)`, agent1 `(1,2)->(1,0)`, SoC = 6 for all tie-breaks:
- `fifo` expands `(1, 2, 3, 4)`
- `conflicts` expands `(1, 2, 3, 4, 5, 6)`
- `depth` expands `(1, 2, 3, 4, 5, 6)`  ← different frontier order

### Determinism per tie-break

`test_determinism_per_tie_break` — same `(instance, options)` twice for each
tie-break: identical paths, SoC, makespan, and all expansion stats (excluding
`runtime_ms`). `test_soc_identical_across_tie_breaks` — final SoC identical
(`{4}`) across all tie-breaks on the frontier-reorder instance.

### Default-options regression diff (empty apart from `runtime_ms`)

Re-emitted `frontend/public/traces/deep-tree-cbs.json` (random-32-32-10, 20 agents,
CBS, default `fifo`) with `--emit-trace` and diffed against the committed file:

```
regen runtime_ms: 566.5046000212897   committed: 554.1301999764983
identical apart from runtime_ms: True
soc: 436 436   events: 114 114
```

Outputs are unchanged from the Phase 5 solver except `runtime_ms`.

## Bundled traces (Section 11.5, Task 4)

Generated with `swarmway solve --emit-trace`, verified with `swarmway replay --check`
(all `VALIDITY: valid`), added through `scripts/bundle-traces.py`:

| trace | story | agents | soc | makespan | search events |
| --- | --- | --- | --- | --- | --- |
| `frontend/public/traces/deep-tree-cbs.json` | Deep constraint tree on random-32-32-10 | 20 | 436 | 46 | 114 |
| `frontend/public/traces/many-conflict-cbs.json` | Many conflicts on warehouse-10-20-10 | 20 | 1697 | 174 | 14 |

Timeout trace fixture (contract test only, **not** in `public/traces`):
- `tests/fixtures/timeout-trace.json`: `status: timeout`, `ct_expanded: 512`,
  `budget_ms: 100` (clamped), `VALIDITY: valid` on parse.

Updated bundled-trace list (with existing traces):

| trace | story |
| --- | --- |
| `corridor-yield-cbs.json` / `corridor-yield-pp.json` | corridor yield (CBS + PP) |
| `warehouse-aisles-cbs.json` / `warehouse-aisles-pp.json` | warehouse aisles (CBS + PP) |
| `pocket-deadlock-cbs.json` / `pocket-deadlock-pp-unsat.json` | pocket deadlock (PP honestly unsat) |
| `plaza-rotary-cbs.json` | plaza rotary (CBS only — no bundled PP trace) |
| `deep-tree-cbs.json` | deep constraint tree (NEW) |
| `many-conflict-cbs.json` | many conflicts (NEW) |

Note: `plaza-rotary` has no bundled PP trace (per Part B, show an honest
"no bundled PP trace for this map" rather than fake data).

## Deviations from PROJECT.md

None beyond ADR-0009 (frontend v2 built directly by the coding agent; AI Studio
tokens exhausted), committed as `8fae4b4`.

## Commits in this phase (Part A)

- `8fae4b4 docs(decisions): frontend v2 built by coding agent (ai studio unavailable)`
- `f10dab2 feat(solver): add deterministic tie-break options`
- `d60ba75 feat(scripts): add search-story curated traces`

## Part B — frontend v2 (Sections 14 tasks 1 + 3, built directly per ADR-0009)

### Contract tests (B4)

Added `ajv` (^8.17.1) as a dev-only dependency — never imported by app code.
Rewrote `frontend/src/logic/traceSchema.test.ts` to validate *fully* against the frozen
`docs/contracts/trace-v1.schema.json` via ajv (`allErrors: true, strict: false`; the
schema uses no `format` keywords, so validation covers every required field, type, and
enum — no spot checks). The schema and the timeout fixture live outside `frontend/`
and are read via repo-root-relative paths (`../docs/contracts/trace-v1.schema.json`,
`../tests/fixtures/timeout-trace.json`), which tsx resolves with cwd=frontend/.

```
$ pnpm run test
$ tsx --test src/utils/mapf.test.ts src/logic/traceSchema.test.ts
✔ trace schema contract: every bundled trace validates fully against trace-v1.schema.json
✔ trace schema contract: timeout fixture validates fully against trace-v1.schema.json
✔ parseGridRows classifies MovingAI passable and blocked characters accurately
✔ getAgentIdentity gives distinct non-color-only archetypes and badges
✔ easeStepProgress respects prefers-reduced-motion jump vs smooth cubic curve
✔ sampleAgentPose interpolates cleanly and marks settledAtGoal accurately
✔ sampleTrailPoints generates monotonically increasing fade samples
✔ HERO_LANDING_TRACE is strictly 4-connected, unit-step, and collision-free
✔ All bundled JSON traces in public/traces conform to Trace v1 schema and are
   collision-free when solved
✔ normalizeRoutePath maps valid and fallback SPA routes
✔ getPlaybackDisplayStep and getScrubberProgress gate integer steps...
ℹ tests 11   ℹ pass 11   ℹ fail 0
```

The existing CI frontend test step (`"test": "tsx --test ..."` in
`frontend/package.json`) already runs these; no new workflow was created.

### Tie-break selector (B3)

Workspace solve controls gain a `Tie-break order (CBS)` dropdown
(`fifo` / `conflicts` / `depth`, default `fifo`), sent as
`options.tie_break` on live CBS solves. It only applies to CBS (prioritized ignores
it — the backend rejects unknown options with 422, so prioritized/compare arms send
`options: {}`). In offline mode the whole solve control deck (including the selector)
is hidden; bundled traces are fixed, so there's nothing to tune — an honest note is
shown via the offline notice instead of a disabled/meaningless control.

### Compare panel (B2)

Already present (`ComparePanel`): side-by-side CBS vs Prioritized stats for the same
instance (status, SoC, makespan, runtime, CT expanded, low-level A*), each number
labelled with the run that produced it (`CBS (Optimal)` vs `Prioritized (Baseline)`),
per-agent arrival-step breakdown, `Load onto 3D stage` buttons per arm, and the
mandatory honesty copy verbatim from `strings.ts`:

- CBS: `"Optimal for sum-of-costs under 4-connected unit-time movement with wait actions and stay-at-goal semantics."`
- Prioritized: `"Incomplete baseline: faster, sometimes fails, usually costlier."`

Solve buttons: `CBS`, `Prioritized`, `Compare both`. Live mode POSTs to `/api/solve`
per arm and reuses an existing result for the same instance+solver (no re-solve).
Offline mode pairs bundled CBS+PP traces via `comparisonFile`; `plaza-rotary` has no
bundled PP trace and shows an honest "no bundled PP trace for this map" rather than
fake data.

### Search tab — tree explorer (B1)

`SearchExplorer` evolved from a flat event list to the G.4 spec:

- **Tree layout**: events rendered in chronological (topological) order, indented by
  Constraint Tree depth (root left, children right), with `├─`/`└─` branch glyphs and
  `│` vertical connectors showing the parent→child relationship.
- **Node cards**: each event shows `#seq · EVENT node N · cost C`, plus the conflict
  it resolved (type, agents, position, timestep) and the constraint that created it
  (agent, type, vertex/edge target, timestep) via the established deep-red conflict
  and amber constraint encodings (`ConflictEncodingTag` / `ConstraintEncodingTag`).
- **Seq scrubber + step buttons**: `◀ Step` / `Step ▶` plus a range scrubber
  `1 / N` walk events in order. Selecting an event notifies WorkspaceScreen, which
  seeks the 3D board to the conflict timestep (conflict cell pulses in the 3D stage;
  the added constraint is outlined; the replanned agent's path highlights; others are
  dimmed). The goal event seeks to makespan and shows the final state of all paths.
- **Truncation badge**: when the event stream was capped (`search_truncated`), an
  honest "Trace truncated — every k-th event kept; last 50 + goal event retained."
  badge is shown.
- **Accessibility**: every row is a keyboard-Tab-reachable `<button>` with an
  `aria-label` summarizing seq/event/node/cost/conflict; a synchronized textual event
  log panel lists one line per event (seq, event, node, cost, conflict/constraint
  summary) as the non-visual path; colors are never the only signal (glyphs + labels
  carry meaning). `prefers-reduced-motion` is respected by the stage/agents.

### Phone-width (B5)

Layout uses a single-column stack below the `lg` breakpoint
(`grid-cols-1 lg:grid-cols-[...]`), the playback dock is `w-[min(94%,760px)]`, the
compare table scrolls (`overflow-x-auto`), and the tie-break select is `w-[170px]`
(fits a ~390px viewport with the main `px-4` padding). **Visual confirmation at a
phone (~390 px) viewport is the human's to perform** — the agent cannot screenshot.
The human should confirm: the workspace, tree explorer, and compare panel are usable
at phone width (stage-first grid collapses to a single column; the tree may yield to
the textual event log on narrow viewports — that is the accessible path anyway).

### Scope sanity

- No benchmark page, no instance editor, no `bench/`.
- `ajv` appears only under `devDependencies`; zero new runtime dependencies.
- No `frontend/` source was modified in Part A; Part B touches only `frontend/`.

## Deviations from PROJECT.md

None beyond ADR-0009 (frontend v2 built directly by the coding agent; AI Studio
tokens exhausted), committed as `8fae4b4`.

## Commits in this phase

- `8fae4b4 docs(decisions): frontend v2 built by coding agent (ai studio unavailable)`
- `f10dab2 feat(solver): add deterministic tie-break options`
- `d60ba75 feat(scripts): add search-story curated traces`
- `<feat(ui) commit>` feat(ui): build search tree explorer and compare panel (frontend v2)
- `<test(ui) commit>` test(ui): add trace schema contract tests to ci

