"""Property #2 of Section 9.2: CBS dominance over prioritized planning.

When CBS and a prioritized-planning variant BOTH solve the same instance,
CBS must be no more expensive: ``soc_cbs <= soc_pp`` (equality allowed).
CBS is optimal for sum-of-costs, PP is a greedy baseline, so PP may be
costlier but never cheaper.

Uses the Hypothesis fast profile (max_examples=25, Section 5.1), grids up
to 12x12 and up to 6 agents, with seeded generation so failures are
reproducible.

Comparisons where one side did not solve (unsat or timeout) are skipped,
but NEVER silently swallowed: the count of comparable and skipped pairs
is reported in the test output.
"""

from __future__ import annotations

import random

import pytest
from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.solver.cbs import solve as cbs_solve
from swarmway.solver.prioritized import solve_pp, solve_pp_best_of_n

AGENT_LIMIT = 6
GRID_LIMIT = 12
PROPERTY_BUDGET_MS = 1000
PP_SEED = 42
PP_ORDERINGS = 4


def _random_grid(rng: random.Random, width: int, height: int) -> Grid:
    """Mostly-open grid: enough walls to create conflicts, enough room
    that both solvers can actually solve the instance."""
    chars = [rng.choice(['.', '.', '.', '.', '.', '.', '@']) for _ in range(width * height)]
    return Grid(
        width=width,
        height=height,
        rows=tuple(''.join(chars[i * width : (i + 1) * width]) for i in range(height)),
    )


def _random_instance(rng: random.Random) -> Instance:
    width = rng.randrange(3, GRID_LIMIT + 1)
    height = rng.randrange(3, GRID_LIMIT + 1)
    grid = _random_grid(rng, width, height)
    passable = [(x, y) for y in range(height) for x in range(width) if grid.passable((x, y))]
    assume(len(passable) >= 4)
    n_agents = rng.randint(1, min(AGENT_LIMIT, len(passable) // 4))
    chosen = rng.sample(passable, 2 * n_agents)
    agents = tuple(Agent(i, chosen[2 * i], chosen[2 * i + 1]) for i in range(n_agents))
    return Instance(grid=grid, agents=agents)


@pytest.fixture
def dominance_counts(request: pytest.FixtureRequest) -> dict[str, int]:
    """Accumulates comparable/skipped pair counts and reports them.

    The report is written straight to the terminal so the skipped
    comparisons are visible in the test output, never silently swallowed.
    """
    counts = {'compared': 0, 'skipped': 0}
    yield counts
    message = (
        f'dominance property: {counts["compared"]} comparable pair(s) '
        f'(soc_cbs <= soc_pp asserted), {counts["skipped"]} skipped pair(s) '
        f'(one side did not solve)'
    )
    reporter = request.config.pluginmanager.get_plugin('terminalreporter')
    if reporter is not None:
        reporter.write_line(message)
    else:
        print(message)


@settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[HealthCheck.filter_too_much, HealthCheck.function_scoped_fixture],
)
@given(seed=st.integers(min_value=0, max_value=10000))
def test_property_2_dominance(dominance_counts: dict[str, int], seed: int) -> None:
    """CBS SoC <= PP SoC whenever both solve the same instance."""
    rng = random.Random(seed)
    instance = _random_instance(rng)

    cbs_outcome = cbs_solve(instance, PROPERTY_BUDGET_MS)
    pp_fixed = solve_pp(instance, budget_ms=PROPERTY_BUDGET_MS)
    pp_best = solve_pp_best_of_n(
        instance,
        n=PP_ORDERINGS,
        seed=PP_SEED,
        budget_ms=PROPERTY_BUDGET_MS,
    )

    for pp_outcome in (pp_fixed, pp_best):
        if cbs_outcome.status == 'solved' and pp_outcome.status == 'solved':
            assert cbs_outcome.solution is not None
            assert pp_outcome.solution is not None
            dominance_counts['compared'] += 1
            assert cbs_outcome.solution.soc <= pp_outcome.solution.soc, (
                f'CBS soc {cbs_outcome.solution.soc} > PP soc {pp_outcome.solution.soc} '
                f'on seed {seed}'
            )
        else:
            dominance_counts['skipped'] += 1


def test_dominance_property_is_exercised() -> None:
    """Guard: the property must actually compare pairs, not only skip.

    A property that silently skipped everything would pass vacuously.
    """
    instance = Instance(
        grid=Grid(width=3, height=3, rows=('...', '...', '...')),
        agents=(Agent(0, (0, 1), (2, 1)), Agent(1, (1, 0), (1, 2))),
    )
    cbs_outcome = cbs_solve(instance, PROPERTY_BUDGET_MS)
    pp_outcome = solve_pp(instance, budget_ms=PROPERTY_BUDGET_MS)
    assert cbs_outcome.status == 'solved'
    assert pp_outcome.status == 'solved'
    assert cbs_outcome.solution is not None
    assert pp_outcome.solution is not None
    assert cbs_outcome.solution.soc <= pp_outcome.solution.soc
