# API image. Build from the repo root so catalog/ and data/ are included:
#   docker build -f backend/Dockerfile -t trend-detective-api .
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    TD_REPO_ROOT=/app \
    PATH="/app/.venv/bin:$PATH"

# Dependencies first (cached layer), then the project and its data.
COPY backend/pyproject.toml backend/uv.lock backend/
RUN cd backend && uv sync --frozen --no-dev --no-install-project
COPY backend/ backend/
COPY catalog/ catalog/
COPY data/ data/
RUN cd backend && uv sync --frozen --no-dev

EXPOSE 8000
# Most hosts inject $PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn trend_detective.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
