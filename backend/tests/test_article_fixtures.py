"""Regression against the MCMC Addict (2024) article on trend tests for methane data."""

import numpy as np
import pymannkendall as mk
import pytest
from scipy import stats as sps

from trend_detective.stats import seasonal_mk


def _datasets() -> list[np.ndarray]:
    np.random.seed(1)
    start_year, end_year = 2000, 2020
    years = np.arange(start_year, end_year + 1)
    months = np.arange(1, 13)
    intercept, seasonal_amplitude, noise_std_dev = 1800, 10, 5
    time_years = np.repeat(years, 12)
    time_months = np.tile(months, len(years))
    slopes = [[0.1, 1], [0.2, 1], [0.3, 1], [7, 1], [0.1, 0]]
    noise = np.random.normal(0, noise_std_dev, len(time_years))
    seasonal = seasonal_amplitude * np.sin(2 * np.pi * (time_months - 1) / 12)
    return [
        np.round(intercept + s[0] * (time_years - start_year) + noise + seasonal * s[1], 1)
        for s in slopes
    ]


DS = _datasets()


@pytest.mark.parametrize(
    ("idx", "expected"),
    [(1, 0.08451668200699602), (2, 0.005446346816116554), (4, 0.03902984383065089)],
)
def test_original_mk(idx: int, expected: float) -> None:
    assert mk.original_test(DS[idx]).p == pytest.approx(expected, rel=1e-6)


@pytest.mark.parametrize(
    ("idx", "period", "expected"),
    [
        (0, 12, 0.09755673352859229),
        (1, 12, 0.00013780365183713172),
        (1, 2, 0.0820714015763353),
    ],
)
def test_seasonal_mk_article(idx: int, period: int, expected: float) -> None:
    assert mk.seasonal_test(DS[idx], period=period).p == pytest.approx(expected, rel=1e-6)


@pytest.mark.parametrize(
    ("idx", "expected"), [(0, 0.09755673352859229), (1, 0.00013780365183713172)]
)
def test_seasonal_wrapper_matches(idx: int, expected: float) -> None:
    p, _z = seasonal_mk(DS[idx], period=12)
    assert p == pytest.approx(expected, rel=1e-6)


def _ols_p(y: np.ndarray) -> float:
    x = np.arange(len(y)) / 12.0
    return float(sps.linregress(x, y).pvalue)


def test_plain_ols_article_significance() -> None:
    """Per the article: 0.2 ppb/yr is not significant at 0.05 for plain OLS, 0.3 ppb/yr is."""
    assert _ols_p(DS[1]) >= 0.05
    assert _ols_p(DS[2]) < 0.05
