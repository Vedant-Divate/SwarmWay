/**
 * Strict TypeScript schema definitions for Swarmway API contracts and Trace format.
 * Zero `any` allowed.
 */

export type GridPoint = [number, number];

export interface HealthResponse {
  status: 'ok';
  version: string;
  solvers: string[];
  caps: Record<string, string | number | boolean | string[]>;
}

export interface MapSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  families: string[];
  presets: {
    even: number;
    random: number;
  };
}

export interface MapDetail {
  id: string;
  name: string;
  width: number;
  height: number;
  rows: string[];
  legend: Record<string, string>;
}

export interface AgentSpec {
  id: number;
  start: GridPoint;
  goal: GridPoint;
}

export interface MapPresetResponse {
  map_id: string;
  agents: AgentSpec[];
}

export type SolverKind = 'cbs' | 'pp-fixed' | 'pp-best-of-n';

export type ScenarioKind = 'even' | 'random';

export interface SolveInstancePreset {
  map_id: string;
  scenario: ScenarioKind;
  agents: number;
}

export interface SolveInstanceCustom {
  name: string;
  width: number;
  height: number;
  rows: string[];
  agents: AgentSpec[];
}

export type SolveInstance = SolveInstancePreset | SolveInstanceCustom;

export interface SolveRequest {
  instance: SolveInstance;
  solver: SolverKind;
  options: {
    tie_break?: 'fifo' | string;
    [key: string]: string | number | boolean | undefined;
  };
  budget_ms: number;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface TraceSolverInfo {
  name: string;
  options: Record<string, string | number | boolean | null>;
  package_version: string;
  seed: number | null;
}

export interface TraceMapInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  rows: string[];
  source: string;
}

export type SolveStatus = 'solved' | 'unsat' | 'timeout' | 'error';

export interface TraceResult {
  status: SolveStatus;
  soc: number;
  makespan: number;
  runtime_ms: number;
  budget_ms: number;
  ct_expanded: number;
  ct_generated: number;
  low_level_expansions: number;
  validity: string;
  notes: string[];
}

export type ConflictOrConstraintKind = 'vertex' | 'edge';

export interface SearchConflict {
  type: ConflictOrConstraintKind;
  agents: [number, number];
  pos?: GridPoint;
  u?: GridPoint;
  v?: GridPoint;
  t: number;
}

export interface SearchConstraint {
  agent: number;
  type: ConflictOrConstraintKind;
  pos?: GridPoint;
  u?: GridPoint;
  v?: GridPoint;
  t: number;
}

export type SearchEventKind = 'root' | 'expand' | 'goal';

export interface SearchEvent {
  seq: number;
  event: SearchEventKind;
  node: number;
  parent?: number;
  cost: number;
  conflict?: SearchConflict;
  constraint?: SearchConstraint;
  replanned_agent?: number;
  replanned_cost?: number;
}

export interface TraceExecution {
  makespan: number;
  paths: GridPoint[][];
}

export interface Trace {
  trace_version: 1;
  solver: TraceSolverInfo;
  instance: {
    map: TraceMapInfo;
    agents: AgentSpec[];
  };
  result: TraceResult;
  search: SearchEvent[];
  execution: TraceExecution;
}

export interface BundledReplayMeta {
  id: string;
  file: string;
  title: string;
  story: string;
  comparisonFile?: string;
}

export type RoutePath = '/' | '/workspace' | '/replays' | '/benchmarks' | '/about';

export type WorkspaceTab = 'paths' | 'search';

export type AgentSetupMode = 'preset' | 'custom';
