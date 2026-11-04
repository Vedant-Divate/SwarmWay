# ADR-0009: Frontend v2 built directly by coding agent (AI Studio unavailable)

- Status: accepted
- Date: 2026-11-04
- Phase: 6

## Context

Section 14 Phase 6 task 1 assumed an AI Studio Build-mode session to
generate the frontend v2 (search tree explorer + CBS-vs-PP compare
panel). AI Studio Build-mode tokens are exhausted; per the human's
decision, Phase 6 frontend work is implemented directly by the coding
agent in `frontend/`, on top of the sessions-12-13 exported state
(stage-first workspace, SearchExplorer event list, strings.ts, frozen
types.ts, three-stdlib devDependency).

## Decision

The Section 11.8 design-language constraints and the frozen
contract/copy rules bind this agent exactly as they bound AI Studio:

- Pure client-side SPA; API contract and trace schema are FROZEN;
  honesty copy stays exactly where it is; ALL user-visible strings in
  `strings.ts`; strict TypeScript, no `any` in API/trace handling.
- No new runtime dependencies. One new dev dependency allowed: ajv
  (or equivalent JSON-Schema validator) for contract tests only — never
  imported by app code.
- Reuse the established encodings from the sessions-12-13 UI
  (deep-red conflict markers, amber constraint bars, ghost lanes):
  consistency beats novelty (Section 11.8).
- `prefers-reduced-motion` disables pulses/animations; geometries
  disposed on change; dpr capped; no per-frame React state; tree
  virtualized beyond ~500 visible nodes (Section 11.6).
- The Section 13.5 sync procedure (ZIP export from AI Studio) is
  replaced by direct commits in `frontend/`.

## Consequences

- Phase 6 frontend commits land as `feat(ui): ...` / `test(ui): ...`
  authored directly, not via an AI Studio export.
- No change to PROJECT.md, AGENTS.md, or Swarmway_PHASE*.md; they stay
  local per standing rules.
- Deviation from Section 14 task 1 (AI Studio session) is recorded
  here, one ADR, committed before any Phase 6 code.
