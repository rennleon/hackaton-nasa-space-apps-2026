import pytest
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


@pytest.mark.parametrize("region,vid,code,start,end", [
    ("cajamarca_highlands", "gpm_precip", "known_artifact_input_change_2014-06", "2001-01", "2024-12"),
    ("cajamarca_highlands", "gldas_soil_moist", "known_artifact_input_change_2008-01", "2002-01", "2020-12"),
])
def test_window_across_a_break_is_never_sure_and_says_why(region, vid, code, start, end):
    r = client.get(f"/regions/{region}/variables/{vid}/analyze", params={"start": start, "end": end}).json()
    assert any(c["code"] == code for c in r["chips"])
    # both tests agree (would be "Sure") and only robustness lowers it; the reason names the break year
    assert r["verdict"]["label"] == "significant_fragile" and r["verdict"]["certainty"] != "sure"
    assert code[-7:-3] in r["verdict"]["sentence"]["simple"]
