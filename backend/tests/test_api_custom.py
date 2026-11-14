import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from trend_detective import api
from trend_detective.catalog import Catalog
from trend_detective.engine import EngineContext, repo_root
from trend_detective.sources import SourceChain
from trend_detective.sources.power import PowerSource

FIX = Path(__file__).parent / "fixtures"
REG = json.loads((FIX / "power_regional_t2m_cajamarca_2001_2003.json").read_text())
PT = json.loads((FIX / "power_point_cajamarca_2001_2002.json").read_text())


class FixtureSource(PowerSource):
    def __init__(self):
        super().__init__(cache_dir=Path("/nonexistent"), offline=True)

    def _load(self, endpoint, param, c, start, end):
        doc = REG if endpoint == "regional" else PT
        return doc, "https://example.invalid"


@pytest.fixture()
def client(monkeypatch):
    c = EngineContext(Catalog.load(repo_root() / "catalog"), SourceChain([FixtureSource()]))
    monkeypatch.setattr(api, "ctx", lambda: c)
    api._custom_analyze_cached.cache_clear()
    api._custom_scan_cached.cache_clear()
    return TestClient(api.app)


def test_box(client):
    r = client.get("/custom/variables/power_t2m", params={"bbox": "-79,-8,-77,-5"})
    assert r.status_code == 200
    j = r.json()
    assert j["verdict"]["certainty"] and j["selection"] is not None
    assert j["region"]["id"].startswith("custom_") and j["region"]["name"]["simple"] == "Your place"


def test_point(client):
    r = client.get("/custom/variables/power_precip", params={"lat": -7.16, "lon": -78.51})
    assert r.status_code == 200
    j = r.json()
    assert j["verdict"]["certainty"] and j["region"]["id"].startswith("custom_pt_")


def test_scan(client):
    r = client.get("/custom/scan", params={"theme": "heat", "lat": -7.16, "lon": -78.51})
    assert r.status_code == 200 and r.json()["entries"]


@pytest.mark.parametrize("params", [
    {"bbox": "-80,-8,-68,-5"},
    {"bbox": "-79,-8,-77,10"},
    {"bbox": "a,b,c,d"},
    {"bbox": "1,2,3"},
    {"bbox": "-79,-8,-77,-5", "lat": 1, "lon": 2},
    {},
    {"lat": 1},
    {"lat": 95, "lon": 0},
    {"lat": 0, "lon": 190},
])
def test_bad_input_422(client, params):
    assert client.get("/custom/variables/power_t2m", params=params).status_code == 422


def test_unknown_variable_and_theme(client):
    assert client.get("/custom/variables/nope", params={"lat": 1, "lon": 2}).status_code == 404
    assert client.get("/custom/scan", params={"theme": "nope", "lat": 1, "lon": 2}).status_code == 404


def test_live_outage_is_503_not_a_cached_no_data(monkeypatch):
    """Review finding: NASA POWER down -> 503 (front end shows 'live data is down'), retried next time."""
    from trend_detective import api
    from trend_detective.sources import LiveSourceUnavailable
    from trend_detective.sources import power as P

    def boom(url):
        raise LiveSourceUnavailable("down")

    monkeypatch.setattr(P, "_http_get_json", boom)
    monkeypatch.delenv("TD_POWER_OFFLINE", raising=False)
    api._custom_analyze_cached.cache_clear()
    r = TestClient(api.app).get("/custom/variables/power_t2m", params={"lat": 21.37, "lon": 11.37})
    assert r.status_code == 503 and "unavailable" in r.json()["detail"]


def test_small_box_uses_one_cell_and_passes_cells_gate():
    """Review finding: a box under 2 degrees is one grid cell, so the cells gate must not count the box area."""
    from pathlib import Path

    from trend_detective.catalog import Catalog, Geometry, RegionCard
    from trend_detective.contract import Text
    from trend_detective.gates import fitness

    cat = Catalog.load(Path(__file__).resolve().parents[2] / "catalog")
    t = Text(simple="x", scientific="x")
    reg = RegionCard(id="custom_box", name=t, description=t, regime="user-defined",
                     geometry=Geometry(kind="bbox", bbox=[-78.4, -7.4, -77.6, -6.6]), listed=False)
    cells = next(c for c in fitness(cat.variables["power_t2m"], reg, 40, n_cells=1) if c.code == "cells")
    assert cells.passed and "middle" in cells.detail.simple
