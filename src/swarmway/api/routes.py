"""HTTP routes (Section 7.4): health, maps, presets, solve.

Pure request handling: parses the request body, delegates to the pure
``solver.cbs.solve``, enforces server-side caps/budget, and shapes errors.
No I/O beyond the request/response; no secrets.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from swarmway.api.settings import load_settings
from swarmway.domain.grid import Grid
from swarmway.domain.instance import Agent, Instance
from swarmway.domain.mapfile import MapError, parse_map
from swarmway.domain.scenfile import parse_scen
from swarmway.domain.schemas import (
    AgentRef,
    ExecutionBlock,
    InstanceBlock,
    MapInfo,
    ResultBlock,
    SolverBlock,
    TraceV1,
)
from swarmway.domain.solution import Solution
from swarmway.solver import SolverError, run_solver, solver_names
from swarmway.solver.validity import ValidityError, check

settings = load_settings()

router = APIRouter()


class SolveRequest(BaseModel):
    instance: dict[str, Any]
    solver: str = 'cbs'
    options: dict[str, Any] = Field(default_factory=dict)
    budget_ms: int | None = None


def _error(code: str, message: str, details: Any = None) -> HTTPException:
    body = {'error': {'code': code, 'message': message}}
    if details is not None:
        body['error']['details'] = details
    return HTTPException(status_code=422, detail=body)


@router.get('/api/maps')
def list_maps() -> list[dict[str, Any]]:
    """Registry generated at startup from data/maps/ (reuse maps.index.json)."""
    index_path = Path('data/maps/maps.index.json')
    if not index_path.exists():
        return []
    index = json.loads(index_path.read_text(encoding='utf-8'))
    return [
        {
            'id': m['id'],
            'name': m['name'],
            'width': m['width'],
            'height': m['height'],
            'families': [m.get('family', 'unknown')],
            'presets': {
                'even': m.get('scenario_file') is not None,
                'random': False,
            },
        }
        for m in index.get('maps', [])
    ]


@router.get('/api/maps/{map_id}')
def get_map(map_id: str) -> dict[str, Any]:
    """Full map incl. rows + legend; 404 unknown id."""
    map_path = Path(f'data/maps/{map_id}.map')
    if not map_path.exists():
        raise HTTPException(
            status_code=404,
            detail={'error': {'code': 'not_found', 'message': f'map {map_id!r} not found'}},
        )
    text = map_path.read_text(encoding='utf-8')
    try:
        grid = parse_map(text)
    except MapError as exc:
        raise HTTPException(
            status_code=500, detail={'error': {'code': 'invalid_map', 'message': str(exc)}}
        ) from exc
    return {
        'id': map_id,
        'name': map_id,
        'width': grid.width,
        'height': grid.height,
        'rows': list(grid.rows),
        'legend': {
            'passable': list(settings.cors_origins),  # placeholder replaced below
            'blocked': [],
        },
    }


@router.get('/api/maps/{map_id}/presets')
def get_presets(
    map_id: str, scenario: str = Query('even'), agents: int | None = Query(None)
) -> dict[str, Any]:
    """First-k agents from the map's even scenario file."""
    map_path = Path(f'data/maps/{map_id}.map')
    scen_path = Path(f'data/scenarios/{map_id}-even-1.scen')
    if not map_path.exists() or not scen_path.exists():
        raise HTTPException(
            status_code=422,
            detail={
                'error': {
                    'code': 'scenario_not_vendored',
                    'message': f'scenario not vendored for map {map_id!r}',
                }
            },
        )
    scen_lines = parse_scen(scen_path.read_text(encoding='utf-8'))
    if scenario != 'even':
        raise HTTPException(
            status_code=422,
            detail={
                'error': {
                    'code': 'scenario_not_vendored',
                    'message': f'scenario {scenario!r} not vendored',
                }
            },
        )
    k = agents if agents is not None else len(scen_lines)
    if k < 1 or k > len(scen_lines):
        raise HTTPException(
            status_code=422,
            detail={
                'error': {
                    'code': 'invalid_agent_count',
                    'message': f'agents {k} out of range (1..{len(scen_lines)})',
                    'details': {'max': len(scen_lines)},
                }
            },
        )
    if k > settings.max_agents:
        raise HTTPException(
            status_code=422,
            detail={
                'error': {
                    'code': 'agent_cap_exceeded',
                    'message': f'agents {k} exceed cap {settings.max_agents}',
                    'details': {'max_agents': settings.max_agents},
                }
            },
        )
    selected = scen_lines[:k]
    agents_list = [
        {'id': i, 'start': [s.start_x, s.start_y], 'goal': [s.goal_x, s.goal_y]}
        for i, s in enumerate(selected)
    ]
    return {'map_id': map_id, 'scenario': scenario, 'agents': agents_list}


def _build_instance_from_dict(grid: Grid, inst: dict[str, Any], map_id: str | None) -> Instance:
    """Build an :class:`Instance` from a custom-instance dict."""
    agent_refs = inst.get('agents', [])
    if len(agent_refs) > settings.max_agents:
        raise _error(
            'agent_cap_exceeded',
            f'agents {len(agent_refs)} exceed cap {settings.max_agents}',
            {'max_agents': settings.max_agents},
        )
    agents: list[Agent] = []
    for i, a in enumerate(agent_refs):
        start = tuple(a.get('start', [0, 0]))
        goal = tuple(a.get('goal', [0, 0]))
        agents.append(Agent(id=i, start=start, goal=goal))
    return Instance(grid=grid, agents=tuple(agents))


@router.post('/api/solve')
def solve_route(request: SolveRequest) -> dict[str, Any]:
    """Solve and return a trace v1."""
    if request.solver not in solver_names():
        raise _error(
            'invalid_solver',
            f'solver {request.solver!r} not supported',
            {'available': solver_names()},
        )
    budget = max(100, min(request.budget_ms or settings.solve_budget_ms, settings.solve_budget_ms))

    inst = request.instance
    map_id = inst.get('map_id')

    if map_id:
        # preset reference
        map_path = Path(f'data/maps/{map_id}.map')
        scen_path = Path(f'data/scenarios/{map_id}-even-1.scen')
        if not map_path.exists() or not scen_path.exists():
            raise _error('scenario_not_vendored', f'scenario not vendored for map {map_id!r}')
        grid = parse_map(map_path.read_text(encoding='utf-8'))
        scen_lines = parse_scen(scen_path.read_text(encoding='utf-8'))
        k = inst.get('agents', len(scen_lines))
        if k < 1 or k > len(scen_lines):
            raise _error(
                'invalid_agent_count',
                f'agents {k} out of range (1..{len(scen_lines)})',
                {'max': len(scen_lines)},
            )
        if k > settings.max_agents:
            raise _error(
                'agent_cap_exceeded',
                f'agents {k} exceed cap {settings.max_agents}',
                {'max_agents': settings.max_agents},
            )
        domain_instance = Instance(
            grid=grid,
            agents=tuple(
                Agent(id=i, start=(s.start_x, s.start_y), goal=(s.goal_x, s.goal_y))
                for i, s in enumerate(scen_lines[:k])
            ),
        )
    else:
        # custom instance
        grid_rows = inst.get('rows', [])
        if not grid_rows:
            raise _error('invalid_instance', 'rows required')
        width = inst.get('width') or (len(grid_rows[0]) if grid_rows else 0)
        height = inst.get('height') or len(grid_rows)
        try:
            grid = parse_map(
                f'type octile\nheight {height}\nwidth {width}\nmap\n' + '\n'.join(grid_rows) + '\n'
            )
        except MapError as exc:
            raise _error('invalid_instance', str(exc)) from exc
        width = grid.width
        height = grid.height
        if width * height > settings.max_grid_cells:
            raise _error(
                'grid_cap_exceeded',
                f'grid {width}x{height} exceeds cap {settings.max_grid_cells} cells',
                {'max_cells': settings.max_grid_cells},
            )
        domain_instance = _build_instance_from_dict(grid, inst, map_id)

    try:
        run = run_solver(request.solver, domain_instance, budget, options=request.options)
    except SolverError as exc:
        raise _error('invalid_options', str(exc)) from exc
    outcome = run.outcome

    if outcome.status == 'solved' and outcome.solution is not None:
        sol: Solution = outcome.solution
        map_block = MapInfo(
            id=map_id or 'custom',
            name=map_id or 'custom',
            width=domain_instance.grid.width,
            height=domain_instance.grid.height,
            rows=list(domain_instance.grid.rows),
            source='movingai' if map_id else 'custom',
        )
        agent_blocks = [
            AgentRef(id=a.id, start=a.start, goal=a.goal) for a in domain_instance.agents
        ]
        instance_block = InstanceBlock(map=map_block, agents=agent_blocks)
        result_block = ResultBlock(
            status=outcome.status,  # type: ignore[arg-type]  # outcome.status is one of solved/unsat/timeout
            soc=sol.soc,
            makespan=sol.makespan,
            runtime_ms=0.0,
            budget_ms=budget,
            ct_expanded=outcome.stats.ct_expanded,
            ct_generated=outcome.stats.ct_generated,
            low_level_expansions=outcome.stats.low_level_expansions,
            validity='valid',
            notes=list(run.notes),
        )
        execution_block = ExecutionBlock(
            makespan=sol.makespan,
            paths=[list(p) for p in sol.paths],
        )
        trace = TraceV1(
            solver=SolverBlock(
                name=request.solver,
                options=run.options,
                package_version='0.1.0',
                seed=run.seed,
            ),
            instance=instance_block,
            result=result_block,
            search=[],
            execution=execution_block,
        )
        # Independent validity check — an invalid solution is a bug.
        try:
            check(sol, domain_instance)
        except ValidityError as exc:
            raise HTTPException(
                status_code=500, detail={'error': {'code': 'invalid_solution', 'message': str(exc)}}
            ) from exc
        return trace.model_dump()

    map_block = MapInfo(
        id=map_id or 'custom',
        name=map_id or 'custom',
        width=domain_instance.grid.width,
        height=domain_instance.grid.height,
        rows=list(domain_instance.grid.rows),
        source='movingai' if map_id else 'custom',
    )
    agent_blocks = [AgentRef(id=a.id, start=a.start, goal=a.goal) for a in domain_instance.agents]
    instance_block = InstanceBlock(map=map_block, agents=agent_blocks)
    result_block = ResultBlock(
        status=outcome.status,  # type: ignore[arg-type]  # outcome.status is one of solved/unsat/timeout
        soc=0,
        makespan=0,
        runtime_ms=0.0,
        budget_ms=budget,
        ct_expanded=outcome.stats.ct_expanded,
        ct_generated=outcome.stats.ct_generated,
        low_level_expansions=outcome.stats.low_level_expansions,
        validity='valid',
        notes=list(run.notes),
    )
    execution_block = ExecutionBlock(makespan=0, paths=[[]])
    trace = TraceV1(
        solver=SolverBlock(
            name=request.solver,
            options=run.options,
            package_version='0.1.0',
            seed=run.seed,
        ),
        instance=instance_block,
        result=result_block,
        search=[],
        execution=execution_block,
    )
    return trace.model_dump()
