"""Trend statistics: Sen's slope, autocorrelation-aware significance tests, detection time.

Dependencies are limited to numpy, scipy and pymannkendall.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pymannkendall as mk
from scipy import stats as sps


@dataclass
class TrendTests:
    """Bundle of trend estimates and tests for one series."""

    slope_per_year: float  # Sen's slope (units per year)
    ci_low_per_year: float  # 95% CI of Sen's slope (Hamed-Rao Var(S))
    ci_high_per_year: float
    intercept: float  # median(y - slope * t); fitted y = intercept + slope * t
    p_mk_hr: float  # Test A: Mann-Kendall with Hamed-Rao correction (two-sided)
    z_mk_hr: float
    p_ols: float  # Test B: OLS slope t-test with effective sample size
    t_ols: float
    ols_slope_per_year: float
    r1: float  # lag-1 autocorrelation of OLS residuals
    n: int  # finite points used
    n_eff: float
    resid_sd: float  # sd of OLS residuals with ddof=2 (two fitted parameters)


def lag1_autocorr(resid: np.ndarray) -> float:
    """Lag-1 autocorrelation using only consecutive finite pairs (NaN-aware).

    The mean is taken over all finite values. Returns 0.0 with fewer than 3 valid
    pairs or zero variance; the result is clipped to [-0.99, 0.99].
    """
    r = np.asarray(resid, dtype=float)
    finite = np.isfinite(r)
    if finite.sum() < 3:
        return 0.0
    d = r - r[finite].mean()
    a, b = d[:-1], d[1:]
    ok = finite[:-1] & finite[1:]
    if ok.sum() < 3:
        return 0.0
    var = float(np.mean(d[finite] ** 2))
    if var <= 0.0:
        return 0.0
    cov = float(np.mean(a[ok] * b[ok]))  # normalised by pair count, so gaps do not bias r1
    return float(np.clip(cov / var, -0.99, 0.99))


def effective_n(n: int, r1: float) -> float:
    """Effective sample size n * (1 - r1) / (1 + r1) for positive r1, else n; floor 3."""
    n_eff = n * (1.0 - r1) / (1.0 + r1) if r1 > 0 else float(n)
    return float(max(n_eff, 3.0))


def ols_neff(
    t: np.ndarray, y: np.ndarray
) -> tuple[float, float, float, float, float, float, np.ndarray]:
    """OLS slope test with the standard error inflated for lag-1 autocorrelation.

    Returns (slope, p_two_sided, t_stat, r1, n_eff, resid_sd, resid_aligned).
    se_adj = se * sqrt((n-2)/(n_eff-2)); p from Student t with df = n_eff - 2.
    resid_sd uses ddof=2. resid_aligned has y's length with NaN where y is NaN.
    """
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    m = np.isfinite(t) & np.isfinite(y)
    n = int(m.sum())
    if n < 3:
        raise ValueError("need at least 3 finite points")
    tt, yy = t[m], y[m]
    tc = tt - tt.mean()
    sxx = float(np.sum(tc**2))
    if sxx <= 0:
        raise ValueError("t has no variance")
    slope = float(np.sum(tc * (yy - yy.mean())) / sxx)
    icpt = float(yy.mean() - slope * tt.mean())
    res = yy - (icpt + slope * tt)
    resid_aligned = np.full(y.shape, np.nan)
    resid_aligned[m] = res
    r1 = lag1_autocorr(resid_aligned)
    n_eff = effective_n(n, r1)
    s2 = float(np.sum(res**2) / (n - 2))
    resid_sd = float(np.sqrt(s2))
    se = float(np.sqrt(s2 / sxx))
    se_adj = se * np.sqrt((n - 2) / (n_eff - 2)) if n_eff > 2 else se
    if se_adj <= 0:
        t_stat = float("inf") if slope != 0 else 0.0
        p = 0.0 if slope != 0 else 1.0
    else:
        t_stat = slope / se_adj
        p = float(2.0 * sps.t.sf(abs(t_stat), df=n_eff - 2))
    return slope, p, float(t_stat), r1, float(n_eff), resid_sd, resid_aligned


def mk_hamed_rao(y: np.ndarray) -> tuple[float, float, float]:
    """Mann-Kendall with Hamed-Rao variance correction; returns (p, z, modified var_s)."""
    v = np.asarray(y, dtype=float)
    v = v[np.isfinite(v)]
    res = mk.hamed_rao_modification_test(v, alpha=0.05)
    return float(res.p), float(res.z), float(res.var_s)


def sen_slope_ci(
    t: np.ndarray, y: np.ndarray, var_s: float, alpha: float = 0.05
) -> tuple[float, float, float, float]:
    """Sen's slope with Gilbert (1987) confidence interval; returns (slope, lo, hi, intercept).

    Sources: Sen, P.K. (1968) "Estimates of the regression coefficient based on Kendall's tau",
    J. Am. Stat. Assoc. 63(324):1379-1389; Gilbert, R.O. (1987) Statistical Methods for
    Environmental Pollution Monitoring, Van Nostrand Reinhold (Sen's nonparametric slope estimator
    and its rank-based confidence interval). var_s is the Hamed-Rao modified Var(S), so the interval
    accounts for autocorrelation; the chart band and the verdict range both use this function.

    With N' pairwise slopes sorted ascending, C = z_{1-alpha/2} * sqrt(var_s),
    M1 = (N' - C)/2, M2 = (N' + C)/2; lo is the slope at 1-based rank M1 and hi at
    rank M2 + 1. Fractional ranks are linearly interpolated and clipped to [1, N'].
    """
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    m = np.isfinite(t) & np.isfinite(y)
    tt, yy = t[m], y[m]
    n = len(tt)
    if n < 2:
        raise ValueError("need at least 2 finite points")
    i, j = np.triu_indices(n, k=1)
    dt = tt[j] - tt[i]
    ok = dt != 0
    slopes = np.sort((yy[j] - yy[i])[ok] / dt[ok])
    npairs = len(slopes)
    if npairs == 0:
        raise ValueError("no pairs with distinct t")
    slope = float(np.median(slopes))
    c = sps.norm.ppf(1 - alpha / 2) * np.sqrt(max(var_s, 0.0))
    m1 = (npairs - c) / 2.0
    m2 = (npairs + c) / 2.0

    def at_rank(rank: float) -> float:
        pos = float(np.clip(rank, 1.0, npairs)) - 1.0
        return float(np.interp(pos, np.arange(npairs), slopes))

    lo = at_rank(m1)
    hi = at_rank(m2 + 1.0)
    intercept = float(np.median(yy - slope * tt))
    return slope, min(lo, slope), max(hi, slope), intercept


def seasonal_mk(values: np.ndarray, period: int = 12) -> tuple[float, float]:
    """Seasonal Mann-Kendall (p, z); context only, ignores serial correlation."""
    res = mk.seasonal_test(np.asarray(values, dtype=float), period=period)
    return float(res.p), float(res.z)


def years_to_detect(
    resid_sd: float, slope_per_year: float, r1: float, samples_per_year: int
) -> float | None:
    """Years needed to detect a trend (Weatherhead et al. 1998, generalised to frequency f).

    n* = [3.3 * sd * sqrt(12/f) / |slope| * sqrt((1+phi)/(1-phi))] ** (2/3), phi = clip(r1, 0, 0.95).
    """
    if not np.isfinite(resid_sd) or not np.isfinite(slope_per_year) or abs(slope_per_year) < 1e-12:
        return None
    phi = float(np.clip(r1, 0.0, 0.95))
    core = 3.3 * resid_sd * np.sqrt(12.0 / samples_per_year) / abs(slope_per_year)
    return float((core * np.sqrt((1 + phi) / (1 - phi))) ** (2.0 / 3.0))


def trend_tests(t: np.ndarray, y: np.ndarray) -> TrendTests:
    """Run Sen slope + CI, Hamed-Rao MK (test A) and autocorrelation-adjusted OLS (test B)."""
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    m = np.isfinite(t) & np.isfinite(y)
    n = int(m.sum())
    if n < 8:
        raise ValueError(f"need at least 8 finite points, got {n}")
    if np.ptp(y[m]) == 0:
        raise ValueError("series is constant")
    ols_slope, p_ols, t_ols, r1, n_eff, resid_sd, _ = ols_neff(t, y)
    p_mk, z_mk, var_s = mk_hamed_rao(y[m])
    slope, lo, hi, icpt = sen_slope_ci(t, y, var_s)
    return TrendTests(
        slope_per_year=slope,
        ci_low_per_year=lo,
        ci_high_per_year=hi,
        intercept=icpt,
        p_mk_hr=p_mk,
        z_mk_hr=z_mk,
        p_ols=p_ols,
        t_ols=t_ols,
        ols_slope_per_year=ols_slope,
        r1=r1,
        n=n,
        n_eff=n_eff,
        resid_sd=resid_sd,
    )


def benjamini_hochberg(pvals: list[float]) -> list[float]:
    """Benjamini-Hochberg adjusted p-values in original order (monotone, capped at 1)."""
    m = len(pvals)
    if m == 0:
        return []
    p = np.asarray(pvals, dtype=float)
    order = np.argsort(p)
    adj = p[order] * m / np.arange(1, m + 1)
    adj = np.minimum.accumulate(adj[::-1])[::-1]
    out = np.empty(m)
    out[order] = np.minimum(adj, 1.0)
    return [float(x) for x in out]
