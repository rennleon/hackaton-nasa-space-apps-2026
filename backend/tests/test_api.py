from fastapi.testclient import TestClient

from trend_detective.api import app

client = TestClient(app)


def test_health_and_catalog():
    assert client.get("/health").json()["status"] == "ok"
    assert {r["id"] for r in client.get("/regions").json()} >= {"cajamarca_west", "wisconsin"}
    assert len(client.get("/glossary").json()) > 10


def test_result_and_analyze():
    r = client.get("/regions/cajamarca_west/variables/airs_rh_surf_day").json()
    assert r["window"]["reason"] == "drift_cut"
    a = client.get("/regions/cajamarca_west/variables/airs_rh_surf_day/analyze",
                   params={"start": "2004-01", "end": "2021-12"}).json()
    assert a["window"]["start"] == "2004-01" and a["window"]["reason"] == "user"


def test_errors():
    assert client.get("/regions/atlantis/variables/airs_rh_surf_day").status_code == 404
    assert client.get("/regions/cajamarca_west/variables/airs_rh_surf_day/analyze",
                      params={"start": "2004-13"}).status_code == 422
    assert client.get("/regions/cajamarca_west/scan", params={"theme": "fire"}).status_code == 404


def test_scan():
    s = client.get("/regions/cajamarca_west/scan", params={"theme": "water"}).json()
    assert s["method"] == "benjamini_hochberg" and s["entries"]
