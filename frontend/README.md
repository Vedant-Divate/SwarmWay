# Swarmway frontend — Phase 0 AI Studio spike (R3F 3D grid render)

This directory holds the Google AI Studio Build-mode spike exported as a ZIP,
cleaned to the Appendix G.1 whitelist, and synced into this repo per
PROJECT.md Section 13.5. The spike is a throwaway proof of the two-workspace
pipeline: a 7×7 extruded 3D grid with two procedural agents gliding between
cells, built with React Three Fiber.

## What it is

- Pure client-side React + TypeScript + Vite SPA — no server, no API keys,
  no network calls. Hardcoded demo data only.
- 7×7 grid, 2 agents patrolling with Manhattan-distance pathfinding, hover
  trails, and a HUD.
- Real traces and live solving arrive in later phases (Phase 4+); this spike
  intentionally contains no solver or API integration.

## Commands

```bash
pnpm install        # install dependencies (frozen lockfile once generated)
pnpm run dev        # start dev server on :5173
pnpm run build      # production build (outputs dist/)
pnpm run typecheck  # tsc --noEmit
pnpm run test       # tsx --test src/logic/gridNavigation.test.ts (8 tests)
```

## Known scale gaps (to fix in Phase 5)

1. Per-cell `useFrame`: `CanvasScene` runs a `useFrame` tick that calls
   `setA1Render`/`setA2Render` every frame — React re-renders per cell per
   frame. Replace with instanced meshes + ref-driven updates so render cost
   is independent of agent/cell count.
2. Per-frame `setState`: telemetry and trail states are updated via
   `useState` setters inside `useFrame`. Drive these through refs and a
   single render pass instead.
