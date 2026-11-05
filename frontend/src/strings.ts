/**
 * Centralized user-visible strings for Swarmway.
 * Every UI label, honesty copy, status message, and aria-label lives here.
 */

export const STRINGS = {
  brand: 'Swarmway',

  nav: {
    home: 'Home',
    workspace: 'Workspace',
    replays: 'Replays',
    benchmarks: 'Benchmarks',
    about: 'About',
    primaryCta: 'Open workspace',
  },

  connection: {
    checking: 'Checking solver connection…',
    online: 'Live solver API connected',
    offlineBadge: 'Pre-computed examples (no solver connected)',
    offlineHint:
      'No external solver backend is reachable. Explore and compare bundled pre-computed traces in full 3D playback.',
  },

  honesty: {
    cbs: 'Optimal for sum-of-costs under 4-connected unit-time movement with wait actions and stay-at-goal semantics.',
    prioritized: 'Incomplete baseline: faster, sometimes fails, usually costlier.',
    offlineReplay: 'Pre-computed example — generated offline.',
  },

  tooltips: {
    sumOfCosts:
      'Sum of costs — the sum, over every agent, of the timestep at which it permanently reaches its goal. Lower is better; CBS guarantees the minimum possible sum-of-costs.',
    makespan:
      'Makespan — the timestep at which the last agent reaches its goal (total elapsed time of the plan).',
    conflict: 'Conflict — a vertex or edge collision detected between two agents at the same timestep.',
    constraint:
      'Constraint — a forbidden cell or transition imposed on one branch of the Constraint Tree to resolve a conflict.',
    constraintTree:
      'Constraint tree — CBS branches on spacetime constraints; each node adds one constraint and re-plans the affected agent until a collision-free plan emerges.',
    optimal:
      'Optimal — proven to minimize sum-of-costs. CBS is optimal under 4-connected unit-time movement with wait actions and stay-at-goal semantics.',
    stayAtGoal:
      'Stay-at-goal — an agent remains physically present at its goal after arrival, so parked agents still block pass-through traffic.',
  },

  encodings: {
    sectionTitle: 'Visual Encodings',
    conflictLabel: 'Conflict',
    conflictDesc: 'Vertex or edge collision detected between two agents at timestep t',
    constraintLabel: 'Constraint',
    constraintDesc: 'Forbidden cell or transition imposed on a branch in the Constraint Tree',
    vertexBadge: 'Vertex',
    edgeBadge: 'Edge',
  },

  landing: {
    kicker: 'Interactive 3D Multi-Agent Path Finding Workbench',
    headline: 'Watch optimal multi-robot coordination unfold step by step.',
    paragraph:
      'Conflict-Based Search (CBS) plans fastest individual routes first, then resolves collisions by branching on spacetime constraints until a provably sum-of-costs optimal plan emerges.',
    openWorkspace: 'Open workspace',
    watchReplays: 'Watch replays',
    benchmarks: 'Benchmarks',
    about: 'About',
    heroSceneCaption: 'Live 8×8 diorama — 6 agents coordinating through a central crossroad without collision',
    heroAriaLabel: 'Interactive 3D diorama of an 8 by 8 grid map with 6 mobile robot agents navigating smoothly around stone obstacles.',
    teaserLead: 'Try a scenario:',
  },

  workspace: {
    title: 'Workspace',
    offlineNoticeTitle: 'Workspace restricted to bundled replays',
    offlineNoticeBody:
      'Connect a live solver via VITE_API_BASE_URL to unlock arbitrary maps, presets, and click-to-place solving. Select any bundled replay below or from the Replays gallery.',
    pickBundledLabel: 'Bundled Replay Trace',
    loadGalleryCta: 'Browse all replays',

    mapPickerTitle: 'Map Picker',
    mapLoading: 'Loading maps from solver…',
    mapEmpty: 'No maps returned by solver.',
    mapSizeUnit: 'cells',
    mapFamiliesPrefix: 'Families:',

    agentSetupTitle: 'Agent Setup',
    modePreset: 'Scenario preset',
    modeCustom: 'Click-to-place',
    scenarioLabel: 'Scenario',
    scenarioEven: 'Even distribution',
    scenarioRandom: 'Random distribution',
    agentCountLabel: 'Agent count',
    customPlacementHelpStart: 'Click any free tile on the 3D board to place next agent start.',
    customPlacementHelpGoal: 'Now click a free tile to set the goal for Agent',
    clearAgents: 'Clear placed agents',
    undoLastAgent: 'Remove last',
    placedAgentsCount: 'Placed agents',
    minOneAgentHint: 'Place at least 1 complete agent (start and goal) to run a solve.',

    solveSectionTitle: 'Run Planner',
    solveCbs: 'Solve — CBS (optimal)',
    solvePrioritized: 'Solve — Prioritized (baseline)',
    solveCompare: 'Compare both',
    solvingLabel: 'Solving…',

    tieBreakLabel: 'Tie-break order (CBS)',
    tieBreakHint:
      'Only reorders equal-cost CBS nodes; sum-of-costs optimality is unchanged. Prioritized baseline ignores it.',
    tieBreakFifo: 'FIFO (insertion order)',
    tieBreakConflicts: 'Conflicts first',
    tieBreakDepth: 'Depth first',

    customGrid: 'Custom Grid Editor',
    customGridUseMap: 'Use map picker',
    customGridUseCustom: 'Use custom grid',
    customGridClear: 'Clear grid',
    customGridWidth: 'Width',
    customGridHeight: 'Height',
    customGridHelp: 'Click cells to toggle obstacles. Click an agent start/goal to remove it.',

    customGridShareTooLong:
      'Instance too large to share as a link — try a smaller grid or fewer agents.',
    customGridInvalidLink: 'Shared grid link could not be restored — invalid or expired instance.',
    errorDetailLine: '{field}: received {received} (limit {limit})',

    gridEditor: {
      placeAgents: 'Place agents',
      paintObstacles: 'Paint obstacles',
      capHint: 'of {maxCells} cells',
    },

    tabs: {
      paths: 'Paths',
      search: 'Search',
      searchPlaceholderTitle: 'Search explorer lands in the next milestone',
      searchPlaceholderBody:
        'The upcoming Constraint Tree inspector will let you step through high-level node expansions, inspect vertex and edge conflicts, and trace low-level A* replans directly on the 3D board.',
      searchPreviewEventsLabel: 'Recorded search events in active trace:',
    },

    stageAriaLabel: 'Interactive 3D multi-agent path finding board. Drag to orbit, scroll to zoom, click an agent to highlight its path.',
    resetCamera: 'Reset view',
    clearSelection: 'Show all routes',
    hideControls: 'Hide controls',
    showControls: 'Show controls',

    playback: {
      play: 'Play',
      pause: 'Pause',
      stepBack: 'Step -1',
      stepForward: 'Step +1',
      timelineLabel: 'Timeline timestep scrubber',
      speedLabel: 'Playback speed',
      timestepPrefix: 't =',
      assembleBanner: 'Assembling agents at start positions…',
      keyboardHint: 'Keys: Space play/pause · ←/→ step · Home/End jump',
      waitNotchLabel: 'Agents yield or wait at this timestep',
      arrivalNotchLabel: 'An agent docks at its goal here',
      activityStripLabel: 'Per-agent activity timeline',
      activityOverflowPrefix: '+',
      activityOverflowSuffix: 'more — see the inspector',
    },

    stats: {
      solver: 'Solver',
      status: 'Outcome',
      soc: 'Sum of costs',
      makespan: 'Makespan',
      runtime: 'Runtime',
      ctExpanded: 'CT expanded',
      ctGenerated: 'CT generated',
      lowLevel: 'Low-level A*',
      validity: 'Validity',
      msUnit: 'ms',
      stepsUnit: 'steps',
    },

    outcomes: {
      solvedTitle: 'Collision-free plan verified',
      timeoutTitle: 'Search budget exhausted (Timeout)',
      timeoutBody:
        'The solver reached its time budget before proving optimality or finding a complete collision-free schedule. Inspect the recorded search effort below.',
      unsatTitle: 'Instance proven unsatisfiable (UNSAT)',
      unsatBody:
        'No collision-free trajectory exists for this start and goal configuration under 4-connected stay-at-goal semantics.',
      errorTitle: 'Solver reported an execution error',
      apiErrorTitle: 'Solver request failed',
      dismissError: 'Dismiss',
    },

    compare: {
      title: 'Solver Comparison on Same Instance',
      loadBaselineCompare: 'Compare with Prioritized baseline',
      loadCbsCompare: 'Compare with optimal CBS',
      exitCompare: 'Close comparison',
      colMetric: 'Metric',
      colCbs: 'CBS (Optimal)',
      colBaseline: 'Prioritized (Baseline)',
      colStage: '3D Stage',
      activeViewBadge: 'Viewing on 3D stage',
      viewOnStage: 'Load onto 3D stage',
      socDeltaLabel: 'Cost overhead',
      socDeltaSuffix: 'steps vs optimal CBS',
      cbsPrefix: 'CBS:',
      prioritizedPrefix: 'Prioritized:',
      perAgentTitle: 'Per-agent arrival steps (baseline vs CBS)',
      perAgentUnit: 'steps',
      perAgentColCbs: 'CBS',
      perAgentColBaseline: 'Baseline',
      perAgentColDelta: 'Delta',
    },

    inspector: {
      title: 'Accessible Scene & Timestep Inspector',
      subtitle: 'Live non-visual readout of agent coordinates and conflict resolution state',
      colAgent: 'Agent',
      colRoute: 'Route',
      colStart: 'Start',
      colCurrent: 'Cell at t',
      colGoal: 'Goal',
      colState: 'State',
      stateMoving: 'Moving',
      stateWaiting: 'Waiting',
      stateArrived: 'At goal',
      focusAgentAction: 'Highlight route',
      focusedState: 'Highlighted',
    },

    cameraTop: 'Top view',
    cameraFollow: 'Follow agent',

    search: {
      title: 'Constraint Tree explorer',
      filterAll: 'All',
      filterConflicts: 'Conflicts only',
      emptyBody:
        'No recorded Constraint Tree events in this trace. Prioritized baselines never run a high-level search, and only CBS traces record every node expansion — load a CBS replay or run a live CBS solve to explore one.',
      jumpHint:
        'Selecting a conflict node pauses playback and seeks the 3D board to that timestep — hover or select the involved agents to trace their lanes.',
    },
  },

  replays: {
    kicker: 'Curated Pre-Computed Traces',
    title: 'Replays Gallery',
    subtitle:
      'Every trace below is a complete recorded solve following the Swarmway Trace v1 schema. Load any scenario into the 3D workspace to scrub timesteps, inspect individual lanes, and compare optimal CBS against prioritized planning.',
    loadIntoWorkspace: 'Open in 3D workspace',
    compareAvailable: 'Includes baseline comparison',
    agentsCountSuffix: 'agents',
    gridSizeSuffix: 'grid',
    searchEventsSuffix: 'CT events',
    socPrefix: 'SoC',
    makespanPrefix: 'Makespan',
    outcomePrefix: 'Outcome:',
    thumb: {
      planThumbAria: 'Floor plan preview with agent routes',
      planThumbUnsolvedAria: 'Floor plan preview with agent start and goal positions',
      mapSeparator: ' — ',
    },
  },

  benchmarks: {
    kicker: 'Milestone Roadmap',
    title: 'Benchmarks',
    placeholderHeading: 'Benchmark suite lands in a future milestone',
    placeholderBody:
      'This view will aggregate success rates, sum-of-costs optimality gaps, and runtime scaling curves across standard MovingAI grid families for CBS and prioritized baselines.',
    exploreReplaysCta: 'Explore pre-computed replays',

    // Honesty copy shown under every table (Section 1.6 / 10.6).
    honestyTimeouts:
      'Timeouts are failures and stay in the success-rate denominators — never dropped.',
    honestyMedians:
      'Medians are computed over solved runs only, with the solved-count shown next to each median.',
    honestyComparable:
      'Artifacts are not comparable across machines — per-environment tables only (Section 10.4).',
    honestyCaveat:
      'Every number on this page cites the committed run ID below; no figure is hand-typed (Section 10.7).',

    runId: 'Run ID',
    environment: 'Environment',
    reproduceCommand: 'Reproduce command',
    reproduceHint:
      'Regenerate these artifacts with: uv run swarmway bench --config bench/default.yaml',
    tableHeading: 'Benchmark results — {runId}',
    noResultsHeading: 'No benchmark results yet',
    noResultsBody:
      'Run the headline benchmark to generate results: uv run swarmway bench --config bench/default.yaml',
    noResultsDetail:
      'Once a run is committed under data/results/<run-id>/, run scripts/sync-results.py to copy its summary.json and environment.json into frontend/public/benchmarks/.',
    colMap: 'Map',
    colAgents: 'Agents',
    colArm: 'Arm',
    colStatus: 'Status',
    colSoc: 'Sum of costs',
    colMakespan: 'Makespan',
    colRuntime: 'Runtime (ms)',
    colSuccessRate: 'Success rate',
    colMedianSoc: 'Median SoC',
    colMedianRuntime: 'Median runtime (ms)',
    solved: 'solved',
    unsat: 'unsat',
    timeout: 'timeout',
    error: 'error',
    skipped: 'skipped',
    aborted: 'aborted',
  },

  about: {
    kicker: 'Methodology & Attribution',
    title: 'About Swarmway',
    optimalTitle: 'What “Optimal” Means Here',
    optimalBody:
      'Conflict-Based Search (CBS) guarantees a minimum sum-of-costs solution—the sum across all agents of the last timestep before each agent permanently settles on its goal—under discrete timesteps and 4-connected cardinal movement.',
    movementTitle: 'Movement & Collision Model',
    movementBody:
      'Time advances in synchronized integer ticks (t = 0, 1, …, makespan). Each tick, an agent either moves to one of its four cardinal neighbors (North, South, East, West) or executes a wait action on its current tile, incurring cost 1 until permanently reaching its goal. Two plans conflict if they occupy the same cell at the same tick (vertex conflict) or traverse the same undirected grid edge in opposite directions during the same tick (edge swap conflict). Agents remain physically present at their goals after arrival (stay-at-goal semantics), so parked agents still block pass-through traffic.',
    baselineTitle: 'Prioritized Planning Baseline Caveat',
    baselineBody:
      'Prioritized planning plans agents sequentially in a fixed or sampled priority order, treating higher-priority trajectories as moving obstacles. While fast in open space, it is neither optimal nor complete: earlier agents can inadvertently seal narrow corridors or block goals needed by lower-priority agents, causing higher sum-of-costs or false unsatisfiability.',
    attributionTitle: 'Map & Scenario Attribution',
    attributionBody:
      'Grid map conventions (. passable floor, @/O/T blocked obstacles) and benchmark taxonomy follow the MovingAI Multi-Agent Path-Finding (MAPF) benchmark format introduced by Nathan Sturtevant (MovingAI Lab). Bundled showcase maps and pre-computed traces are deterministic synthetic instances crafted for interactive inspection.',
    aiDisclosureTitle: 'Disclosure',
    aiDisclosureBody:
      'Built with AI assistance.',
  },

  shapes: {
    capsule: 'Capsule (# circle badge)',
    cube: 'Rounded Cube (# square badge)',
    pawn: 'Tapered Pawn (# diamond badge)',
    cylinder: 'Hex Beacon (# hex badge)',
  },
} as const;
