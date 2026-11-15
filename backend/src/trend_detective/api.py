"""HTTP API: a thin layer over the engine. Same result objects as the static files.

Run locally:  uv run uvicorn trend_detective.api:app --reload
"""

from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import ENGINE_VERSION
from .catalog import Geometry, RegionCard
from .contract import AnalysisResult, ScanResult, Text
from .engine import EngineContext, analyze
from .ratelimit import MESSAGE, MESSAGE_ES, RateLimited, counts_as_live, limit_client
from .scan import scan, scan_region
from .sources import LiveSourceUnavailable
from .sources.power import validate_geometry

app = FastAPI(title="Earth System Trend Detective API", version=ENGINE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in (os.environ.get("TD_ALLOWED_ORIGINS") or "*").split(",") if o.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(LiveSourceUnavailable)
async def live_source_down(_request: Request, exc: LiveSourceUnavailable) -> JSONResponse:
    """A live source (NASA POWER) is unreachable: 503, never a cached 'no data' answer."""
    return JSONResponse(status_code=503, content={"detail": f"Live data source unavailable: {exc}"})


@app.exception_handler(RateLimited)
async def rate_limited(_request: Request, exc: RateLimited) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": MESSAGE, "detail_es": MESSAGE_ES},
        headers={"Retry-After": str(exc.retry_after)},
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


# --- custom places (R2): any point or box up to 10 x 10 degrees, live from NASA POWER ---


def _parse_place(bbox: str | None, lat: float | None, lon: float | None) -> tuple[str, tuple[float, ...]]:
    """Return ("bbox", (W, S, E, N)) or ("point", (lon, lat)); HTTP 422 on bad input."""
    has_point = lat is not None or lon is not None
    if (bbox is None) == (not has_point):
        raise HTTPException(422, "give either bbox=W,S,E,N or lat=..&lon=.., not both and not neither")
    try:
        if bbox is not None:
            parts = [float(x) for x in bbox.split(",")]
            if len(parts) != 4:
                raise ValueError("bbox needs four numbers: W,S,E,N")
            box = tuple(round(x, 2) for x in parts)
            validate_geometry("bbox", list(box))
            return "bbox", box
        if lat is None or lon is None:
            raise ValueError("a point needs both lat and lon")
        pt = (round(lon, 2), round(lat, 2))
        validate_geometry("point", [pt[0], pt[1], pt[0], pt[1]])
        return "point", pt
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def _num(x: float) -> str:
    return f"{x:.2f}".replace("-", "m").replace(".", "p")


def custom_region(kind: str, c: tuple[float, ...]) -> RegionCard:
    if kind == "point":
        lon, lat = c
        rid = f"custom_pt_{_num(lat)}_{_num(lon)}"
        name = Text(simple="Your place", scientific=f"Point {lat:.2f}, {lon:.2f}",
                    simple_es="Tu lugar", scientific_es=f"Punto {lat:.2f}, {lon:.2f}")
        desc = Text(
            simple="A spot you picked on the map.",
            scientific=f"User-chosen point at latitude {lat:.2f}, longitude {lon:.2f} (NASA POWER grid cell).",
            simple_es="Un lugar que elegiste en el mapa.",
            scientific_es=f"Punto elegido por el usuario en latitud {lat:.2f}, longitud {lon:.2f} (celda de la rejilla de NASA POWER).",
        )
        geom = Geometry(kind="point", bbox=[lon, lat, lon, lat])
    else:
        w, s, e, n = c
        rid = "custom_" + "_".join(_num(x) for x in (w, s, e, n))
        name = Text(simple="Your place", scientific=f"Custom box {w:.2f} to {e:.2f} E, {s:.2f} to {n:.2f} N",
                    simple_es="Tu lugar", scientific_es=f"Caja personalizada {w:.2f} a {e:.2f} E, {s:.2f} a {n:.2f} N")
        desc = Text(
            simple="A box you picked on the map.",
            scientific=f"User-chosen box, west {w:.2f}, south {s:.2f}, east {e:.2f}, north {n:.2f}; area mean of NASA POWER grid points.",
            simple_es="Una zona que elegiste en el mapa.",
            scientific_es=f"Caja elegida por el usuario: oeste {w:.2f}, sur {s:.2f}, este {e:.2f}, norte {n:.2f}; "
                          "media de área de los puntos de la rejilla de NASA POWER.",
        )
        geom = Geometry(kind="bbox", bbox=list(c))
    return RegionCard(id=rid, name=name, description=desc, regime="user-defined", geometry=geom, listed=False)


class _NotCacheable(Exception):
    """Raised inside an lru_cache'd function so the value is returned but never stored
    (lru_cache does not cache exceptions)."""

    def __init__(self, value):
        self.value = value


@lru_cache(maxsize=256)
@counts_as_live
def _custom_scan_cached(kind: str, c: tuple[float, ...], theme: str) -> ScanResult:
    result = scan_region(ctx(), custom_region(kind, c), theme)
    down = [e for e in result.entries if e.availability == "fetch_failed"]
    if down and len(down) == len(result.entries):
        raise LiveSourceUnavailable("no data source answered")  # handled as HTTP 503; never cached
    if down:
        raise _NotCacheable(result)  # some live source was down: answer, but do not remember it
    return result


@lru_cache(maxsize=512)
@counts_as_live
def _custom_analyze_cached(kind: str, c: tuple[float, ...], variable: str, start: str | None, end: str | None):
    from .engine import analyze_region

    return analyze_region(ctx(), custom_region(kind, c), variable, start=start, end=end)


@app.get("/custom/scan", response_model=ScanResult, dependencies=[Depends(limit_client)])
def custom_scan(
    theme: str = Query(...), bbox: str | None = None, lat: float | None = None, lon: float | None = None
) -> ScanResult:
    kind, c = _parse_place(bbox, lat, lon)
    if theme not in ctx().catalog.themes:
        raise HTTPException(404, f"unknown theme {theme}")
    try:
        return _custom_scan_cached(kind, c, theme)
    except _NotCacheable as partial:
        return partial.value
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/custom/variables/{variable}", response_model=AnalysisResult, dependencies=[Depends(limit_client)])
def custom_result(
    variable: str,
    bbox: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    start: str | None = Query(None, pattern=MONTH),
    end: str | None = Query(None, pattern=MONTH),
) -> AnalysisResult:
    kind, c = _parse_place(bbox, lat, lon)
    if variable not in ctx().catalog.variables:
        raise HTTPException(404, f"unknown variable {variable}")
    try:
        return _custom_analyze_cached(kind, c, variable, start, end)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
