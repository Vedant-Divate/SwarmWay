# ADR-0002: Exact tool and dependency versions

- Status: accepted
- Date: 2026-10-31
- Phase: 0

## Context

PROJECT.md Section 5 requires exact tool and dependency versions to be
recorded here, and Section 5.1 / 17.2 require `uv.lock` committed with
CI installing `--locked`.

## Decision

Runtime (uv-managed CPython):

- Python 3.12 (`.python-version` = `3.12`; installed CPython 3.12.15)
- uv 0.13.0

Backend dependencies (locked in `uv.lock`):

- fastapi 0.162.0, pydantic 2.14.2, uvicorn 0.54.0
- pytest 9.2.0, pytest-cov 7.1.0, hypothesis 6.170.14, httpx 0.28.1
- ruff 0.17.3, mypy 2.4.1, pre-commit 4.7.0

Frontend tooling (system):

- Node 24.14.0, pnpm 12.6.0

`uv.lock` is committed; CI installs `--locked` (Section 17.2).

## Consequences

- Reproducible installs; `make verify` uses the locked versions.
- Frontend dependency versions will be recorded once `frontend/`
  contains a `package.json` (Phase 0 task 8 / the AI Studio spike).
