"""Do the grid cells inside a box go the way the box average goes?

A box mean can hide opposite changes that cancel out. This counts the cells whose own trend has the same
sign as the box trend. Each cell is de-seasonalised and tested exactly like the box (the engine's own trend
tests, passed in as `tests_of`), and the cells that go the other way are tested for significance with
Benjamini-Hochberg FDR across the cells: Wilks (2016), Bull. Amer. Meteor. Soc. 97(12):2263-2273,
doi:10.1175/BAMS-D-15-00267.1, recommends false-discovery-rate control for many grid-point tests.
Counts only; no map.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np

from .catalog import VariableCard
from .contract import CellAgreement, Provenance, Season, Window
from .gates import MIN_COMPLETENESS
from .ingest import to_monthly
from .prepare import Prepared, prepare
from .sources.base import CellSeries, RawSeries
from .stats import TrendTests, benjamini_hochberg
from .timeutil import calendar_month

MIN_CELLS = 2

# Project rule (declared before any result is seen): "agree" when at least 80% of the cells go the box's way
# and no opposite cell is sure; "mixed" when any opposite cell is sure, or fewer than 60% go the box's way;
# "mostly" otherwise.
AGREE_SHARE = 0.8
MIXED_SHARE = 0.6


def classify(n_cells: int, n_same_sign: int, n_opposite_sure: int) -> str:
    share = n_same_sign / n_cells
    if n_opposite_sure >= 1 or share < MIXED_SHARE:
        return "mixed"
    return "agree" if share >= AGREE_SHARE else "mostly"


def _complete(p: Prepared, season: Season | None) -> bool:
    """Same completeness idea as the box gate: the share of months with a value inside the window
    (only the season's months for a seasonal analysis)."""
    vals = p.values_window
    if season:
        cal = np.array([calendar_month(m) for m in p.months_window])
        vals = vals[np.isin(cal, season.months)]
    return vals.size > 0 and float(np.isfinite(vals).mean()) >= MIN_COMPLETENESS


def cell_agreement(
    cells: list[CellSeries],
    variable: VariableCard,
    provenance: Provenance | None,
    window: Window,
    season: Season | None,
    box_slope_per_year: float,
    tests_of: Callable[[Prepared], TrendTests],
    alpha: float = 0.05,
) -> CellAgreement | None:
    """None when fewer than MIN_CELLS cells have enough data in the window."""
    prov = provenance or Provenance(source_kind="cells", source_ref="cells")
    slopes: list[float] = []
    ps: list[float] = []
    for c in cells:
        try:
            ms = to_monthly(RawSeries(c.months, c.values, prov), variable)
            if not ms.months:
                continue
            p = prepare(ms, window)
            if not _complete(p, season):
                continue
            tt = tests_of(p)
        except ValueError:  # too few points, constant series, undefined variance: this cell cannot say
            continue
        slopes.append(tt.slope_per_year)
        ps.append(max(float(tt.p_mk_hr), float(tt.p_ols)))  # both persistence-aware tests must agree
    n = len(slopes)
    if n < MIN_CELLS:
        return None
    sign = np.sign(box_slope_per_year)
    same = [bool(np.sign(s) == sign) for s in slopes]
    sure = [adj < alpha for adj in benjamini_hochberg(ps)]
    n_same = sum(same)
    n_opp_sure = sum(1 for sm, su in zip(same, sure) if not sm and su)
    return CellAgreement(
        n_cells=n, n_same_sign=n_same, n_opposite=n - n_same, n_opposite_sure=n_opp_sure,
        verdict=classify(n, n_same, n_opp_sure),
    )
