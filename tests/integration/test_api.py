"""Integration tests for the HTTP API (Section 7.4).

Tests use httpx TestClient against the FastAPI app. Every solve response
is validated against the trace v1 Pydantic models — the API's return type
IS the contract.
"""

from __future__ import annotations

import warnings
from typing import Any

import pytest
from fastapi.testclient import TestClient

from swarmway.api.app import app
from swarmway.domain.schemas import TraceV1

warnings.filterwarnings('ignore', category=DeprecationWarning)

pytestmark = pytest.mark.filterwarnings('ignore::starlette.exceptions.StarletteDeprecationWarning')

client = TestClient(app)


def test_health_shape() -> None:
    """GET /api/health returns version, solver list, caps."""
    r = client.get('/api/health')
    assert r.status_code == 200
    body = r.json()
    assert body['status'] == 'ok'
    assert body['version'] == '0.1.0'
    assert body['solvers'] == ['cbs', 'pp-best-of-n', 'pp-fixed']
    caps = body['caps']
    assert caps['max_agents'] == 60
    assert caps['max_grid_cells'] == 262144
    assert caps['solve_budget_ms'] == 10000
    assert caps['trace_event_cap'] == 20000


def test_list_maps() -> None:
    """GET /api/maps returns the curated registry."""
    r = client.get('/api/maps')
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 7
    ids = {m['id'] for m in body}
    expected = {
        'empty-16-16',
        'random-32-32-10',
        'random-32-32-20',
        'maze-32-32-2',
        'room-32-32-4',
        'warehouse-10-20-10-2-1',
        'ht_chantry',
    }
    assert ids == expected
    for m in body:
        assert 'name' in m
        assert 'width' in m
        assert 'height' in m
        assert 'families' in m
        assert 'presets' in m


def test_get_map() -> None:
    """GET /api/maps/{id} returns full map with rows."""
    r = client.get('/api/maps/empty-16-16')
    assert r.status_code == 200
    body = r.json()
    assert body['id'] == 'empty-16-16'
    assert body['width'] == 16
    assert body['height'] == 16
    assert len(body['rows']) == 16
    assert all(len(row) == 16 for row in body['rows'])


def test_get_map_unknown() -> None:
    """GET /api/maps/{id} returns 404 with error shape for unknown id."""
    r = client.get('/api/maps/does-not-exist')
    assert r.status_code == 404
    body = r.json()
    assert 'error' in body
    assert body['error']['code'] == 'not_found'


def test_get_presets() -> None:
    """GET /api/maps/{id}/presets returns first-k agents."""
    r = client.get('/api/maps/empty-16-16/presets?scenario=even&agents=5')
    assert r.status_code == 200
    body = r.json()
    assert body['map_id'] == 'empty-16-16'
    assert body['scenario'] == 'even'
    assert len(body['agents']) == 5
    assert body['agents'][0]['id'] == 0
    assert 'start' in body['agents'][0]
    assert 'goal' in body['agents'][0]


def test_get_presets_unknown_scenario() -> None:
    """GET /api/maps/{id}/presets with random scenario -> 422."""
    r = client.get('/api/maps/empty-16-16/presets?scenario=random&agents=5')
    assert r.status_code == 422
    body = r.json()
    assert body['error']['code'] == 'scenario_not_vendored'


def test_get_presets_agent_cap() -> None:
    """GET /api/maps/{id}/presets with agents over cap -> 422.
    empty-16-16 has 128 lines, so 70 > 60 cap but <= 128 available."""
    r = client.get('/api/maps/empty-16-16/presets?scenario=even&agents=70')
    assert r.status_code == 422
    body = r.json()
    assert body['error']['code'] == 'agent_cap_exceeded'


def test_get_presets_agent_count_out_of_range() -> None:
    """GET /api/maps/{id}/presets with agents > available lines -> 422."""
    r = client.get('/api/maps/empty-16-16/presets?scenario=even&agents=99999')
    assert r.status_code == 422
    body = r.json()
    assert body['error']['code'] == 'invalid_agent_count'


def test_solve_valid() -> None:
    """POST /api/solve with a valid instance returns a trace v1."""
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 5,
        },
        'solver': 'cbs',
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 200
    trace = TraceV1.model_validate(r.json())
    assert trace.result.status == 'solved'
    assert trace.result.validity == 'valid'
    assert trace.result.soc > 0


def test_solve_custom_instance() -> None:
    """POST /api/solve with a custom instance works."""
    body = {
        'instance': {
            'name': 'custom',
            'width': 3,
            'height': 3,
            'rows': ['...', '...', '...'],
            'agents': [{'start': [0, 0], 'goal': [2, 2]}],
        },
        'solver': 'cbs',
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 200
    trace = TraceV1.model_validate(r.json())
    assert trace.result.status == 'solved'


def test_solve_agents_over_cap() -> None:
    """POST /api/solve with agents over cap -> 422.
    Uses 70 agents (> 60 cap but <= 128 available lines for empty-16-16)."""
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 70,
        },
        'solver': 'cbs',
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422
    assert r.json()['error']['code'] == 'agent_cap_exceeded'


def test_solve_budget_clamped() -> None:
    """POST /api/solve with huge budget_ms gets clamped."""
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 5,
        },
        'solver': 'cbs',
        'budget_ms': 999999,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 200
    trace = TraceV1.model_validate(r.json())
    assert trace.result.budget_ms == 10000


def test_solve_timeout_honesty() -> None:
    """POST /api/solve with tiny budget returns 200 with timeout status."""
    body = {
        'instance': {
            'map_id': 'warehouse-10-20-10-2-1',
            'scenario': 'even',
            'agents': 40,
        },
        'solver': 'cbs',
        'budget_ms': 1,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 200
    trace = TraceV1.model_validate(r.json())
    assert trace.result.status == 'timeout'
    assert trace.result.ct_expanded > 0


def test_solve_unknown_solver() -> None:
    """POST /api/solve with unknown solver -> 422."""
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 5,
        },
        'solver': 'pp',
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422
    assert r.json()['error']['code'] == 'invalid_solver'


def test_solve_pp_best_of_n_returns_valid_trace() -> None:
    """POST /api/solve with pp-best-of-n returns a trace v1 (Section 8.6).

    The response validates against the trace v1 Pydantic models, the
    search block is empty (PP has no constraint tree) and the solver
    block records the name, options and seed.
    """
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 5,
        },
        'solver': 'pp-best-of-n',
        'options': {'orderings': 4, 'seed': 42},
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 200
    trace = TraceV1.model_validate(r.json())
    assert trace.solver.name == 'pp-best-of-n'
    assert trace.solver.options == {'orderings': 4}
    assert trace.solver.seed == 42
    assert trace.search == []
    assert trace.result.status == 'solved'
    assert trace.result.validity == 'valid'
    assert trace.result.soc > 0
    # Ordering evidence is in the notes (Section 8.6).
    assert any('orderings tried' in note for note in trace.result.notes)
    # Execution paths are padded to makespan + 1 (Section 7.3).
    assert trace.execution.makespan == trace.result.makespan
    for path in trace.execution.paths:
        assert len(path) == trace.execution.makespan + 1


def test_solve_pp_best_of_n_invalid_orderings() -> None:
    """POST /api/solve with an out-of-range ordering count -> 422."""
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 5,
        },
        'solver': 'pp-best-of-n',
        'options': {'orderings': 0},
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422
    assert r.json()['error']['code'] == 'invalid_options'


def test_solve_cbs_tie_break_recorded() -> None:
    """POST /api/solve with cbs tie_break records it in the solver block."""
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 5,
        },
        'solver': 'cbs',
        'options': {'tie_break': 'conflicts'},
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 200
    trace = TraceV1.model_validate(r.json())
    assert trace.solver.name == 'cbs'
    assert trace.solver.options == {'tie_break': 'conflicts'}
    assert trace.solver.seed is None
    assert trace.result.status == 'solved'
    assert trace.result.validity == 'valid'


def test_solve_cbs_tie_break_unknown() -> None:
    """POST /api/solve with unknown tie_break -> 422."""
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 5,
        },
        'solver': 'cbs',
        'options': {'tie_break': 'bogus'},
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422
    assert r.json()['error']['code'] == 'invalid_options'


def test_solve_cbs_tie_break_unknown_option() -> None:
    """POST /api/solve with an unknown cbs option -> 422."""
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 5,
        },
        'solver': 'cbs',
        'options': {'bogus': 1},
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422
    assert r.json()['error']['code'] == 'invalid_options'


def test_solve_cbs_seed_in_options_rejected() -> None:
    """cbs takes no seed, even via options."""
    body = {
        'instance': {
            'map_id': 'empty-16-16',
            'scenario': 'even',
            'agents': 5,
        },
        'solver': 'cbs',
        'options': {'tie_break': 'fifo', 'seed': 7},
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422
    assert r.json()['error']['code'] == 'invalid_options'


def test_solve_custom_grid_over_cap() -> None:
    """POST /api/solve with custom grid over cell cap -> 422."""
    big_row = '.' * 1000
    body = {
        'instance': {
            'name': 'big',
            'width': 1000,
            'height': 1000,
            'rows': [big_row] * 1000,
            'agents': [{'start': [0, 0], 'goal': [999, 999]}],
        },
        'solver': 'cbs',
        'budget_ms': 10000,
    }
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422
    assert r.json()['error']['code'] == 'grid_cap_exceeded'


def test_cors_headers() -> None:
    """CORS headers present for allowlisted origins."""
    r = client.get(
        '/api/health',
        headers={'Origin': 'http://localhost:5173'},
    )
    assert r.status_code == 200
    assert r.headers.get('access-control-allow-origin') == 'http://localhost:5173'


def test_cors_no_wildcard() -> None:
    """No wildcard CORS in production settings."""
    r = client.get(
        '/api/health',
        headers={'Origin': 'http://evil.example.com'},
    )
    assert r.status_code == 200
    assert r.headers.get('access-control-allow-origin') != '*'


def _custom_instance_body(
    rows: list[str],
    agents: list[dict[str, Any]],
    width: int | None = None,
    height: int | None = None,
) -> dict[str, Any]:
    instance: dict[str, Any] = {
        'name': 'custom-cap-test',
        'rows': rows,
        'agents': agents,
    }
    if width is not None:
        instance['width'] = width
    if height is not None:
        instance['height'] = height
    return {'instance': instance, 'solver': 'cbs', 'budget_ms': 10000}


def test_solve_custom_grid_cell_cap_exact() -> None:
    """Custom grid exactly at cell cap (512x512 = 262144) -> 200."""
    size = 512
    rows = ['.' * size] * size
    body = _custom_instance_body(
        rows, [{'start': [0, 0], 'goal': [size - 1, size - 1]}], width=size, height=size
    )
    r = client.post('/api/solve', json=body)
    assert r.status_code == 200, r.text


def test_solve_custom_grid_cell_cap_over() -> None:
    """Custom grid over cell cap (512x513 > 262144) -> 422 with details."""
    size = 512
    rows = ['.' * size] * (size + 1)
    body = _custom_instance_body(
        rows, [{'start': [0, 0], 'goal': [size - 1, size]}], width=size, height=size + 1
    )
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'grid_cap_exceeded'
    details = body_json['error']['details']
    assert details['field'] == 'grid_cells'
    assert details['limit'] == 262144
    assert details['received'] == size * (size + 1)


def test_solve_custom_agents_over_cap_custom() -> None:
    """Custom instance with 61 agents (> 60 cap) -> 422 with details."""
    rows = ['.' * 10] * 10
    agents = [{'start': [i % 10, i // 10], 'goal': [(i + 1) % 10, (i // 10)]} for i in range(61)]
    body = _custom_instance_body(rows, agents)
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'agent_cap_exceeded'
    details = body_json['error']['details']
    assert details['field'] == 'agents'
    assert details['limit'] == 60
    assert details['received'] == 61


def test_solve_custom_grid_width_mismatch() -> None:
    """Declared width != row length -> 422 grid_width_mismatch with details."""
    rows = ['......', '......', '......']  # each row length 6
    body = _custom_instance_body(rows, [{'start': [0, 0], 'goal': [2, 2]}], width=3, height=3)
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'grid_width_mismatch'
    details = body_json['error']['details']
    assert details['field'] == 'width'
    assert details['limit'] == 'row length (6)'
    assert details['received'] == 3


def test_solve_custom_grid_height_mismatch() -> None:
    """Declared height != row count -> 422 grid_height_mismatch with details."""
    rows = ['...', '...', '...', '...']  # 4 rows
    body = _custom_instance_body(rows, [{'start': [0, 0], 'goal': [2, 2]}], width=3, height=3)
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'grid_height_mismatch'
    details = body_json['error']['details']
    assert details['field'] == 'height'
    assert details['limit'] == 'row count (4)'
    assert details['received'] == 3


def test_solve_custom_start_out_of_bounds() -> None:
    """Start off-grid -> 422 agent_start_out_of_bounds with details."""
    rows = ['...', '...', '...']
    body = _custom_instance_body(rows, [{'start': [5, 5], 'goal': [2, 2]}], width=3, height=3)
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'agent_start_out_of_bounds'
    details = body_json['error']['details']
    assert details['field'] == 'agents[0].start'
    assert details['limit'] == '3x3'
    assert details['received'] == [5, 5]


def test_solve_custom_start_blocked() -> None:
    """Start on blocked cell -> 422 agent_start_blocked with details."""
    rows = ['.@.', '...', '...']
    body = _custom_instance_body(rows, [{'start': [1, 0], 'goal': [2, 2]}], width=3, height=3)
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'agent_start_blocked'
    details = body_json['error']['details']
    assert details['field'] == 'agents[0].start'
    assert details['limit'] == 'passable cell'
    assert details['received'] == [1, 0]


def test_solve_custom_goal_blocked() -> None:
    """Goal on blocked cell -> 422 agent_goal_blocked with details."""
    rows = ['...', '...', '.@.']
    body = _custom_instance_body(rows, [{'start': [0, 0], 'goal': [1, 2]}], width=3, height=3)
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'agent_goal_blocked'
    details = body_json['error']['details']
    assert details['field'] == 'agents[0].goal'
    assert details['limit'] == 'passable cell'
    assert details['received'] == [1, 2]


def test_solve_custom_goal_out_of_bounds() -> None:
    """Goal off-grid -> 422 agent_goal_out_of_bounds with details."""
    rows = ['...', '...', '...']
    body = _custom_instance_body(rows, [{'start': [0, 0], 'goal': [5, 5]}], width=3, height=3)
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'agent_goal_out_of_bounds'
    details = body_json['error']['details']
    assert details['field'] == 'agents[0].goal'
    assert details['limit'] == '3x3'
    assert details['received'] == [5, 5]


def test_solve_custom_start_equals_goal() -> None:
    """Start equals goal -> 422 agent_start_equals_goal with details."""
    rows = ['...', '...', '...']
    body = _custom_instance_body(rows, [{'start': [1, 1], 'goal': [1, 1]}], width=3, height=3)
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'agent_start_equals_goal'
    details = body_json['error']['details']
    assert details['field'] == 'agents[0]'
    assert details['limit'] == 'start != goal'
    assert details['received'] == [1, 1]


def test_solve_custom_duplicate_start() -> None:
    """Duplicate start positions -> 422 agent_duplicate_start with details."""
    rows = ['...', '...', '...']
    body = _custom_instance_body(
        rows,
        [{'start': [1, 1], 'goal': [0, 0]}, {'start': [1, 1], 'goal': [2, 2]}],
        width=3,
        height=3,
    )
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'agent_duplicate_start'
    details = body_json['error']['details']
    assert details['field'] == 'agents[1].start'
    assert details['limit'] == 'distinct start cells'
    assert details['received'] == [1, 1]


def test_solve_custom_duplicate_goal() -> None:
    """Duplicate goal positions -> 422 agent_duplicate_goal with details."""
    rows = ['...', '...', '...']
    body = _custom_instance_body(
        rows,
        [{'start': [0, 0], 'goal': [2, 2]}, {'start': [2, 0], 'goal': [2, 2]}],
        width=3,
        height=3,
    )
    r = client.post('/api/solve', json=body)
    assert r.status_code == 422, r.text
    body_json = r.json()
    assert body_json['error']['code'] == 'agent_duplicate_goal'
    details = body_json['error']['details']
    assert details['field'] == 'agents[1].goal'
    assert details['limit'] == 'distinct goal cells'
    assert details['received'] == [2, 2]
