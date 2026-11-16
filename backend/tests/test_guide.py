"""The detective guide: keyword route, id validation, the Claude route (mocked) and the endpoint. No network."""

import json
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from trend_detective import api
from trend_detective import guide as g
from trend_detective.catalog import Catalog
from trend_detective.engine import repo_root

CAT = Catalog.load(repo_root() / "catalog")


@pytest.fixture(autouse=True)
def no_real_key(monkeypatch, tmp_path):
    """Never read the developer's real backend/.env or environment key."""
    monkeypatch.delenv(g.ENV_KEY, raising=False)
    monkeypatch.setenv("TD_ENV_FILE", str(tmp_path / "missing.env"))


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
    assert "Pick a place" in en and "Elige un lugar" in es


def test_place_hint():
    assert g.keyword_guide("more smoke in Cajamarca", "en", CAT)["place_hint"] == "Cajamarca"
    assert g.keyword_guide("más humo en Lima Norte", "es", CAT)["place_hint"] == "Lima Norte"
    assert g.keyword_guide("smoke in the summer", "en", CAT)["place_hint"] is None
    assert g.clean_place("12.5, -77") is None  # never coordinates


def test_glossary_expands_query():
    # "NO2" is a glossary term whose definition talks about burning fuel
    assert g.keyword_guide("what about NO2", "en", CAT)["theme"] == "burning_fuel"


# --------------------------------------------------------------------------- id validation


def test_validate_drops_unknown_ids():
    ok = g.validate_llm_output(
        {"theme": "heat", "variables": ["power_t2m", "made_up", "power_t2m", "merra2_t2m"], "place_hint": "Lima",
         "reason": "These show how warm the air is."},
        CAT, "en", "hot in Lima",
    )
    assert ok["variables"] == ["power_t2m", "merra2_t2m"]
    assert ok["source"] == "llm" and ok["place_hint"] == "Lima"


def test_validate_rejects_unknown_theme_and_fills_empty_variables():
    assert g.validate_llm_output({"theme": "nope", "variables": [], "reason": "x"}, CAT, "en", "x") is None
    assert g.validate_llm_output("not a dict", CAT, "en", "x") is None
    out = g.validate_llm_output({"theme": "rain", "variables": ["bogus"], "place_hint": "", "reason": "Rain fits."}, CAT, "en", "x")
    assert out["variables"] and all("rain" in CAT.variables[v].themes for v in out["variables"])


def test_validate_replaces_reason_that_claims_a_result():
    for bad in ("It is getting 3 degrees hotter.", "This proves the heat is rising.", "It is caused by cars."):
        out = g.validate_llm_output({"theme": "heat", "variables": ["power_t2m"], "place_hint": "", "reason": bad}, CAT, "en", "x")
        assert out["reason"] == g._reason("heat", CAT, "en")


def test_validate_place_hint_never_coordinates():
    out = g.validate_llm_output({"theme": "heat", "variables": [], "place_hint": "12.5, -77.0", "reason": "Fits."}, CAT, "en", "hot")
    assert out["place_hint"] is None


# --------------------------------------------------------------------------- Claude route (mocked)


class FakeClient:
    """Stands in for anthropic.Anthropic: records the call, returns a canned response or raises."""

    def __init__(self, response=None, raises=None):
        self.response, self.raises, self.calls = response, raises, []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.calls.append(kw)
        if self.raises:
            raise self.raises
        return self.response


def reply(payload, stop_reason="end_turn", text=None):
    block = SimpleNamespace(type="text", text=text if text is not None else json.dumps(payload))
    return SimpleNamespace(content=[block], stop_reason=stop_reason)


GOOD = {"theme": "smoke_haze", "variables": ["omi_aod", "bogus"], "place_hint": "Lima", "reason": "Smoke makes the air hazy."}


@pytest.fixture()
def with_key(monkeypatch):
    monkeypatch.setenv(g.ENV_KEY, "sk-test-not-real")


def use(monkeypatch, fake):
    monkeypatch.setattr(g, "_make_client", lambda key: fake)
    return fake


def test_llm_happy_path_and_request_shape(monkeypatch, with_key):
    fake = use(monkeypatch, FakeClient(reply(GOOD)))
    out = g.llm_guide("smoke in Lima", "en", CAT)
    assert out == {"theme": "smoke_haze", "variables": ["omi_aod"], "place_hint": "Lima",
                   "reason": "Smoke makes the air hazy.", "source": "llm"}
    kw = fake.calls[0]
    assert kw["model"] == "claude-opus-5-5"
    assert "thinking" not in kw and "temperature" not in kw
    assert kw["output_config"]["effort"] == "low"
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "omi_aod" in kw["system"][0]["text"] and "smoke_haze" in kw["system"][0]["text"]
    assert "Lima" in kw["messages"][0]["content"] and "Language for the reason: English" in kw["messages"][0]["content"]


def test_llm_missing_key_is_none_and_guide_falls_back(monkeypatch):
    fake = use(monkeypatch, FakeClient(reply(GOOD)))
    assert g.llm_guide("smoke", "en", CAT) is None
    assert fake.calls == []
    out = g.guide("more smoke", "en", CAT)
    assert out["source"] == "keywords" and out["theme"] == "smoke_haze"


def test_key_read_from_env_file(monkeypatch, tmp_path):
    f = tmp_path / ".env"
    f.write_text('# c\nANTHROPIC_API_KEY="abc123"\n')
    monkeypatch.setenv("TD_ENV_FILE", str(f))
    assert g.load_api_key() == "abc123"


def test_llm_refusal_and_max_tokens_fall_back(monkeypatch, with_key):
    for reason in ("refusal", "max_tokens"):
        use(monkeypatch, FakeClient(reply(GOOD, stop_reason=reason)))
        assert g.llm_guide("smoke", "en", CAT) is None
        out = g.guide("more smoke", "en", CAT)
        assert out["source"] == "keywords"


def test_llm_bad_json_and_unknown_theme_fall_back(monkeypatch, with_key):
    use(monkeypatch, FakeClient(reply(None, text="not json")))
    assert g.llm_guide("smoke", "en", CAT) is None
    use(monkeypatch, FakeClient(reply({"theme": "zzz", "variables": [], "place_hint": "", "reason": "x"})))
    assert g.llm_guide("smoke", "en", CAT) is None


def _status_error(cls, status):
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("boom", response=httpx.Response(status, request=req), body=None)


@pytest.mark.parametrize(
    "exc",
    [
        anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com")),
        _status_error(anthropic.RateLimitError, 429),
        _status_error(anthropic.APIStatusError, 529),
    ],
)
def test_llm_errors_fall_back_to_keywords(monkeypatch, with_key, exc):
    use(monkeypatch, FakeClient(raises=exc))
    assert g.llm_guide("smoke", "en", CAT) is None
    assert g.guide("more smoke", "en", CAT)["source"] == "keywords"


def test_guide_caps_input_and_rejects_empty(monkeypatch):
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


def test_endpoint_uses_llm_when_available(client, monkeypatch, with_key):
    use(monkeypatch, FakeClient(reply(GOOD)))
    assert client.post("/guide", json={"text": "smoke", "lang": "es"}).json()["source"] == "llm"


def test_validate_injected_claims_fall_back_to_template():
    for bad in ("Cars cause hotter afternoons here.", "Smoke is increasing because of fires.",
                "La lluvia aumenta cada década.", "Most nights are warmer now."):
        out = g.validate_llm_output({"theme": "heat", "variables": ["power_t2m"], "place_hint": "", "reason": bad}, CAT, "en", "x")
        assert out["reason"] == g._reason("heat", CAT, "en"), bad


def test_validate_keeps_only_theme_members_and_typed_places():
    other = next(v for v in CAT.variables if "heat" not in CAT.variables[v].themes)
    out = g.validate_llm_output(
        {"theme": "heat", "variables": [other, "power_t2m"], "place_hint": "Atlantis", "reason": "Fits."},
        CAT, "en", "is it hot here",
    )
    assert other not in out["variables"] and "power_t2m" in out["variables"]
    assert out["place_hint"] != "Atlantis"
