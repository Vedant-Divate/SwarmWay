"""Solver registry (Sections 7.4, 8.2, 8.6).

One registry, two consumers: the CLI and the HTTP API both resolve
solver names through :func:`run_solver`, so a solver can never be
exposed by one and hidden by the other. The registry is pure — it
imports only ``domain/`` and ``solver/``, does no I/O and prints
nothing.

Registered solvers:

- ``cbs``: Conflict-Based Search (Section 8.2), optimal for sum-of-costs.
- ``pp-fixed``: prioritized planning in agent-index order (Section 8.6).
- ``pp-best-of-n``: prioritized planning over n seeded shuffles of the
  agent order, keeping the min-SoC success (Section 8.6, A-9).

Iteration over the registry is always sorted (Section 8.4 determinism
policy).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from swarmway.domain.instance import Instance
from swarmway.domain.solution import SolveOutcome
from swarmway.solver.cbs import solve as cbs_solve
from swarmway.solver.prioritized import (
    DEFAULT_PP_BEST_OF_N,
    DEFAULT_PP_SEED,
    MAX_PP_BEST_OF_N,
    MIN_PP_BEST_OF_N,
    solve_pp,
    solve_pp_best_of_n,
)


class SolverError(Exception):
    """Unknown solver name or invalid options (API 422, CLI exit code 2)."""


@dataclass(frozen=True)
class SolverRun:
    """One solver invocation: the outcome plus its trace metadata.

    ``notes`` carries the solver-specific evidence of Section 8.6 (the
    orderings tried, which one won, per-ordering outcomes).
    """

    outcome: SolveOutcome
    notes: tuple[str, ...] = ()
    seed: int | None = None
    options: dict[str, Any] = field(default_factory=dict)


SolverRunner = Callable[[Instance, int, dict[str, Any], int | None], SolverRun]


def _run_cbs(
    instance: Instance,
    budget_ms: int,
    options: dict[str, Any],
    seed: int | None,
) -> SolverRun:
    if seed is not None:
        raise SolverError('cbs does not take a seed')
    outcome = cbs_solve(instance, budget_ms)
    return SolverRun(outcome=outcome, notes=(), seed=None, options=dict(options))


def _run_pp_fixed(
    instance: Instance,
    budget_ms: int,
    options: dict[str, Any],
    seed: int | None,
) -> SolverRun:
    if options:
        raise SolverError('pp-fixed takes no options')
    if seed is not None:
        raise SolverError('pp-fixed does not take a seed')
    notes: list[str] = []
    outcome = solve_pp(instance, budget_ms=budget_ms, notes=notes)
    return SolverRun(outcome=outcome, notes=tuple(notes), seed=None, options={})


def _run_pp_best_of_n(
    instance: Instance,
    budget_ms: int,
    options: dict[str, Any],
    seed: int | None,
) -> SolverRun:
    unknown = sorted(set(options) - {'orderings', 'n'})
    if unknown:
        raise SolverError(f'pp-best-of-n: unknown option(s) {unknown}')
    # "n" is the PROJECT.md 7.4 spelling, "orderings" the Phase 5 one;
    # both are accepted, "orderings" is what the trace records.
    orderings = options.get('orderings', options.get('n', DEFAULT_PP_BEST_OF_N))
    if isinstance(orderings, bool) or not isinstance(orderings, int):
        raise SolverError('pp-best-of-n: orderings must be an integer')
    if not MIN_PP_BEST_OF_N <= orderings <= MAX_PP_BEST_OF_N:
        raise SolverError(
            f'pp-best-of-n: orderings must be in '
            f'{MIN_PP_BEST_OF_N}..{MAX_PP_BEST_OF_N}, got {orderings}'
        )
    effective_seed = DEFAULT_PP_SEED if seed is None else seed
    notes: list[str] = []
    outcome = solve_pp_best_of_n(
        instance,
        n=orderings,
        seed=effective_seed,
        budget_ms=budget_ms,
        notes=notes,
    )
    return SolverRun(
        outcome=outcome,
        notes=tuple(notes),
        seed=effective_seed,
        options={'orderings': orderings},
    )


_SOLVERS: dict[str, SolverRunner] = {
    'cbs': _run_cbs,
    'pp-best-of-n': _run_pp_best_of_n,
    'pp-fixed': _run_pp_fixed,
}


def solver_names() -> list[str]:
    """Registered solver names, sorted (deterministic)."""
    return sorted(_SOLVERS)


def run_solver(
    name: str,
    instance: Instance,
    budget_ms: int,
    options: dict[str, Any] | None = None,
    seed: int | None = None,
) -> SolverRun:
    """Run a registered solver and return its outcome plus trace metadata.

    ``seed`` may be passed directly or as an ``options['seed']`` entry
    (the HTTP request body has no separate seed field); passing both is
    an error.
    """
    runner = _SOLVERS.get(name)
    if runner is None:
        raise SolverError(f'solver {name!r} not supported')
    effective_options = dict(options or {})
    if 'seed' in effective_options:
        if seed is not None:
            raise SolverError('seed given both directly and in options')
        seed = effective_options.pop('seed')
    if seed is not None and not isinstance(seed, int):
        raise SolverError('seed must be an integer')
    return runner(instance, budget_ms, effective_options, seed)


__all__ = [
    'SolverError',
    'SolverRun',
    'run_solver',
    'solver_names',
]
