"""Benchmark harness package (Section 10).

Config-driven benchmarking of the CBS and prioritized-planning solvers over
curated MovingAI cells. Public entry point: :func:`swarmway.bench.runner.run_config`.
"""

from swarmway.bench.runner import ArmSpec, CellResult, CellSpec, RunResult, run_config

__all__ = ['ArmSpec', 'CellResult', 'CellSpec', 'RunResult', 'run_config']
