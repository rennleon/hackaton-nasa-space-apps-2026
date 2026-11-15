import os

# Tests never call NASA Giovanni; a missing cache means "no data" (like TD_POWER_OFFLINE in CI).
os.environ.setdefault("TD_GIOVANNI_OFFLINE", "1")
