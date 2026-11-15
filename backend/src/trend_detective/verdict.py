"""Protocol step: the verdict. Labels follow the MVP spec rules table mechanically.

Every user-facing text comes in two registers that say the same thing:
- simple: written for a primary-school child (CLAUDE.md, R5): answer first, short
  sentences, whole numbers, no banned words (p-value, significant, decade, anomaly, ...).
- scientific: the full numbers.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .catalog import RegionCard, VariableCard
from .contract import Certainty, Chip, Label, Season, Selection, Text, ThenNow, Verdict, Window

CERTAINTY: dict[str, Certainty] = {
    "significant": "sure",
    "significant_fragile": "maybe",
    "borderline": "maybe",
    "possibly_changing": "too_soon",
    "no_detectable_change": "too_soon",
    "cant_tell": "cant_tell",
}
METER_WORDS: dict[str, str] = {
    "sure": "Sure it's real",
    "maybe": "Maybe, not sure yet",
    "too_soon": "Too soon to tell",
    "cant_tell": "We can't tell here",
}


def decide(
    p_a: float,
    p_b: float,
    robust_ok: bool,
    years_available: float,
    years_needed: float | None,
    alpha: float = 0.05,
) -> Label:
    sig_a, sig_b = p_a < alpha, p_b < alpha
    if sig_a and sig_b:
        return "significant" if robust_ok else "significant_fragile"
    if sig_a != sig_b:
        return "borderline"
    if years_needed is not None and years_available >= 0.5 * years_needed:
        return "possibly_changing"
    return "no_detectable_change"


def fmt_p(p: float) -> str:
    return "< 0.001" if p < 0.001 else f"= {p:.3f}"


def _lower_first(s: str) -> str:
    return s[:1].lower() + s[1:] if s else s


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


def kid_number(value: float, scale: float) -> str:
    """Whole number, never negative (R5): -3 -> '3 below zero'."""
    n = round(value * scale)
    return f"{abs(n)} below zero" if n < 0 else str(n)


@dataclass
class VerdictInputs:
    variable: VariableCard
    region: RegionCard
    window: Window
    season: Season | None
    slope_per_decade: float
    ci_low: float
    ci_high: float
    p_a: float
    p_b: float
    p_c: float | None
    r1: float
    n_eff: float
    years_needed: float | None
    years_available: float
    alpha: float = 0.05
    warning_chips: list[Chip] = field(default_factory=list)
    checks_run: list[str] = field(default_factory=list)
    then_now: ThenNow | None = None
    selection: Selection | None = None  # stage 1, used only to explain the result afterwards


def _place(region: RegionCard) -> str:
    """Region name inside a sentence: a user-chosen place reads 'your place', not 'Your place'."""
    return "your place" if region.id.startswith("custom") else region.name.simple


def _subject(x: VerdictInputs) -> str:
    s = x.variable.words.subject
    return f"{s} in the {x.season.name.simple}" if x.season else s


def short_record_note(label: Label, x: VerdictInputs) -> list[Text]:
    """Explains, after the fact, why a sure result sits beside "hard to spot with this record" (tracker #5).

    Both are true: the record is short for the TYPICAL change (stage 1), but the change seen here is
    bigger than typical. Never alters selection or the label."""
    sel = x.selection
    if label != "significant" or sel is None or sel.mdt_per_decade is None or sel.expected_per_decade is None:
        return []
    if not any(c.code == "detectability" and c.status == "fail" for c in sel.checks):
        return []
    v, d = x.variable, x.variable.units.decimals
    observed, expected, mdt = abs(x.slope_per_decade), abs(sel.expected_per_decade), sel.mdt_per_decade
    if observed < expected:
        return []
    return [Text(
        simple="This record is short for a typical change. But this change is bigger than typical, so we still see it.",
        scientific=f"Stage-1 detectability failed (MDT ≈ {mdt:.{d}f} {v.units.display}/decade vs expected "
                   f"{expected:.{d}f}), but the observed |slope| {observed:.{d}f} {v.units.display}/decade "
                   "exceeds the expected size, so both decisive tests can still reject no-trend. "
                   "This explains the result; it does not change selection or the label.",
    )]


def build_verdict(label: Label, x: VerdictInputs) -> Verdict:
    v, d = x.variable, x.variable.units.decimals
    w = v.words
    up = x.slope_per_decade > 0
    phrase = w.up if up else w.down
    direction = "increase" if up else "decrease"
    amount = f"{abs(x.slope_per_decade):.{d}f}"
    y0, y1 = x.window.start[:4], x.window.end[:4]
    region_s, region_sc = _place(x.region), x.region.name.scientific
    subj = _subject(x)
    certainty = CERTAINTY[label]
    season_sc = f", {x.season.name.scientific} means" if x.season else ""

    # --- one-sentence answer
    if certainty == "sure":
        answer_s = f"Yes, {subj} {w.verb} {phrase} in {region_s}."
        answer_sc = f"Significant {direction} in {v.name.scientific}, {region_sc} ({y0}–{y1}{season_sc})."
    elif certainty == "maybe":
        answer_s = f"Maybe. {_cap(subj)} might be {phrase} in {region_s}."
        kind = "Borderline" if label == "borderline" else "Significant but not robust"
        answer_sc = f"{kind} {direction} in {v.name.scientific}, {region_sc} ({y0}–{y1}{season_sc})."
    else:
        answer_s = f"Too soon to tell if {subj} {w.verb} changing in {region_s}."
        answer_sc = f"No significant trend in {v.name.scientific}, {region_sc} ({y0}–{y1}{season_sc})."

    # --- how much (then vs now in whole numbers), or how long to wait
    slope_sc = (
        f"Sen's slope {x.slope_per_decade:+.{d}f} {v.units.display} per decade "
        f"(95% CI {x.ci_low:+.{d}f} to {x.ci_high:+.{d}f}), {x.window.start} to {x.window.end}"
    )
    tn = x.then_now
    level_sc = (
        f"; fitted level {tn.value_then:.{d}f} → {tn.value_now:.{d}f} {v.units.display} ({tn.year_then}→{tn.year_now})"
        if tn else ""
    )
    if certainty in ("sure", "maybe") and tn:
        a, b = kid_number(tn.value_then, tn.kid_scale), kid_number(tn.value_now, tn.kid_scale)
        if a == b:
            one = "degree" if tn.kid_label == "degrees" else tn.kid_label
            how_s = f"Since {tn.year_then} it changed by less than 1 {one}."
        else:
            how_s = f"In {tn.year_then}: about {a} {tn.kid_label}. In {tn.year_now}: about {b}."
        how_sc = f"{slope_sc}{level_sc}."
    elif certainty == "too_soon":
        if x.years_needed is not None and x.years_needed > x.years_available:
            more = math.ceil(x.years_needed - x.years_available)
            how_s = f"We need to watch for about {more} more years."
            how_sc = (f"{slope_sc}. Years to detection ≈ {x.years_needed:.0f} vs {x.years_available:.0f} "
                      "available (Weatherhead et al. 1998).")
        else:
            how_s = "The normal ups and downs are still bigger than the change."
            how_sc = f"{slope_sc}. Not significant at α = {x.alpha}."
    else:
        how_s = f"From {y0} to {y1} it changed a little each year."
        how_sc = f"{slope_sc}."

    # --- "Tell me more" sentence
    sci_core = (
        f"{v.name.scientific}, {region_sc}, {x.window.start} to {x.window.end}{season_sc}: {slope_sc}. "
        f"Mann–Kendall (Hamed–Rao) p {fmt_p(x.p_a)}; OLS with n_eff = {x.n_eff:.0f} (r₁ = {x.r1:.2f}) p {fmt_p(x.p_b)}."
    )
    chip_reasons_s = " ".join(c.text.simple for c in x.warning_chips)
    chip_reasons_sc = " ".join(c.text.scientific for c in x.warning_chips)
    per10 = f"about {amount} {v.units.simple} every 10 years"
    if label == "significant":
        more_s = f"From {y0} to {y1} it changed by {per10}. A change this steady is very unlikely to be luck."
        ran = f" Robustness checks run ({', '.join(x.checks_run)}) pass." if x.checks_run else ""
        more_sc = f"{sci_core} Both decisive tests reject no-trend at α = {x.alpha}.{ran}"
        headline_sc = f"Significant {direction}"
    elif label == "significant_fragile":
        more_s = f"From {y0} to {y1} it changed by {per10}. But be careful. {chip_reasons_s}"
        more_sc = f"{sci_core} Both decisive tests reject no-trend at α = {x.alpha}, but: {chip_reasons_sc}"
        headline_sc = f"Significant {direction}, not robust"
    elif label == "borderline":
        more_s = f"It may be changing by {per10}. One of our two checks agrees. The other does not."
        more_sc = f"{sci_core} Only one decisive test rejects no-trend at α = {x.alpha}; treat as a lead."
        headline_sc = "Borderline: tests disagree"
    elif label == "possibly_changing":
        more_s = f"It may be changing by {per10}. But normal ups and downs are still bigger."
        more_sc = f"{sci_core} Not significant at α = {x.alpha}."
        headline_sc = "Not significant yet"
    else:
        more_s = "Normal ups and downs are bigger than any change so far. That does not mean nothing is changing."
        more_sc = (f"{sci_core} Not significant at α = {x.alpha}; record short relative to detection time. "
                   "Absence of evidence is not evidence of no trend.")
        headline_sc = "No detectable trend"

    notes: list[Text] = []
    if x.p_c is not None and x.p_c < x.alpha and not (x.p_a < x.alpha and x.p_b < x.alpha):
        notes.append(Text(
            simple="A quicker check sees a change. Slow swings can fool it, so we don't trust it alone.",
            scientific=f"Seasonal Mann–Kendall p {fmt_p(x.p_c)} ignores autocorrelation and is not decisive; "
                       "it may reflect multi-year variability.",
        ))
    notes.extend(short_record_note(label, x))
    if v.source.type == "model":
        notes.append(Text(
            simple="This is a computer model estimate, not a direct measurement.",
            scientific="Model/reanalysis output; agreement with other products is not independent evidence.",
        ))
    return Verdict(
        label=label,
        certainty=certainty,
        answer=Text(simple=answer_s, scientific=answer_sc),
        how_much=Text(simple=how_s, scientific=how_sc),
        headline=Text(simple=METER_WORDS[certainty], scientific=headline_sc),
        sentence=Text(simple=more_s, scientific=more_sc),
        notes=notes,
    )


def cant_tell(variable: VariableCard, region: RegionCard, reasons: list[Text]) -> Verdict:
    first = reasons[0] if reasons else Text(simple="We don't have enough data.", scientific="Not assessable.")
    rsc = " ".join(r.scientific for r in reasons)
    return Verdict(
        label="cant_tell",
        certainty="cant_tell",
        answer=Text(simple=f"We can't answer this for {_place(region)} yet.",
                    scientific=f"{variable.name.scientific}, {region.name.scientific}: not assessable."),
        how_much=Text(simple=first.simple, scientific=rsc),
        headline=Text(simple=METER_WORDS["cant_tell"], scientific="Not assessable"),
        sentence=Text(simple=first.simple, scientific=f"Failed gates. {rsc}"),
    )
