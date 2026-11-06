FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV SWARMWAY_API_HOST=0.0.0.0
ENV SWARMWAY_API_PORT=8000

RUN pip install uv

# Copy project metadata + source so uv can build/install the swarmway package
COPY pyproject.toml uv.lock ./
COPY README.md ./
COPY src ./src
COPY data ./data

RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "swarmway.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
