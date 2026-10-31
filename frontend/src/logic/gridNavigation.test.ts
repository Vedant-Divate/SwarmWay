import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gridToWorld,
  manhattanDistance,
  isValidCell,
  getNeighbors,
  chooseNextCell,
  smoothStep,
  interpolateAgentPosition,
  GridConfig,
  CellCoord,
} from './gridNavigation';

const sampleConfig: GridConfig = {
  size: 7,
  cellSize: 1.0,
  spacing: 0.2,
  baseHeight: 0.3,
};

test('gridToWorld centers grid correctly', () => {
  // For size 7, stride = 1.2. Middle cell is (3, 3)
  const center = gridToWorld({ x: 3, z: 3 }, sampleConfig);
  assert.equal(Math.abs(center[0]) < 0.0001, true);
  assert.equal(Math.abs(center[2]) < 0.0001, true);
  assert.equal(center[1], 0.15); // baseHeight / 2
});

test('manhattanDistance calculates correct distance', () => {
  assert.equal(manhattanDistance({ x: 0, z: 0 }, { x: 3, z: 4 }), 7);
  assert.equal(manhattanDistance({ x: 2, z: 2 }, { x: 2, z: 2 }), 0);
});

test('isValidCell respects grid boundaries', () => {
  assert.equal(isValidCell({ x: 0, z: 0 }, 7), true);
  assert.equal(isValidCell({ x: 6, z: 6 }, 7), true);
  assert.equal(isValidCell({ x: -1, z: 0 }, 7), false);
  assert.equal(isValidCell({ x: 7, z: 3 }, 7), false);
  assert.equal(isValidCell({ x: 2, z: 7 }, 7), false);
});

test('getNeighbors returns only valid orthogonal neighbors', () => {
  // Corner cell has 2 neighbors
  const cornerNeighbors = getNeighbors({ x: 0, z: 0 }, 7);
  assert.equal(cornerNeighbors.length, 2);
  assert.deepEqual(cornerNeighbors.sort((a, b) => a.x - b.x || a.z - b.z), [
    { x: 0, z: 1 },
    { x: 1, z: 0 },
  ]);

  // Center cell has 4 neighbors
  const centerNeighbors = getNeighbors({ x: 3, z: 3 }, 7);
  assert.equal(centerNeighbors.length, 4);
});

test('chooseNextCell navigates towards destination', () => {
  const current: CellCoord = { x: 1, z: 1 };
  const destination: CellCoord = { x: 5, z: 1 };
  const next = chooseNextCell(current, destination, 7);
  // Next step should reduce distance to (5, 1), so x must be 2, z must be 1
  assert.deepEqual(next, { x: 2, z: 1 });
});

test('chooseNextCell avoids occupied cells when alternative paths exist', () => {
  const current: CellCoord = { x: 1, z: 1 };
  const destination: CellCoord = { x: 2, z: 1 };
  const occupied: CellCoord[] = [{ x: 2, z: 1 }]; // Block direct path
  const next = chooseNextCell(current, destination, 7, occupied);
  // Should choose an alternative neighbor, not the occupied one
  assert.notDeepEqual(next, { x: 2, z: 1 });
  assert.equal(isValidCell(next, 7), true);
});

test('smoothStep clamps and eases progress', () => {
  assert.equal(smoothStep(0), 0);
  assert.equal(smoothStep(1), 1);
  assert.equal(smoothStep(0.5), 0.5);
  assert.equal(smoothStep(-0.2), 0);
  assert.equal(smoothStep(1.5), 1);
});

test('interpolateAgentPosition yields smooth movement and arc', () => {
  const start: [number, number, number] = [0, 0, 0];
  const end: [number, number, number] = [1.2, 0, 0];
  const mid = interpolateAgentPosition(start, end, 0.5, 0.4, 0);

  // At progress 0.5, X should be exactly halfway (0.6)
  assert.equal(Math.abs(mid.position[0] - 0.6) < 0.001, true);
  // Y elevation should include hover elevation + apex arc (> 0.4)
  assert.equal(mid.position[1] > 0.4, true);
  // Yaw should point along +X
  assert.equal(mid.rotationY > 0, true);
});
