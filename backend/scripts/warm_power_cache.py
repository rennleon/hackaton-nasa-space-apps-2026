"""Fetch NASA POWER data for every catalog region so pre-loaded regions work offline.

Run:  cd backend && uv run python scripts/warm_power_cache.py
Writes raw JSON to data/cache/power/ (to be committed).
"""

from __future__ import annotations

import logging

from trend_detective.engine import EngineContext, repo_root
from trend_detective.sources.power import PowerSource


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    root = repo_root()
    ctx = EngineContext.from_repo(root)
    src = PowerSource(cache_dir=root / "data" / "cache" / "power", offline=False)
    for region in ctx.catalog.regions.values():
        for var in ctx.catalog.variables.values():
            if not var.power_param:
                continue
            s = src.fetch(var, region)
            status = f"{len(s.months)} months {s.months[0]}..{s.months[-1]}" if s else "FAILED"
            print(f"{region.id:22s} {var.id:14s} {status}")


if __name__ == "__main__":
    main()
