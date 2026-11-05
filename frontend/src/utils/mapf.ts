import type {
  AgentSpec,
  BundledReplayMeta,
  GridPoint,
  RoutePath,
  Trace,
} from '../types';

const PASSABLE_CHARS = new Set(['.', 'G', 'S', 'W']);
const BLOCKED_CHARS = new Set(['@', 'O', 'T']);

export function isPassableChar(ch: string): boolean {
  if (PASSABLE_CHARS.has(ch)) return true;
  if (BLOCKED_CHARS.has(ch)) return false;
  return ch === '.';
}

export interface ParsedGrid {
  width: number;
  height: number;
  freeCells: GridPoint[];
  blockedCells: GridPoint[];
}

export function parseGridRows(width: number, height: number, rows: string[]): ParsedGrid {
  const freeCells: GridPoint[] = [];
  const blockedCells: GridPoint[] = [];

  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '.';
      if (isPassableChar(ch)) {
        freeCells.push([x, y]);
      } else {
        blockedCells.push([x, y]);
      }
    }
  }

  return { width, height, freeCells, blockedCells };
}

export function isCellPassable(rows: string[], x: number, y: number): boolean {
  if (y < 0 || y >= rows.length) return false;
  const row = rows[y];
  if (!row || x < 0 || x >= row.length) return false;
  return isPassableChar(row[x]);
}

export type AgentArchetype = 'capsule' | 'cube' | 'pawn' | 'cylinder';

export interface AgentVisualIdentity {
  color: string;
  darkColor: string;
  archetype: AgentArchetype;
  badgeText: string;
  shapeSymbol: string;
}

/**
 * Curated matte architectural palette — zero neon/rainbow gaudiness,
 * distinct luminance + hue + 4 geometric archetypes + numeric index badge
 * so agents are never distinguished by color alone.
 */
const AGENT_PALETTE: ReadonlyArray<{ fill: string; dark: string }> = [
  { fill: '#1E40AF', dark: '#1E3A8A' }, // Cobalt
  { fill: '#B45309', dark: '#92400E' }, // Ochre Amber
  { fill: '#0F766E', dark: '#115E59' }, // Deep Teal
  { fill: '#9F1239', dark: '#881337' }, // Terracotta Crimson
  { fill: '#4338CA', dark: '#3730A3' }, // Indigo Slate
  { fill: '#3F6212', dark: '#365314' }, // Olive Moss
  { fill: '#7E22CE', dark: '#6B21A8' }, // Plum
  { fill: '#0369A1', dark: '#075985' }, // Cerulean
  { fill: '#A16207', dark: '#854D0E' }, // Warm Brass
  { fill: '#BE185D', dark: '#9D174D' }, // Rose Madder
  { fill: '#15803D', dark: '#166534' }, // Forest
  { fill: '#334155', dark: '#1E293B' }, // Graphite
];

const ARCHETYPES: ReadonlyArray<{ kind: AgentArchetype; symbol: string }> = [
  { kind: 'capsule', symbol: '●' },
  { kind: 'cube', symbol: '■' },
  { kind: 'pawn', symbol: '◆' },
  { kind: 'cylinder', symbol: '⬢' },
];

export function getAgentIdentity(agentId: number): AgentVisualIdentity {
  const idx = Math.max(0, Math.floor(agentId));
  const swatch = AGENT_PALETTE[idx % AGENT_PALETTE.length];
  const arch = ARCHETYPES[idx % ARCHETYPES.length];
  return {
    color: swatch.fill,
    darkColor: swatch.dark,
    archetype: arch.kind,
    badgeText: String(agentId),
    shapeSymbol: arch.symbol,
  };
}

/**
 * Smooth eased interpolation for within-tick movement [0..1].
 * Under prefers-reduced-motion, steps jump cleanly without easing.
 */
export function easeStepProgress(u: number, reducedMotion: boolean): number {
  const clamped = Math.max(0, Math.min(1, u));
  if (reducedMotion) {
    return clamped >= 0.999 ? 1 : 0;
  }
  // Smooth cubic in-out with gentle arrival
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/**
 * Computes the last timestep before an agent permanently settles at its goal.
 * If the agent starts at its goal and never leaves, returns 0.
 */
export function getAgentPermanentArrivalTick(
  path: ReadonlyArray<GridPoint>,
  goal: GridPoint
): number {
  if (path.length === 0) return 0;
  let lastNonGoal = -1;
  for (let t = 0; t < path.length; t++) {
    const pt = path[t];
    if (pt[0] !== goal[0] || pt[1] !== goal[1]) {
      lastNonGoal = t;
    }
  }
  return Math.min(path.length - 1, lastNonGoal + 1);
}

export interface InterpolatedAgentPose {
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  settledAtGoal: boolean;
  isMovingThisStep: boolean;
  stepBounce: number;
  headingRad: number;
}

/**
 * Computes exact interpolated board coordinates [x, y] for an agent at continuous clock `time`
 * in [0, makespan].
 */
export function sampleAgentPose(
  path: ReadonlyArray<GridPoint>,
  agent: AgentSpec,
  time: number,
  reducedMotion: boolean
): InterpolatedAgentPose {
  if (path.length === 0) {
    return {
      x: agent.start[0],
      y: agent.start[1],
      cellX: agent.start[0],
      cellY: agent.start[1],
      settledAtGoal:
        agent.start[0] === agent.goal[0] && agent.start[1] === agent.goal[1],
      isMovingThisStep: false,
      stepBounce: 0,
      headingRad: 0,
    };
  }

  const maxTick = path.length - 1;
  const clampedTime = Math.max(0, Math.min(maxTick, time));
  const t0 = Math.min(maxTick, Math.floor(clampedTime));
  const t1 = Math.min(maxTick, t0 + 1);
  const rawFrac = clampedTime - t0;

  const p0 = path[t0];
  const p1 = path[t1];
  const moved = p0[0] !== p1[0] || p0[1] !== p1[1];
  const alpha = easeStepProgress(rawFrac, reducedMotion);

  const x = p0[0] + (p1[0] - p0[0]) * alpha;
  const y = p0[1] + (p1[1] - p0[1]) * alpha;

  const arrivalTick = getAgentPermanentArrivalTick(path, agent.goal);
  const settledAtGoal = clampedTime >= arrivalTick && arrivalTick <= maxTick &&
    path[maxTick][0] === agent.goal[0] && path[maxTick][1] === agent.goal[1];

  // Subtle arrival settle pulse right as an agent reaches its permanent goal tick
  let stepBounce = 0;
  if (!reducedMotion) {
    if (moved) {
      // Gentle hover arc mid-step
      stepBounce = Math.sin(rawFrac * Math.PI) * 0.045;
    } else if (
      arrivalTick > 0 &&
      clampedTime >= arrivalTick &&
      clampedTime <= arrivalTick + 0.45
    ) {
      const local = (clampedTime - arrivalTick) / 0.45;
      stepBounce = Math.sin(local * Math.PI) * 0.055 * (1 - local);
    }
  }

  // Determine heading from most recent non-zero motion
  let headingRad = 0;
  if (moved) {
    headingRad = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
  } else {
    for (let k = t0; k > 0; k--) {
      const prev = path[k - 1];
      const curr = path[k];
      if (curr[0] !== prev[0] || curr[1] !== prev[1]) {
        headingRad = Math.atan2(curr[0] - prev[0], curr[1] - prev[1]);
        break;
      }
    }
  }

  const nearestCell = rawFrac < 0.5 ? p0 : p1;

  return {
    x,
    y,
    cellX: nearestCell[0],
    cellY: nearestCell[1],
    settledAtGoal,
    isMovingThisStep: moved,
    stepBounce,
    headingRad,
  };
}

/**
 * Extracts a short trailing history of positions behind `time` for the fading trail ribbon.
 */
export function sampleTrailPoints(
  path: ReadonlyArray<GridPoint>,
  time: number,
  reducedMotion: boolean,
  windowSteps = 3.2,
  samples = 14
): Array<{ x: number; y: number; fade: number }> {
  if (path.length < 2 || time <= 0.01) return [];
  const maxTick = path.length - 1;
  const endT = Math.max(0, Math.min(maxTick, time));
  const startT = Math.max(0, endT - windowSteps);
  if (endT - startT < 0.02) return [];

  const result: Array<{ x: number; y: number; fade: number }> = [];
  for (let i = 0; i <= samples; i++) {
    const frac = i / samples;
    const sampleT = startT + (endT - startT) * frac;
    const t0 = Math.min(maxTick, Math.floor(sampleT));
    const t1 = Math.min(maxTick, t0 + 1);
    const localU = easeStepProgress(sampleT - t0, reducedMotion);
    const p0 = path[t0];
    const p1 = path[t1];
    result.push({
      x: p0[0] + (p1[0] - p0[0]) * localU,
      y: p0[1] + (p1[1] - p0[1]) * localU,
      fade: frac,
    });
  }
  return result;
}

/**
 * Validates that a Trace object conforms to the Swarmway Trace v1 schema
 * and checks whether any vertex or edge collisions exist in `execution.paths`.
 */
export interface PathCollisionCheck {
  valid: boolean;
  vertexConflicts: number;
  edgeConflicts: number;
}

export function verifyExecutionCollisionFree(trace: Trace): PathCollisionCheck {
  const { paths, makespan } = trace.execution;
  if (paths.length === 0 || makespan === 0) {
    return { valid: true, vertexConflicts: 0, edgeConflicts: 0 };
  }

  let vertexConflicts = 0;
  let edgeConflicts = 0;

  for (let t = 0; t <= makespan; t++) {
    const occupied = new Map<string, number>();
    for (let i = 0; i < paths.length; i++) {
      const pt = paths[i]?.[t];
      if (!pt) continue;
      const key = `${pt[0]},${pt[1]}`;
      if (occupied.has(key)) {
        vertexConflicts++;
      } else {
        occupied.set(key, i);
      }
    }

    if (t < makespan) {
      for (let i = 0; i < paths.length; i++) {
        const a0 = paths[i]?.[t];
        const a1 = paths[i]?.[t + 1];
        if (!a0 || !a1) continue;
        for (let j = i + 1; j < paths.length; j++) {
          const b0 = paths[j]?.[t];
          const b1 = paths[j]?.[t + 1];
          if (!b0 || !b1) continue;
          if (
            a0[0] === b1[0] &&
            a0[1] === b1[1] &&
            a1[0] === b0[0] &&
            a1[1] === b0[1]
          ) {
            edgeConflicts++;
          }
        }
      }
    }
  }

  return {
    valid: vertexConflicts === 0 && edgeConflicts === 0,
    vertexConflicts,
    edgeConflicts,
  };
}

export function normalizeRoutePath(pathname: string): RoutePath {
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (
    clean === '/' ||
    clean === '/workspace' ||
    clean === '/replays' ||
    clean === '/benchmarks' ||
    clean === '/about'
  ) {
    return clean;
  }
  return '/';
}

export const BUNDLED_REPLAYS: ReadonlyArray<BundledReplayMeta> = [
  {
    id: 'corridor-yield',
    file: '/traces/corridor-yield-cbs.json',
    comparisonFile: '/traces/corridor-yield-pp.json',
    title: 'Single-Lane Corridor Yield',
    story:
      'Three agents meet inside a narrow 1-tile bottleneck flanked by recessed alcoves, stepping aside into an alcove pocket so opposing traffic clears without collision.',
  },
  {
    id: 'warehouse-aisles',
    file: '/traces/warehouse-aisles-cbs.json',
    comparisonFile: '/traces/warehouse-aisles-pp.json',
    title: 'Warehouse Cross-Aisle Dispatch',
    story:
      'Twelve fulfillment robots weave through parallel storage racks on a 14×10 floor. Vertex and edge-swap collisions at aisle intersections are resolved cleanly via Constraint Tree branching.',
  },
  {
    id: 'plaza-rotary',
    file: '/traces/plaza-rotary-cbs.json',
    title: 'Courtyard Rotary Exchange',
    story:
      'Eight agents positioned around an open 10×10 courtyard with central pillars cross opposite quadrants simultaneously, coordinating smooth mid-plaza yields.',
  },
  {
    id: 'pocket-deadlock-unsat',
    file: '/traces/pocket-deadlock-pp-unsat.json',
    comparisonFile: '/traces/pocket-deadlock-cbs.json',
    title: 'Goal-Blocking Pocket (Baseline Failure vs CBS)',
    story:
      'Agent 0 reaches its goal early at the mouth of a 1-wide cul-de-sac, sealing Agent 1 out when planned sequentially (UNSAT). Comparing with CBS shows how delaying Agent 0 unlocks an optimal plan.',
  },
  {
    id: 'perf-100-agent-empty-16-16',
    file: '/traces/perf-100-agent-empty-16-16.json',
    title: '100-Agent Performance Scene (empty 16×16)',
    story:
      'Performance demonstration: 100 fulfillment robots stepping one tile right in parallel on an empty 16×16 floor. Solved by CBS in under budget with sum-of-costs 100 and makespan 1. Bundle only — used for the integrated-GPU performance pass (Section 11.6).',
  },
];

/**
 * Derives the discrete integer timestep in [0, makespan] from a continuous clock value.
 * Used so React UI state updates only when the displayed integer timestep changes.
 */
export function getPlaybackDisplayStep(time: number, makespan: number): number {
  if (makespan <= 0 || !Number.isFinite(time)) return 0;
  const clamped = Math.max(0, Math.min(makespan, time));
  return Math.min(makespan, Math.floor(clamped + 1e-6));
}

/**
 * Computes normalized [0, 1] scrubber progress ratio for direct DOM transform updates.
 */
export function getScrubberProgress(time: number, makespan: number): number {
  if (makespan <= 0 || !Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(1, time / makespan));
}

