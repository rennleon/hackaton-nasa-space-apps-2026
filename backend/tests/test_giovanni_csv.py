from pathlib import Path

import numpy as np
import pytest

from trend_detective.catalog import Catalog
from trend_detective.sources.giovanni_csv import GiovanniCsvSource, parse_giovanni_csv

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
REGION_DIR = RAW / "cajamarca_west"


def _real(suffix: str) -> Path:
    return next(REGION_DIR.glob(f"*{suffix}.*csv"))


def test_parse_real_daytime():
    p = parse_giovanni_csv(_real("RelHumSurf_A"))
    assert p.dataset_id == "AIRS3STM_7_0_RelHumSurf_A"
    assert len(p.months) == 290 and len(p.values) == 290
    assert p.months[0] == "2002-09" and p.months[-1] == "2026-10"
    assert p.values[0] == pytest.approx(58.5033379)
    assert not np.isnan(p.values).any()
    assert p.requested_bbox == [-79.5, -7.8, -77.7, -4.5]
    assert p.data_bbox == [-79.5, -7.5, -78.5, -4.5]
    assert p.title and "Relative Humidity" in p.title
    assert p.shape is None
    assert p.start == "2002-09-01T00:00:00Z"


def test_parse_real_nighttime_no_mean_prefix():
    p = parse_giovanni_csv(_real("RelHumSurf_D"))
    assert p.dataset_id == "AIRS3STM_7_0_RelHumSurf_D"
    assert len(p.months) == 290
    assert p.values[0] == pytest.approx(89.7051315)


def _write(tmp_path, text, name="a.csv"):
    f = tmp_path / name
    f.write_text(text)
    return f


def test_synthetic_shape_empty_bbox_and_fill(tmp_path):
    f = _write(
        tmp_path,
        'Title:,"T"\n'
        "User Bounding Box:,\n"
        'Data Bounding Box:,""\n'
        'URL to Reproduce Results:,"https://x/#service=ArAvTs&shape=tl_2014_us_state/shp_15&data=FOO"\n'
        "Fill Value (FOO):, -9999\n"
        "Bogus Key:, whatever\n"
        "\n"
        "time, FOO\n"
        "2020-01-01 00:00:00, 1.5\n"
        "2020-02-01T00:00:00Z,-9999\n"
        "2020-03-01 00:00:00,3\n\n\n",
    )
    p = parse_giovanni_csv(f)
    assert p.dataset_id == "FOO"
    assert p.requested_bbox is None and p.data_bbox is None
    assert p.shape == "tl_2014_us_state/shp_15"
    assert p.months == ["2020-01", "2020-02", "2020-03"]
    assert p.values[0] == 1.5 and np.isnan(p.values[1]) and p.values[2] == 3.0


def test_synthetic_mean_prefix_stripped(tmp_path):
    f = _write(tmp_path, "time,mean_BAR\n2020-01-01 00:00:00,2\n")
    assert parse_giovanni_csv(f).dataset_id == "BAR"


@pytest.mark.parametrize("row", ["2020-02-01 00:00:00,abc", "garbage,1", "2020-02-01 00:00:00"])
def test_malformed_row_raises(tmp_path, row):
    f = _write(tmp_path, f"time,FOO\n2020-01-01 00:00:00,1\n{row}\n")
    with pytest.raises(ValueError):
        parse_giovanni_csv(f)


def test_missing_header_raises(tmp_path):
    with pytest.raises(ValueError):
        parse_giovanni_csv(_write(tmp_path, "Title:,x\n"))


@pytest.fixture(scope="module")
def catalog():
    return Catalog.load(ROOT / "catalog")


def test_fetch_real(catalog):
    src = GiovanniCsvSource(RAW)
    raw = src.fetch(catalog.variables["airs_rh_surf_day"], catalog.regions["cajamarca_west"])
    assert raw is not None
    assert len(raw.months) == 290
    assert raw.provenance.source_kind == "giovanni_csv"
    assert raw.provenance.source_ref.endswith(".csv")
    assert raw.provenance.requested_bbox == [-79.5, -7.8, -77.7, -4.5]
    assert "AIRS3STM_7_0_RelHumSurf_A" in src.available("cajamarca_west")


def test_fetch_missing_variable_and_region(catalog):
    src = GiovanniCsvSource(RAW)
    region = catalog.regions["cajamarca_west"]
    assert src.fetch(catalog.variables["merra2_precip"], region) is None
    ghost = region.model_copy(update={"id": "no_such_region"})
    assert src.fetch(catalog.variables["airs_rh_surf_day"], ghost) is None
    assert src.available("no_such_region") == {}


def test_duplicate_files_prefer_longer(tmp_path, catalog):
    d = tmp_path / "cajamarca_west"
    d.mkdir()
    (d / "short.csv").write_text(
        "time,AIRS3STM_7_0_RelHumSurf_A\n2020-01-01 00:00:00,1\n"
    )
    (d / "long.csv").write_text(
        "time,AIRS3STM_7_0_RelHumSurf_A\n2020-01-01 00:00:00,1\n2020-02-01 00:00:00,2\n"
    )
    raw = GiovanniCsvSource(tmp_path).fetch(
        catalog.variables["airs_rh_surf_day"], catalog.regions["cajamarca_west"]
    )
    assert raw is not None and raw.provenance.source_ref == "long.csv"
