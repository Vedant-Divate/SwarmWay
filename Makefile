.PHONY: verify
verify:
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy src/swarmway/domain src/swarmway/solver
	uv run pytest -q
