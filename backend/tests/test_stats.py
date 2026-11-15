"""Unit tests for trend_detective.stats."""

import numpy as np
import pytest
from scipy import stats as sps

from trend_detective.stats import (
    benjamini_hochberg,
    effective_n,
    lag1_autocorr,
    ols_neff,
    sen_slope_ci,
    trend_tests,
    years_to_detect,
)


def ar1(n: int, phi: float, seed: int, sd: float = 1.0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    e = rng.normal(0, sd, n)
    x = np.zeros(n)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + e[i]
    return x


def test_lag1_ar1() -> None:
    assert lag1_autocorr(ar1(5000, 0.7, 1)) == pytest.approx(0.7, abs=0.05)


def test_lag1_short_and_clip() -> None:
    assert lag1_autocorr(np.array([1.0, 2.0])) == 0.0
    assert lag1_autocorr(np.arange(100.0)) <= 0.99


def test_lag1_nan_uses_consecutive_pairs_only() -> None:
    x = ar1(2000, 0.6, 2)
    x[::7] = np.nan
    assert lag1_autocorr(x) == pytest.approx(0.6, abs=0.12)
    # alternating NaN -> no consecutive pairs
    y = np.arange(20.0)
    y[::2] = np.nan
    assert lag1_autocorr(y) == 0.0


def test_ols_neff_nan_alignment() -> None:
    t = np.arange(100) / 12.0
    y = 2.0 * t + ar1(100, 0.3, 3)
    y[10:15] = np.nan
    slope, p, _tstat, _r1, n_eff, sd, res = ols_neff(t, y)
    assert res.shape == y.shape
    assert np.isnan(res[10:15]).all() and np.isfinite(res[:10]).all()
    assert slope == pytest.approx(2.0, abs=0.5)
    assert 0 <= p <= 1 and sd > 0 and n_eff <= 95


def test_effective_n_edges() -> None:
    assert effective_n(100, 0.0) == 100.0
    assert effective_n(100, -0.5) == 100.0
    assert effective_n(100, 1 / 3) == pytest.approx(50.0)
    assert effective_n(10, 0.99) == 3.0


def test_sen_ci_contains_slope_and_widens() -> None:
    t = np.arange(120) / 12.0
    y = 1.5 * t + np.random.default_rng(0).normal(0, 1, 120)
    s, lo, hi, icpt = sen_slope_ci(t, y, var_s=120 * 119 * (2 * 120 + 5) / 18)
    assert lo <= s <= hi
    assert s == pytest.approx(1.5, abs=0.2)
    assert icpt == pytest.approx(np.median(y - s * t))
    _, lo2, hi2, _ = sen_slope_ci(t, y, var_s=4 * 120 * 119 * 245 / 18)
    assert (hi2 - lo2) > (hi - lo)


def test_years_to_detect() -> None:
    base = years_to_detect(1.0, 0.1, 0.0, 12)
    assert base is not None
    assert years_to_detect(1.0, 0.2, 0.0, 12) < base
    assert years_to_detect(1.0, 0.1, 0.6, 12) > base
    assert years_to_detect(1.0, 0.1, 0.0, 1) == pytest.approx(base * 12 ** (1 / 3))
    assert years_to_detect(1.0, 0.0, 0.0, 12) is None
    assert years_to_detect(float("nan"), 0.1, 0.0, 12) is None
    # Weatherhead formula check, monthly
    assert base == pytest.approx((3.3 * 1.0 / 0.1) ** (2 / 3))


def test_benjamini_hochberg() -> None:
    assert benjamini_hochberg([]) == []
    # sorted p .01 .02 .03 .5 -> raw .04 .04 .04 .5 -> monotone
    out = benjamini_hochberg([0.5, 0.01, 0.03, 0.02])
    assert out == pytest.approx([0.5, 0.04, 0.04, 0.04])
    assert benjamini_hochberg([0.9, 0.95]) == pytest.approx([0.95, 0.95])
    assert max(benjamini_hochberg([0.6, 0.8, 0.99])) <= 1.0


def test_trend_tests_clear_trend() -> None:
    t = 2000 + np.arange(240) / 12.0
    y = 0.5 * (t - 2000) + np.random.default_rng(5).normal(0, 1, 240)
    r = trend_tests(t, y)
    assert r.p_mk_hr < 0.01 and r.p_ols < 0.01
    assert r.ci_low_per_year <= r.slope_per_year <= r.ci_high_per_year
    assert r.slope_per_year == pytest.approx(0.5, abs=0.1)
    assert r.n == 240


def test_trend_tests_white_noise_rarely_flagged() -> None:
    t = 2000 + np.arange(120) / 12.0
    flagged = sum(
        trend_tests(t, np.random.default_rng(s).normal(size=120)).p_ols < 0.05 for s in range(40)
    )
    assert flagged <= 6


def test_trend_tests_errors() -> None:
    t = np.arange(20.0)
    with pytest.raises(ValueError):
        trend_tests(t, np.ones(20))
    y = np.full(20, np.nan)
    y[:5] = [1, 2, 3, 2, 5]
    with pytest.raises(ValueError):
        trend_tests(t, y)


def test_persistence_correction_inflates_p() -> None:
    t = np.arange(240) / 12.0
    ratios = []
    for s in range(10):
        y = ar1(240, 0.9, s)
        naive = sps.linregress(t, y).pvalue
        r = trend_tests(2000 + t, y)
        assert r.r1 > 0.6 and r.n_eff < 120
        ratios.append(r.p_ols >= naive)
    assert all(ratios)


def test_seasonal_homogeneity_flags_opposite_seasons_only() -> None:
    from trend_detective.stats import seasonal_homogeneity

    rng = np.random.default_rng(3)
    years = 25
    t = np.repeat(np.arange(years), 12).astype(float)
    same = t * 0.1 + rng.normal(0, 0.3, years * 12)  # every month rises alike
    sign = np.tile([1.0] * 6 + [-1.0] * 6, years)  # half the months rise, half fall
    differ = sign * t * 0.1 + rng.normal(0, 0.3, years * 12)
    assert seasonal_homogeneity(same)[1] > 0.05
    assert seasonal_homogeneity(differ)[1] < 0.001
