"""Tiny in-process rate limits for the live `/custom/*` endpoints (each live call may hit NASA).

Two token buckets: one per client IP, and one global budget of uncached live computations.
Env (read at import): TD_RATE_PER_MIN (default 20), TD_RATE_BURST (10), TD_LIVE_PER_MIN (60);
a value of 0 turns that limit off. TD_TRUST_PROXY=1 reads the client IP from the last
X-Forwarded-For entry (the one our own proxy added). Per process: no Redis, resets on restart.
"""

from __future__ import annotations

import math
import os
import threading
import time
from collections.abc import Callable
from functools import wraps

from fastapi import Request


class RateLimited(Exception):
    def __init__(self, retry_after: int):
        super().__init__("rate limited")
        self.retry_after = retry_after


MESSAGE = "Too many questions at once. Please wait a little and try again."
MESSAGE_ES = "Demasiadas preguntas a la vez. Espera un poquito y vuelve a intentar."


class Buckets:
    """Token buckets keyed by string. `per_min` tokens refill each minute, up to `burst`."""

    def __init__(self, per_min: float, burst: float, clock: Callable[[], float] = time.monotonic):
        self.rate = per_min / 60.0
        self.burst = burst
        self.clock = clock
        self._lock = threading.Lock()
        self._state: dict[str, tuple[float, float]] = {}  # key -> (tokens, last time)

    def take(self, key: str = "") -> None:
        """Spend one token or raise RateLimited(seconds to wait)."""
        if self.rate <= 0 or self.burst <= 0:
            return  # disabled
        with self._lock:
            now = self.clock()
            tokens, last = self._state.get(key, (self.burst, now))
            tokens = min(self.burst, tokens + (now - last) * self.rate)
            if tokens < 1:
                self._state[key] = (tokens, now)
                raise RateLimited(max(1, math.ceil((1 - tokens) / self.rate)))
            self._state[key] = (tokens - 1, now)
            if len(self._state) > 10_000:  # forget clients whose bucket is full again
                full = [k for k, (t, ts) in self._state.items() if t + (now - ts) * self.rate >= self.burst]
                for k in full:
                    del self._state[k]


def _env(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


per_ip = Buckets(_env("TD_RATE_PER_MIN", 20), _env("TD_RATE_BURST", 10))
_live_per_min = _env("TD_LIVE_PER_MIN", 60)
live = Buckets(_live_per_min, _live_per_min)


def client_ip(request: Request) -> str:
    if os.environ.get("TD_TRUST_PROXY") == "1":
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded.strip():
            return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def limit_client(request: Request) -> None:
    """FastAPI dependency for the `/custom/*` endpoints."""
    per_ip.take(client_ip(request))


def counts_as_live(fn: Callable) -> Callable:
    """Put under @lru_cache: the budget is spent only when a computation really runs (a cache miss)."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        live.take()
        return fn(*args, **kwargs)

    return wrapper
