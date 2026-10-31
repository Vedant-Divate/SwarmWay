"""Swarmway — pure-Python MAPF/CBS workbench.

Domain model and solver stay framework-free so they import under CPython
and PyPy with no network I/O. The FastAPI API and CLI live in `api/`
and `cli/`.
"""

import logging

logger = logging.getLogger('swarmway')


def main() -> None:
    """CLI entry point (skeleton; full CLI arrives in Phase 1 / Phase 4)."""
    logging.basicConfig(level=logging.INFO)
    logger.info('swarmway skeleton — run the API with: uv run uvicorn swarmway.api.app:app')
