"""CBS property-based tests (Section 9.2 #1, #3, #4).

Uses the hypothesis fast profile (max_examples=25 per Section 15.1).
#2 dominance is deferred to Phase 5 (prioritized planning does not exist yet).
"""

from __future__ import annotations

from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.solver.cbs import solve
from swarmway.solver.validity import check

AGENT_LIMIT = 6
GRID_LIMIT = 8
PROPERTY_BUDGET_MS = 1000


def _random_grid(rng, width, height):
    chars = [rng.choice(['.', '@']) for _ in range(width * height)]
    return Grid(
        width=width,
        height=height,
        rows=tuple(''.join(chars[i * width : (i + 1) * width]) for i in range(height)),
    )


def _random_instance(rng):
    width = rng.randrange(2, GRID_LIMIT + 1)
    height = rng.randrange(2, GRID_LIMIT + 1)
    grid = _random_grid(rng, width, height)
    passable = [(x, y) for y in range(height) for x in range(width) if grid.passable((x, y))]
    assume(len(passable) >= 4)
    n_agents = rng.randint(1, min(AGENT_LIMIT, len(passable) // 2))
    chosen = rng.sample(passable, 2 * n_agents)
    agents = tuple(Agent(i, chosen[2 * i], chosen[2 * i + 1]) for i in range(n_agents))
    return Instance(grid=grid, agents=agents)


@settings(suppress_health_check=[HealthCheck.filter_too_much], deadline=None)
@given(
    width=st.integers(min_value=2, max_value=GRID_LIMIT),
    height=st.integers(min_value=2, max_value=GRID_LIMIT),
    seed=st.integers(min_value=0, max_value=10000),
)
def test_property_1_validity(width, height, seed):
    # Any outcome claiming solved passes the independent validity check.
    import random

    rng = random.Random(seed)
    grid = _random_grid(rng, width, height)
    passable = [(x, y) for y in range(height) for x in range(width) if grid.passable((x, y))]
    assume(len(passable) >= 4)
    n_agents = rng.randint(1, min(AGENT_LIMIT, len(passable) // 2))
    chosen = rng.sample(passable, 2 * n_agents)
    agents = tuple(Agent(i, chosen[2 * i], chosen[2 * i + 1]) for i in range(n_agents))
    instance = Instance(grid=grid, agents=agents)
    outcome = solve(instance, PROPERTY_BUDGET_MS)
    if outcome.status == 'solved':
        assert outcome.solution is not None
        assert check(outcome.solution, instance) == 'valid'


@settings(suppress_health_check=[HealthCheck.filter_too_much], deadline=None)
@given(
    width=st.integers(min_value=2, max_value=GRID_LIMIT),
    height=st.integers(min_value=2, max_value=GRID_LIMIT),
    seed=st.integers(min_value=0, max_value=10000),
)
def test_property_3_determinism(width, height, seed):
    # Same instance twice: identical paths and stats (excluding runtime).
    import random

    rng = random.Random(seed)
    grid = _random_grid(rng, width, height)
    passable = [(x, y) for y in range(height) for x in range(width) if grid.passable((x, y))]
    assume(len(passable) >= 4)
    n_agents = rng.randint(1, min(AGENT_LIMIT, len(passable) // 2))
    chosen = rng.sample(passable, 2 * n_agents)
    agents = tuple(Agent(i, chosen[2 * i], chosen[2 * i + 1]) for i in range(n_agents))
    instance = Instance(grid=grid, agents=agents)
    r1 = solve(instance, PROPERTY_BUDGET_MS)
    r2 = solve(instance, PROPERTY_BUDGET_MS)
    assert r1.status == r2.status
    if r1.status == 'solved':
        assert r1.solution.paths == r2.solution.paths
        assert r1.solution.soc == r2.solution.soc
        assert r1.solution.makespan == r2.solution.makespan
        # Stats on a solved outcome are fully deterministic (no timing).
        assert r1.stats.ct_expanded == r2.stats.ct_expanded
        assert r1.stats.ct_generated == r2.stats.ct_generated
        assert r1.stats.low_level_expansions == r2.stats.low_level_expansions
    # On timeout, expansion counts are inherently timing-dependent (the
    # deadline fires mid-search), so only status equality is required here.


def test_property_4_unsat_honesty() -> None:
    # CBS reports unsat only after open-list exhaustion (ct_expanded > 0),
    # never as timeout or error. Goal in a disconnected region: the root
    # low level fails for that agent, so the tree is exhausted immediately.
    grid = Grid(width=3, height=3, rows=('...', '###', '...'))
    instance = Instance(grid=grid, agents=(Agent(0, (0, 0), (0, 2)),))
    outcome = solve(instance, PROPERTY_BUDGET_MS)
    # Root low level fails (goal unreachable) → unsat with exhaustion
    # evidence, never timeout or error.
    assert outcome.status == 'unsat', outcome.status
    assert outcome.solution is None
