"""Runtime configuration read from the environment (Section 17.1).

No secrets: every value has a documented default. CORS is an explicit
allowlist (never a wildcard in production settings).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_CORS_ORIGINS = ('http://localhost:5173',)


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, str(default)))


def _env_origins(name: str) -> tuple[str, ...]:
    raw = _env(name, ','.join(DEFAULT_CORS_ORIGINS))
    origins = tuple(part.strip() for part in raw.split(',') if part.strip())
    return origins or DEFAULT_CORS_ORIGINS


@dataclass(frozen=True)
class Settings:
    api_host: str
    api_port: int
    cors_origins: tuple[str, ...]
    max_agents: int
    max_grid_cells: int
    solve_budget_ms: int
    trace_event_cap: int


def load_settings() -> Settings:
    return Settings(
        api_host=_env('SWARMWAY_API_HOST', '127.0.0.1'),
        api_port=_env_int('SWARMWAY_API_PORT', 8000),
        cors_origins=_env_origins('SWARMWAY_CORS_ORIGINS'),
        max_agents=_env_int('SWARMWAY_MAX_AGENTS', 60),
        max_grid_cells=_env_int('SWARMWAY_MAX_GRID_CELLS', 262144),
        solve_budget_ms=_env_int('SWARMWAY_SOLVE_BUDGET_MS', 10000),
        trace_event_cap=_env_int('SWARMWAY_TRACE_EVENT_CAP', 20000),
    )
