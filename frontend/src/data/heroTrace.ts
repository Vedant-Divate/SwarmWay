import type { Trace } from '../types';

/**
 * Deterministic 8×8 showcase trace for the Landing hero diorama.
 * 6 agents cross a central courtyard with 4 stone pillars, zero collisions,
 * looping gently on the landing screen.
 */
export const HERO_LANDING_TRACE: Trace = {
  trace_version: 1,
  solver: {
    name: 'cbs',
    options: { tie_break: 'fifo' },
    package_version: '1.0.0',
    seed: null,
  },
  instance: {
    map: {
      id: 'hero-courtyard-8x8',
      name: 'Courtyard 8×8',
      width: 8,
      height: 8,
      rows: [
        '........',
        '........',
        '..@..@..',
        '........',
        '........',
        '..@..@..',
        '........',
        '........',
      ],
      source: 'Swarmway Showcase',
    },
    agents: [
      { id: 0, start: [0, 3], goal: [7, 3] },
      { id: 1, start: [7, 4], goal: [0, 4] },
      { id: 2, start: [3, 0], goal: [3, 7] },
      { id: 3, start: [4, 7], goal: [4, 0] },
      { id: 4, start: [1, 1], goal: [6, 6] },
      { id: 5, start: [6, 1], goal: [1, 6] },
    ],
  },
  result: {
    status: 'solved',
    soc: 51,
    makespan: 11,
    runtime_ms: 4.2,
    budget_ms: 10000,
    ct_expanded: 5,
    ct_generated: 9,
    low_level_expansions: 68,
    validity: 'valid',
    notes: [],
  },
  search: [
    { seq: 0, event: 'root', node: 0, cost: 49 },
    {
      seq: 1,
      event: 'expand',
      node: 0,
      cost: 49,
      conflict: { type: 'vertex', agents: [0, 2], pos: [3, 3], t: 3 },
      constraint: { agent: 2, type: 'vertex', pos: [3, 3], t: 3 },
      replanned_agent: 2,
      replanned_cost: 8,
    },
    {
      seq: 2,
      event: 'expand',
      node: 1,
      parent: 0,
      cost: 50,
      conflict: { type: 'vertex', agents: [1, 3], pos: [4, 4], t: 3 },
      constraint: { agent: 3, type: 'vertex', pos: [4, 4], t: 3 },
      replanned_agent: 3,
      replanned_cost: 8,
    },
    { seq: 3, event: 'goal', node: 4, parent: 1, cost: 51 },
  ],
  execution: {
    makespan: 11,
    paths: [
      [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [7, 3], [7, 3], [7, 3], [7, 3]],
      [[7, 4], [6, 4], [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 4], [0, 4], [0, 4], [0, 4]],
      [[3, 0], [3, 1], [3, 2], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7], [3, 7], [3, 7], [3, 7]],
      [[4, 7], [4, 6], [4, 5], [4, 5], [4, 4], [4, 3], [4, 2], [4, 1], [4, 0], [4, 0], [4, 0], [4, 0]],
      [[1, 1], [1, 2], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6]],
      [[6, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 6]],
    ],
  },
};
