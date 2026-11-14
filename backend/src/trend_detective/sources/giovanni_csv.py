"""Source for local NASA Giovanni "Time Series, Area-Averaged" CSV exports.

Files live in `<raw_dir>/<region.id>/*.csv`. They are treated as untrusted
input: parsed with plain string handling only.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..catalog import RegionCard, VariableCard
from ..contract import Provenance
from .base import RawSeries

_MISSING_THRESHOLD = -9990.0
_SHAPE_RE = re.compile(r"[?&#]shape=([^&#\s]+)")
_MONTH_RE = re.compile(r"^(\d{4})-(\d{2})")


@dataclass
class ParsedCsv:
    dataset_id: str
    title: str | None
    months: list[str]
    values: np.ndarray
    requested_bbox: list[float] | None
    data_bbox: list[float] | None
    url: str | None
    shape: str | None
    start: str | None
    end: str | None


def _bbox(text: str | None) -> list[float] | None:
    if text is None or not text.strip():
        return None
    try:
        box = [float(p) for p in text.split(",")]
    except ValueError:
        return None
    return box if len(box) == 4 else None


def _float_or_none(text: str) -> float | None:
    try:
        return float(text)
    except ValueError:
        return None


def parse_giovanni_csv(path: Path) -> ParsedCsv:
    path = Path(path)
    with path.open(newline="", encoding="utf-8-sig") as fh:
        rows = [[c.strip() for c in row] for row in csv.reader(fh, skipinitialspace=True)]

    header: dict[str, str] = {}
    fill: float | None = None
    data_start: int | None = None
    column: str | None = None
    for i, row in enumerate(rows):
        if not row or not any(row):
            continue
        key = row[0]
        if key.lower() == "time" and len(row) >= 2:
            column = row[1]
            data_start = i + 1
            break
        value = row[1] if len(row) > 1 else ""
        if key.startswith("Fill Value"):
            fill = _float_or_none(value)
        elif key.endswith(":"):
            header[key[:-1].strip()] = value
    if data_start is None or not column:
        raise ValueError(f"{path.name}: no 'time, <variable>' data header found")

    dataset_id = column.removeprefix("mean_")

    months: list[str] = []
    vals: list[float] = []
    for offset, row in enumerate(rows[data_start:]):
        lineno = data_start + offset + 1
        if not row or not any(row):
            continue
        if len(row) < 2:
            raise ValueError(f"{path.name}: malformed data row at line {lineno}: {row!r}")
        m = _MONTH_RE.match(row[0])
        v = _float_or_none(row[1])
        if m is None or v is None:
            raise ValueError(f"{path.name}: malformed data row at line {lineno}: {row!r}")
        month = f"{m.group(1)}-{m.group(2)}"
        if not 1 <= int(m.group(2)) <= 12:
            raise ValueError(f"{path.name}: bad month at line {lineno}: {row[0]!r}")
        if months and month <= months[-1]:
            raise ValueError(f"{path.name}: months not increasing at line {lineno}: {month}")
        if (fill is not None and v == fill) or v <= _MISSING_THRESHOLD or not np.isfinite(v):
            v = float("nan")
        months.append(month)
        vals.append(v)

    url = header.get("URL to Reproduce Results") or None
    shape_m = _SHAPE_RE.search(url) if url else None
    return ParsedCsv(
        dataset_id=dataset_id,
        title=header.get("Title") or None,
        months=months,
        values=np.asarray(vals, dtype=np.float64),
        requested_bbox=_bbox(header.get("User Bounding Box")),
        data_bbox=_bbox(header.get("Data Bounding Box")),
        url=url,
        shape=shape_m.group(1) if shape_m else None,
        start=header.get("User Start Date") or None,
        end=header.get("User End Date") or None,
    )


class GiovanniCsvSource:
    kind = "giovanni_csv"

    def __init__(self, raw_dir: Path):
        self.raw_dir = Path(raw_dir)
        self._index: dict[str, dict[str, tuple[Path, ParsedCsv]]] = {}

    def _load(self, region_id: str) -> dict[str, tuple[Path, ParsedCsv]]:
        if region_id in self._index:
            return self._index[region_id]
        found: dict[str, tuple[Path, ParsedCsv]] = {}
        region_dir = self.raw_dir / region_id
        if region_dir.is_dir():
            for path in sorted(region_dir.glob("*.csv")):
                try:
                    parsed = parse_giovanni_csv(path)
                except (ValueError, OSError):
                    continue  # skip unreadable/malformed files
                prev = found.get(parsed.dataset_id)
                if prev is None or len(parsed.months) > len(prev[1].months):
                    found[parsed.dataset_id] = (path, parsed)
        self._index[region_id] = found
        return found

    def available(self, region_id: str) -> dict[str, Path]:
        return {k: p for k, (p, _) in self._load(region_id).items()}

    def fetch(self, variable: VariableCard, region: RegionCard) -> RawSeries | None:
        hit = self._load(region.id).get(variable.giovanni_id)
        if hit is None:
            return None
        path, parsed = hit
        return RawSeries(
            months=parsed.months,
            values=parsed.values,
            provenance=Provenance(
                source_kind=self.kind,
                source_ref=path.name,
                title=parsed.title,
                requested_bbox=parsed.requested_bbox,
                data_bbox=parsed.data_bbox,
            ),
        )
