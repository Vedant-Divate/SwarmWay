.PHONY: verify bench-default
verify:
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy src/swarmway/domain src/swarmway/solver
	uv run pytest -q

bench-default:
	uv run swarmway bench --config bench/default.yaml
