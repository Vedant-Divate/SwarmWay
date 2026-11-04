"""FastAPI application skeleton (Phase 0, task 6).

Exposes only `GET /api/health` at this stage; solve/maps routes arrive in
Phase 4. CORS origins and resource caps come from the environment
(Section 17.1) and are enforced server-side.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from swarmway.api.routes import router
from swarmway.api.settings import load_settings
from swarmway.solver import solver_names

settings = load_settings()

app = FastAPI(title='Swarmway', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(router)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    """Shape errors as {error: {code, message, details?}} per Section 7.4."""
    detail = exc.detail
    if isinstance(detail, dict) and 'error' in detail:
        content = detail
    else:
        content = {'error': {'code': 'error', 'message': str(detail)}}
    return JSONResponse(status_code=exc.status_code, content=content)


@app.get('/api/health')
def health() -> dict[str, Any]:
    """Liveness: version, solver list, caps. No solve, no heavy work."""
    return {
        'status': 'ok',
        'version': '0.1.0',
        'solvers': solver_names(),
        'caps': {
            'max_agents': settings.max_agents,
            'max_grid_cells': settings.max_grid_cells,
            'solve_budget_ms': settings.solve_budget_ms,
            'trace_event_cap': settings.trace_event_cap,
        },
    }
