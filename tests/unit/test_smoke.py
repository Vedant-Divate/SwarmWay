"""Smoke test: the package imports and exposes its entry point."""

from swarmway import main


def test_package_imports() -> None:
    assert callable(main)
