"""Swarmway domain model (pure Python).

Public API: :class:`Grid`, :class:`Position`, :class:`Agent`,
:class:`Instance`, :class:`ValidationError`, :class:`ScenarioLine`,
:func:`parse_map`, :func:`parse_scen`, :func:`validate_instance`,
:func:`build_instance_from_lines`.

Imports nothing from solver/, api/, or frontend/ (Section 6.1).
"""

from __future__ import annotations

from swarmway.domain.grid import (
    DEFAULT_BLOCKED_CHARS,
    DEFAULT_PASSABLE_CHARS,
    Grid,
    Position,
)
from swarmway.domain.instance import (
    Agent,
    Instance,
    ValidationError,
    build_instance_from_lines,
    validate_instance,
)
from swarmway.domain.mapfile import MapError, parse_map
from swarmway.domain.scenfile import ScenarioLine, ScenError, parse_scen

__all__ = [
    'DEFAULT_BLOCKED_CHARS',
    'DEFAULT_PASSABLE_CHARS',
    'Agent',
    'Grid',
    'Instance',
    'MapError',
    'Position',
    'ScenError',
    'ScenarioLine',
    'ValidationError',
    'build_instance_from_lines',
    'parse_map',
    'parse_scen',
    'validate_instance',
]
