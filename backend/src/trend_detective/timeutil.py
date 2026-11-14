"""Month helpers. A month is the string "YYYY-MM"."""

from __future__ import annotations


def month_index(m: str) -> int:
    """Months since year 0 (monotonic integer)."""
    return int(m[:4]) * 12 + int(m[5:7]) - 1


def from_index(i: int) -> str:
    return f"{i // 12:04d}-{i % 12 + 1:02d}"


def month_add(m: str, k: int) -> str:
    return from_index(month_index(m) + k)


def month_range(start: str, end: str) -> list[str]:
    """Inclusive list of months from start to end."""
    return [from_index(i) for i in range(month_index(start), month_index(end) + 1)]


def month_to_float(m: str) -> float:
    """Decimal year at the middle of the month (2002-01 -> 2002.0417)."""
    return int(m[:4]) + (int(m[5:7]) - 0.5) / 12


def calendar_month(m: str) -> int:
    return int(m[5:7])


def year_of(m: str) -> int:
    return int(m[:4])
