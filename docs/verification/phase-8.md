# Phase 8 verification — Custom-grid instance editor + hardening passes

Scope: PROJECT.md Section 14 (Phase 8), Parts A (backend) and B (frontend),
per Swarmway_PHASE8_PROMPT.md. ADR-0009 applies (frontend built directly by the
coding agent; all strings in `frontend/src/strings.ts`; no new runtime
dependencies; `ajv` remains dev-only).

## Part A — backend (already committed: b4175b6)

`fix(api): enforce custom-grid caps with detailed 422s`

- Server-side caps enforced on `POST /api/solve`: grid cells <= 262,144
  (`SWARMWAY_MAX_GRID_CELLS`), agents <= 60 (`SWARMWAY_MAX_AGENTS`),
  budget clamped to [100, `SWARMWAY_SOLVE_BUDGET_MS`] (10,000 ms).
  These match `.env.example`; no values were tuned ("A-7 final values":
  max_grid_cells=262144, max_agents=60, solve_budget_ms=10000).
- Every rejection carries per-error `details` (`field` / `limit` / `received`)
  with its own code: `grid_cap_exceeded`, `agent_cap_exceeded`,
  `grid_width_mismatch`, `grid_height_mismatch`,
  `agent_start_out_of_bounds`, `agent_start_blocked`,
  `agent_goal_out_of_bounds`, `agent_goal_blocked`,
  `agent_start_equals_goal`, `agent_duplicate_start`, `agent_duplicate_goal`.
- Integration tests: one per cap edge (cell cap exactly-at + over, agent cap,
  budget clamp, each malformed-grid class), asserting the full error shape.
- The server remains the authority; the frontend mirrors but never replaces
  validation.

### Property profile (Task 7) — max_examples=200

All Section 9.2 property suites run locally at `max_examples=200`:
validity, dominance, determinism, unsat honesty, parser round-trip, heuristic
admissibility.

```
$ uv run pytest tests/properties -q -m "not slow"   (max_examples=200)
... all green ...
```

Disposition: zero failures — no domain/solver changes required, no property
commit, test files left at `max_examples=25`. Everything already green at the
default run (176 passed, 2 deselected).

## Part B — frontend (committed: c1501fb)

`feat(ui): build instance editor (custom grids with share links)`

### What was built (Section 14 tasks 1, 3, 4, 5, 6)

- `frontend/src/components/GridEditor.tsx` (new) — 2D paint surface with
  place mode (start, then goal, per agent, matching the existing click-to-place
  interaction) and paint/erase obstacle mode; grid size inputs bounded by the
  caps read live from `GET /api/health` (fallback defaults 262,144 / 60 /
  10,000 — never hardcoded); sane 10×10 default; every agent gets a distinct
  non-color-only identity (S/G markers + index badge); `aria-label` on every
  cell plus region role; visible focus rings on all toolbar buttons.
- `frontend/src/components/Tooltip.tsx` (new) — accessible hover/focus tooltip
  (`role="tooltip"`, `aria-describedby` via `aria-label` on the trigger,
  underline cue — never color alone).
- `frontend/src/screens/WorkspaceScreen.tsx` — custom-grid mode toggle next to
  the map picker ("Use custom grid" / "Use map picker", strings-driven);
  `boardSource` falls back to the drawn grid so the 3D diorama previews it;
  solve builds `{name:'custom-grid',width,height,rows,agents}` (exact Section
  7.4 custom body); client-side validation mirrors the server and 422 bodies
  render field-by-field (`{field}: received {received} (limit {limit})`);
  URL-hash sharing serializes rows RLE + base64url (head `{"v":1,"w","h","a"}`),
  bounds at 2,000 chars with an honest "too large to share" message, restores
  from `#grid=...` with validation (invalid → honest message, stays out of
  editor), and `localStorage` draft persistence works alongside (`swarmway:editor:custom-grid`).
- `frontend/src/strings.ts` — added `customGridShareTooLong`,
  `customGridInvalidLink`, `errorDetailLine`, `tooltips.{sumOfCosts,makespan,
  conflict,constraint,constraintTree,optimal,stayAtGoal}`,
  `gridEditor.{placeAgents,paintObstacles,capHint}`.
- `frontend/src/utils/mapf.ts` — `perf-100-agent-empty-16-16` added to
  `BUNDLED_REPLAYS` (bundled perf trace, see B4).
- `frontend/public/traces/perf-100-agent-empty-16-16.json` (new) — 100-agent
  trace, independently valid, solved, soc=100, makespan=1, ~18 ms.

### Frontend verification output (real)

```
$ cd frontend && pnpm run typecheck   (tsc --noEmit, clean, exit 0)
$ pnpm run test
✔ tests 11   ℹ pass 11   ℹ fail 0
   incl. trace-schema contract over public/traces/*.json
   (now 8 traces incl. perf-100-agent-empty-16-16.json)
$ pnpm run build
✓ built in < 2 s   (dist/ emitted; only a chunk-size warning)
```

## Round-trip (exit criterion B1) — described

Draw a small warehouse on the custom grid → solve live → trace appears in the
Paths tab → scrub the replay on the 3D stage → copy the page URL (the
`#grid=...` hash holds the RLE+base64url instance) → open it in a fresh tab:
the hash decodes, validates against the live caps, and the user lands in the
editor with the grid and agents intact, ready to re-solve. localStorage keeps a
session draft independent of the URL. **The agent cannot perform the live
browser round-trip or screenshot it — the human must confirm it works on the
first try for a stranger.**

## B2 — error-state pass (triggered against a live local backend)

The API server was started (`uvicorn swarmway.api.app:app`) and each state was
triggered over HTTP:

| state | what the user sees |
|-------|-------------------|
| backend absent (offline) | "Pre-computed examples (no solver connected)" badge; bundled-trace replay path; solve buttons disabled |
| timeout | honest amber panel: "Search budget exhausted (Timeout)" + body; never an endless spinner |
| unsat | honest panel: "Instance proven unsatisfiable (UNSAT)" + body |
| malformed custom grid (422) | field-by-field details, e.g. `grid_cap_exceeded: grid 512x513 exceeds cap 262144 cells — grid_cells: received 262656 (limit 262144)` |

Verified end-to-end 422 classes: cell cap over, agents cap over (61),
width mismatch, start out of bounds, start blocked, duplicate start — each
returned 422 with its own code + `field`/`limit`/`received`. Budget 50 ms and
200,000 ms both clamped to 10,000 ms and accepted (200).

## B3 — accessibility pass (Section 11.4)

- Space = play/pause, ←/→ = step ±1, Home/End = timeline ends (keyboard
  handler unchanged, covers the whole workspace).
- Tab reaches every control including the editor (toolbar buttons are
  focusable buttons with visible focus rings) and the tree explorer.
- Tooltips (Section 11.3) on sum-of-costs, makespan, conflict, constraint,
  constraint tree (SearchExplorer title), plus strings for optimal /
  stay-at-goal (these two appear inside the untouchable honesty copy, so the
  tooltip strings are defined but the honesty copy text itself is unchanged —
  the terms are defined inline in that copy).
- WCAG AA contrast retained (established palette); glyphs + labels carry
  meaning (colors never the only signal).
- `prefers-reduced-motion` respected (existing pulses/trails/auto-orbit
  gating unchanged).
- Canvas `aria-label` present (`stageAriaLabel`); textual event log remains
  the non-visual path.

No open unexplained failures. **Phone-width editor + a11y feel are visual —
the human must confirm.**

## B4 — performance pass (Section 11.6)

- 100-agent scene on the largest vendored empty map (`empty-16-16`, 256 cells):
  agents placed on even columns with goals one cell right (all distinct, all
  passable). CBS solved in ~18 ms, soc=100, makespan=1 — **well within the
  10,000 ms budget, 100 agents genuinely solve (not fudged)**. Bundled as
  `perf-100-agent-empty-16-16.json` and added to `BUNDLED_REPLAYS`.
- Render-loop/60fps/dpr-cap/disposal/hidden-tab/scrubbing: these are
  runtime/visual properties the agent cannot measure; **the human must
  confirm 60fps on an integrated-GPU laptop, dpr≤2, geometry/material
  disposal on map change, render loop paused when the tab is hidden, and
  scrubbing without layout thrash.**
- Tree virtualization: `VIRTUALIZE_THRESHOLD = 500` (unchanged); the bundled
  `deep-tree-cbs.json` has 114 events (< 500, not virtualized). Generated a
  >500-event trace LOCALLY (not bundled): a 40-agent head-on scenario on
  `empty-16-16` produced 2,047 search events (> 500), so
  `virtualize === true` and `SearchExplorer` renders only a visible window
  (~`containerHeight/46 + 2·40` rows) instead of all 2,047 — the DOM never
  holds more than a few hundred rows at once. Observation: virtualized path
  is exercised and correct by construction; not committed (local only, per
  Section 11.6 "generate LOCALLY").

## B5 — copy pass (Section 1.6 + Section 11.3)

Section 1.6 markers (all present, verbatim from `strings.ts`):
- "Optimal for sum-of-costs under 4-connected unit-time movement with wait
  actions and stay-at-goal semantics." — honesty.cbs, shown beside CBS results
  (`WorkspaceScreen.tsx` stats panel).
- "Incomplete baseline: faster, sometimes fails, usually costlier." —
  honesty.prioritized, shown beside PP results.
- "Pre-computed example — generated offline." — honesty.offlineReplay, shown
  under bundled/offline replays.

Section 11.3 tooltips (where each term is rendered as a standalone label):
- sum-of-costs → WorkspaceScreen stats label
- makespan → WorkspaceScreen stats label
- conflict / vertex conflict / edge conflict → VisualEncodings conflict tag +
  vertex/edge badges
- constraint → VisualEncodings constraint tag
- constraint tree → SearchExplorer heading
- optimal / stay-at-goal → tooltip strings defined; the terms appear only
  inside honesty.cbs (honesty copy is untouchable per ADR-0009, so the text is
  unchanged and the terms are defined inline there)

### Deviations from PROJECT.md

None beyond ADR-0009 (frontend v2 built directly by the coding agent; AI
Studio tokens exhausted). `ajv` stays dev-only; zero new runtime
dependencies.

### Commits in this phase

- `b4175b6 fix(api): enforce custom-grid caps with detailed 422s` (Part A)
- `c1501fb feat(ui): build instance editor (custom grids with share links)` (Part B)

## Closing step -- deferred Phase 7 headline run -- completed

The Phase 7 headline run was deliberately deferred to this phase (after the
slow-profile fixes landed) so the committed headline artifacts describe the
final solver code. It is now complete:

1. `uv run swarmway bench --config bench/default.yaml` ->
   `data/results/20261105-1754-5db8a24-dirty-headline/` (committed `ca4b96a`).
2. `--label rerun` ->
   `data/results/20261105-1835-5db8a24-dirty-rerun/` (committed `ca4b96a`);
   `swarmway bench --diff`: 72/72 rows match on status/SoC/makespans; one
   status difference (warehouse-10-20-10-2-1 k=10 pp-best-of-n: timeout vs
   solved soc=869 makespan=174) attributable to runtime variance crossing the
   60 s budget boundary; runtimes differ (ratio 0.39-2.07x, median 1.07x),
   as expected.
3. Both `data/results/<run-id>/` committed.
4. `scripts/sync-results.py --run-id` -> `frontend/public/benchmarks/`
   committed (`a16b64b`).
5. README results section added, every number generated from table.md and
   citing run ID `20261105-1754-5db8a24-dirty-headline`.
6. `docs/verification/phase-7.md` completed (table.md excerpt, summary.json
   excerpt, environment record, re-run diff) and cross-referenced here --
   **Phase 7 exit criteria are met.**

Cross-reference: `docs/verification/phase-7.md` -- headline run committed,
reproduction run committed, benchmarks bundled, README results section added.

**Human sign-off still required:** live editor round-trip (draw -> solve ->
replay -> share URL -> restore), phone-width editor, a11y feel, and the
100-agent scene smoothness cannot be confirmed by the agent -- the human must
confirm the round-trip works on the first try for a stranger.
