import os

# Tests never call NASA Giovanni; a missing cache means "no data" (like TD_POWER_OFFLINE in CI).
os.environ.setdefault("TD_GIOVANNI_OFFLINE", "1")

# The rate limits (ratelimit.py) are off in tests; test_ratelimit.py builds its own limiters.
for _k in ("TD_RATE_PER_MIN", "TD_RATE_BURST", "TD_LIVE_PER_MIN"):
    os.environ.setdefault(_k, "0")
