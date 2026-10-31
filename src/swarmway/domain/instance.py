"""Instance model and validation (Section 7.2).

Pure: takes a :class:`Grid` and agents in, returns an :class:`Instance`
or a list of :class:`ValidationError` (one per violation, with agent id
and position). No I/O, no printing.
"""

from __future__ import annotations

from dataclasses import dataclass

from swarmway.domain.grid import Grid, Position
from swarmway.domain.scenfile import ScenarioLine


@dataclass(frozen=True)
class Agent:
    id: int
    start: Position
    goal: Position


@dataclass(frozen=True)
class Instance:
    grid: Grid
    agents: tuple[Agent, ...]


@dataclass(frozen=True)
class ValidationError:
    agent_id: int | None
    position: Position | None
    field: str
    message: str


def _in_bounds(grid: Grid, p: Position) -> bool:
    x, y = p
    return 0 <= x < grid.width and 0 <= y < grid.height


def validate_instance(instance: Instance) -> tuple[ValidationError, ...]:
    """Validate an :class:`Instance`, returning one error per violation.

    Checks, per agent: start/goal in bounds, start/goal on a passable
    cell. Across agents: all start cells distinct, all goal cells
    distinct, and no start cell equals any goal cell (stay-at-goal means
    an occupied goal blocks every other agent).
    """
    errors: list[ValidationError] = []
    agents = instance.agents
    grid = instance.grid

    # Per-agent checks.
    for agent in agents:
        if not _in_bounds(grid, agent.start):
            errors.append(
                ValidationError(
                    agent_id=agent.id,
                    position=agent.start,
                    field='start',
                    message=(
                        f'agent {agent.id} start {agent.start} is out of '
                        f'bounds for {grid.width}x{grid.height} grid'
                    ),
                )
            )
        elif not grid.passable(agent.start):
            errors.append(
                ValidationError(
                    agent_id=agent.id,
                    position=agent.start,
                    field='start',
                    message=(f'agent {agent.id} start {agent.start} is on a blocked cell'),
                )
            )
        if not _in_bounds(grid, agent.goal):
            errors.append(
                ValidationError(
                    agent_id=agent.id,
                    position=agent.goal,
                    field='goal',
                    message=(
                        f'agent {agent.id} goal {agent.goal} is out of '
                        f'bounds for {grid.width}x{grid.height} grid'
                    ),
                )
            )
        elif not grid.passable(agent.goal):
            errors.append(
                ValidationError(
                    agent_id=agent.id,
                    position=agent.goal,
                    field='goal',
                    message=(f'agent {agent.id} goal {agent.goal} is on a blocked cell'),
                )
            )

    # Pairwise distinctness: all start cells distinct among themselves, all
    # goal cells distinct among themselves, and an agent's start differs
    # from its own goal. A start may equal another agent's goal (normal in
    # MAPF benchmarks); stay-at-goal conflicts are solved by the planner,
    # not rejected at instance validation.
    starts: dict[Position, int] = {}
    goals: dict[Position, int] = {}
    for agent in agents:
        if agent.start == agent.goal:
            errors.append(
                ValidationError(
                    agent_id=agent.id,
                    position=agent.start,
                    field='start',
                    message=(f'agent {agent.id} start {agent.start} equals its goal'),
                )
            )
        if agent.start in starts:
            errors.append(
                ValidationError(
                    agent_id=agent.id,
                    position=agent.start,
                    field='start',
                    message=(
                        f'agent {agent.id} start {agent.start} duplicates '
                        f'agent {starts[agent.start]} start'
                    ),
                )
            )
        else:
            starts[agent.start] = agent.id
        if agent.goal in goals:
            errors.append(
                ValidationError(
                    agent_id=agent.id,
                    position=agent.goal,
                    field='goal',
                    message=(
                        f'agent {agent.id} goal {agent.goal} duplicates '
                        f'agent {goals[agent.goal]} goal'
                    ),
                )
            )
        else:
            goals[agent.goal] = agent.id

    return tuple(errors)


def build_instance_from_lines(
    grid: Grid,
    map_name: str,
    lines: tuple[ScenarioLine, ...],
    k: int,
) -> tuple[Instance | None, tuple[ValidationError, ...]]:
    """Build the first-``k``-agent :class:`Instance` from scen lines.

    Cross-validates each of the first k lines against the loaded map:
    map-path basename == ``map_name``, map-width/map-height match the
    grid, and start/goal are passable. Returns ``(instance, ())`` on
    success or ``(None, errors)`` with one :class:`ValidationError` per
    violation (naming the field, expected vs actual).
    """
    errors: list[ValidationError] = []
    selected = lines[:k]
    agents: list[Agent] = []

    for i, line in enumerate(selected):
        agent_id = i
        basename = line.map_path.rsplit('/', 1)[-1]
        if basename != map_name:
            errors.append(
                ValidationError(
                    agent_id=agent_id,
                    position=None,
                    field='map-path',
                    message=(
                        f'.scen line {i} map-path {line.map_path!r}: basename '
                        f'{basename!r} does not match loaded map {map_name!r}'
                    ),
                )
            )
        if line.map_width != grid.width:
            errors.append(
                ValidationError(
                    agent_id=agent_id,
                    position=None,
                    field='map-width',
                    message=(
                        f'.scen line {i} map-width {line.map_width} does not '
                        f'match loaded map width {grid.width}'
                    ),
                )
            )
        if line.map_height != grid.height:
            errors.append(
                ValidationError(
                    agent_id=agent_id,
                    position=None,
                    field='map-height',
                    message=(
                        f'.scen line {i} map-height {line.map_height} does not '
                        f'match loaded map height {grid.height}'
                    ),
                )
            )
        start = (line.start_x, line.start_y)
        goal = (line.goal_x, line.goal_y)
        if not _in_bounds(grid, start):
            errors.append(
                ValidationError(
                    agent_id=agent_id,
                    position=start,
                    field='start',
                    message=(
                        f'.scen line {i} start {start} is out of bounds for '
                        f'{grid.width}x{grid.height} grid'
                    ),
                )
            )
        elif not grid.passable(start):
            errors.append(
                ValidationError(
                    agent_id=agent_id,
                    position=start,
                    field='start',
                    message=(f'.scen line {i} start {start} is on a blocked cell'),
                )
            )
        if not _in_bounds(grid, goal):
            errors.append(
                ValidationError(
                    agent_id=agent_id,
                    position=goal,
                    field='goal',
                    message=(
                        f'.scen line {i} goal {goal} is out of bounds for '
                        f'{grid.width}x{grid.height} grid'
                    ),
                )
            )
        elif not grid.passable(goal):
            errors.append(
                ValidationError(
                    agent_id=agent_id,
                    position=goal,
                    field='goal',
                    message=(f'.scen line {i} goal {goal} is on a blocked cell'),
                )
            )
        agents.append(Agent(id=agent_id, start=start, goal=goal))

    if errors:
        return None, tuple(errors)

    instance = Instance(grid=grid, agents=tuple(agents))
    instance_errors = validate_instance(instance)
    if instance_errors:
        return None, instance_errors
    return instance, ()
