"""Stage 1 of variable selection: is a variable WORTH INVESTIGATING here?

Runs before any trend is judged (challenge Objective 1), so a variable is never
"selected" because it came out significant. Four checks:
  (a) question      - does it fit the theme the user asked about?
  (b) expectation   - is there a cited, published reason to expect change here?
  (c) fitness       - gates 2-3 (coverage, cells, record, completeness, zero months) and known breaks
  (d) detectability - minimum detectable trend (MDT) for this record <= expected trend size

MDT is Weatherhead et al. (1998) inverted, using only the noise of the series
(sigma and lag-1 autocorrelation of the detrended anomalies), never the slope:
    MDT_per_decade = 10 * 3.3 * sigma * sqrt(12/f) / n_years**1.5 * sqrt((1 + phi) / (1 - phi))
with f samples per year (12 monthly, 1 for a season series). For f = 12 this is
Weatherhead's formula for monthly data.
"""

from __future__ import annotations

import math

import numpy as np

from .catalog import RegionCard, VariableCard
from .contract import GateCheck, Selection, SelectionCheck, Text
from .stats import ols_neff


def mdt_per_decade(resid_sd: float, r1: float, n_years: float, samples_per_year: int) -> float | None:
    if not (math.isfinite(resid_sd) and n_years > 0):
        return None
    phi = min(max(r1, 0.0), 0.95)
    per_year = 3.3 * resid_sd * math.sqrt(12 / samples_per_year) / n_years**1.5 * math.sqrt((1 + phi) / (1 - phi))
    return 10 * per_year


def kid_amount(x: float) -> str:
    """Simple-view amount: whole numbers, or 'less than 1' (R5: no decimals for children)."""
    return "less than 1" if abs(x) < 1 else f"about {round(abs(x))}"


def detect_sentences(mdt: float, expected: float | None, u_simple: str) -> tuple[str, bool | None]:
    """Simple-view detectability text, and whether a typical change is detectable (None: no reference size).

    The comparison is made on the real numbers; the words never contradict it after rounding (CLAUDE.md R5,
    tracker #6). Amounts are shown only when the rounded amounts differ, so they can't read "less than 1 ...
    less than 1. Not enough"."""
    if expected is None:
        if abs(mdt) < 1:
            return "We can spot even small changes.", None
        return f"We can spot changes of {kid_amount(mdt)} {u_simple} or more every 10 years.", None
    ok = mdt <= abs(expected)
    if kid_amount(mdt) == kid_amount(expected):
        if ok:
            return "This record is long enough to spot a typical change.", ok
        return "This record can only spot changes bigger than a typical one.", ok
    spot = ("We can spot even small changes." if abs(mdt) < 1
            else f"We can spot changes of {kid_amount(mdt)} {u_simple} or more every 10 years.")
    if ok:
        return f"{spot} A typical change is {kid_amount(expected)} {u_simple}. That's enough to see it.", ok
    return f"{spot} A typical change is {kid_amount(expected)} {u_simple}. We can't see that yet.", ok


def noise_of(t: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """(sigma, phi) of the detrended series: the noise only."""
    _, _, _, r1, _, resid_sd, _ = ols_neff(t, y)
    return resid_sd, r1


def stage1(
    variable: VariableCard,
    region: RegionCard,
    theme_id: str | None,
    gate_checks: list[GateCheck],
    flagged: list,
    t: np.ndarray | None,
    y: np.ndarray | None,
    n_years: float,
    samples_per_year: int,
) -> Selection:
    checks: list[SelectionCheck] = []

    # (a) question
    if theme_id is None or theme_id in variable.themes:
        themes = ", ".join(variable.themes) if theme_id is None else theme_id
        checks.append(SelectionCheck(
            code="question", status="pass",
            detail=Text(simple=f"It helps answer the {themes} question.",
                        scientific=f"Member of theme(s): {themes} (role: {', '.join(variable.themes.values())})."),
        ))
    else:
        checks.append(SelectionCheck(
            code="question", status="fail",
            detail=Text(simple="It doesn't help answer this question.", scientific=f"Not in theme {theme_id}."),
        ))

    # (b) expectation
    exp = region.expectation_for(variable.id)
    if exp:
        checks.append(SelectionCheck(
            code="expectation", status="pass",
            detail=Text(simple=exp.reason.simple, scientific=f"{exp.reason.scientific} Source: {exp.source}"),
        ))
    else:
        checks.append(SelectionCheck(
            code="expectation", status="caution",
            detail=Text(simple="We haven't found a published study that expects a change here yet.",
                        scientific="No cited published expectation recorded for this variable and region."),
        ))

    # (c) fitness + known breaks
    failed = [c for c in gate_checks if not c.passed]
    if failed:
        checks.append(SelectionCheck(
            code="fitness", status="fail",
            detail=Text(simple="; ".join(c.detail.simple.rstrip(".") for c in failed) + ".",
                        scientific=" ".join(c.detail.scientific for c in failed)),
        ))
    else:
        checks.append(SelectionCheck(
            code="fitness", status="pass",
            detail=Text(simple="The data covers this place well enough and for long enough.",
                        scientific="Coverage, grid cells, record length, completeness and zero-month checks pass."),
        ))
    if flagged:
        checks.append(SelectionCheck(
            code="known_breaks", status="caution",
            detail=Text(simple=" ".join(a.note.simple for a in flagged),
                        scientific=" ".join(f"{a.start}: {a.note.scientific}" for a in flagged)),
        ))
    else:
        checks.append(SelectionCheck(
            code="known_breaks", status="pass",
            detail=Text(simple="No known instrument or input changes in these years.",
                        scientific="No catalogued artifact dates inside the window."),
        ))

    # (d) detectability
    expected = (exp.expected_per_decade if exp and exp.expected_per_decade is not None
                else variable.reference_trend_per_decade)
    mdt = None
    if t is not None and y is not None and np.isfinite(y).sum() >= 8:
        sigma, phi = noise_of(t, y)
        mdt = mdt_per_decade(sigma, phi, n_years, samples_per_year)
    u, d = variable.units, variable.units.decimals
    if mdt is None:
        checks.append(SelectionCheck(
            code="detectability", status="caution",
            detail=Text(simple="We couldn't work out how big a change this record can detect.",
                        scientific="MDT not computable (insufficient data)."),
        ))
    elif expected is None:
        simple, _ = detect_sentences(mdt, None, u.simple)
        checks.append(SelectionCheck(
            code="detectability", status="pass",
            detail=Text(simple=simple,
                        scientific=f"MDT ≈ {mdt:.{d}f} {u.display} per decade over {n_years:.1f} years "
                                   "(no reference trend size recorded)."),
        ))
    else:
        simple, ok = detect_sentences(mdt, expected, u.simple)
        ref = exp.source if exp else (variable.reference_source or "reference")
        checks.append(SelectionCheck(
            code="detectability", status="pass" if ok else "fail",
            detail=Text(
                simple=simple,
                scientific=(f"MDT ≈ {mdt:.{d}f} {u.display}/decade over {n_years:.1f} yr vs expected "
                            f"{abs(expected):.{d}f} ({ref}): {'detectable' if ok else 'not detectable'}."),
            ),
        ))

    return Selection(
        worth_investigating=not any(c.status == "fail" for c in checks),
        checks=checks,
        mdt_per_decade=None if mdt is None else round(mdt, 6),
        expected_per_decade=expected,
    )
