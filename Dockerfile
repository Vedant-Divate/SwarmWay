FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev

# Copy application code
COPY src ./src
COPY data ./data

ENV PYTHONUNBUFFERED=1
ENV SWARMWAY_API_HOST=0.0.0.0
ENV SWARMWAY_API_PORT=8000

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "swarmway.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
