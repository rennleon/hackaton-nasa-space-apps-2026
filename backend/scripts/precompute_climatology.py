"""Precompute the "where does it happen?" map layers for the offline demo.

For each pre-loaded region and each ready-made example point, fetch a 10 x 10 degree window centred on it from
the NASA POWER climatology endpoint (one request per parameter) and write
`web/public/data/climatology/<place_id>_<PARAM>.json` plus `index.json` (place id -> window). The web's static
client picks the window that contains the centre of the map view it is asked for.

Run: uv run python scripts/precompute_climatology.py [--out PATH]   (needs network, or a warm data/cache/power)
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from precompute import EXAMPLES, WHERE_REGIONS

from trend_detective.catalog import Catalog
from trend_detective.engine import repo_root
from trend_detective.sources.power import CLIMATOLOGY_PARAMS, fetch_climatology

HALF_DEG = 5.0  # windows are 10 x 10 degrees, the most NASA POWER's regional endpoint allows


def window(lon: float, lat: float) -> list[float]:
    """10 x 10 degree box on whole degrees around a centre (the same grid the web snaps its requests to)."""
    cx, cy = math.floor(lon + 0.5), math.floor(lat + 0.5)
    return [cx - HALF_DEG, cy - HALF_DEG, cx + HALF_DEG, cy + HALF_DEG]


def places() -> list[tuple[str, list[float]]]:
    cat = Catalog.load(repo_root() / "catalog")
    out: list[tuple[str, list[float]]] = []
    for rid in WHERE_REGIONS:
        w, s, e, n = cat.regions[rid].geometry.bbox
        out.append((rid, window((w + e) / 2, (s + n) / 2)))
    for rid, lat, lon, *_ in EXAMPLES:
        out.append((rid, window(lon, lat)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=repo_root() / "web" / "public" / "data" / "climatology")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    index = []
    for pid, box in places():
        for param in CLIMATOLOGY_PARAMS:
            doc = fetch_climatology(param, box)
            (args.out / f"{pid}_{param}.json").write_text(
                json.dumps({**doc, "bbox": box}, separators=(",", ":")) + "\n", encoding="utf-8")
            print(f"{pid} {param}: {len(doc['cells'])} cells")
        index.append({"id": pid, "bbox": box, "params": list(CLIMATOLOGY_PARAMS)})
    lines = ",\n".join(" " + json.dumps(e, separators=(",", ":")) for e in index)
    (args.out / "index.json").write_text(f"[\n{lines}\n]\n", encoding="utf-8")


if __name__ == "__main__":
    main()
