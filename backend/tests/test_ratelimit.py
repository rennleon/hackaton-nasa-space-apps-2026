import pytest

from test_api_custom import client  # noqa: F401  (fixture: API on fixture data)
from trend_detective import ratelimit
from trend_detective.ratelimit import Buckets, RateLimited


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def test_burst_then_refill():
    clock = Clock()
    b = Buckets(per_min=60, burst=3, clock=clock)  # one token per second
    for _ in range(3):
        b.take("a")
    with pytest.raises(RateLimited) as e:
        b.take("a")
    assert e.value.retry_after == 1
    b.take("b")  # another client has its own bucket
    clock.t += 1
    b.take("a")
    with pytest.raises(RateLimited):
        b.take("a")
    clock.t += 100  # refill is capped at the burst
    for _ in range(3):
        b.take("a")
    with pytest.raises(RateLimited):
        b.take("a")


def test_zero_disables():
    b = Buckets(per_min=0, burst=0, clock=Clock())
    for _ in range(100):
        b.take("a")


def test_client_ip_proxy(monkeypatch):
    class Req:
        client = type("C", (), {"host": "1.1.1.1"})()
        headers = {"x-forwarded-for": "9.9.9.9, 2.2.2.2"}

    monkeypatch.delenv("TD_TRUST_PROXY", raising=False)
    assert ratelimit.client_ip(Req()) == "1.1.1.1"
    monkeypatch.setenv("TD_TRUST_PROXY", "1")
    assert ratelimit.client_ip(Req()) == "2.2.2.2"  # last entry: the one our proxy added


def test_api_429_per_ip(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(ratelimit, "per_ip", Buckets(60, 2, Clock()))
    p = {"bbox": "-79,-8,-77,-5"}
    assert client.get("/custom/variables/power_t2m", params=p).status_code == 200
    assert client.get("/custom/variables/power_t2m", params=p).status_code == 200
    r = client.get("/custom/variables/power_t2m", params=p)
    assert r.status_code == 429
    assert r.json()["detail"] and r.json()["detail_es"]
    assert int(r.headers["Retry-After"]) >= 1
    assert client.get("/health").status_code == 200  # other endpoints are not limited


def test_global_budget_counts_only_cache_misses(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(ratelimit, "live", Buckets(60, 1, Clock()))
    p = {"bbox": "-79,-8,-77,-5"}
    assert client.get("/custom/variables/power_t2m", params=p).status_code == 200  # miss: spends the 1 token
    assert client.get("/custom/variables/power_t2m", params=p).status_code == 200  # hit: free
    r = client.get("/custom/variables/power_t2m", params={"bbox": "-79,-8,-77,-6"})  # new place: a miss
    assert r.status_code == 429
    assert r.json()["detail_es"] and "Retry-After" in r.headers
