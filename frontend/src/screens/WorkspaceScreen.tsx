import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBundledTrace,
  fetchMapDetail,
  fetchMapPresets,
  fetchMaps,
  checkSolverHealth,
  postSolve,
  SolverApiError,
} from '../api/client';
import { AccessibleInspector } from '../components/AccessibleInspector';
import { Tooltip } from '../components/Tooltip';
import { ComparePanel } from '../components/ComparePanel';
import { GridEditor } from '../components/GridEditor';
import { type CameraViewRequest, DioramaStage } from '../components/DioramaStage';
import { SearchExplorer } from '../components/SearchExplorer';
import { AgentIdentityBadge, EncodingLegendStrip } from '../components/VisualEncodings';
import { STRINGS } from '../strings';
import type {
  AgentSetupMode,
  AgentSpec,
  BundledReplayMeta,
  GridPoint,
  MapDetail,
  MapSummary,
  RoutePath,
  ScenarioKind,
  SolveInstance,
  SolverKind,
  Trace,
  WorkspaceTab,
} from '../types';
import {
  BUNDLED_REPLAYS,
  getAgentIdentity,
  getAgentPermanentArrivalTick,
  getPlaybackDisplayStep,
  getScrubberProgress,
  isCellPassable,
} from '../utils/mapf';

interface WorkspaceScreenProps {
  isOffline: boolean;
  reducedMotion: boolean;
  initialReplayMeta: BundledReplayMeta | null;
  onNavigate: (route: RoutePath) => void;
}

type ActivitySegmentKind = 'moving' | 'waiting' | 'docked';

interface ActivitySegment {
  from: number;
  to: number;
  kind: ActivitySegmentKind;
}

interface AgentActivityRow {
  id: number;
  segments: ActivitySegment[];
}

const SPEED_OPTIONS: ReadonlyArray<number> = [0.5, 1, 2, 4, 8];
const MAX_ACTIVITY_STRIP_AGENTS = 16;

// --- Custom grid share-link codec (rows RLE + base64url, size bounded) ---
const SHARE_VERSION = 1;
const SHARE_MAX_CHARS = 2000;

function base64urlEncode(text: string): string {
  return btoa(text)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(text: string): string | null {
  try {
    const pad = '='.repeat((4 - (text.length % 4)) % 4);
    return atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  } catch {
    return null;
  }
}

function rleEncode(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    let run = 1;
    while (i + run < text.length && text[i + run] === ch && run < 99) run++;
    out += String(run) + ch;
    i += run;
  }
  return out;
}

function rleDecode(encoded: string): string | null {
  let out = '';
  let i = 0;
  while (i < encoded.length) {
    let num = '';
    while (i < encoded.length && encoded[i] >= '0' && encoded[i] <= '9') {
      num += encoded[i];
      i++;
    }
    if (num === '' || i >= encoded.length) return null;
    out += encoded[i].repeat(Number(num));
    i++;
  }
  return out;
}

function encodeShareLink(instance: {
  width: number;
  height: number;
  rows: string[];
  agents: Array<{ start: GridPoint; goal: GridPoint }>;
}): string {
  const head = JSON.stringify({
    v: SHARE_VERSION,
    w: instance.width,
    h: instance.height,
    a: instance.agents.map((a) => [a.start, a.goal]),
  });
  return base64urlEncode(head + '|' + rleEncode(instance.rows.join('\n')));
}

function decodeShareLink(encoded: string): {
  width: number;
  height: number;
  rows: string[];
  agents: AgentSpec[];
} | null {
  const text = base64urlDecode(encoded);
  if (text === null) return null;
  const sep = text.lastIndexOf('|');
  if (sep < 0) return null;
  let head: { v: number; w: number; h: number; a: Array<[GridPoint, GridPoint]> };
  try {
    head = JSON.parse(text.slice(0, sep)) as {
      v: number;
      w: number;
      h: number;
      a: Array<[GridPoint, GridPoint]>;
    };
  } catch {
    return null;
  }
  const rowsText = rleDecode(text.slice(sep + 1));
  if (rowsText === null) return null;
  return {
    width: head.w,
    height: head.h,
    rows: rowsText.split('\n'),
    agents: head.a.map(([start, goal], i) => ({ id: i, start, goal })),
  };
}

function validateCustomInstance(
  instance: { width: number; height: number; rows: string[]; agents: AgentSpec[] },
  caps: { maxGridCells: number; maxAgents: number; budgetMs: number } | null,
): { ok: true } | { ok: false; reason: string } {
  const maxCells = caps?.maxGridCells ?? 262144;
  const maxAgents = caps?.maxAgents ?? 60;
  if (!instance.width || !instance.height || instance.width > 512 || instance.height > 512) {
    return { ok: false, reason: 'grid size out of range' };
  }
  if (instance.width * instance.height > maxCells) {
    return { ok: false, reason: 'grid over cell cap' };
  }
  if (instance.agents.length === 0 || instance.agents.length > maxAgents) {
    return { ok: false, reason: 'agent count invalid' };
  }
  if (instance.rows.length !== instance.height) {
    return { ok: false, reason: 'row count mismatch' };
  }
  for (const row of instance.rows) {
    if (row.length !== instance.width) return { ok: false, reason: 'row width mismatch' };
    for (const ch of row) {
      if (ch !== '.' && ch !== '@') return { ok: false, reason: 'bad cell character' };
    }
  }
  const starts = new Set<string>();
  const goals = new Set<string>();
  for (const a of instance.agents) {
    const [sx, sy] = a.start;
    const [gx, gy] = a.goal;
    if (sx < 0 || sx >= instance.width || sy < 0 || sy >= instance.height) {
      return { ok: false, reason: 'agent start out of bounds' };
    }
    if (gx < 0 || gx >= instance.width || gy < 0 || gy >= instance.height) {
      return { ok: false, reason: 'agent goal out of bounds' };
    }
    if (instance.rows[sy][sx] !== '.' || instance.rows[gy][gx] !== '.') {
      return { ok: false, reason: 'agent start or goal on blocked cell' };
    }
    if (sx === gx && sy === gy) return { ok: false, reason: 'agent start equals goal' };
    const sk = `${sx},${sy}`;
    const gk = `${gx},${gy}`;
    if (starts.has(sk) || goals.has(gk)) return { ok: false, reason: 'duplicate agent position' };
    starts.add(sk);
    goals.add(gk);
  }
  return { ok: true };
}


export function WorkspaceScreen({
  isOffline,
  reducedMotion,
  initialReplayMeta,
  onNavigate,
}: WorkspaceScreenProps) {
  // Active tab: "paths" | "search"
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('paths');

  // Offline / Bundled replay state
  const [selectedReplayId, setSelectedReplayId] = useState<string>(
    initialReplayMeta?.id ?? BUNDLED_REPLAYS[0].id
  );
  const [activeTrace, setActiveTrace] = useState<Trace | null>(null);
  const [comparisonPair, setComparisonPair] = useState<{
    cbs: Trace;
    baseline: Trace;
  } | null>(null);

  // Live API Map & Agent Setup state (used when !isOffline)
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [liveMapDetail, setLiveMapDetail] = useState<MapDetail | null>(null);
  const [setupMode, setSetupMode] = useState<AgentSetupMode>('preset');
  const [scenario, setScenario] = useState<ScenarioKind>('even');
  const [agentCount, setAgentCount] = useState<number>(10);
  const [presetAgents, setPresetAgents] = useState<AgentSpec[]>([]);
  const [customAgents, setCustomAgents] = useState<AgentSpec[]>([]);
  const [pendingStartCell, setPendingStartCell] = useState<GridPoint | null>(null);
  const [solving, setSolving] = useState(false);
  const [solvingSlow, setSolvingSlow] = useState(false);

  // Show 'waking up backend' hint when a solve takes more than 3s (Render cold start)
  useEffect(() => {
    if (!solving) { setSolvingSlow(false); return; }
    const timer = window.setTimeout(() => setSolvingSlow(true), 3000);
    return () => window.clearTimeout(timer);
  }, [solving]);

  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [tieBreak, setTieBreak] = useState<'fifo' | 'conflicts' | 'depth'>('fifo');

  // Live solver capability caps (read from GET /api/health — never hardcoded)
  const [healthCaps, setHealthCaps] = useState<{
    maxGridCells: number;
    maxAgents: number;
    budgetMs: number;
  } | null>(null);

  // Custom grid editor state
  const [customGridMode, setCustomGridMode] = useState<boolean>(false);
  const [customGridWidth, setCustomGridWidth] = useState<number>(10);
  const [customGridHeight, setCustomGridHeight] = useState<number>(10);
  const [customGridRows, setCustomGridRows] = useState<string[]>(
    Array(10).fill('..........')
  );
  const [customPendingStartCell, setCustomPendingStartCell] = useState<
    GridPoint | null
  >(null);
  const [shareTooLarge, setShareTooLarge] = useState<boolean>(false);
  const [hashError, setHashError] = useState<string | null>(null);

  // Playback & 3D interaction state (React state holds integer timestep only)
  const [playbackStep, setPlaybackStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [assembleProgress, setAssembleProgress] = useState<number>(1);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<number | null>(null);
  const [cameraResetTrigger] = useState<number>(0);
  const [viewRequest, setViewRequest] = useState<CameraViewRequest>({
    kind: 'reset',
    seq: 0,
  });
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [activeSearchSeq, setActiveSearchSeq] = useState<number | null>(null);

  const handleSelectAgent = useCallback((nextId: number | null) => {
    setSelectedAgentId(nextId);
    setViewRequest((prev) => {
      if (prev.kind !== 'follow') return prev;
      if (nextId === null) {
        return { kind: 'reset', seq: prev.seq };
      }
      return { kind: 'follow', seq: prev.seq + 1 };
    });
  }, []);

  // Single source of continuous playback time (never overwritten during render)
  const timeRef = useRef<number>(0);
  const displayStepRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = isPlaying;

  const scrubberInputRef = useRef<HTMLInputElement | null>(null);
  const scrubberFillRef = useRef<HTMLDivElement | null>(null);
  const activityPlayheadRef = useRef<HTMLDivElement | null>(null);
  const invalidateStageRef = useRef<(() => void) | null>(null);

  const syncScrubberDom = useCallback(
    (time: number, maxSpan: number, updateInputValue = true) => {
      const clamped = Math.max(0, Math.min(maxSpan, time));
      if (updateInputValue && scrubberInputRef.current) {
        scrubberInputRef.current.value = String(clamped);
      }
      if (scrubberFillRef.current) {
        const ratio = getScrubberProgress(clamped, maxSpan);
        scrubberFillRef.current.style.transform = `scaleX(${ratio})`;
      }
      if (activityPlayheadRef.current) {
        activityPlayheadRef.current.style.left =
          maxSpan > 0 ? `${(clamped / maxSpan) * 100}%` : '0%';
      }
    },
    []
  );

  const triggerSolveRevealAndPlay = useCallback(
    (trace: Trace, autoPlay = true) => {
      const nextMakespan =
        trace.result.status === 'solved' ? trace.execution.makespan : 0;
      setActiveTrace(trace);
      setSelectedAgentId(null);
      setViewRequest((prev) =>
        prev.kind === 'follow' ? { kind: 'reset', seq: prev.seq } : prev
      );
      setHoveredAgentId(null);
      setActiveSearchSeq(null);
      timeRef.current = 0;
      displayStepRef.current = 0;
      setPlaybackStep(0);
      syncScrubberDom(0, nextMakespan, true);
      invalidateStageRef.current?.();

      if (trace.result.status !== 'solved' || trace.execution.paths.length === 0) {
        setAssembleProgress(1);
        setIsPlaying(false);
        return;
      }

      if (reducedMotion) {
        setAssembleProgress(1);
        setIsPlaying(false);
        return;
      }

      // Solve reveal: agents assemble smoothly to start cells over 420ms, then playback begins
      setIsPlaying(false);
      setAssembleProgress(0);
      const t0 = performance.now();
      const duration = 420;
      const stepReveal = (now: number) => {
        const u = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - u, 3);
        setAssembleProgress(eased);
        if (u < 1) {
          requestAnimationFrame(stepReveal);
        } else if (autoPlay) {
          setIsPlaying(true);
        }
      };
      requestAnimationFrame(stepReveal);
    },
    [reducedMotion, syncScrubberDom]
  );

  // Load bundled replay when offline or when initialReplayMeta changes
  const loadBundledById = useCallback(
    async (replayId: string) => {
      const meta = BUNDLED_REPLAYS.find((r) => r.id === replayId) ?? BUNDLED_REPLAYS[0];
      setSelectedReplayId(meta.id);
      setApiErrorMessage(null);
      setComparisonPair(null);
      try {
        const primary = await fetchBundledTrace(meta.file);
        triggerSolveRevealAndPlay(primary, !reducedMotion);
      } catch (err) {
        setApiErrorMessage(err instanceof Error ? err.message : 'Failed to load replay');
      }
    },
    [reducedMotion, triggerSolveRevealAndPlay]
  );

  useEffect(() => {
    if (initialReplayMeta) {
      void loadBundledById(initialReplayMeta.id);
      return;
    }
    if (isOffline) {
      void loadBundledById(selectedReplayId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplayMeta, isOffline]);

  // Fetch live maps when online
  useEffect(() => {
    if (isOffline) return;
    let active = true;
    setMapsLoading(true);
    fetchMaps()
      .then((list) => {
        if (!active) return;
        setMaps(list);
        if (list.length > 0 && !selectedMapId) {
          setSelectedMapId(list[0].id);
        }
      })
      .catch((err) => {
        if (!active) return;
        setApiErrorMessage(err instanceof Error ? err.message : 'Failed to fetch maps');
      })
      .finally(() => {
        if (active) setMapsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOffline, selectedMapId])

  // Read solver capability caps from the health endpoint; fall back to documented defaults
  useEffect(() => {
    if (isOffline) return;
    let active = true;
    checkSolverHealth().then((health) => {
      if (!active || !health) return;
      const caps = health.caps ?? {};
      setHealthCaps({
        maxGridCells: Number(caps['max_grid_cells'] ?? 262144) || 262144,
        maxAgents: Number(caps['max_agents'] ?? 60) || 60,
        budgetMs: Number(caps['solve_budget_ms'] ?? 10000) || 10000,
      });
    });
    return () => { active = false; };
  }, [isOffline]);;

  // Fetch selected map detail when online
  useEffect(() => {
    if (isOffline || !selectedMapId) return;
    let active = true;
    fetchMapDetail(selectedMapId)
      .then((detail) => {
        if (!active) return;
        setLiveMapDetail(detail);
        setCustomAgents([]);
        setPendingStartCell(null);
        // Clear stale trace if map changed manually
        if (activeTrace && activeTrace.instance.map.id !== detail.id) {
          setActiveTrace(null);
          setComparisonPair(null);
          setIsPlaying(false);
          timeRef.current = 0;
          displayStepRef.current = 0;
          setPlaybackStep(0);
          syncScrubberDom(0, 0, true);
        }
      })
      .catch((err) => {
        if (!active) return;
        setApiErrorMessage(err instanceof Error ? err.message : 'Failed to load map');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline, selectedMapId]);

  // Fetch scenario presets when online and in preset mode
  useEffect(() => {
    if (isOffline || !selectedMapId || setupMode !== 'preset') return;
    let active = true;
    fetchMapPresets(selectedMapId, scenario, agentCount)
      .then((res) => {
        if (!active) return;
        setPresetAgents(res.agents);
      })
      .catch(() => {
        if (!active) return;
        setPresetAgents([]);
      });
    return () => {
      active = false;
    };
  }, [isOffline, selectedMapId, setupMode, scenario, agentCount]);

  // Determine current 3D board source (either activeTrace or live map setup preview)
  const boardSource = useMemo(() => {
    if (activeTrace) {
      return {
        width: activeTrace.instance.map.width,
        height: activeTrace.instance.map.height,
        rows: activeTrace.instance.map.rows,
        name: activeTrace.instance.map.name,
        agents: activeTrace.instance.agents,
        paths:
          activeTrace.result.status === 'solved' && activeTrace.execution.paths.length > 0
            ? activeTrace.execution.paths
            : activeTrace.instance.agents.map((a) => [a.start]),
        makespan:
          activeTrace.result.status === 'solved' ? activeTrace.execution.makespan : 0,
      };
    }
    if (liveMapDetail) {
      const agents = setupMode === 'custom' ? customAgents : presetAgents;
      return {
        width: liveMapDetail.width,
        height: liveMapDetail.height,
        rows: liveMapDetail.rows,
        name: liveMapDetail.name,
        agents,
        paths: agents.map((a) => [a.start]),
        makespan: 0,
      };
    }
    if (customGridMode) {
      return {
        width: customGridWidth,
        height: customGridHeight,
        rows: customGridRows,
        name: STRINGS.workspace.customGrid,
        agents: customAgents,
        paths: customAgents.map((a) => [a.start]),
        makespan: 0,
      };
    }
    return null;
  }, [activeTrace, liveMapDetail, setupMode, customAgents, presetAgents, customGridMode, customGridWidth, customGridHeight, customGridRows]);

  const makespan = boardSource?.makespan ?? 0;

  const { keyMoments, arrivalTickSet } = useMemo<{
    keyMoments: number[];
    arrivalTickSet: ReadonlySet<number>;
  }>(() => {
    if (
      !activeTrace ||
      activeTrace.result.status !== 'solved' ||
      activeTrace.execution.makespan <= 0 ||
      activeTrace.execution.paths.length === 0
    ) {
      return { keyMoments: [], arrivalTickSet: new Set<number>() };
    }

    const traceMakespan = activeTrace.execution.makespan;
    const arrivals = new Set<number>();
    const waits = new Set<number>();
    const agents = activeTrace.instance.agents;
    const paths = activeTrace.execution.paths;

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const path = paths[i];
      if (!agent || !path || path.length === 0) continue;

      const arrivalTick = getAgentPermanentArrivalTick(path, agent.goal);
      if (arrivalTick >= 0 && arrivalTick <= traceMakespan) {
        arrivals.add(arrivalTick);
      }

      const maxStep = Math.min(traceMakespan, path.length - 1);
      for (let t = 1; t <= maxStep; t++) {
        if (t >= arrivalTick) break;
        const cur = path[t];
        const prev = path[t - 1];
        if (cur && prev && cur[0] === prev[0] && cur[1] === prev[1]) {
          waits.add(t);
        }
      }
    }

    const merged = new Set<number>([...arrivals, ...waits]);
    const sortedMoments =
      merged.size > 24
        ? Array.from(arrivals).sort((a, b) => a - b)
        : Array.from(merged).sort((a, b) => a - b);

    return { keyMoments: sortedMoments, arrivalTickSet: arrivals };
  }, [activeTrace]);

  const agentActivity = useMemo<AgentActivityRow[]>(() => {
    if (
      !activeTrace ||
      activeTrace.result.status !== 'solved' ||
      activeTrace.execution.makespan <= 0 ||
      activeTrace.execution.paths.length === 0
    ) {
      return [];
    }

    const traceMakespan = activeTrace.execution.makespan;
    const agents = activeTrace.instance.agents;
    const paths = activeTrace.execution.paths;
    const rows: AgentActivityRow[] = [];

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const path = paths[i];
      if (!agent || !path || path.length === 0) continue;

      const arrivalTick = getAgentPermanentArrivalTick(path, agent.goal);
      const segments: ActivitySegment[] = [];

      for (let t = 0; t < traceMakespan; t++) {
        const cur = path[Math.min(t, path.length - 1)];
        const next = path[Math.min(t + 1, path.length - 1)];
        const isMoving =
          cur !== undefined &&
          next !== undefined &&
          (cur[0] !== next[0] || cur[1] !== next[1]);

        const kind: ActivitySegmentKind = isMoving
          ? 'moving'
          : t >= arrivalTick
            ? 'docked'
            : 'waiting';

        const prevSeg = segments[segments.length - 1];
        if (prevSeg && prevSeg.kind === kind) {
          prevSeg.to = t + 1;
        } else {
          segments.push({ from: t, to: t + 1, kind });
        }
      }

      rows.push({ id: agent.id, segments });
    }

    return rows;
  }, [activeTrace]);

  const seekToTime = useCallback(
    (targetTime: number) => {
      const clamped = Math.max(0, Math.min(makespan, targetTime));
      timeRef.current = clamped;
      syncScrubberDom(clamped, makespan, true);
      invalidateStageRef.current?.();
      const nextStep = getPlaybackDisplayStep(clamped, makespan);
      if (nextStep !== displayStepRef.current) {
        displayStepRef.current = nextStep;
        setPlaybackStep(nextStep);
      }
    },
    [makespan, syncScrubberDom]
  );

  // Sync uncontrolled scrubber input, track fill & activity playhead when mounted or when trace/makespan changes
  useLayoutEffect(() => {
    syncScrubberDom(timeRef.current, makespan, true);
  }, [activeTrace, makespan, dockCollapsed, activeTab, syncScrubberDom]);

  // Commit React integer timestep state once when user finishes scrubbing (native DOM change event)
  useEffect(() => {
    const inputEl = scrubberInputRef.current;
    if (!inputEl) return;
    const handleScrubCommit = () => {
      if (isPlayingRef.current) {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
      seekToTime(Number(inputEl.value));
    };
    inputEl.addEventListener('change', handleScrubCommit);
    return () => {
      inputEl.removeEventListener('change', handleScrubCommit);
    };
  }, [seekToTime, makespan, dockCollapsed, activeTab]);

  // RequestAnimationFrame-driven playback clock (updates React state only on integer step changes)
  useEffect(() => {
    if (!isPlaying || makespan <= 0) return;
    let rafId = 0;
    let lastNow = performance.now();

    const stepClock = (now: number) => {
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      // 1x speed = 2.0 timesteps per second for graceful cadence
      const next = timeRef.current + dt * speed * 2.0;
      if (next >= makespan) {
        timeRef.current = makespan;
        syncScrubberDom(makespan, makespan, true);
        invalidateStageRef.current?.();
        if (displayStepRef.current !== makespan) {
          displayStepRef.current = makespan;
          setPlaybackStep(makespan);
        }
        setIsPlaying(false);
        return;
      }
      timeRef.current = next;
      syncScrubberDom(next, makespan, true);
      const nextStep = getPlaybackDisplayStep(next, makespan);
      if (nextStep !== displayStepRef.current) {
        displayStepRef.current = nextStep;
        setPlaybackStep(nextStep);
      }
      rafId = requestAnimationFrame(stepClock);
    };

    rafId = requestAnimationFrame(stepClock);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, makespan, speed, syncScrubberDom]);

  // Keyboard shortcuts: Space = play/pause, Left/Right = step ±1, Home/End = timeline ends
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        // Still allow Space play/pause while range slider is focused
        if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'range') {
          if (e.key === ' ') {
            e.preventDefault();
            if (makespan > 0) {
              if (!isPlayingRef.current && timeRef.current >= makespan) {
                seekToTime(0);
              }
              setIsPlaying((p) => !p);
            }
          }
        }
        return;
      }

      if (e.key === ' ' && activeTab === 'paths' && makespan > 0) {
        e.preventDefault();
        if (!isPlayingRef.current && timeRef.current >= makespan) {
          seekToTime(0);
        }
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'ArrowLeft' && activeTab === 'paths' && makespan > 0) {
        e.preventDefault();
        setIsPlaying(false);
        const curStep = getPlaybackDisplayStep(timeRef.current, makespan);
        seekToTime(Math.max(0, curStep - 1));
      } else if (e.key === 'ArrowRight' && activeTab === 'paths' && makespan > 0) {
        e.preventDefault();
        setIsPlaying(false);
        const curStep = getPlaybackDisplayStep(timeRef.current, makespan);
        seekToTime(Math.min(makespan, curStep + 1));
      } else if (e.key === 'Home' && activeTab === 'paths' && makespan > 0) {
        e.preventDefault();
        setIsPlaying(false);
        seekToTime(0);
      } else if (e.key === 'End' && activeTab === 'paths' && makespan > 0) {
        e.preventDefault();
        setIsPlaying(false);
        seekToTime(makespan);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, makespan, seekToTime]);

  // Click-to-place floor handler
  const handleBoardCellClick = useCallback(
    (cell: GridPoint) => {
      if (isOffline || setupMode !== 'custom' || !liveMapDetail) return;
      if (!isCellPassable(liveMapDetail.rows, cell[0], cell[1])) return;

      // Clear any previous solve trace so user sees live placement cleanly
      if (activeTrace) {
        setActiveTrace(null);
        setComparisonPair(null);
        setActiveSearchSeq(null);
        setIsPlaying(false);
      }

      if (!pendingStartCell) {
        // Ensure two agents don't share the exact same start cell
        const startTaken = customAgents.some(
          (a) => a.start[0] === cell[0] && a.start[1] === cell[1]
        );
        if (startTaken) return;
        setPendingStartCell(cell);
      } else {
        // Ensure two agents don't share the exact same goal cell
        const goalTaken = customAgents.some(
          (a) => a.goal[0] === cell[0] && a.goal[1] === cell[1]
        );
        if (goalTaken) return;
        const nextId = customAgents.length;
        const nextSpec: AgentSpec = {
          id: nextId,
          start: pendingStartCell,
          goal: cell,
        };
        setCustomAgents((prev) => [...prev, nextSpec]);
        setPendingStartCell(null);
      }
    },
    [isOffline, setupMode, liveMapDetail, activeTrace, pendingStartCell, customAgents]
  );

  // Execute live API solve
  const handleRunLiveSolve = async (mode: 'cbs' | 'prioritized' | 'compare') => {
    let instance: SolveInstance;
    if (customGridMode) {
      if (customGridRows.length === 0 || customAgents.length === 0) return;
      instance = {
        name: 'custom-grid',
        width: customGridWidth,
        height: customGridHeight,
        rows: customGridRows,
        agents: customAgents,
      };
    } else {
      if (isOffline || !selectedMapId) return;

      if (setupMode === 'preset') {
        instance = { map_id: selectedMapId, scenario, agents: agentCount };
      } else {
        if (!liveMapDetail || liveMapDetail.id !== selectedMapId || customAgents.length === 0) {
          return;
        }
        instance = {
          name: liveMapDetail.name,
          width: liveMapDetail.width,
          height: liveMapDetail.height,
          rows: liveMapDetail.rows,
          agents: customAgents,
        };
      }
    }

    setSolving(true);
    setApiErrorMessage(null);
    setIsPlaying(false);

    try {
      if (mode === 'cbs') {
        const trace = await postSolve({
          instance,
          solver: 'cbs',
          options: { tie_break: tieBreak },
          budget_ms: 10000,
        });
        setComparisonPair(null);
        triggerSolveRevealAndPlay(trace, !reducedMotion);
      } else if (mode === 'prioritized') {
        const trace = await postSolve({
          instance,
          solver: 'pp-fixed',
          options: {},
          budget_ms: 10000,
        });
        setComparisonPair(null);
        triggerSolveRevealAndPlay(trace, !reducedMotion);
      } else {
        const [cbsRes, ppRes] = await Promise.all([
          postSolve({
            instance,
            solver: 'cbs',
            options: { tie_break: tieBreak },
            budget_ms: 10000,
          }),
          postSolve({
            instance,
            solver: 'pp-fixed',
            options: {},
            budget_ms: 10000,
          }),
        ]);
        setComparisonPair({ cbs: cbsRes, baseline: ppRes });
        triggerSolveRevealAndPlay(cbsRes, !reducedMotion);
      }
    } catch (err) {
      let detailText = '';
      if (err instanceof SolverApiError) {
        const d = err.details;
        if (
          d &&
          typeof d === 'object' &&
          'field' in d && 'limit' in d && 'received' in d
        ) {
          const field = String((d as { field: unknown }).field);
          const limit = String((d as { limit: unknown }).limit);
          const received = String((d as { received: unknown }).received);
          detailText = STRINGS.workspace.errorDetailLine
            .replace('{field}', field)
            .replace('{limit}', limit)
            .replace('{received}', received);
        }
        setApiErrorMessage(`${err.code}: ${err.message}${detailText ? ' — ' + detailText : ''}`);
      } else {
        setApiErrorMessage(err instanceof Error ? err.message : 'Solver request failed');
      }
    } finally {
      setSolving(false);
    }
  };

  // Load bundled comparison pair when offline
  const handleLoadBundledComparison = async () => {
    const meta = BUNDLED_REPLAYS.find((r) => r.id === selectedReplayId);
    if (!meta || !meta.comparisonFile || !activeTrace) return;
    try {
      const other = await fetchBundledTrace(meta.comparisonFile);
      const isPrimaryCbs = activeTrace.solver.name === 'cbs';
      const pair = isPrimaryCbs
        ? { cbs: activeTrace, baseline: other }
        : { cbs: other, baseline: activeTrace };
      setComparisonPair(pair);
    } catch (err) {
      setApiErrorMessage(err instanceof Error ? err.message : 'Failed to load comparison trace');
    }
  };

  // URL-hash sharing for custom grid instances (rows RLE + base64url, size-bounded)
  useEffect(() => {
    let source: { width: number; height: number; rows: string[]; agents: AgentSpec[] } | null = null;
    const hash = window.location.hash;
    if (hash.startsWith('#grid=')) {
      source = decodeShareLink(hash.slice('#grid='.length));
    } else {
      try {
        const raw = localStorage.getItem('swarmway:editor:custom-grid');
        if (raw) {
          const parsed = JSON.parse(raw) as
            | { width: number; height: number; rows: string[]; agents: AgentSpec[] }
            | undefined;
          if (parsed && parsed.rows && parsed.agents) source = parsed;
        }
      } catch {
        // Ignore unreadable draft
      }
    }
    if (!source) return;
    const check = validateCustomInstance(source, healthCaps);
    if (!check.ok) {
      if (hash.startsWith('#grid=')) setHashError(STRINGS.workspace.customGridInvalidLink);
      return;
    }
    setCustomGridRows(source.rows);
    setCustomGridWidth(source.width);
    setCustomGridHeight(source.height);
    setCustomAgents(source.agents);
    setCustomGridMode(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist editor draft to localStorage (works alongside URL-hash sharing, Section 11.2)
  useEffect(() => {
    if (!customGridMode) return;
    try {
      localStorage.setItem('swarmway:editor:custom-grid', JSON.stringify({
        width: customGridWidth,
        height: customGridHeight,
        rows: customGridRows,
        agents: customAgents,
      }));
    } catch {
      // Storage unavailable or quota exceeded — draft is session-only
    }
  }, [customGridMode, customGridWidth, customGridHeight, customGridRows, customAgents]);

  // Write size-bounded share link; honest message when over the bound
  useEffect(() => {
    if (!customGridMode) return;
    const encoded = encodeShareLink({
      width: customGridWidth,
      height: customGridHeight,
      rows: customGridRows,
      agents: customAgents,
    });
    if (encoded.length > SHARE_MAX_CHARS) {
      setShareTooLarge(true);
      return;
    }
    setShareTooLarge(false);
    window.location.hash = `#grid=${encoded}`;
  }, [customGridMode, customGridWidth, customGridHeight, customGridRows, customAgents]);

  const currentReplayMeta = BUNDLED_REPLAYS.find((r) => r.id === selectedReplayId);
  const selectedMapSummary = maps.find((m) => m.id === selectedMapId);
  const maxPresetAgents = selectedMapSummary
    ? Math.max(2, selectedMapSummary.presets[scenario] || 40)
    : 50;

  const isCbsSolver = activeTrace?.solver.name.toLowerCase().includes('cbs') ?? false;
  const compareGhostPaths =
    comparisonPair && activeTrace
      ? (activeTrace === comparisonPair.cbs
          ? comparisonPair.baseline
          : comparisonPair.cbs
        ).execution.paths
      : undefined;

  // Search tab selection: derive the selected CT event (null when none matches)
  const activeSearchEvent = useMemo(() => {
    if (activeSearchSeq === null || !activeTrace) return null;
    return activeTrace.search.find((ev) => ev.seq === activeSearchSeq) ?? null;
  }, [activeSearchSeq, activeTrace]);

  // Sparse ghost paths for the two conflict agents only. Indexed by agent id to
  // match DioramaStage's per-agent ghostPaths?.[idx] lookup — all other agents
  // stay undefined so only the involved pair grows a ghost lane.
  const searchGhostPaths = useMemo(() => {
    const conflict = activeSearchEvent?.conflict;
    if (!conflict || !activeTrace || activeTrace.result.status !== 'solved') return undefined;
    const paths = activeTrace.execution.paths;
    const ghost: GridPoint[][] = [];
    const agentA = conflict.agents[0];
    const agentB = conflict.agents[1];
    if (paths[agentA]) ghost[agentA] = paths[agentA];
    if (paths[agentB]) ghost[agentB] = paths[agentB];
    return ghost.some(Boolean) ? ghost : undefined;
  }, [activeSearchEvent, activeTrace]);

  const ghostPaths = searchGhostPaths ?? compareGhostPaths;

  const handleSelectSearchEvent = useCallback(
    (seq: number) => {
      setActiveSearchSeq(seq);
      const event = activeTrace?.search.find((ev) => ev.seq === seq) ?? null;
      setIsPlaying(false);
      if (!event) return;
      // Highlight the replanned agent's path and dim the others so the
      // constraint being added / the conflict being resolved is visible.
      const focusAgent =
        event.constraint?.agent ??
        event.conflict?.agents[0] ??
        event.replanned_agent ??
        null;
      setSelectedAgentId(focusAgent);
      if (event.event === 'goal') {
        // Winning leaf reached: show the final state of all paths.
        const makespan = activeTrace?.execution.makespan ?? 0;
        seekToTime(makespan);
      } else if (event.conflict && typeof event.conflict.t === 'number') {
        setIsPlaying(false);
        seekToTime(event.conflict.t);
      }
    },
    [activeTrace, seekToTime]
  );

  return (
    <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
      {/* Top Workspace Header Row: Offline badge + Paths / Search Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E3DFD7]">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-[#171614]">
            {STRINGS.workspace.title}
          </h1>
          {isOffline && (
            <>
              <span aria-hidden="true" className="text-[#C8C2B5]">
                ·
              </span>
              <span className="text-xs font-semibold text-[#92400E]" role="status">
                {STRINGS.connection.offlineBadge}
              </span>
            </>
          )}
        </div>

        {/* Workspace View Tabs: Paths | Search */}
        <div
          role="tablist"
          aria-label="Workspace views"
          className="inline-flex items-center p-1 bg-[#EAE6DD] rounded-lg border border-[#DCD7CC]"
        >
          <button
            role="tab"
            type="button"
            id="tab-paths"
            aria-selected={activeTab === 'paths'}
            aria-controls="panel-paths"
            onClick={() => setActiveTab('paths')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'paths'
                ? 'bg-[#FAF9F6] text-[#171614] shadow-xs'
                : 'text-[#524F49] hover:text-[#171614]'
            }`}
          >
            {STRINGS.workspace.tabs.paths}
          </button>
          <button
            role="tab"
            type="button"
            id="tab-search"
            aria-selected={activeTab === 'search'}
            aria-controls="panel-search"
            onClick={() => setActiveTab('search')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'search'
                ? 'bg-[#FAF9F6] text-[#171614] shadow-xs'
                : 'text-[#524F49] hover:text-[#171614]'
            }`}
          >
            {STRINGS.workspace.tabs.search}
          </button>
        </div>
      </div>

      {/* API Error Banner (Non-2xx response) */}
      {apiErrorMessage && (
        <div
          role="alert"
          className="mt-4 p-4 bg-[#FFF1F2] border border-[#FECDD3] rounded-xl flex items-start justify-between gap-4"
        >
          <div>
            <p className="text-xs font-bold text-[#9F1239]">
              {STRINGS.workspace.outcomes.apiErrorTitle}
            </p>
            <p className="mt-1 text-xs font-mono text-[#881337]">{apiErrorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setApiErrorMessage(null)}
            className="px-2.5 py-1 text-xs font-medium text-[#9F1239] hover:bg-[#FFE4E6] rounded cursor-pointer"
          >
            {STRINGS.workspace.outcomes.dismissError}
          </button>
        </div>
      )}

      {/* Main Split Grid: Left Control Deck + Right Stage/Tab Area */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(300px,3.5fr)_minmax(0,8.5fr)] gap-6 items-start">
        {/* Left Sidebar: Offline Replay Selector OR Live Map Picker + Agent Setup + Solve */}
        <aside className="space-y-5">
          {isOffline ? (
            <section className="p-5 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#171614]">
                  {STRINGS.workspace.offlineNoticeTitle}
                </h2>
                <p className="mt-1.5 text-xs text-[#524F49] leading-relaxed">
                  {STRINGS.workspace.offlineNoticeBody}
                </p>
              </div>

              <div className="pt-3 border-t border-[#E3DFD7]">
                <label
                  htmlFor="bundled-replay-select"
                  className="block text-xs font-semibold text-[#171614]"
                >
                  {STRINGS.workspace.pickBundledLabel}
                </label>
                <select
                  id="bundled-replay-select"
                  value={selectedReplayId}
                  onChange={(e) => void loadBundledById(e.target.value)}
                  className="mt-1.5 w-full px-3 py-2 text-xs font-medium bg-white border border-[#D4CFC5] rounded-lg text-[#171614]"
                >
                  {BUNDLED_REPLAYS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>

                {currentReplayMeta && (
                  <p className="mt-2.5 text-xs text-[#44413C] leading-relaxed">
                    {currentReplayMeta.story}
                  </p>
                )}

                <p className="mt-2 text-[11px] text-[#524F49] italic">
                  {STRINGS.honesty.offlineReplay}
                </p>
              </div>

              <div className="pt-3 border-t border-[#E3DFD7] flex flex-wrap items-center gap-2.5">
                {currentReplayMeta?.comparisonFile && !comparisonPair && (
                  <button
                    type="button"
                    onClick={() => void handleLoadBundledComparison()}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1E40AF] rounded-lg hover:bg-[#1E3A8A] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {isCbsSolver
                      ? STRINGS.workspace.compare.loadBaselineCompare
                      : STRINGS.workspace.compare.loadCbsCompare}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate('/replays')}
                  className="px-3.5 py-2 text-xs font-semibold text-[#171614] bg-white border border-[#D4CFC5] rounded-lg hover:bg-[#EFECE4] transition-colors whitespace-nowrap cursor-pointer"
                >
                  {STRINGS.workspace.loadGalleryCta}
                </button>
              </div>
            </section>
          ) : (
            <>
              {/* Live Map Picker */}
              <section className="p-5 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl">
                <h2 className="text-sm font-semibold text-[#171614]">
                  {STRINGS.workspace.mapPickerTitle}
                </h2>
                {mapsLoading ? (
                  <p className="mt-3 text-xs text-[#524F49]">{STRINGS.workspace.mapLoading}</p>
                ) : maps.length === 0 ? (
                  <p className="mt-3 text-xs text-[#524F49]">{STRINGS.workspace.mapEmpty}</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                    {maps.map((m) => {
                      const selected = m.id === selectedMapId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMapId(m.id)}
                          aria-pressed={selected}
                          className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-white border-[#1E40AF]'
                              : 'bg-[#F6F5F1] border-[#E3DFD7] hover:bg-white'
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-semibold text-[#171614]">{m.name}</span>
                            <span className="font-mono text-[11px] tabular-nums text-[#524F49]">
                              {m.width}×{m.height}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-[#524F49]">
                            {STRINGS.workspace.mapFamiliesPrefix}{' '}
                            {m.families.length > 0 ? m.families.join(' · ') : 'grid'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Live Agent Setup: Scenario Preset OR Click-to-Place */}
              <section className="p-5 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[#171614]">
                    {STRINGS.workspace.agentSetupTitle}
                  </h2>
                  <div className="inline-flex p-0.5 bg-[#EAE6DD] rounded-md border border-[#DCD7CC]">
                    <button
                      type="button"
                      onClick={() => {
                        setSetupMode('preset');
                        setPendingStartCell(null);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                        setupMode === 'preset'
                          ? 'bg-white text-[#171614] font-semibold'
                          : 'text-[#524F49]'
                      }`}
                    >
                      {STRINGS.workspace.modePreset}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSetupMode('custom');
                        setPendingStartCell(null);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                        setupMode === 'custom'
                          ? 'bg-white text-[#171614] font-semibold'
                          : 'text-[#524F49]'
                      }`}
                    >
                      {STRINGS.workspace.modeCustom}
                    </button>
                  </div>
                </div>

                {setupMode === 'preset' ? (
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="scenario-select"
                        className="block text-xs font-medium text-[#44413C]"
                      >
                        {STRINGS.workspace.scenarioLabel}
                      </label>
                      <select
                        id="scenario-select"
                        value={scenario}
                        onChange={(e) => setScenario(e.target.value as ScenarioKind)}
                        className="mt-1 w-full px-3 py-1.5 text-xs bg-white border border-[#D4CFC5] rounded-lg"
                      >
                        <option value="even">{STRINGS.workspace.scenarioEven}</option>
                        <option value="random">{STRINGS.workspace.scenarioRandom}</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <label htmlFor="agent-count-slider" className="font-medium text-[#44413C]">
                          {STRINGS.workspace.agentCountLabel}
                        </label>
                        <span className="font-mono font-semibold tabular-nums text-[#171614]">
                          {agentCount} agents
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAgentCount((c) => Math.max(1, c - 1))}
                          disabled={agentCount <= 1}
                          className="px-3 py-1.5 text-xs font-semibold text-[#171614] bg-white border border-[#D4CFC5] rounded-lg hover:bg-[#EFECE4] disabled:opacity-40 cursor-pointer"
                          aria-label="Decrease agent count"
                        >
                          −
                        </button>
                        <span className="flex-1 text-center font-mono font-semibold tabular-nums text-[#171614]">
                          {agentCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAgentCount((c) => Math.min(Math.min(100, maxPresetAgents), c + 1))}
                          disabled={agentCount >= Math.min(100, maxPresetAgents)}
                          className="px-3 py-1.5 text-xs font-semibold text-[#171614] bg-white border border-[#D4CFC5] rounded-lg hover:bg-[#EFECE4] disabled:opacity-40 cursor-pointer"
                          aria-label="Increase agent count"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-[#44413C] leading-relaxed">
                      {pendingStartCell
                        ? `${STRINGS.workspace.customPlacementHelpGoal} ${customAgents.length} (start at ${pendingStartCell[0]}, ${pendingStartCell[1]}).`
                        : STRINGS.workspace.customPlacementHelpStart}
                    </p>
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums text-[#524F49]">
                      <span>
                        {STRINGS.workspace.placedAgentsCount}:{' '}
                        <strong className="text-[#171614]">{customAgents.length}</strong>
                      </span>
                      <div className="flex items-center gap-2 font-sans">
                        {customAgents.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomAgents((prev) => prev.slice(0, -1));
                              setPendingStartCell(null);
                            }}
                            className="px-2 py-1 text-xs text-[#44413C] hover:text-[#171614] border border-[#D4CFC5] rounded cursor-pointer"
                          >
                            {STRINGS.workspace.undoLastAgent}
                          </button>
                        )}
                        {(customAgents.length > 0 || pendingStartCell) && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomAgents([]);
                              setPendingStartCell(null);
                            }}
                            className="px-2 py-1 text-xs text-[#9F1239] hover:bg-[#FFF1F2] rounded cursor-pointer"
                          >
                            {STRINGS.workspace.clearAgents}
                          </button>
                        )}
                      </div>
                    </div>
                    {customAgents.length === 0 && (
                      <p className="text-[11px] text-[#92400E]">
                        {STRINGS.workspace.minOneAgentHint}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Custom grid editor mode toggle */}
              <section className="p-5 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[#171614]">
                    {STRINGS.workspace.customGrid}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setCustomGridMode((m) => !m)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${customGridMode ? 'bg-[#1E40AF] text-white' : 'text-[#171614] bg-white border border-[#D4CFC5]'}`}
                  >
                    {customGridMode ? STRINGS.workspace.customGridUseMap : STRINGS.workspace.customGridUseCustom}
                  </button>
                </div>

                {customGridMode && (
                  <>
                    

                    <GridEditor
                      width={customGridWidth}
                      height={customGridHeight}
                      maxCells={healthCaps?.maxGridCells ?? 262144}
                      rows={customGridRows}
                      agents={customAgents}
                      pendingStartCell={customPendingStartCell}
                      onSizeChange={(w, h) => {
                        setCustomGridWidth(w);
                        setCustomGridHeight(h);
                      }}
                      onGridChange={setCustomGridRows}
                      onAgentPlace={(agent) => {
                        // Replace or add agent
                        const existingIdx = customAgents.findIndex((a) => a.id === agent.id);
                        if (existingIdx >= 0) {
                          const next = [...customAgents];
                          next[existingIdx] = agent;
                          setCustomAgents(next);
                        } else {
                          setCustomAgents([...customAgents, agent]);
                        }
                      }}
                      onClearAgents={() => {
                        setCustomAgents([]);
                        setCustomPendingStartCell(null);
                      }}
                      onAgentRemove={(id) => {
                        setCustomAgents((prev) => prev.filter((a) => a.id !== id));
                        setCustomPendingStartCell(null);
                      }}
                      onClearGrid={() => {
                        setCustomGridRows(Array(customGridHeight).fill('.'.repeat(customGridWidth)));
                        setCustomAgents([]);
                        setCustomPendingStartCell(null);
                      }}
                      onPendingStartChange={setCustomPendingStartCell}
                    />

                    {shareTooLarge && (
                      <p className="text-[11px] text-[#92400E]">
                        {STRINGS.workspace.customGridShareTooLong}
                      </p>
                    )}
                    {hashError && (
                      <p className="text-[11px] text-[#9F1239]" role="alert">
                        {STRINGS.workspace.customGridInvalidLink}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs font-mono tabular-nums text-[#524F49]">
                      <span>
                        {STRINGS.workspace.placedAgentsCount}:{' '}
                        <strong className="text-[#171614]">{customAgents.length}</strong>
                      </span>
                      <div className="flex items-center gap-2 font-sans">
                        {customAgents.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomAgents((prev) => prev.slice(0, -1));
                              setCustomPendingStartCell(null);
                            }}
                            className="px-2 py-1 text-xs text-[#44413C] hover:text-[#171614] border border-[#D4CFC5] rounded cursor-pointer"
                          >
                            {STRINGS.workspace.undoLastAgent}
                          </button>
                        )}
                        {(customAgents.length > 0 || customPendingStartCell) && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomAgents([]);
                              setCustomPendingStartCell(null);
                            }}
                            className="px-2 py-1 text-xs text-[#9F1239] hover:bg-[#FFF1F2] rounded cursor-pointer"
                          >
                            {STRINGS.workspace.clearAgents}
                          </button>
                        )}
                      </div>
                    </div>
                    {customAgents.length === 0 && (
                      <p className="text-[11px] text-[#92400E]">
                        {STRINGS.workspace.minOneAgentHint}
                      </p>
                    )}
                  </>
                )}
              </section>

              {/* Live Solve Buttons */}
              <section className="p-5 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl space-y-2.5">
                <h2 className="text-sm font-semibold text-[#171614]">
                  {STRINGS.workspace.solveSectionTitle}
                </h2>

                {/* Tie-break order applies only to CBS; prioritized ignores it. */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="tie-break-select"
                    className="block text-xs font-medium text-[#44413C]"
                  >
                    {STRINGS.workspace.tieBreakLabel}
                  </label>
                  <select
                    id="tie-break-select"
                    value={tieBreak}
                    onChange={(e) =>
                      setTieBreak(e.target.value as 'fifo' | 'conflicts' | 'depth')
                    }
                    className="w-[170px] px-3 py-1.5 text-xs bg-white border border-[#D4CFC5] rounded-lg"
                  >
                    <option value="fifo">{STRINGS.workspace.tieBreakFifo}</option>
                    <option value="conflicts">{STRINGS.workspace.tieBreakConflicts}</option>
                    <option value="depth">{STRINGS.workspace.tieBreakDepth}</option>
                  </select>
                  <p className="text-[11px] text-[#524F49] italic">
                    {STRINGS.workspace.tieBreakHint}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    solving ||
                    !selectedMapId ||
                    (setupMode === 'custom' &&
                      (!liveMapDetail ||
                        liveMapDetail.id !== selectedMapId ||
                        customAgents.length === 0))
                  }
                  onClick={() => void handleRunLiveSolve('cbs')}
                  className="w-full px-4 py-2.5 text-xs font-semibold text-white bg-[#1E40AF] rounded-lg hover:bg-[#1E3A8A] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {solving ? (solvingSlow ? STRINGS.workspace.solvingWakingUp : STRINGS.workspace.solvingLabel) : STRINGS.workspace.solveCbs}
                </button>
                <button
                  type="button"
                  disabled={
                    solving ||
                    !selectedMapId ||
                    (setupMode === 'custom' &&
                      (!liveMapDetail ||
                        liveMapDetail.id !== selectedMapId ||
                        customAgents.length === 0))
                  }
                  onClick={() => void handleRunLiveSolve('prioritized')}
                  className="w-full px-4 py-2 text-xs font-semibold text-[#171614] bg-white border border-[#D4CFC5] rounded-lg hover:bg-[#EFECE4] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {STRINGS.workspace.solvePrioritized}
                </button>
                <button
                  type="button"
                  disabled={
                    solving ||
                    !selectedMapId ||
                    (setupMode === 'custom' &&
                      (!liveMapDetail ||
                        liveMapDetail.id !== selectedMapId ||
                        customAgents.length === 0))
                  }
                  onClick={() => void handleRunLiveSolve('compare')}
                  className="w-full px-4 py-2 text-xs font-semibold text-[#1E40AF] bg-[#1E40AF]/8 border border-[#1E40AF]/25 rounded-lg hover:bg-[#1E40AF]/15 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {STRINGS.workspace.solveCompare}
                  </button>
              </section>
            </>
          )}

          {activeTrace && (
            <section className="p-5 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl space-y-3">
              {/* Honest Outcome Banners for timeout / unsat / error */}
              {activeTrace.result.status === 'timeout' && (
                <div className="p-3 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-xs text-[#92400E]">
                  <p className="font-semibold">{STRINGS.workspace.outcomes.timeoutTitle}</p>
                  <p className="mt-1 leading-relaxed">{STRINGS.workspace.outcomes.timeoutBody}</p>
                </div>
              )}
              {activeTrace.result.status === 'unsat' && (
                <div className="p-3 rounded-lg bg-[#F5F3FF] border border-[#DDD6FE] text-xs text-[#4C1D95]">
                  <p className="font-semibold">{STRINGS.workspace.outcomes.unsatTitle}</p>
                  <p className="mt-1 leading-relaxed">{STRINGS.workspace.outcomes.unsatBody}</p>
                </div>
              )}
              {activeTrace.result.status === 'error' && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-[#FFF1F2] border border-[#FECDD3] text-xs text-[#9F1239]"
                >
                  <p className="font-semibold">{STRINGS.workspace.outcomes.errorTitle}</p>
                  {activeTrace.result.notes.length > 0 && (
                    <p className="mt-1 font-mono">{activeTrace.result.notes.join(' · ')}</p>
                  )}
                </div>
              )}

              {/* Unboxed Tabular Stats Readout */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                <div>
                  <span className="text-[#524F49] block">{STRINGS.workspace.stats.solver}</span>
                  <span className="font-mono font-semibold text-[#171614] uppercase">
                    {activeTrace.solver.name}
                  </span>
                </div>
                <div>
                  <span className="text-[#524F49] block">{STRINGS.workspace.stats.status}</span>
                  <span className="font-mono font-semibold text-[#171614] uppercase">
                    {activeTrace.result.status}
                  </span>
                </div>
                <div>
                  <Tooltip description={STRINGS.tooltips.sumOfCosts}>{STRINGS.workspace.stats.soc}</Tooltip>
                  <span className="font-mono font-semibold tabular-nums text-[#171614]">
                    {activeTrace.result.status === 'solved' ? activeTrace.result.soc : '—'}
                  </span>
                </div>
                <div>
                  <Tooltip description={STRINGS.tooltips.makespan}>{STRINGS.workspace.stats.makespan}</Tooltip>
                  <span className="font-mono font-semibold tabular-nums text-[#171614]">
                    {activeTrace.result.status === 'solved' ? activeTrace.result.makespan : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[#524F49] block">{STRINGS.workspace.stats.runtime}</span>
                  <span className="font-mono font-semibold tabular-nums text-[#171614]">
                    {activeTrace.result.runtime_ms.toFixed(2)} {STRINGS.workspace.stats.msUnit}
                  </span>
                </div>
                <div>
                  <span className="text-[#524F49] block">{STRINGS.workspace.stats.ctExpanded}</span>
                  <span className="font-mono font-semibold tabular-nums text-[#171614]">
                    {activeTrace.result.ct_expanded} / {activeTrace.result.ct_generated}
                  </span>
                </div>
              </div>

              {/* Mandatory Honesty Copy directly beside solver results */}
              <div className="pt-3 border-t border-[#E3DFD7] text-xs text-[#44413C] leading-relaxed">
                {isCbsSolver ? STRINGS.honesty.cbs : STRINGS.honesty.prioritized}
              </div>
            </section>
          )}
        </aside>

        {/* Right Primary Stage & Tab Content */}
        <div className="space-y-5">
          {activeTab === 'paths' ? (
            <div id="panel-paths" role="tabpanel" aria-labelledby="tab-paths" className="space-y-5">
              {/* 3D Diorama Stage Container with Unified Collapsible Bottom Playback Dock */}
              <div className="relative w-full h-[520px] sm:h-[min(760px,calc(100vh-9.5rem))] rounded-xl overflow-hidden border border-[#DCD7CC] bg-[#EAE6DD]">
                {boardSource && (
                  <DioramaStage
                    mapWidth={boardSource.width}
                    mapHeight={boardSource.height}
                    mapRows={boardSource.rows}
                    agents={boardSource.agents}
                    paths={boardSource.paths}
                    ghostPaths={ghostPaths}
                    activeConflict={activeSearchEvent?.conflict ?? null}
                    activeConstraint={activeSearchEvent?.constraint ?? null}
                    playbackTime={playbackStep}
                    playbackTimeRef={timeRef}
                    invalidateRef={invalidateStageRef}
                    isPlaying={isPlaying}
                    assembleProgress={assembleProgress}
                    reducedMotion={reducedMotion}
                    selectedAgentId={selectedAgentId}
                    hoveredAgentId={hoveredAgentId}
                    onSelectAgent={handleSelectAgent}
                    onHoverAgent={setHoveredAgentId}
                    placementMode={!isOffline && setupMode === 'custom'}
                    pendingStartCell={pendingStartCell}
                    onCellClick={handleBoardCellClick}
                    cameraResetTrigger={cameraResetTrigger}
                    cameraViewRequest={viewRequest}
                    ariaLabel={STRINGS.workspace.stageAriaLabel}
                  />
                )}

                {/* Top-Left Minimal Map Info & Camera Presets */}
                <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                  <div className="px-3 py-1.5 rounded-lg bg-[#FAF9F6]/94 border border-[#DCD7CC] text-xs text-[#171614] font-medium flex items-center gap-2 pointer-events-auto">
                    <span>{boardSource?.name ?? 'Board'}</span>
                    {boardSource && (
                      <>
                        <span aria-hidden="true" className="text-[#C8C2B5]">
                          ·
                        </span>
                        <span className="font-mono tabular-nums text-[#524F49]">
                          {boardSource.width}×{boardSource.height}
                        </span>
                        <span aria-hidden="true" className="text-[#C8C2B5]">
                          ·
                        </span>
                        <span className="font-mono tabular-nums text-[#524F49]">
                          {boardSource.agents.length} agents
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
                    {selectedAgentId !== null && (
                      <button
                        type="button"
                        onClick={() => handleSelectAgent(null)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E40AF] text-white text-xs font-semibold hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <AgentIdentityBadge agentId={selectedAgentId} compact />
                        <span>{STRINGS.workspace.clearSelection}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      aria-pressed={viewRequest.seq > 0 && viewRequest.kind === 'top'}
                      onClick={() =>
                        setViewRequest((prev) => ({ kind: 'top', seq: prev.seq + 1 }))
                      }
                      className={`px-3 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        viewRequest.seq > 0 && viewRequest.kind === 'top'
                          ? 'bg-white border-[#1E40AF] text-[#1E40AF] font-semibold'
                          : 'bg-[#FAF9F6]/94 border-[#DCD7CC] text-[#171614] font-medium hover:bg-white'
                      }`}
                    >
                      {STRINGS.workspace.cameraTop}
                    </button>
                    <button
                      type="button"
                      disabled={selectedAgentId === null}
                      aria-pressed={
                        selectedAgentId !== null &&
                        viewRequest.seq > 0 &&
                        viewRequest.kind === 'follow'
                      }
                      onClick={() => {
                        if (selectedAgentId === null) return;
                        setViewRequest((prev) => ({ kind: 'follow', seq: prev.seq + 1 }));
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        selectedAgentId !== null &&
                        viewRequest.seq > 0 &&
                        viewRequest.kind === 'follow'
                          ? 'bg-white border-[#1E40AF] text-[#1E40AF] font-semibold'
                          : 'bg-[#FAF9F6]/94 border-[#DCD7CC] text-[#171614] font-medium hover:bg-white'
                      }`}
                    >
                      {selectedAgentId !== null && (
                        <AgentIdentityBadge agentId={selectedAgentId} compact />
                      )}
                      <span>{STRINGS.workspace.cameraFollow}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setViewRequest((prev) => ({ kind: 'reset', seq: prev.seq + 1 }))
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#FAF9F6]/94 border border-[#DCD7CC] text-xs font-medium text-[#171614] hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {STRINGS.workspace.resetCamera}
                    </button>
                  </div>
                </div>

                {/* Assemble notification if revealing */}
                {assembleProgress < 1 && (
                  <div className="absolute top-14 left-3 px-3 py-1 rounded bg-[#FAF9F6]/94 border border-[#DCD7CC] text-xs font-medium text-[#1E40AF] pointer-events-none">
                    {STRINGS.workspace.playback.assembleBanner}
                  </div>
                )}

                {/* Unified Collapsible Bottom Playback Dock (solid surface, zero backdrop-blur over WebGL) */}
                {makespan > 0 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(94%,760px)] flex flex-col items-center pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => setDockCollapsed((c) => !c)}
                      aria-expanded={!dockCollapsed}
                      className="mb-1 px-2.5 py-0.5 rounded-md bg-[#FAF9F6] border border-[#DCD7CC] text-[11px] font-medium text-[#524F49] hover:text-[#171614] cursor-pointer"
                    >
                      {dockCollapsed
                        ? `▴ ${STRINGS.workspace.showControls}`
                        : `▾ ${STRINGS.workspace.hideControls}`}
                    </button>

                    {!dockCollapsed && (
                      <div className="w-full p-3.5 rounded-xl bg-[#FAF9F6] border border-[#DCD7CC] shadow-sm space-y-2.5">
                        {/* Per-Agent Activity Strip (DOM-ref playhead, zero per-frame React state) */}
                        {agentActivity.length > 0 && (
                          <div
                            role="region"
                            aria-label={STRINGS.workspace.playback.activityStripLabel}
                            className="max-h-28 overflow-y-auto overflow-x-hidden pr-0.5 space-y-1"
                          >
                            <div aria-hidden="true" className="flex items-stretch">
                              <div className="w-8 shrink-0 flex flex-col gap-0.5">
                                {agentActivity.slice(0, MAX_ACTIVITY_STRIP_AGENTS).map((row) => (
                                  <div key={row.id} className="h-5 flex items-center">
                                    <AgentIdentityBadge agentId={row.id} compact />
                                  </div>
                                ))}
                              </div>
                              <div className="relative flex-1 min-w-0 flex flex-col gap-0.5">
                                {agentActivity.slice(0, MAX_ACTIVITY_STRIP_AGENTS).map((row) => {
                                  const agentColor = getAgentIdentity(row.id).color;
                                  return (
                                    <div key={row.id} className="h-5 flex items-center">
                                      <div className="w-full h-2 flex gap-px bg-[#EFECE4] rounded-[2px] overflow-hidden">
                                        {row.segments.map((seg) => (
                                          <div
                                            key={seg.from}
                                            style={
                                              seg.kind === 'moving'
                                                ? {
                                                    flexGrow: seg.to - seg.from,
                                                    background: agentColor,
                                                  }
                                                : seg.kind === 'waiting'
                                                  ? {
                                                      flexGrow: seg.to - seg.from,
                                                      background:
                                                        'repeating-linear-gradient(45deg, #FDE68A 0 3px, #B45309 3px 6px)',
                                                    }
                                                  : {
                                                      flexGrow: seg.to - seg.from,
                                                      background: '#E7E2D8',
                                                    }
                                            }
                                            className="h-full basis-0 min-w-0"
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                                <div
                                  ref={activityPlayheadRef}
                                  style={{ left: '0%' }}
                                  className="pointer-events-none absolute top-0 bottom-0 -translate-x-1/2 w-[2px] bg-[#171614]/70 z-10"
                                />
                              </div>
                            </div>
                            {agentActivity.length > MAX_ACTIVITY_STRIP_AGENTS && (
                              <p className="text-[11px] text-[#524F49] pl-8 leading-tight">
                                {STRINGS.workspace.playback.activityOverflowPrefix}
                                {agentActivity.length - MAX_ACTIVITY_STRIP_AGENTS}{' '}
                                {STRINGS.workspace.playback.activityOverflowSuffix}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Scrubber Row (DOM-ref driven thumb & track fill) */}
                        <div className="flex items-center gap-3">
                          <label htmlFor="timeline-scrubber" className="sr-only">
                            {STRINGS.workspace.playback.timelineLabel}
                          </label>
                          <div className="relative flex-1 flex items-center h-5">
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-x-0 z-0 h-1.5 rounded-full bg-[#DCD7CC] overflow-hidden"
                            >
                              <div
                                ref={scrubberFillRef}
                                className="h-full w-full bg-[#1E40AF] origin-left will-change-transform"
                              />
                            </div>
                            {keyMoments.length > 0 && (
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-x-0 inset-y-0 z-0"
                              >
                                {keyMoments.map((t) => {
                                  const isArrival = arrivalTickSet.has(t);
                                  const label = isArrival
                                    ? STRINGS.workspace.playback.arrivalNotchLabel
                                    : STRINGS.workspace.playback.waitNotchLabel;
                                  return (
                                    <span
                                      key={t}
                                      title={`${label} (${STRINGS.workspace.playback.timestepPrefix} ${t})`}
                                      style={{ left: `${(t / makespan) * 100}%` }}
                                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[2px] h-2.5 rounded-sm ${
                                        isArrival ? 'bg-[#171614]' : 'bg-[#B45309]'
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                            )}
                            <input
                              ref={scrubberInputRef}
                              id="timeline-scrubber"
                              type="range"
                              min={0}
                              max={makespan}
                              step={0.02}
                              defaultValue={0}
                              onInput={(e) => {
                                if (isPlayingRef.current) {
                                  isPlayingRef.current = false;
                                  setIsPlaying(false);
                                }
                                const val = Number(e.currentTarget.value);
                                timeRef.current = val;
                                syncScrubberDom(val, makespan, false);
                                invalidateStageRef.current?.();
                              }}
                              onBlur={(e) => {
                                seekToTime(Number(e.currentTarget.value));
                              }}
                              className="relative z-10 w-full h-5 appearance-none bg-transparent cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E40AF] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#1E40AF] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#FAF9F6] [&::-webkit-slider-thumb]:shadow-xs [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#1E40AF] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#FAF9F6]"
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold tabular-nums text-[#171614] whitespace-nowrap shrink-0 min-w-[76px] text-right">
                            {STRINGS.workspace.playback.timestepPrefix} {playbackStep} /{' '}
                            {makespan}
                          </span>
                        </div>

                        {/* Transport Buttons + Speed Selector */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!isPlayingRef.current && timeRef.current >= makespan) {
                                  seekToTime(0);
                                }
                                setIsPlaying((p) => !p);
                              }}
                              className="px-4 py-1.5 text-xs font-semibold text-white bg-[#1E40AF] rounded-lg hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {isPlaying
                                ? STRINGS.workspace.playback.pause
                                : STRINGS.workspace.playback.play}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setIsPlaying(false);
                                const curStep = getPlaybackDisplayStep(
                                  timeRef.current,
                                  makespan
                                );
                                seekToTime(Math.max(0, curStep - 1));
                              }}
                              disabled={playbackStep <= 0}
                              className="px-3 py-1.5 text-xs font-medium text-[#171614] bg-white border border-[#D4CFC5] rounded-lg hover:bg-[#EFECE4] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {STRINGS.workspace.playback.stepBack}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setIsPlaying(false);
                                const curStep = getPlaybackDisplayStep(
                                  timeRef.current,
                                  makespan
                                );
                                seekToTime(Math.min(makespan, curStep + 1));
                              }}
                              disabled={playbackStep >= makespan}
                              className="px-3 py-1.5 text-xs font-medium text-[#171614] bg-white border border-[#D4CFC5] rounded-lg hover:bg-[#EFECE4] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {STRINGS.workspace.playback.stepForward}
                            </button>
                          </div>

                          {/* Speed Control 0.5x – 8x */}
                          <div
                            role="group"
                            aria-label={STRINGS.workspace.playback.speedLabel}
                            className="inline-flex items-center gap-1 p-0.5 bg-[#EAE6DD] rounded-lg border border-[#DCD7CC]"
                          >
                            {SPEED_OPTIONS.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setSpeed(s)}
                                aria-pressed={speed === s}
                                className={`px-2 py-1 text-xs font-mono tabular-nums rounded transition-colors whitespace-nowrap cursor-pointer ${
                                  speed === s
                                    ? 'bg-white text-[#171614] font-semibold'
                                    : 'text-[#524F49] hover:text-[#171614]'
                                }`}
                              >
                                {s}x
                              </button>
                            ))}
                          </div>
                        </div>

                        <p className="text-[11px] text-[#524F49] hidden sm:block">
                          {STRINGS.workspace.playback.keyboardHint}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Side-by-side Solver Comparison Panel when active */}
              {comparisonPair && activeTrace && (
                <ComparePanel
                  cbsTrace={comparisonPair.cbs}
                  baselineTrace={comparisonPair.baseline}
                  activeTrace={activeTrace}
                  onSelectActiveTrace={(trace) => triggerSolveRevealAndPlay(trace, false)}
                  onClose={() => setComparisonPair(null)}
                />
              )}

              {/* Non-Visual Accessible Scene & Timestep Inspector */}
              {boardSource && boardSource.agents.length > 0 && (
                <AccessibleInspector
                  agents={boardSource.agents}
                  paths={boardSource.paths}
                  playbackTime={playbackStep}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={handleSelectAgent}
                />
              )}
            </div>
          ) : (
            /* Search Tab: interactive Constraint Tree explorer synced with the 3D board */
            <div
              id="panel-search"
              role="tabpanel"
              aria-labelledby="tab-search"
              className="p-8 bg-[#FAF9F6] border border-[#DCD7CC] rounded-xl space-y-6"
            >
              {activeSearchEvent?.conflict && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveTab('paths')}
                    className="px-4 py-2.5 text-sm font-semibold text-white bg-[#1E40AF] rounded-lg hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {STRINGS.workspace.compare.viewOnStage}
                  </button>
                </div>
              )}

              <SearchExplorer
                searchEvents={activeTrace?.search ?? []}
                activeSeq={activeSearchSeq}
                onSelectEvent={handleSelectSearchEvent}
              />
            </div>
          )}

          <EncodingLegendStrip />
        </div>
      </div>
    </main>
  );
}
