"""Swarmway — pure-Python MAPF/CBS workbench.

Domain model and solver stay framework-free so they import under CPython
and PyPy with no network I/O. The FastAPI API and CLI live in `api/`
and `cli/`.
"""

import logging

from swarmway.cli.main import main as cli_main

logger = logging.getLogger('swarmway')


def main() -> None:
    """CLI entry point: delegate to :mod:`swarmway.cli`."""
    cli_main()
