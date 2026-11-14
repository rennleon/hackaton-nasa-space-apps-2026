"""HTTP API: a thin layer over the engine. Same result objects as the static files.

Run locally:  uv run uvicorn trend_detective.api:app --reload
"""

from __future__ import annotations

import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import ENGINE_VERSION
from .contract import AnalysisResult, ScanResult
from .engine import EngineContext, analyze
from .scan import scan

app = FastAPI(title="Earth System Trend Detective API", version=ENGINE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in (os.environ.get("TD_ALLOWED_ORIGINS") or "*").split(",") if o.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def ctx() -> EngineContext:
    return EngineContext.from_repo()


def _check(region: str, variable: str | None = None) -> None:
    c = ctx().catalog
    if region not in c.regions:
        raise HTTPException(404, f"unknown region {region}")
    if variable is not None and variable not in c.variables:
        raise HTTPException(404, f"unknown variable {variable}")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine_version": ENGINE_VERSION}


@app.get("/regions")
def regions() -> list[dict]:
    return [r.model_dump() for r in ctx().catalog.regions.values()]


@app.get("/themes")
def themes() -> list[dict]:
    return [t.model_dump() for t in ctx().catalog.themes.values()]


@app.get("/variables")
def variables() -> list[dict]:
    return [v.model_dump() for v in ctx().catalog.variables.values()]


@app.get("/glossary")
def glossary() -> list[dict]:
    return [g.model_dump() for g in ctx().catalog.glossary.values()]


@lru_cache(maxsize=512)
def _analyze_cached(region: str, variable: str, start: str | None, end: str | None, season: str | None):
    return analyze(ctx(), region, variable, start=start, end=end, season_id=season)


@app.get("/regions/{region}/scan", response_model=ScanResult)
def get_scan(region: str, theme: str = Query(...)) -> ScanResult:
    _check(region)
    if theme not in ctx().catalog.themes:
        raise HTTPException(404, f"unknown theme {theme}")
    return scan(ctx(), region, theme)


@app.get("/regions/{region}/variables/{variable}", response_model=AnalysisResult)
def get_result(region: str, variable: str, season: str | None = None) -> AnalysisResult:
    _check(region, variable)
    try:
        return _analyze_cached(region, variable, None, None, season)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"


@app.get("/regions/{region}/variables/{variable}/analyze", response_model=AnalysisResult)
def get_analyze(
    region: str,
    variable: str,
    start: str | None = Query(None, pattern=MONTH),
    end: str | None = Query(None, pattern=MONTH),
    season: str | None = None,
) -> AnalysisResult:
    _check(region, variable)
    try:
        return _analyze_cached(region, variable, start, end, season)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
