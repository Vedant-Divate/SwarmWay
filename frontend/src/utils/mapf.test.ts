import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Trace } from '../types';
import { HERO_LANDING_TRACE } from '../data/heroTrace';
import {
  BUNDLED_REPLAYS,
  easeStepProgress,
  getAgentIdentity,
  getAgentPermanentArrivalTick,
  getPlaybackDisplayStep,
  getScrubberProgress,
  isCellPassable,
  normalizeRoutePath,
  parseGridRows,
  sampleAgentPose,
  sampleTrailPoints,
  verifyExecutionCollisionFree,
} from './mapf';

test('parseGridRows classifies MovingAI passable and blocked characters accurately', () => {
  const rows = [
    '.GSW',
    '@OT.',
  ];
  const parsed = parseGridRows(4, 2, rows);
  assert.equal(parsed.freeCells.length, 5);
  assert.equal(parsed.blockedCells.length, 3);
  assert.equal(isCellPassable(rows, 0, 0), true);
  assert.equal(isCellPassable(rows, 2, 0), true);
  assert.equal(isCellPassable(rows, 0, 1), false);
  assert.equal(isCellPassable(rows, 1, 1), false);
  assert.equal(isCellPassable(rows, 2, 1), false);
});

test('getAgentIdentity gives distinct non-color-only archetypes and badges', () => {
  const a0 = getAgentIdentity(0);
  const a1 = getAgentIdentity(1);
  const a2 = getAgentIdentity(2);
  const a3 = getAgentIdentity(3);
  assert.notEqual(a0.archetype, a1.archetype);
  assert.notEqual(a1.archetype, a2.archetype);
  assert.notEqual(a2.archetype, a3.archetype);
  assert.equal(a0.badgeText, '0');
  assert.equal(a3.badgeText, '3');
});

test('easeStepProgress respects prefers-reduced-motion jump vs smooth cubic curve', () => {
  assert.equal(easeStepProgress(0.4, true), 0);
  assert.equal(easeStepProgress(0.9999, true), 1);

  const mid = easeStepProgress(0.5, false);
  assert.ok(Math.abs(mid - 0.5) < 1e-6);
  assert.ok(easeStepProgress(0.25, false) < 0.25);
  assert.ok(easeStepProgress(0.75, false) > 0.75);
});

test('sampleAgentPose interpolates cleanly and marks settledAtGoal accurately', () => {
  const agent = { id: 0, start: [0, 0] as [number, number], goal: [2, 0] as [number, number] };
  const path: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 0]];
  assert.equal(getAgentPermanentArrivalTick(path, agent.goal), 2);

  const pMid = sampleAgentPose(path, agent, 0.5, false);
  assert.ok(Math.abs(pMid.x - 0.5) < 1e-4);
  assert.equal(pMid.settledAtGoal, false);
  assert.equal(pMid.isMovingThisStep, true);

  const pSettled = sampleAgentPose(path, agent, 2.5, false);
  assert.equal(pSettled.x, 2);
  assert.equal(pSettled.settledAtGoal, true);
  assert.equal(pSettled.isMovingThisStep, false);
});

test('sampleTrailPoints generates monotonically increasing fade samples', () => {
  const path: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0]];
  const trail = sampleTrailPoints(path, 2.5, false, 2.0, 8);
  assert.equal(trail.length, 9);
  assert.equal(trail[0].fade, 0);
  assert.equal(trail[trail.length - 1].fade, 1);
  assert.ok(trail[trail.length - 1].x > trail[0].x);
});

test('HERO_LANDING_TRACE is strictly 4-connected, unit-step, and collision-free', () => {
  const check = verifyExecutionCollisionFree(HERO_LANDING_TRACE);
  assert.equal(check.valid, true);
  assert.equal(check.vertexConflicts, 0);
  assert.equal(check.edgeConflicts, 0);

  const { makespan, paths } = HERO_LANDING_TRACE.execution;
  const rows = HERO_LANDING_TRACE.instance.map.rows;
  let computedSoc = 0;

  paths.forEach((p, idx) => {
    assert.equal(p.length, makespan + 1);
    const ag = HERO_LANDING_TRACE.instance.agents[idx];
    assert.deepEqual(p[0], ag.start);
    assert.deepEqual(p[makespan], ag.goal);
    computedSoc += getAgentPermanentArrivalTick(p, ag.goal);

    for (let t = 0; t <= makespan; t++) {
      assert.equal(isCellPassable(rows, p[t][0], p[t][1]), true);
      if (t < makespan) {
        const dist = Math.abs(p[t + 1][0] - p[t][0]) + Math.abs(p[t + 1][1] - p[t][1]);
        assert.ok(dist <= 1, `Agent ${idx} jumped ${dist} cells at t=${t}`);
      }
    }
  });
  assert.equal(computedSoc, HERO_LANDING_TRACE.result.soc);
});

test('All bundled JSON traces in public/traces conform to Trace v1 schema and are collision-free when solved', () => {
  const filesToVerify = new Set<string>();
  for (const meta of BUNDLED_REPLAYS) {
    filesToVerify.add(meta.file);
    if (meta.comparisonFile) filesToVerify.add(meta.comparisonFile);
  }

  for (const rel of filesToVerify) {
    const diskPath = path.join(process.cwd(), 'public', rel);
    assert.equal(fs.existsSync(diskPath), true, `Missing trace file ${diskPath}`);
    const trace = JSON.parse(fs.readFileSync(diskPath, 'utf-8')) as Trace;
    assert.equal(trace.trace_version, 1);

    if (trace.result.status === 'solved') {
      const check = verifyExecutionCollisionFree(trace);
      assert.equal(check.valid, true, `Collision found in ${rel}`);
      for (const p of trace.execution.paths) {
        assert.equal(p.length, trace.execution.makespan + 1);
      }
    }
  }
});

test('normalizeRoutePath maps valid and fallback SPA routes', () => {
  assert.equal(normalizeRoutePath('/'), '/');
  assert.equal(normalizeRoutePath('/workspace/'), '/workspace');
  assert.equal(normalizeRoutePath('/replays?foo=1'), '/replays');
  assert.equal(normalizeRoutePath('/benchmarks'), '/benchmarks');
  assert.equal(normalizeRoutePath('/about'), '/about');
  assert.equal(normalizeRoutePath('/unknown-route'), '/');
});

test('getPlaybackDisplayStep and getScrubberProgress gate integer steps and normalize fill ratio', () => {
  assert.equal(getPlaybackDisplayStep(0, 14), 0);
  assert.equal(getPlaybackDisplayStep(0.02, 14), 0);
  assert.equal(getPlaybackDisplayStep(0.99, 14), 0);
  assert.equal(getPlaybackDisplayStep(1.0, 14), 1);
  assert.equal(getPlaybackDisplayStep(2.9999999, 14), 3);
  assert.equal(getPlaybackDisplayStep(14, 14), 14);
  assert.equal(getPlaybackDisplayStep(18, 14), 14);
  assert.equal(getPlaybackDisplayStep(-2, 14), 0);
  assert.equal(getPlaybackDisplayStep(4, 0), 0);

  assert.equal(getScrubberProgress(0, 10), 0);
  assert.equal(getScrubberProgress(2.5, 10), 0.25);
  assert.equal(getScrubberProgress(10, 10), 1);
  assert.equal(getScrubberProgress(15, 10), 1);
  assert.equal(getScrubberProgress(3, 0), 0);
});

