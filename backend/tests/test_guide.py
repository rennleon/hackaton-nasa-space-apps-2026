"""The detective guide: keyword route and the endpoint. No network."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from trend_detective import api
from trend_detective import guide as g
from trend_detective.catalog import Catalog
from trend_detective.engine import repo_root

CAT = Catalog.load(repo_root() / "catalog")


# --------------------------------------------------------------------------- keywords


@pytest.mark.parametrize(
    ("text", "lang", "theme"),
    [
        ("Is there more smoke from wildfires?", "en", "smoke_haze"),
        ("the air is hazy and smoky", "en", "smoke_haze"),
        ("are my nights getting warmer", "en", "warm_nights"),
        ("hot afternoons", "en", "hot_afternoons"),
        ("is it getting hotter", "en", "heat"),
        ("will there be drought? less rain", "en", "rain"),
        ("humid and damp", "en", "damp_air"),
        ("my family farm and crops", "en", "soil"),
        ("cars and burning fuel", "en", "burning_fuel"),
        ("hay más humo en el aire", "es", "smoke_haze"),
        ("¿Hay más calor?", "es", "heat"),
        ("la sequía y la lluvia", "es", "rain"),
        ("las noches", "es", "warm_nights"),
        ("las tardes calurosas", "es", "hot_afternoons"),
        ("el suelo de mi chacra", "es", "soil"),
    ],
)
def test_keyword_theme(text, lang, theme):
    out = g.keyword_guide(text, lang, CAT)
    assert out["theme"] == theme
    assert out["source"] == "keywords"
    assert 1 <= len(out["variables"]) <= 4
    # every returned variable is in the catalog and belongs to the theme
    for vid in out["variables"]:
        assert theme in CAT.variables[vid].themes


def test_keyword_no_match():
    out = g.keyword_guide("zzz qqq", "en", CAT)
    assert out["theme"] is None and out["variables"] == []
    assert out["reason"] == g.NO_MATCH["en"]
    assert g.keyword_guide("zzz qqq", "es", CAT)["reason"] == g.NO_MATCH["es"]


def test_keyword_reason_language_and_no_ids():
    en = g.keyword_guide("more smoke", "en", CAT)["reason"]
    es = g.keyword_guide("más humo", "es", CAT)["reason"]
    assert "Smoke" in en or "smoke" in en.lower()
    assert "Open it" in en and "Ábrela" in es


def test_place_hint():
    assert g.keyword_guide("more smoke in Cajamarca", "en", CAT)["place_hint"] == "Cajamarca"
    assert g.keyword_guide("más humo en Lima Norte", "es", CAT)["place_hint"] == "Lima Norte"
    assert g.keyword_guide("smoke in the summer", "en", CAT)["place_hint"] is None
    assert g.clean_place("12.5, -77") is None  # never coordinates


def test_glossary_expands_query():
    # "NO2" is a glossary term whose definition talks about burning fuel
    assert g.keyword_guide("what about NO2", "en", CAT)["theme"] == "burning_fuel"


def test_guide_caps_input_and_rejects_empty():
    with pytest.raises(ValueError):
        g.guide("   ", "en", CAT)
    assert len(g.clean_text("a" * 1000)) == g.MAX_CHARS


# --------------------------------------------------------------------------- endpoint


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(api, "ctx", lambda: SimpleNamespace(catalog=CAT))
    return TestClient(api.app)


def test_endpoint_keywords(client):
    r = client.post("/guide", json={"text": "more smoke in Cajamarca", "lang": "en"})
    assert r.status_code == 200
    body = r.json()
    assert body["theme"] == "smoke_haze" and body["source"] == "keywords" and body["place_hint"] == "Cajamarca"
    assert set(body) == {"theme", "variables", "place_hint", "reason", "source"}


def test_endpoint_empty_is_400(client):
    assert client.post("/guide", json={"text": "   ", "lang": "en"}).status_code == 400
    assert client.post("/guide", json={"lang": "en"}).status_code == 422
