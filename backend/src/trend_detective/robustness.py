"""Protocol step 8: robustness checks that become warning chips."""

from __future__ import annotations

import numpy as np

from .contract import LeaveOneYearOut
from .stats import trend_tests


def leave_one_year_out(
    t: np.ndarray, y: np.ndarray, years: np.ndarray, base_slope: float, base_sig: bool, alpha: float = 0.05
) -> LeaveOneYearOut:
    """Drop each year in turn and re-run the decisive tests. A year 'flips' the result
    when dropping it changes the slope's sign or the significance decision."""
    slopes, worst_p, flips = [], 0.0, []
    for yr in np.unique(years):
        y_drop = y.astype(float).copy()
        y_drop[years == yr] = np.nan  # a gap, so neighbours are not treated as consecutive
        try:
            tt = trend_tests(t, y_drop)
        except ValueError:
            continue
        p = max(tt.p_mk_hr, tt.p_ols)
        slopes.append(tt.slope_per_year * 10)
        worst_p = max(worst_p, p)
        if np.sign(tt.slope_per_year) != np.sign(base_slope) or (p < alpha) != base_sig:
            flips.append(int(yr))
    if not slopes:
        slopes = [base_slope * 10]
    return LeaveOneYearOut(
        slope_min=float(min(slopes)), slope_max=float(max(slopes)), worst_p=float(worst_p), flip_years=flips
    )
