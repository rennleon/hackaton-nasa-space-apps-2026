import json
import math
import os
from pathlib import Path

import numpy as np
import pytest

from trend_detective.catalog import Catalog, Geometry, RegionCard
from trend_detective.contract import Text
from trend_detective.engine import repo_root
from trend_detective.sources import power as P
from trend_detective.sources.power import PowerSource, parse_power, validate_geometry

FIX = Path(__file__).parent / "fixtures"
REG = json.loads((FIX / "power_regional_t2m_cajamarca_2001_2003.json").read_text())
PT = json.loads((FIX / "power_point_cajamarca_2001_2002.json").read_text())
CAT = Catalog.load(repo_root() / "catalog")


def region(kind="bbox", bbox=(-79.0, -8.0, -77.0, -5.0)):
    t = Text(simple="x", scientific="x")
    return RegionCard(id="t", name=t, description=t, regime="user-defined",
                      geometry=Geometry(kind=kind, bbox=list(bbox)), listed=False)


class FakeSource(PowerSource):
    """Serves fixture JSON instead of the network."""

    def __init__(self, doc):
        super().__init__(cache_dir=Path("/nonexistent"), offline=True)
        self.doc = doc
        self.calls = []

    def _load(self, endpoint, param, c, start, end):
        self.calls.append((endpoint, param, c))
        return self.doc, f"https://example.invalid/{endpoint}"


def test_regional_area_mean_and_drop_13():
    s = FakeSource(REG).fetch(CAT.variables["power_t2m"], region())
    assert len(s.months) == 36 and all(not m.endswith("-13") for m in s.months)
    vals = [f["properties"]["parameter"]["T2M"]["200101"] for f in REG["features"]]
    w = [np.cos(np.radians(f["geometry"]["coordinates"][1])) for f in REG["features"]]
    assert s.values[0] == pytest.approx(np.average(vals, weights=w))  # cos(latitude)-weighted, all points present
    assert s.provenance.source_kind == "nasa_power"
    assert s.provenance.requested_bbox == [-79.0, -8.0, -77.0, -5.0]
    assert s.provenance.data_bbox[0] >= -79.0 and s.provenance.data_bbox[3] <= -5.0


def test_fill_values_become_nan():
    doc = json.loads(json.dumps(REG))
    for f in doc["features"]:
        f["properties"]["parameter"]["T2M"]["200102"] = -999.0
    doc["features"][0]["properties"]["parameter"]["T2M"]["200103"] = -999.0
    s = FakeSource(doc).fetch(CAT.variables["power_t2m"], region())
    assert math.isnan(s.values[1])  # every point missing
    ok = [f["properties"]["parameter"]["T2M"]["200103"] for f in doc["features"][1:]]
    # one missing point: the month is kept, estimated from the others plus their usual offsets
    assert math.isfinite(s.values[2]) and min(ok) - 1 <= s.values[2] <= max(ok) + 1


def test_point_endpoint_for_point_and_small_box():
    src = FakeSource(PT)
    s = src.fetch(CAT.variables["power_precip"], region("point", (-78.51, -7.16, -78.51, -7.16)))
    assert src.calls[-1][0] == "point" and len(s.months) == 24
    assert s.values[0] == pytest.approx(PT["properties"]["parameter"]["PRECTOTCORR"]["200101"])
    s2 = src.fetch(CAT.variables["power_t2m"], region("bbox", (-79, -8, -78, -7)))
    assert src.calls[-1] == ("point", "T2M", [-78.5, -7.5]) and "centre" in s2.provenance.title


def test_variable_without_power_param_returns_none():
    src = FakeSource(REG)
    giov = next(v for v in CAT.variables.values() if not v.power_param)
    assert src.fetch(giov, region()) is None and src.calls == []


@pytest.mark.parametrize("kind,bbox", [
    ("bbox", [-79, -8, -77, 15]), ("bbox", [-79, -8, -60, -5]), ("bbox", [-77, -8, -79, -5]),
    ("bbox", [-79, -5, -77, -8]), ("bbox", [-200, -8, -190, -5]), ("bbox", [0, -95, 2, -5]),
    ("point", [10, 95, 10, 95]), ("bbox", [1, 2, 3]), ("bbox", [float("nan"), 0, 1, 1]),
])
def test_validation_errors(kind, bbox):
    with pytest.raises(ValueError):
        validate_geometry(kind, bbox)


def test_offline_without_cache_returns_none(tmp_path):
    assert PowerSource(cache_dir=tmp_path, offline=True).fetch(CAT.variables["power_t2m"], region()) is None


def test_offline_env(monkeypatch, tmp_path):
    monkeypatch.setenv("TD_POWER_OFFLINE", "1")
    monkeypatch.setattr(P, "_http_get_json", lambda url: pytest.fail("network used"))
    assert PowerSource(cache_dir=tmp_path).fetch(CAT.variables["power_t2m"], region()) is None


def test_cache_roundtrip_and_offline_reuse(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(P, "_http_get_json", lambda url: calls.append(url) or REG)
    src = PowerSource(cache_dir=tmp_path, offline=False, end_year=2003)
    a = src.fetch(CAT.variables["power_t2m"], region())
    assert len(calls) == 1 and "User" not in calls[0] and list(tmp_path.glob("*.json"))
    b = PowerSource(cache_dir=tmp_path, offline=True, end_year=2030).fetch(CAT.variables["power_t2m"], region())
    assert len(calls) == 1 and np.allclose(a.values, b.values)  # other end year: falls back to cached span


def test_network_failure_raises_unavailable_and_is_not_cached(tmp_path, monkeypatch):
    """Review finding: an outage must not become a cached 'no data' answer."""
    from trend_detective.engine import EngineContext
    from trend_detective.sources import LiveSourceUnavailable, SourceChain

    def boom(url):
        raise LiveSourceUnavailable("down")

    monkeypatch.setattr(P, "_http_get_json", boom)
    src = PowerSource(cache_dir=tmp_path, offline=False)
    with pytest.raises(LiveSourceUnavailable):
        src.fetch(CAT.variables["power_t2m"], region())
    ctx = EngineContext(CAT, SourceChain([src]))
    with pytest.raises(LiveSourceUnavailable):
        ctx.series("power_t2m", region())
    assert not ctx._cache  # nothing cached, so the next request retries


def test_truncated_reply_is_caught(tmp_path, monkeypatch):
    """Review finding: http.client errors (e.g. IncompleteRead) must not escape as a crash."""
    import http.client
    import urllib.request

    from trend_detective.sources import LiveSourceUnavailable

    class Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            raise http.client.IncompleteRead(b"partial")

    monkeypatch.setattr(urllib.request, "urlopen", lambda req, timeout: Resp())
    monkeypatch.setattr(P.time, "sleep", lambda s: None)
    with pytest.raises(LiveSourceUnavailable):
        PowerSource(cache_dir=tmp_path, offline=False).fetch(CAT.variables["power_t2m"], region())


def test_rejected_request_is_no_data(tmp_path, monkeypatch):
    def rejected(url):
        raise P.PowerRequestRejected("HTTP 422")

    monkeypatch.setattr(P, "_http_get_json", rejected)
    assert PowerSource(cache_dir=tmp_path, offline=False).fetch(CAT.variables["power_t2m"], region()) is None


def test_error_document_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(P, "_http_get_json", lambda url: {"messages": ["bad"]})
    assert PowerSource(cache_dir=tmp_path, offline=False).fetch(CAT.variables["power_t2m"], region()) is None


def test_parse_point_units():
    by_month, coords = parse_power(PT, "RH2M")
    assert len(by_month) == 24 and coords == [[-78.51, -7.16]]


@pytest.mark.skipif(os.environ.get("TD_LIVE") != "1", reason="set TD_LIVE=1 to call NASA POWER")
def test_live_tiny_request(tmp_path):
    s = PowerSource(cache_dir=tmp_path, offline=False, end_year=2002).fetch(
        CAT.variables["power_t2m"], region("point", (-78.51, -7.16, -78.51, -7.16)))
    assert s is not None and s.months[0] == "1981-01" and np.isfinite(s.values).all()


def test_unit_mismatch_is_refused():
    from trend_detective.sources.base import UnitMismatch

    doc = {**REG, "parameters": {"T2M": {"units": "K"}}}
    with pytest.raises(UnitMismatch):
        FakeSource(doc).fetch(CAT.variables["power_t2m"], region())


def test_cell_series_one_per_grid_point_and_none_for_a_point():
    src = FakeSource(REG)
    cells = src.cell_series(CAT.variables["power_t2m"], region())
    assert len(cells) == len(REG["features"]) and all(len(c.months) == 36 for c in cells)
    assert src.cell_series(CAT.variables["power_t2m"], region(kind="point", bbox=(-78.5, -7.2, -78.5, -7.2))) is None
