"""Integration tests for the HTTP API (Section 7.4).

Tests use httpx TestClient against the FastAPI app. Every solve response
is validated against the trace v1 Pydantic models — the API's return type
IS the contract.
"""

from __future__ import annotations

import warnings

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
    assert body['solvers'] == ['cbs']
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
