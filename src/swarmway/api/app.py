"""FastAPI application skeleton (Phase 0, task 6).

Exposes only `GET /api/health` at this stage; solve/maps routes arrive in
Phase 4. CORS origins and resource caps come from the environment
(Section 17.1) and are enforced server-side.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from swarmway.api.settings import load_settings

settings = load_settings()

app = FastAPI(title='Swarmway', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/api/health')
def health() -> dict:
    """Liveness: version, solver list, caps. No solve, no heavy work."""
    return {
        'status': 'ok',
        'version': '0.1.0',
        'solvers': ['cbs', 'pp-fixed', 'pp-best-of-n'],
        'caps': {
            'max_agents': settings.max_agents,
            'max_grid_cells': settings.max_grid_cells,
            'solve_budget_ms': settings.solve_budget_ms,
            'trace_event_cap': settings.trace_event_cap,
        },
    }
