import calendar
import json
import logging
import math
import shutil
import urllib.parse
from pathlib import Path

import numpy as np
import pytest

from trend_detective.catalog import Catalog, Geometry, RegionCard
from trend_detective.contract import Text
from trend_detective.engine import EngineContext, repo_root
from trend_detective.sources import (
    GiovanniApiSource,
    GiovanniBoxTooLarge,
    GiovanniUnitMismatch,
    LiveSourceUnavailable,
)
from trend_detective.sources import giovanni_api as G

FIX = Path(__file__).parent / "fixtures"
CAT = Catalog.load(repo_root() / "catalog")
TOKEN = "SECRET-TOKEN-do-not-leak-123"


def fx(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


def region(kind="bbox", bbox=(-79.0, -8.0, -77.0, -5.0)):
    t = Text(simple="x", scientific="x")
    return RegionCard(id="t", name=t, description=t, regime="user-defined",
                      geometry=Geometry(kind=kind, bbox=list(bbox)), listed=False)


POINT = region("point", (-78.5, -6.5, -78.5, -6.5))
BOX = region("bbox", (-79.0, -8.0, -77.0, -5.0))  # Cajamarca highlands: 2 x 3 AIRS cells
AIRS = CAT.variables["airs_t_surf_day"]
GPM = CAT.variables["gpm_precip"]
SOIL = CAT.variables["gldas_soil_moist"]


def csv_text(rows, lat=-6.5, lon=-78.5, unit="K", undef="-9999", res=(1, 1), gid="AIRS3STM_7_0_SurfAirTemp_A"):
    head = (f"prod_name,{gid}\ndoi,x\nparam_short_name,x\nparam_name,A thing, with a comma\nunit,{unit}\n"
            f"undef,{undef}\nbegin_time,x\nend_time,x\nlat,{lat}\nlon,{lon}\nlat_resolution,{res[0]}\n"
            f"lon_resolution,{res[1]}\nmean,1\nRequest_time,x\n\nTimestamp (UTC),Data\n")
    return head + "".join(f"{t},{v}\n" for t, v in rows)


def month_rows(first="2002-09", last="2003-12", fn=lambda i: 290.0 + i):
    y, m = map(int, first.split("-"))
    ly, lm = map(int, last.split("-"))
    rows, i = [], 0
    while (y, m) <= (ly, lm):
        rows.append((f"{y}-{m:02d}-01 00:00", fn(i)))
        i += 1
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return rows


class Fake(GiovanniApiSource):
    """Serves canned CSV instead of the network. `serve(gid, lat, lon, start, end)` -> text, '' = 404."""

    def __init__(self, tmp_path, serve, configured=None, quota=0.0, **kw):
        kw.setdefault("end_year", 2003)
        super().__init__(cache_dir=tmp_path / "giovanni", offline=kw.pop("offline", False), **kw)
        self.serve, self.calls, self.quota = serve, [], quota
        self.configured = configured if configured is not None else [AIRS.giovanni_id, GPM.giovanni_id,
                                                                     SOIL.giovanni_id, "X_OMI", "M2T1NXAER_5_12_4_SO4SMASS"]
        self.tokens = []

    def _http(self, url, token):
        if self.offline:
            raise AssertionError("network touched in offline mode")
        parts = urllib.parse.urlparse(url)
        if parts.path == "/configured-variables/":
            return 200, json.dumps({"configured_variables": self.configured})
        if parts.path == "/quota":
            return 200, json.dumps({"status": 200, "quota": self.quota})
        q = urllib.parse.parse_qs(parts.query)
        lat, lon = json.loads(q["location"][0])
        start, end = q["time"][0].split("/")
        self.calls.append((q["data"][0], lat, lon, start, end))
        self.tokens.append(token)
        text = self.serve(q["data"][0], lat, lon, start, end)
        return (200, text) if text else (404, "Data was not found for the requested time range")


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.setenv("EARTHDATA_TOKEN", TOKEN)
    monkeypatch.delenv("TD_GIOVANNI_MAX_CALLS", raising=False)
    monkeypatch.delenv("TD_GIOVANNI_OFFLINE", raising=False)


def airs_serve(gid, lat, lon, start, end):
    return csv_text(month_rows(), lat=lat, lon=lon)


# ----------------------------------------------------------------------------- parser


def test_parse_real_airs_fixture():
    p = G.parse_timeseries(fx("giovanni_airs_t_surf_day_monthly.csv"))
    assert p.unit == "K" and (p.lat, p.lon) == (-6.5, -78.5) and p.lat_res == 1.0
    assert p.stamps[0] == "2002-09-01 00:00" and p.values[0] == 293.219
    assert len(p.stamps) == len(p.values) == 268 and np.isfinite(p.values).all()


def test_header_value_with_comma_is_kept():
    p = G.parse_timeseries(fx("giovanni_m2_so4smass_hourly_3days.csv"))
    assert "ENSEMBLE" in p.header["param_name"] and "time average" in p.header["param_name"]
    assert p.stamps[0] == "2020-01-01 00:30" and p.lon == -89.375


def test_not_a_timeseries_csv():
    with pytest.raises(ValueError):
        G.parse_timeseries('{"code":"400","message":"Bad or missing input"}')


@pytest.mark.parametrize("fixture, undef_val", [
    ("giovanni_gldas_soilmoi_ocean.csv", -9999),
    ("giovanni_omi_no2_daily_2020q1.csv", -1.26765e30),
])
def test_undef_becomes_nan(fixture, undef_val):
    p = G.parse_timeseries(fx(fixture))
    assert p.undef == pytest.approx(undef_val)
    assert np.isnan(p.values).any()
    assert not np.any(p.values == undef_val)


def test_undef_tolerance_covers_float32_and_other_products():
    assert G.is_undef(-9999.900390625, -9999.9)  # GPM
    assert G.is_undef(1.0000000272564224e15, 1e15)  # MERRA-2
    assert G.is_undef(-1.26765e30, -1.26765e30)  # OMI
    assert not G.is_undef(290.4, -9999.0) and not G.is_undef(0.0, -9999.0)
    assert G.is_undef(float("nan"), None)


def test_gldas_ocean_point_is_no_data(tmp_path):
    src = Fake(tmp_path, lambda *a: fx("giovanni_gldas_soilmoi_ocean.csv"))
    assert src.fetch(SOIL, region("point", (-82.125, -6.125, -82.125, -6.125))) is None


# ----------------------------------------------------------------------------- units


def test_unit_normalising():
    assert G.normalize_unit("molecules/cm^2") == G.normalize_unit("molecules/cm2")
    assert G.normalize_unit("kg m-2 s-1") == G.normalize_unit("kg m-2  s-1")
    assert G.normalize_unit("") == G.normalize_unit("1")
    assert G.normalize_unit("percent") == G.normalize_unit("%")  # AIRS RelHumSurf says 'percent' 


def test_unit_mismatch_is_an_error_not_a_conversion(tmp_path):
    card = AIRS.model_copy(update={"units": AIRS.units.model_copy(update={"native": "°C"})})
    with pytest.raises(GiovanniUnitMismatch, match="declares native unit"):
        Fake(tmp_path, airs_serve).fetch(card, POINT)


def test_real_gpm_unit_matches_its_card():
    p = G.parse_timeseries(fx("giovanni_gpm_precip_monthly_head.csv"))
    G.check_unit(GPM, p.unit)  # mm/hr on both sides
    assert p.unit == "mm/hr" and GPM.units.scale == 24.0


# ----------------------------------------------------------------------------- monthly point


def test_point_monthly_values_native_units_and_provenance(tmp_path):
    src = Fake(tmp_path, airs_serve)
    raw = src.fetch(AIRS, POINT)
    assert raw.months[0] == "2002-09" and raw.months[-1] == "2003-12" and len(raw.months) == 16
    assert raw.values[0] == 290.0 and raw.values[1] == 291.0  # native K, no scale or offset applied
    pv = raw.provenance
    assert (pv.source_kind, pv.source_ref, pv.n_cells) == ("giovanni_api", AIRS.giovanni_id, 1)
    assert pv.requested_bbox == [-78.5, -6.5, -78.5, -6.5]
    assert pv.data_bbox == [-79.0, -7.0, -78.0, -6.0]  # the snapped 1-degree cell
    assert len(src.calls) == 1 and src.calls[0][1:3] == (-6.5, -78.5)
    assert src.calls[0][3].startswith("2002-09-01") and src.calls[0][4] == "2003-12-31T23:59:59"


def test_id_not_in_configured_list_is_not_live(tmp_path):
    src = Fake(tmp_path, airs_serve, configured=["SOMETHING_ELSE"])
    assert src.fetch(AIRS, POINT) is None and src.calls == []
    assert src.fetch(CAT.variables["power_t2m"], POINT) is None  # no giovanni_id


# ----------------------------------------------------------------------------- boxes


def test_box_calls_every_cell_centre_in_parallel_and_weights_by_cos_lat(tmp_path):
    def serve(gid, lat, lon, start, end):  # value depends on the cell's latitude; one cell is all undef
        if (lat, lon) == (-5.5, -77.5):
            return csv_text(month_rows(fn=lambda i: -9999), lat=lat, lon=lon)
        return csv_text(month_rows(fn=lambda i: 300.0 + (-lat) * 10), lat=lat, lon=lon)

    src = Fake(tmp_path, serve)
    raw = src.fetch(AIRS, BOX)
    cells = {(c[1], c[2]) for c in src.calls}
    assert cells == {(la, lo) for la in (-7.5, -6.5, -5.5) for lo in (-78.5, -77.5)}
    valid = [(la, lo) for la, lo in cells if (la, lo) != (-5.5, -77.5)]
    w = [math.cos(math.radians(la)) for la, _ in valid]
    expected = sum(wi * (300.0 + -la * 10) for wi, (la, _) in zip(w, valid)) / sum(w)
    assert raw.values[0] == pytest.approx(expected)
    assert expected != pytest.approx(np.mean([300.0 + -la * 10 for la, _ in valid]), abs=1e-6)  # weights matter
    assert raw.provenance.n_cells == 5 and "5 of 6" in raw.provenance.title
    assert raw.provenance.data_bbox == [-79.0, -8.0, -77.0, -5.0]  # cell edges of the cells used
    assert raw.provenance.requested_bbox == [-79.0, -8.0, -77.0, -5.0]


def test_month_needs_half_the_cells(tmp_path):
    def serve(gid, lat, lon, start, end):
        # lat rows -7.5 and -6.5 (4 of 6 cells) are undef in month 3
        rows = month_rows(fn=lambda i: -9999 if (i == 3 and lat in (-7.5, -6.5)) else 295.0)
        return csv_text(rows, lat=lat, lon=lon)

    raw = Fake(tmp_path, serve).fetch(AIRS, BOX)
    assert np.isnan(raw.values[3])  # only 2 of 6 valid
    assert raw.values[2] == pytest.approx(295.0) and raw.values[4] == pytest.approx(295.0)


def test_cell_snapped_outside_the_box_is_dropped_and_noted(tmp_path):
    def serve(gid, lat, lon, start, end):
        if (lat, lon) == (-7.5, -78.5):  # pretend the service snapped it to a cell outside the box
            return csv_text(month_rows(), lat=-8.5, lon=-78.5)
        return csv_text(month_rows(), lat=lat, lon=lon)

    raw = Fake(tmp_path, serve).fetch(AIRS, BOX)
    assert raw.provenance.n_cells == 5 and "-8.5" in raw.provenance.title
    assert raw.provenance.data_bbox[1] == -8.0 or raw.provenance.data_bbox[1] == -7.0


def test_box_smaller_than_a_cell_uses_the_cell_at_its_centre(tmp_path):
    src = Fake(tmp_path, airs_serve)
    raw = src.fetch(AIRS, region("bbox", (-78.9, -6.9, -78.6, -6.6)))
    assert [(c[1], c[2]) for c in src.calls] == [(-6.75, -78.75)]
    assert "smaller than one grid cell" in raw.provenance.title


def test_grid_centres_per_product():
    def pts(v, box):
        return G.plan_cells(v, region("bbox", box))

    assert len(pts(AIRS, (-79, -8, -77, -5))) == 6
    assert pts(GPM, (-78.5, -6.5, -78.3, -6.4)) == [(-6.45, -78.45), (-6.45, -78.35)]
    assert pts(SOIL, (-78.0, -6.0, -77.75, -5.75))[0] == (-5.875, -77.875)
    m2 = AIRS.model_copy(update={"giovanni_id": "M2IMNXASM_5_12_4_T2M", "grid_deg": 0.5})
    la = {p[0] for p in pts(m2, (-90.0, 43.0, -89.0, 44.0))}
    lo = {p[1] for p in pts(m2, (-90.0, 43.0, -89.0, 44.0))}
    assert la == {43.0, 43.5, 44.0} and lo == {-90.0, -89.375}


def test_box_cap_raises_instead_of_sub_sampling(tmp_path):
    src = Fake(tmp_path, airs_serve)
    big = region("bbox", (-79.0, -8.0, -77.0, -5.0))
    with pytest.raises(GiovanniBoxTooLarge, match=r"box too large for a 0\.1° product.*pick a point"):
        src.fetch(GPM, big)
    assert src.calls == []  # refused before any call


def test_cap_can_be_raised_by_env_and_counts_uncached_calls_only(tmp_path, monkeypatch):
    box = region("bbox", (-78.0, -6.0, -77.55, -5.55))  # 5 x 5 = 25 GPM cells
    monkeypatch.setenv("TD_GIOVANNI_MAX_CALLS", "10")
    src = Fake(tmp_path, lambda gid, lat, lon, s, e: csv_text(month_rows(), lat=lat, lon=lon, unit="mm/hr", res=(.1, .1)))
    with pytest.raises(GiovanniBoxTooLarge):
        src.fetch(GPM, box)
    monkeypatch.setenv("TD_GIOVANNI_MAX_CALLS", "200")
    assert src.fetch(GPM, box).provenance.n_cells == 25 and len(src.calls) == 25
    monkeypatch.setenv("TD_GIOVANNI_MAX_CALLS", "10")  # everything is cached now: no calls, no cap error
    assert src.fetch(GPM, box).provenance.n_cells == 25 and len(src.calls) == 25


# ----------------------------------------------------------------------------- daily and hourly


OMI = AIRS.model_copy(update={
    "giovanni_id": "X_OMI", "cadence": "daily", "min_valid_days": 10, "record_start": "2020-01", "grid_deg": 0.25,
    "units": AIRS.units.model_copy(update={"native": "molecules/cm2"}),
})


def test_daily_to_monthly_needs_min_valid_days(tmp_path):
    p = G.parse_timeseries(fx("giovanni_omi_no2_daily_2020q1.csv"))
    jan = np.array([s.startswith("2020-01") for s in p.stamps])
    n_jan = int(np.isfinite(p.values[jan]).sum())
    assert 0 < n_jan < 31
    months, vals = G.to_months(p.stamps, p.values, "daily", min_valid_days=1)
    assert months == ["2020-01", "2020-02", "2020-03"]
    assert vals[0] == pytest.approx(np.nanmean(p.values[jan]))
    _, strict = G.to_months(p.stamps, p.values, "daily", min_valid_days=n_jan + 1)
    assert np.isnan(strict[0])
    with pytest.raises(ValueError, match="min_valid_days"):
        G.to_months(p.stamps, p.values, "daily", None)


def test_daily_card_through_the_source(tmp_path):
    src = Fake(tmp_path, lambda *a: fx("giovanni_omi_no2_daily_2020q1.csv"), end_year=2020)
    raw = src.fetch(OMI, region("point", (-76.875, -12.125, -76.875, -12.125)))
    assert raw.months == ["2020-01", "2020-02", "2020-03"] and "monthly mean of daily" in raw.provenance.title
    assert len(src.calls) == 1  # daily products are not split


def hourly_rows(year, month, n_valid, value=2.0):
    hours = calendar.monthrange(year, month)[1] * 24
    return [(f"{year}-{month:02d}-{1 + h // 24:02d} {h % 24:02d}:30", value if h < n_valid else "1e+15")
            for h in range(hours)]


def test_hourly_needs_ninety_percent_of_hours():
    jan = hourly_rows(2020, 1, 744)  # all 744 valid
    feb = hourly_rows(2020, 2, 600)  # 600 of 696 = 86%: too few
    mar = hourly_rows(2020, 3, 670)  # 670 of 744 = 90.05%: enough
    rows = jan + feb + mar
    p = G.parse_timeseries(csv_text(rows, undef="1e+15", unit="kg m-3"))
    months, vals = G.to_months(p.stamps, p.values, "hourly")
    assert months == ["2020-01", "2020-02", "2020-03"]
    assert vals[0] == 2.0 and np.isnan(vals[1]) and vals[2] == 2.0
    assert G.MIN_HOURLY_VALID_SHARE == 0.9


def test_real_hourly_fixture_three_days_is_not_a_month():
    p = G.parse_timeseries(fx("giovanni_m2_so4smass_hourly_3days.csv"))
    months, vals = G.to_months(p.stamps, p.values, "hourly")
    assert months == ["2020-01"] and np.isnan(vals[0])


def test_hourly_chunks_are_at_most_ten_years():
    chunks = G.plan_chunks("hourly", "1980-01", 2025)
    assert len(chunks) == 5 and chunks[0][0] == "1980-01-01T00:00:00" and chunks[-1][1] == "2025-12-31T23:59:59"
    assert chunks[1][0] == "1990-01-01T00:00:00" and chunks[0][1] == "1989-12-31T23:59:59"
    assert len(G.plan_chunks("daily", "2005-01", 2024)) == 1 and len(G.plan_chunks("monthly", "2002-09", 2024)) == 1


SO4 = AIRS.model_copy(update={
    "giovanni_id": "M2T1NXAER_5_12_4_SO4SMASS", "cadence": "hourly", "record_start": "2000-01", "grid_deg": 0.5,
    "units": AIRS.units.model_copy(update={"native": "kg m-3"}),
})


def so4_serve(fail=()):
    def serve(gid, lat, lon, start, end):
        if start[:4] in fail:
            return None
        y0, y1 = int(start[:4]), int(end[:4])
        rows = [r for y in range(y0, y1 + 1) for m in (1, 2) for r in hourly_rows(y, m, 10_000, 3.0e-9)]
        return csv_text(rows, lat=lat, lon=lon, undef="1e+15", unit="kg m-3", res=(0.5, 0.625))
    return serve


def test_hourly_chunks_fetched_cached_per_chunk_and_retried_alone(tmp_path, monkeypatch):
    pt = region("point", (-89.375, 43.0, -89.375, 43.0))
    src = Fake(tmp_path, so4_serve(), end_year=2024)
    raw = src.fetch(SO4, pt)
    assert len(src.calls) == 3  # 2000-2009, 2010-2019, 2020-2024
    assert sorted(c[3][:4] for c in src.calls) == ["2000", "2010", "2020"]
    assert raw.months[0] == "2000-01" and raw.values[0] == pytest.approx(3.0e-9)
    assert "monthly mean of hourly" in raw.provenance.title
    assert len(src.calls) == 3 and src.fetch(SO4, pt) is not None and len(src.calls) == 3  # all cached

    # a failing chunk: the others are cached, and only the failed one is asked for again
    src2 = Fake(tmp_path / "b", None, end_year=2024)
    ok = so4_serve()

    def flaky(gid, lat, lon, start, end):
        if start.startswith("2010") and not src2.healed:
            raise LiveSourceUnavailable("NASA Giovanni did not answer within 60 s")
        return ok(gid, lat, lon, start, end)

    src2.serve, src2.healed = flaky, False
    with pytest.raises(LiveSourceUnavailable):
        src2.fetch(SO4, pt)
    src2.calls.clear()
    src2.healed = True
    assert src2.fetch(SO4, pt) is not None
    assert [c[3][:4] for c in src2.calls] == ["2010"]


def test_hourly_chunks_count_toward_the_cap(tmp_path):
    box = region("bbox", (-90.0, 43.0, -88.7, 44.0))  # M2 cells: lon -89.375 and -88.75 (x2 chunks... 3 each)
    src = Fake(tmp_path, so4_serve(), end_year=2024)
    n_cells = len(G.plan_cells(SO4, box))
    assert n_cells * 3 > 5
    import os
    os.environ["TD_GIOVANNI_MAX_CALLS"] = str(n_cells * 3 - 1)
    try:
        with pytest.raises(GiovanniBoxTooLarge):
            src.fetch(SO4, box)
        assert src.calls == []
        os.environ["TD_GIOVANNI_MAX_CALLS"] = str(n_cells * 3)
        assert src.fetch(SO4, box).provenance.n_cells == n_cells and len(src.calls) == n_cells * 3
    finally:
        del os.environ["TD_GIOVANNI_MAX_CALLS"]


def test_no_data_chunk_is_cached_as_empty(tmp_path):
    pt = region("point", (-89.375, 43.0, -89.375, 43.0))
    src = Fake(tmp_path, so4_serve(fail=("2000",)), end_year=2024)
    raw = src.fetch(SO4, pt)
    assert raw.months[0] == "2010-01"
    n = len(src.calls)
    src.fetch(SO4, pt)
    assert len(src.calls) == n  # the 404 chunk is remembered


# ----------------------------------------------------------------------------- offline and cache


def test_offline_reads_the_cache_and_never_the_network(tmp_path):
    online = Fake(tmp_path, airs_serve)
    a = online.fetch(AIRS, BOX)
    off = Fake(tmp_path, None, offline=True, end_year=2030)  # even a different end year finds the cached span
    b = off.fetch(AIRS, BOX)
    assert b.months == a.months and np.array_equal(b.values, a.values)
    assert any(p.name.endswith(".csv") for p in (tmp_path / "giovanni" / "cells").iterdir())


def test_offline_falls_back_to_raw_cells_when_no_series_file(tmp_path):
    online = Fake(tmp_path, airs_serve)
    a = online.fetch(AIRS, BOX)
    shutil.rmtree(tmp_path / "giovanni" / "box")  # only the level-2 cache is left
    b = Fake(tmp_path, None, offline=True).fetch(AIRS, BOX)
    assert np.array_equal(b.values, a.values) and b.provenance.n_cells == a.provenance.n_cells


def test_offline_with_empty_cache_is_no_data(tmp_path, monkeypatch):
    monkeypatch.setenv("TD_GIOVANNI_OFFLINE", "1")
    src = Fake(tmp_path, None, offline=None)
    assert src.offline and src.fetch(AIRS, POINT) is None


def test_offline_partial_cache_counts_missing_cells_as_invalid(tmp_path):
    src = Fake(tmp_path, airs_serve)
    src.fetch(AIRS, BOX)
    shutil.rmtree(tmp_path / "giovanni" / "box")  # level 1 would answer first; test the raw cells
    for p in list((tmp_path / "giovanni" / "cells").glob("*_-5.5000_*.csv")):  # drop the cells at 5.5 S
        p.unlink()
    raw = Fake(tmp_path, None, offline=True).fetch(AIRS, BOX)
    assert raw.provenance.n_cells == 4 and not np.isnan(raw.values).all()


# ----------------------------------------------------------------------------- failures and the token


def test_http_errors_become_live_source_unavailable_without_the_token(tmp_path):
    class Denied(Fake):
        def _http(self, url, token):
            if "/timeseries" in url:
                return 403, json.dumps({"code": "401", "message": "Bad or missing token"})
            return super()._http(url, token)

    with pytest.raises(LiveSourceUnavailable) as e:
        Denied(tmp_path, airs_serve).fetch(AIRS, POINT)
    assert "token" in str(e.value) and TOKEN not in str(e.value)


def test_timeout_is_unavailable(tmp_path):
    def serve(*a):
        raise LiveSourceUnavailable("NASA Giovanni did not answer within 60 s")

    with pytest.raises(LiveSourceUnavailable, match="within 60 s"):
        Fake(tmp_path, serve).fetch(AIRS, POINT)


def test_garbled_reply_is_not_cached(tmp_path):
    src = Fake(tmp_path, lambda *a: "<html>oops</html>")
    with pytest.raises(LiveSourceUnavailable, match="unreadable"):
        src.fetch(AIRS, POINT)
    assert not list((tmp_path / "giovanni").rglob("*.csv"))


def test_missing_token_means_no_live_data_not_a_crash(tmp_path, monkeypatch, caplog):
    monkeypatch.delenv("EARTHDATA_TOKEN")
    monkeypatch.setenv("TD_ENV_FILE", str(tmp_path / "nope.env"))
    src = Fake(tmp_path, airs_serve)
    assert src.fetch(AIRS, POINT) is None and src.calls == []
    assert "live Giovanni data is off" in caplog.text


def test_cached_data_needs_no_token(tmp_path, monkeypatch):
    Fake(tmp_path, airs_serve).fetch(AIRS, POINT)
    monkeypatch.delenv("EARTHDATA_TOKEN")
    monkeypatch.setenv("TD_ENV_FILE", str(tmp_path / "nope.env"))
    assert Fake(tmp_path, airs_serve).fetch(AIRS, POINT) is not None


def test_quota_refuse_and_warn(tmp_path, caplog):
    src = Fake(tmp_path, airs_serve, quota=0.96)
    with pytest.raises(LiveSourceUnavailable, match="quota"):
        src.fetch(AIRS, POINT)
    assert src.calls == []
    caplog.set_level(logging.WARNING)
    src = Fake(tmp_path / "w", airs_serve, quota=0.85)
    assert src.fetch(AIRS, POINT) is not None
    assert any("quota" in r.message and "85%" in r.message for r in caplog.records)


def test_token_never_in_logs_cache_or_provenance(tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    src = Fake(tmp_path, airs_serve)
    raw = src.fetch(AIRS, BOX)
    assert set(src.tokens) == {TOKEN}  # it is sent, as the header value, to every call
    assert TOKEN not in caplog.text and TOKEN not in raw.provenance.model_dump_json()
    for p in (tmp_path / "giovanni").rglob("*"):
        if p.is_file():
            assert TOKEN not in p.read_text()


def test_env_file_parser_and_token_order(tmp_path, monkeypatch):
    f = tmp_path / "x.env"
    f.write_text("# comment\n\nOTHER=1\nexport EARTHDATA_TOKEN = \"file-token\"  \nBAD LINE\n")
    assert G.read_env_file(f) == {"OTHER": "1", "EARTHDATA_TOKEN": "file-token"}
    monkeypatch.delenv("EARTHDATA_TOKEN")
    monkeypatch.setenv("TD_ENV_FILE", str(f))
    assert G.load_token() == "file-token"
    monkeypatch.setenv("EARTHDATA_TOKEN", "env-token")
    assert G.load_token() == "env-token"  # the environment wins
    assert G.read_env_file(tmp_path / "missing") == {}


def test_configured_list_is_cached_on_disk(tmp_path):
    src = Fake(tmp_path, airs_serve)
    assert AIRS.giovanni_id in src.configured_ids()
    assert (tmp_path / "giovanni" / "configured_variables.json").exists()
    off = Fake(tmp_path, None, offline=True)
    assert AIRS.giovanni_id in off.configured_ids()
    assert Fake(tmp_path / "empty", None, offline=True).configured_ids() is None


def test_engine_chain_keeps_the_csv_source_first():
    ctx = EngineContext.from_repo()
    kinds = [s.kind for s in ctx.sources.sources]
    assert kinds[0] == "giovanni_csv" and kinds[-1] == "giovanni_api"


# ----------------------------------------------------------------------------- level-1 cache: box and point series


def test_box_series_is_cached_as_one_small_json_with_provenance(tmp_path):
    src = Fake(tmp_path, airs_serve)
    raw = src.fetch(AIRS, BOX)
    f = tmp_path / "giovanni" / "box" / "AIRS3STM_7_0_SurfAirTemp_A__-79_-8_-77_-5.json"
    doc = json.loads(f.read_text())
    assert doc["unit"] == "K" and doc["prod_name"] == "AIRS3STM_7_0_SurfAirTemp_A" and doc["doi"] == "x"
    assert doc["provenance"]["requested_bbox"] == [-79.0, -8.0, -77.0, -5.0]
    assert doc["provenance"]["n_cells"] == 6 and doc["provenance"]["data_bbox"] == raw.provenance.data_bbox
    assert doc["provenance"]["retrieved_at"] and len(doc["months"]) == len(doc["values"]) == len(raw.months)


def test_box_series_is_read_first_even_offline_with_no_cells(tmp_path):
    a = Fake(tmp_path, airs_serve).fetch(AIRS, BOX)
    shutil.rmtree(tmp_path / "giovanni" / "cells")
    off = Fake(tmp_path, None, offline=True)
    b = off.fetch(AIRS, BOX)
    assert b.months == a.months and np.array_equal(b.values, a.values, equal_nan=True)
    assert b.provenance == a.provenance


def test_box_series_hit_makes_no_calls_online(tmp_path):
    Fake(tmp_path, airs_serve).fetch(AIRS, BOX)
    src = Fake(tmp_path, airs_serve)
    assert src.fetch(AIRS, BOX) is not None and src.calls == []


def test_box_series_keeps_nan_months(tmp_path):
    def serve(gid, lat, lon, s, e):
        return csv_text(month_rows(fn=lambda i: -9999 if i == 2 else 290.0 + i), lat=lat, lon=lon)

    a = Fake(tmp_path, serve).fetch(AIRS, BOX)
    b = Fake(tmp_path, None, offline=True).fetch(AIRS, BOX)
    assert np.isnan(a.values[2]) and np.array_equal(a.values, b.values, equal_nan=True)


def test_series_cache_older_end_year_is_refetched_online_but_used_offline(tmp_path):
    Fake(tmp_path, airs_serve, end_year=2003).fetch(AIRS, BOX)
    newer = Fake(tmp_path, airs_serve, end_year=2004)
    shutil.rmtree(tmp_path / "giovanni" / "cells")
    newer.fetch(AIRS, BOX)
    assert len(newer.calls) == 6  # a newer year exists: asked again
    assert Fake(tmp_path, None, offline=True, end_year=2030).fetch(AIRS, BOX) is not None


def test_unreadable_series_file_is_ignored(tmp_path):
    src = Fake(tmp_path, airs_serve)
    src.fetch(AIRS, BOX)
    (tmp_path / "giovanni" / "box" / "AIRS3STM_7_0_SurfAirTemp_A__-79_-8_-77_-5.json").write_text("{nope")
    again = Fake(tmp_path, airs_serve)
    assert again.fetch(AIRS, BOX) is not None


def test_snap_point_uses_the_card_grid():
    assert G.snap_point(AIRS, 28.61, 77.21) == (28.5, 77.5)       # 1 degree cells: centres at x.5
    assert G.snap_point(AIRS, -3.10, -60.02) == (-3.5, -60.5)
    assert G.snap_point(GPM, -3.12, -60.02) == (-3.15, -60.05)    # 0.1 degree cells
    assert G.snap_point(SOIL, 22.79, 5.52) == (22.875, 5.625)     # 0.25 degree cells
    m2 = CAT.variables["merra2_t2m"]
    assert G.snap_point(m2, 28.61, 77.21) == (28.5, 77.5)         # 0.5 x 0.625, centres on multiples of the step


def test_nearby_points_share_one_point_file_and_one_call(tmp_path):
    src = Fake(tmp_path, airs_serve)
    a = src.fetch(AIRS, region("point", (77.21, 28.61, 77.21, 28.61)))
    b = src.fetch(AIRS, region("point", (77.40, 28.80, 77.40, 28.80)))  # same 1-degree cell
    assert len(src.calls) == 1 and (src.calls[0][1], src.calls[0][2]) == (28.5, 77.5)
    files = list((tmp_path / "giovanni" / "point").iterdir())
    assert [f.name for f in files] == ["AIRS3STM_7_0_SurfAirTemp_A__28.5_77.5.json"]
    assert np.array_equal(a.values, b.values)
    assert a.provenance.requested_bbox == [77.21, 28.61, 77.21, 28.61]
    assert b.provenance.requested_bbox == [77.4, 28.8, 77.4, 28.8]  # each click reports its own point


def test_point_series_is_read_offline_without_cells(tmp_path):
    pt = region("point", (-60.02, -3.10, -60.02, -3.10))
    a = Fake(tmp_path, airs_serve).fetch(AIRS, pt)
    shutil.rmtree(tmp_path / "giovanni" / "cells")
    b = Fake(tmp_path, None, offline=True).fetch(AIRS, pt)
    assert np.array_equal(a.values, b.values) and b.months == a.months


def test_unit_spelling_cm2_matches_superscript():
    assert G.normalize_unit("molecules/cm^2") == G.normalize_unit("molecules/cm²")


def test_series_cache_with_a_different_unit_is_refused(tmp_path):
    Fake(tmp_path, airs_serve).fetch(AIRS, BOX)
    f = tmp_path / "giovanni" / "box" / "AIRS3STM_7_0_SurfAirTemp_A__-79_-8_-77_-5.json"
    doc = json.loads(f.read_text())
    doc["unit"] = "degC"
    f.write_text(json.dumps(doc))
    with pytest.raises(GiovanniUnitMismatch):
        Fake(tmp_path, airs_serve).fetch(AIRS, BOX)


def test_area_mean_is_not_biased_by_a_cell_dropping_out():
    """A wet cell missing in the later years must not make the box look drier (no trend in either cell)."""
    from trend_detective.sources.base import area_mean

    months = [f"{y}-{m:02d}" for y in range(2000, 2020) for m in range(1, 13)]
    dry = np.full(len(months), 1.0)
    wet = np.full(len(months), 9.0)
    wet[len(months) // 2:] = np.nan  # the wet cell stops reporting halfway
    _, plain_like = area_mean([(0.0, months, dry)], 1, 0.5)
    _, out = area_mean([(0.0, months, dry), (0.0, months, wet)], 2, 0.5)
    assert np.allclose(plain_like, 1.0)
    assert np.allclose(out, 5.0)  # both halves read as the two-cell climate: no false drop to 1.0


def test_area_mean_keeps_a_real_trend_when_cells_drop_out_late():
    """True trend 0.3/decade in every cell; two of four cells stop halfway. The box trend must stay 0.3."""
    from trend_detective.sources.base import area_mean

    months = [f"{y}-{m:02d}" for y in range(2000, 2022) for m in range(1, 13)]
    t = np.arange(len(months)) / 12
    season = np.tile(np.sin(np.arange(12) / 12 * 2 * np.pi) * 5, 22)
    cells = []
    for k, base in enumerate([10.0, 12.0, 20.0, 25.0]):
        v = base + season + 0.03 * t
        if k >= 2:
            v[len(months) // 2:] = np.nan
        cells.append((0.0, months, v))
    _, out = area_mean(cells, 4, 0.5)
    slope = np.polyfit(t, out - season, 1)[0]
    assert slope == pytest.approx(0.03, abs=1e-6)
