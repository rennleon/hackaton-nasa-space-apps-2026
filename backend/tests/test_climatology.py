"""/climatology/grid: long-term mean per grid cell, from a mocked NASA POWER document (no network)."""

import json

import pytest
from fastapi.testclient import TestClient

from trend_detective import api
from trend_detective.sources.power import climatology_cache_path


def _doc(param: str, unit: str, cells):
    feats = [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat, 10.0]},
         "properties": {"parameter": {param: {"JAN": v, "ANN": v}}}}
        for lon, lat, v in cells
    ]
    return {"type": "FeatureCollection", "features": feats, "header": {"fill_value": -999.0},
            "parameters": {param: {"units": unit}}}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TD_REPO_ROOT", str(tmp_path))
    monkeypatch.setenv("TD_POWER_OFFLINE", "1")
    api._climatology_cached.cache_clear()
    return TestClient(api.app)


def _seed(tmp_path, param, box, doc):
    path = climatology_cache_path(param, box, tmp_path / "data" / "cache" / "power")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc))
    return path


def test_cache_name_is_shared_format(tmp_path):
    p = climatology_cache_path("T2M", (-80, -9, -75.5, -5), tmp_path)
    assert p.name == "clim_regional_T2M_-80.00_-9.00_-75.50_-5.00.json"


def test_grid_from_cache(client, tmp_path):
    cells = [(-80.0, -9.0, 20.52), (-79.375, -9.0, 19.84), (-79.0, -8.5, -999.0)]
    _seed(tmp_path, "T2M", (-80, -9, -75, -5), _doc("T2M", "C", cells))
    r = client.get("/climatology/grid", params={"param": "T2M", "bbox": "-80,-9,-75,-5"})
    assert r.status_code == 200
    j = r.json()
    assert j["param"] == "T2M" and j["units"] == "°C" and j["cell_deg"] == [0.5, 0.625]
    assert "MERRA-2" in j["source"]
    assert j["cells"] == [[-80.0, -9.0, 20.52], [-79.375, -9.0, 19.84]]  # fill value dropped


def test_air_layer_uses_one_degree_cells(client, tmp_path):
    _seed(tmp_path, "AOD_55", (-80, -9, -75, -5), _doc("AOD_55", "dimensionless", [(-79.5, -8.5, 0.26)]))
    j = client.get("/climatology/grid", params={"param": "AOD_55", "bbox": "-80,-9,-75,-5"}).json()
    assert j["cell_deg"] == [1.0, 1.0] and j["cells"] == [[-79.5, -8.5, 0.26]]


def test_offline_without_cache_is_503(client):
    r = client.get("/climatology/grid", params={"param": "T2M", "bbox": "-80,-9,-75,-5"})
    assert r.status_code == 503


def test_unexpected_unit_is_refused(client, tmp_path):
    _seed(tmp_path, "T2M", (-80, -9, -75, -5), _doc("T2M", "K", [(-80.0, -9.0, 293.0)]))
    assert client.get("/climatology/grid", params={"param": "T2M", "bbox": "-80,-9,-75,-5"}).status_code == 503


@pytest.mark.parametrize("params", [
    {"param": "NOPE", "bbox": "-80,-9,-75,-5"},      # not whitelisted
    {"param": "T2M", "bbox": "-80,-9,-79,-5"},        # 1 degree wide: too small
    {"param": "T2M", "bbox": "-80,-9,-60,-5"},        # 20 degrees wide: too big
    {"param": "T2M", "bbox": "a,b,c,d"},
    {"param": "T2M", "bbox": "-80,-9,-75"},
])
def test_bad_input_422(client, params):
    assert client.get("/climatology/grid", params=params).status_code == 422
