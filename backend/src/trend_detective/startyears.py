"""Start-year sensitivity: does the answer hold if the window starts in a different year?

Context only; the headline verdict stays on the declared window. Trends over a few decades can change
sign with the choice of start or end year (Liebmann, B., Dole, R.M., Jones, C., Bladé, I., Allured, D.
(2010), "Influence of Choice of Time Period on Global Surface Temperature Trend Estimates", Bull. Amer.
Meteor. Soc. 91(11), 1485-1491, doi:10.1175/2010BAMS3030.1).
"""

from __future__ import annotations

import numpy as np

from .contract import StartYearPoint, StartYearSensitivity
from .gates import MIN_YEARS
from .prepare import Prepared, window_years
from .stats import trend_tests
from .timeutil import month_index, month_to_float, year_of

# Project choices (not from the literature): the share of start years that must keep the declared
# slope's sign for "mostly". All of them keeping it is "holds"; fewer than this is "depends".
MOSTLY_SHARE = 0.75


def classify(n_same_sign: int, n_starts: int) -> str:
    if n_same_sign == n_starts:
        return "holds"
    return "mostly" if n_same_sign >= MOSTLY_SHARE * n_starts else "depends"


def start_year_sensitivity(
    p: Prepared, declared_slope_per_year: float, alpha: float = 0.05
) -> StartYearSensitivity | None:
    """Re-run the verdict's own trend tests (Sen's slope with the persistence-corrected 95% range,
    Mann-Kendall Hamed-Rao and the OLS t-test with effective sample size) for windows that start in
    January of each year from the window's first full year to the last year that still leaves
    MIN_YEARS years, keeping the window's end month.

    Seasonal anomalies come from `p.anomalies`, i.e. the climatology of the FULL declared window, the
    same one the headline uses. Re-centring each shortened window on its own climatology would change
    the baseline with the start year, so the slopes would no longer be comparable with the headline.

    Returns None when fewer than two start years fit (nothing to compare)."""
    w = p.window
    first_full = year_of(w.start) + (0 if w.start[5:7] == "01" else 1)
    in_win = p.in_window
    t_all = np.array([month_to_float(m) for m in p.months])
    yrs_all = np.array([year_of(m) for m in p.months])
    points: list[StartYearPoint] = []
    for y0 in range(first_full, year_of(w.end) + 1):
        start = f"{y0}-01"
        if month_index(start) > month_index(w.end) or window_years(start, w.end) < MIN_YEARS:
            break
        sel = in_win & (yrs_all >= y0)
        try:
            tt = trend_tests(t_all[sel], p.anomalies[sel])
        except ValueError:
            continue  # this start cannot be tested (too little data, constant series, undefined variance)
        points.append(StartYearPoint(
            start=start, years=round(window_years(start, w.end), 2),
            slope_per_decade=float(tt.slope_per_year * 10),
            ci_low=float(tt.ci_low_per_year * 10), ci_high=float(tt.ci_high_per_year * 10),
            significant=bool(tt.p_mk_hr < alpha and tt.p_ols < alpha),
        ))
    if len(points) < 2:
        return None
    same = sum(1 for q in points if np.sign(q.slope_per_decade) == np.sign(declared_slope_per_year))
    return StartYearSensitivity(
        points=points, n_starts=len(points), n_same_sign=same,
        n_significant=sum(q.significant for q in points), classification=classify(same, len(points)),
    )
