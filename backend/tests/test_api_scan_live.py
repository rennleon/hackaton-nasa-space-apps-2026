"""API: /custom/scan with live-source trouble (availability, 503 only when nothing answered, no caching of outages)."""

import pytest
from fastapi.testclient import TestClient
from synthetic import LIVE_DOWN, make_ctx, make_raw

from trend_detective import api

GOOD = {"slope_per_decade": 0.8, "sd": 1.0}
PLACE = {"theme": "heat", "lat": -7.16, "lon": -78.51}


def client_for(monkeypatch, data):
    ctx, src = make_ctx(data)
    monkeypatch.setattr(api, "ctx", lambda: ctx)
    api._custom_scan_cached.cache_clear()
    api._custom_analyze_cached.cache_clear()
    return TestClient(api.app), ctx, src


def test_partial_outage_is_200_with_fetch_failed_and_is_not_cached(monkeypatch):
    c, _ctx, src = client_for(monkeypatch, {
        "power_t2m": make_raw("1981-01", "2021-12", seed=1, **GOOD),
        "airs_t_surf_day": LIVE_DOWN,
    })
    r = c.get("/custom/scan", params=PLACE)
    assert r.status_code == 200
    by = {e["variable_id"]: e for e in r.json()["entries"]}
    assert by["airs_t_surf_day"]["availability"] == "fetch_failed"
    assert by["power_t2m"]["availability"] == "available"
    assert by["power_t2m"]["instrument_id"] == "merra2" and by["power_t2m"]["yearly_series"]
    # the source recovers: the next request must not replay the outage
    src.data["airs_t_surf_day"] = make_raw("2002-09", "2021-12", seed=2, **GOOD)
    by2 = {e["variable_id"]: e for e in c.get("/custom/scan", params=PLACE).json()["entries"]}
    assert by2["airs_t_surf_day"]["availability"] == "available"
    assert by2["power_t2m"]["cross_check"]["outcome"] == "agree"


def test_complete_outage_is_503(monkeypatch):
    ctx, _ = make_ctx({})
    from trend_detective.sources import LiveSourceUnavailable

    class Down:
        kind = "down"

        def fetch(self, variable, region):
            raise LiveSourceUnavailable("everything is down")

    ctx.sources.sources = [Down()]
    monkeypatch.setattr(api, "ctx", lambda: ctx)
    api._custom_scan_cached.cache_clear()
    r = TestClient(api.app).get("/custom/scan", params=PLACE)
    assert r.status_code == 503 and "unavailable" in r.json()["detail"]


def test_complete_no_data_is_200_not_503(monkeypatch):
    c, _, _ = client_for(monkeypatch, {})
    r = c.get("/custom/scan", params=PLACE)
    assert r.status_code == 200
    assert {e["availability"] for e in r.json()["entries"]} == {"no_data_here"}


@pytest.mark.parametrize("theme", ["heat", "water"])
def test_scan_is_cached_when_everything_answered(monkeypatch, theme):
    c, _, src = client_for(monkeypatch, {"power_t2m": make_raw("1981-01", "2021-12", seed=1, **GOOD)})
    c.get("/custom/scan", params={**PLACE, "theme": theme})
    n = len(src.calls)
    c.get("/custom/scan", params={**PLACE, "theme": theme})
    assert len(src.calls) == n
