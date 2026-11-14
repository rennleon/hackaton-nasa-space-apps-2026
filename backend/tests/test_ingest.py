from pathlib import Path

import numpy as np
import pytest

from trend_detective.catalog import Catalog
from trend_detective.contract import Provenance
from trend_detective.ingest import to_monthly
from trend_detective.sources.base import RawSeries

ROOT = Path(__file__).resolve().parents[2]
CAT = Catalog.load(ROOT / "catalog")
PROV = Provenance(source_kind="test", source_ref="x")


def raw(months, values):
    return RawSeries(months=months, values=np.array(values, dtype=float), provenance=PROV)


def test_gap_filled_with_nan():
    out = to_monthly(
        raw(["2020-11", "2021-01", "2021-02"], [280.0, 281.0, 282.0]), CAT.variables["airs_t_surf_day"]
    )
    assert out.months == ["2020-11", "2020-12", "2021-01", "2021-02"]
    assert np.isnan(out.values[1])
    assert out.values[2] == pytest.approx(281.0 - 273.15)
    assert out.provenance is PROV


def test_kelvin_to_celsius():
    out = to_monthly(raw(["2020-01", "2020-02"], [273.15, 300.0]), CAT.variables["airs_t_surf_day"])
    assert out.values == pytest.approx([0.0, 26.85])


def test_precip_flux_to_mm_per_day():
    out = to_monthly(raw(["2020-01"], [1e-5]), CAT.variables["merra2_precip"])
    assert out.values[0] == pytest.approx(0.864)


def test_nan_stays_nan():
    out = to_monthly(raw(["2020-01", "2020-02"], [np.nan, 1e-5]), CAT.variables["merra2_precip"])
    assert np.isnan(out.values[0])


def test_duplicate_months_raise():
    with pytest.raises(ValueError, match="duplicate"):
        to_monthly(raw(["2020-01", "2020-01"], [1.0, 2.0]), CAT.variables["merra2_precip"])
