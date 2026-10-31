export interface CellCoord {
  x: number;
  z: number;
}

export interface GridConfig {
  size: number; // e.g. 7 for 7x7 grid
  cellSize: number;
  spacing: number;
  baseHeight: number;
}

export interface AgentState {
  id: string;
  name: string;
  color: string;
  accentColor: string;
  currentCell: CellCoord;
  targetCell: CellCoord;
  position: [number, number, number];
  rotationY: number;
  tilt: [number, number, number];
  progress: number; // 0 to 1
  speed: number;
  mode: 'patrol' | 'destination';
  trail: [number, number, number][];
}

/**
 * Converts grid integer (x, z) to 3D world space (worldX, worldY, worldZ).
 * Grid is centered around (0, 0, 0).
 */
export function gridToWorld(
  cell: CellCoord,
  config: GridConfig
): [number, number, number] {
  const stride = config.cellSize + config.spacing;
  const halfGrid = ((config.size - 1) * stride) / 2;
  const wx = cell.x * stride - halfGrid;
  const wz = cell.z * stride - halfGrid;
  return [wx, config.baseHeight / 2, wz];
}

/**
 * Calculates Manhattan distance between two cells.
 */
export function manhattanDistance(a: CellCoord, b: CellCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/**
 * Checks if cell coordinates are within the grid bounds.
 */
export function isValidCell(cell: CellCoord, size: number): boolean {
  return cell.x >= 0 && cell.x < size && cell.z >= 0 && cell.z < size;
}

/**
 * Get valid orthogonal neighbor cells (no diagonals for clean grid gliding).
 */
export function getNeighbors(cell: CellCoord, size: number): CellCoord[] {
  const deltas: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const results: CellCoord[] = [];
  for (const [dx, dz] of deltas) {
    const next: CellCoord = { x: cell.x + dx, z: cell.z + dz };
    if (isValidCell(next, size)) {
      results.push(next);
    }
  }
  return results;
}

/**
 * Pick next best step towards a destination or random patrol step.
 * Avoids the other agent's current or target cell if specified.
 */
export function chooseNextCell(
  current: CellCoord,
  destination: CellCoord | null,
  size: number,
  occupiedCells: CellCoord[] = [],
  randomSeed?: number
): CellCoord {
  const neighbors = getNeighbors(current, size);
  if (neighbors.length === 0) return current;

  // Filter out occupied cells if possible
  const available = neighbors.filter(
    (n) => !occupiedCells.some((occ) => occ.x === n.x && occ.z === n.z)
  );

  const candidates = available.length > 0 ? available : neighbors;

  // If we have a destination, pick neighbor with minimum Manhattan distance
  if (destination) {
    let best = candidates[0];
    let bestDist = manhattanDistance(best, destination);
    for (let i = 1; i < candidates.length; i++) {
      const d = manhattanDistance(candidates[i], destination);
      if (d < bestDist) {
        bestDist = d;
        best = candidates[i];
      }
    }
    return best;
  }

  // Otherwise, pseudo-random or random neighbor
  if (randomSeed !== undefined) {
    const idx = Math.floor(Math.abs(Math.sin(randomSeed) * candidates.length)) % candidates.length;
    return candidates[idx];
  }
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

/**
 * Smooth step interpolation function (ease in-out).
 */
export function smoothStep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Calculates current 3D position and rotation for an agent gliding between cells.
 * Includes gentle vertical hover bob and dynamic bank/tilt in moving direction.
 */
export function interpolateAgentPosition(
  startPos: [number, number, number],
  endPos: [number, number, number],
  progress: number,
  hoverElevation = 0.45,
  time = 0
): {
  position: [number, number, number];
  rotationY: number;
  tilt: [number, number, number];
} {
  const eased = smoothStep(progress);

  const dx = endPos[0] - startPos[0];
  const dz = endPos[2] - startPos[2];

  // Current interpolated X & Z
  const curX = startPos[0] + dx * eased;
  const curZ = startPos[2] + dz * eased;

  // Smooth arc / hover in Y: lift slightly during the transition + subtle sine bob
  const arcY = Math.sin(progress * Math.PI) * 0.12;
  const hoverSine = Math.sin(time * 3.5) * 0.035;
  const curY = startPos[1] + hoverElevation + arcY + hoverSine;

  // Yaw orientation towards direction of travel
  let targetYaw = 0;
  if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
    targetYaw = Math.atan2(dx, dz);
  }

  // Dynamic tilt/pitch/roll
  // Rolling into movement: when moving along X or Z, tilt slightly down in front
  const movingFactor = Math.sin(progress * Math.PI);
  const pitch = movingFactor * 0.12; // tilt forward
  const roll = Math.cos(time * 4) * 0.02; // slight gentle stabilizing sway

  return {
    position: [curX, curY, curZ],
    rotationY: targetYaw,
    tilt: [pitch, 0, roll],
  };
}
