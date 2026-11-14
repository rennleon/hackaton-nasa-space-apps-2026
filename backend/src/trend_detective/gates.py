"""Gates 2 (fitness) and 3 (data quality), plus data warning chips."""

from __future__ import annotations

import numpy as np

from .catalog import RegionCard, VariableCard
from .contract import Chip, GateCheck, Provenance, Text
from .prepare import Prepared

MIN_YEARS = 15.0
MIN_CELLS = 4.0
MIN_COMPLETENESS = 0.9
MAX_FLOOR_FRACTION = 0.3


def no_data() -> GateCheck:
    return GateCheck(
        code="no_data",
        passed=False,
        detail=Text(
            simple="We don't have this data for this place yet.",
            scientific="No series loaded for this variable and region.",
        ),
    )


def fitness(
    variable: VariableCard, region: RegionCard, years: float, unit: str = "years", n_cells: int | None = None
) -> list[GateCheck]:
    """n_cells: grid cells the source actually returned (overrides the estimate from the region size)."""
    checks: list[GateCheck] = []
    if variable.coverage != "global":
        w, s, e, n = variable.coverage
        rw, rs, re_, rn = region.geometry.bbox
        inside = w <= rw and s <= rs and e >= re_ and n >= rn
        checks.append(
            GateCheck(
                code="coverage",
                passed=inside,
                detail=Text(
                    simple="This data covers this place."
                    if inside
                    else "This data does not cover this place.",
                    scientific=f"Variable coverage {variable.coverage} vs region bbox {region.geometry.bbox}.",
                ),
            )
        )
    cells = float(n_cells) if n_cells is not None else region.geometry.cells(variable.grid_deg)
    if region.geometry.kind == "point" or n_cells == 1:
        small_box = region.geometry.kind != "point"
        checks.append(
            GateCheck(
                code="cells",
                passed=True,
                detail=Text(
                    simple="Your box is small, so we use the map square in its middle."
                    if small_box
                    else "One place: we use the map square around it.",
                    scientific=f"Single {variable.grid_deg}° grid cell"
                    + (" at the box centre (box below the source's regional minimum)." if small_box else "."),
                ),
            )
        )
        cells = None
    if cells is not None:
        checks.append(
            GateCheck(
                code="cells",
                passed=cells >= MIN_CELLS,
                detail=Text(
                    simple=f"About {cells:.0f} map squares cover this place (we need at least {MIN_CELLS:.0f}).",
                    scientific=f"≈{cells:.1f} grid cells at {variable.grid_deg}° (minimum {MIN_CELLS:.0f}).",
                ),
            )
        )
    checks.append(
        GateCheck(
            code="record_length",
            passed=years >= MIN_YEARS,
            detail=Text(
                simple=f"{years:.0f} years of data (we need at least {MIN_YEARS:.0f}).",
                scientific=f"{years:.1f} {unit} in the analysis window (minimum {MIN_YEARS:.0f}).",
            ),
        )
    )
    return checks


def quality(p: Prepared, variable: VariableCard, months: list[int] | None = None) -> list[GateCheck]:
    """Completeness and floor checks over the window, or over the season's months only."""
    vals = p.values_window
    if months:
        cal = np.array([int(m[5:7]) for m in p.months_window])
        vals = vals[np.isin(cal, months)]
    completeness = float(np.isfinite(vals).mean()) if vals.size else 0.0
    checks = [
        GateCheck(
            code="completeness",
            passed=completeness >= MIN_COMPLETENESS,
            detail=Text(
                simple=f"{completeness:.0%} of the months have data (we need {MIN_COMPLETENESS:.0%}).",
                scientific=f"Completeness {completeness:.1%} within the window (minimum {MIN_COMPLETENESS:.0%}).",
            ),
        )
    ]
    if variable.floor is not None:
        finite = vals[np.isfinite(vals)]
        frac = float((finite <= variable.floor + 1e-9).mean()) if finite.size else 1.0
        checks.append(
            GateCheck(
                code="floor",
                passed=frac < MAX_FLOOR_FRACTION,
                detail=Text(
                    simple=f"{frac:.0%} of the months are at zero, so a trend would mean little."
                    if frac >= MAX_FLOOR_FRACTION
                    else "The values are not stuck at zero.",
                    scientific=f"{frac:.1%} of months at the floor value {variable.floor} "
                    f"(maximum {MAX_FLOOR_FRACTION:.0%}).",
                ),
            )
        )
    return checks


def bbox_chip(prov: Provenance | None, region: RegionCard, grid_deg: float) -> Chip | None:
    """Rule 3: the box we get should be the box we asked for. Giovanni's 'Data Bounding
    Box' is interpreted as grid-cell centres (assumption), so edges are centres ± grid/2."""
    if prov is None or prov.data_bbox is None or region.geometry.kind != "bbox" or prov.source_kind != "giovanni_csv":
        return None
    w, s, e, n = prov.data_bbox
    h = grid_deg / 2
    edges = [w - h, s - h, e + h, n + h]
    if max(abs(a - b) for a, b in zip(edges, region.geometry.bbox)) <= grid_deg / 4:
        return None
    ew, es, ee, en = edges
    return Chip(
        code="data_box_differs",
        severity="info",
        text=Text(
            simple="The satellite data covers a slightly different area than the box we asked for.",
            scientific=f"Returned grid cells span {ew:g}…{ee:g}°E, {es:g}…{en:g}°N (data bounding box read as "
            f"cell centres) vs requested {region.geometry.bbox}.",
        ),
    )


def step_month(months: list[str], resid: np.ndarray, sd: float, r1: float) -> str | None:
    """First month where a 12-month running mean of detrended anomalies sits beyond
    4 standard errors (inflated for persistence): a candidate step change. 4 SE keeps
    false alarms on pure noise near 0.5% over a 20-year record (3 SE gave ~25%, because
    ~230 overlapping windows are scanned)."""
    if not np.isfinite(sd) or sd <= 0 or len(resid) < 12:
        return None
    phi = min(max(r1, 0.0), 0.95)
    thr = 4 * sd * np.sqrt((1 + phi) / (1 - phi)) / np.sqrt(12)
    for i in range(len(resid) - 11):
        block = resid[i : i + 12]
        fin = block[np.isfinite(block)]
        if fin.size >= 9 and abs(fin.mean()) > thr:
            return months[i]
    return None
