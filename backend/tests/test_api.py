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


def test_frozen_model_emissions_make_a_sure_trend_not_robust():
    # MERRA-2 persists emissions after 2008 (Randles et al. 2017): a window across it is never "Sure it's real"
    r = client.get("/regions/cajamarca_highlands/variables/merra2_sulfate").json()
    assert r["verdict"]["certainty"] != "sure"
    assert any(c["code"] == "known_artifact_frozen_emissions_2009-01" for c in r["chips"])
    late = client.get("/regions/cajamarca_highlands/variables/merra2_sulfate/analyze",
                      params={"start": "1980-01", "end": "2008-12"}).json()  # before the freeze: no flag
    assert not any(c["code"].startswith("known_artifact_frozen") for c in late["chips"])
