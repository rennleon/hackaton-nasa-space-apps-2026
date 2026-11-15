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

MAX_MORE_YEARS = 30  # project choice: beyond this a 'watch N more years' number is not meaningful to show

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
METER_WORDS_ES: dict[str, str] = {
    "sure": "Seguro que es real",
    "maybe": "Quizás, aún no estamos seguros",
    "too_soon": "Es muy pronto para saberlo",
    "cant_tell": "No podemos saberlo aquí",
}
# Names of the robustness checks (engine.checks_run) in Spanish, for the scientific sentence.
CHECK_NAMES_ES: dict[str, str] = {
    "leave-one-year-out": "omitir un año a la vez",
    "drift years included": "incluir los años con deriva",
    "cross-check source": "fuente de contraste",
    "neighbouring box": "caja vecina",
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


def _place_es(region: RegionCard) -> str:
    """Spanish region name inside a sentence ('en tu lugar', 'en Cajamarca (zona alta)')."""
    if region.id.startswith("custom"):
        return "tu lugar"
    name = region.name.simple_es or region.name.simple
    return _lower_first(name) if name.split(" ")[0] in ("Las", "Los", "La", "El") else name


def _subject_es(x: VerdictInputs) -> str:
    """Spanish subject with its season: 'las tardes en la temporada de lluvias'."""
    s = x.variable.words_es.subject  # type: ignore[union-attr]
    if not x.season:
        return s
    name = x.season.name.simple_es or x.season.name.simple
    art = "la" if name.startswith(("temporada", "época", "estación")) else "el"
    return f"{s} en {art} {name}"


def kid_value_es(value: float, scale: float, label: str) -> str:
    """Whole number with its label, never negative (R5): -3 degrees -> '3 grados bajo cero'."""
    n = round(value * scale)
    return f"{abs(n)} {label} bajo cero" if n < 0 else f"{n} {label}"


def _unos_es(label: str) -> str:
    """'unos' before a masculine label, 'unas' before 'unidades ...'."""
    return "unas" if label.startswith("unidades") else "unos"


def less_than_one(label: str) -> str:
    """'less than 1 <unit>' for a kid label, singular where the label is a plural noun (never '1 units')."""
    if label.startswith("on "):
        return f"less than 1 point {label}"
    for plural, one in (("degrees", "degree"), (" units", " unit")):
        if label.endswith(plural):
            return f"less than 1 {label[: -len(plural)] + one}"
    return f"less than 1 {label}"


def amount_en(n: int, label: str) -> str:
    """'<n> <unit>' for a kid label, singular for 1 ('1 point on the haze scale', '2 degrees')."""
    if label.startswith("on "):
        return f"{n} point{'' if n == 1 else 's'} {label}"
    for plural, one in (("degrees", "degree"), (" units", " unit")):
        if label.endswith(plural) and n == 1:
            return f"1 {label[: -len(plural)] + one}"
    return f"{n} {label}"


def amount_es(n: int, label: str) -> str:
    """Spanish '<n> <unidad>' with singular agreement for 1."""
    if label.startswith("en "):
        return f"{n} punto{'' if n == 1 else 's'} {label}"
    if label == "grados" and n == 1:
        return "1 grado"
    if label.startswith("unidades") and n == 1:
        return f"1 unidad{label[len('unidades'):]}"
    return f"{n} {label}"


def less_than_one_es(label: str) -> str:
    """Spanish 'menos de 1 <unidad>' with singular agreement ('grado', 'unidad ...')."""
    if label.startswith("en "):
        return f"menos de 1 punto {label}"
    if label == "grados":
        return "menos de 1 grado"
    if label.startswith("unidades"):
        return f"menos de 1 unidad{label[len('unidades'):]}"
    return f"menos de 1 {label}"


def has_es(v: VariableCard) -> bool:
    return v.words_es is not None and v.kid_units.label_es is not None and v.units.simple_es is not None


def _subject(x: VerdictInputs) -> str:
    s = x.variable.words.subject
    # "dry-season afternoons" keeps the answer within the R5 sentence length
    return f"{x.season.name.simple.replace(' season', '-season')} {s}" if x.season else s


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
        simple_es="Este registro es corto para un cambio típico. Pero este cambio es mayor que el típico, así que aún lo vemos.",
        scientific_es=f"La detectabilidad de la etapa 1 no se cumple (MDT ≈ {mdt:.{d}f} {v.units.display}/década frente a "
                      f"{expected:.{d}f} esperado), pero la |pendiente| observada, {observed:.{d}f} {v.units.display}/década, "
                      "supera el tamaño esperado, así que las dos pruebas decisivas aún pueden rechazar la ausencia de tendencia. "
                      "Esto explica el resultado; no cambia la selección ni la etiqueta.",
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

    # Spanish parts (all None when the card has no Spanish words yet)
    es = has_es(v)
    answer_es = answer_sc_es = how_es = how_sc_es = more_es = more_sc_es = headline_sc_es = None
    if es:
        we = v.words_es
        phrase_es = we.up if up else we.down
        direction_es = "aumento" if up else "disminución"
        adj_es = "significativo" if up else "significativa"
        region_es, region_sc_es = _place_es(x.region), x.region.name.scientific_es or region_sc
        subj_es = _subject_es(x)
        season_sc_es = f", medias de {x.season.name.scientific_es or x.season.name.scientific}" if x.season else ""
        name_sc_es = v.name.scientific_es or v.name.scientific
        u_es = v.units.simple_es

    # --- one-sentence answer
    if certainty == "sure":
        answer_s = f"Yes, {subj} {w.verb} {phrase} in {region_s}."
        answer_sc = f"Significant {direction} in {v.name.scientific}, {region_sc} ({y0}–{y1}{season_sc})."
        if es:
            answer_es = f"Sí, {subj_es} {phrase_es} en {region_es}."
            answer_sc_es = f"{direction_es.capitalize()} {adj_es} en {name_sc_es}, {region_sc_es} ({y0}–{y1}{season_sc_es})."
    elif certainty == "maybe":
        answer_s = f"Maybe. {_cap(subj)} might be {phrase} in {region_s}."
        kind = "Borderline" if label == "borderline" else "Significant but not robust"
        answer_sc = f"{kind} {direction} in {v.name.scientific}, {region_sc} ({y0}–{y1}{season_sc})."
        if es:
            answer_es = f"Quizás {subj_es} {phrase_es} en {region_es}."
            kind_es = (f"{direction_es.capitalize()} en el límite" if label == "borderline"
                       else f"{direction_es.capitalize()} {adj_es} pero no robust{'o' if up else 'a'}")
            answer_sc_es = f"{kind_es} en {name_sc_es}, {region_sc_es} ({y0}–{y1}{season_sc_es})."
    else:
        answer_s = f"Too soon to tell if {subj} {w.verb} changing in {region_s}."
        answer_sc = f"No significant trend in {v.name.scientific}, {region_sc} ({y0}–{y1}{season_sc})."
        if es:
            answer_es = f"Aún no sabemos si {subj_es} {we.changing} en {region_es}."
            answer_sc_es = f"Sin tendencia significativa en {name_sc_es}, {region_sc_es} ({y0}–{y1}{season_sc_es})."

    # --- how much (then vs now in whole numbers), or how long to wait
    slope_sc = (
        f"Sen's slope {x.slope_per_decade:+.{d}f} {v.units.display} per decade "
        f"(95% CI {x.ci_low:+.{d}f} to {x.ci_high:+.{d}f}), {x.window.start} to {x.window.end}"
    )
    slope_sc_es = (
        f"Pendiente de Sen {x.slope_per_decade:+.{d}f} {v.units.display} por década "
        f"(IC 95 % {x.ci_low:+.{d}f} a {x.ci_high:+.{d}f}), {x.window.start} a {x.window.end}"
    )
    tn = x.then_now
    level_sc = (
        f"; fitted level {tn.value_then:.{d}f} → {tn.value_now:.{d}f} {v.units.display} ({tn.year_then}→{tn.year_now})"
        if tn else ""
    )
    level_sc_es = level_sc.replace("fitted level", "nivel ajustado")
    if certainty in ("sure", "maybe") and tn:
        # then/now are points on the fitted trend line. Whole numbers can distort a small change (1.5 shown as
        # "6 then 7"), so when rounding moves the step by more than half a unit we say the size of the change
        # instead; the direction word is always there.
        a, b = kid_number(tn.value_then, tn.kid_scale), kid_number(tn.value_now, tn.kid_scale)
        a_n, b_n = round(tn.value_then * tn.kid_scale), round(tn.value_now * tn.kid_scale)
        change = (tn.value_now - tn.value_then) * tn.kid_scale
        up = change > 0
        size = max(1, round(abs(change)))
        if a_n == b_n:
            how_s = f"Since {tn.year_then} it went {'up' if up else 'down'} by {less_than_one(tn.kid_label)}."
        elif abs((b_n - a_n) - change) > 0.5:
            how_s = f"Since {tn.year_then} it went {'up' if up else 'down'} by about {amount_en(size, tn.kid_label)}."
        else:
            how_s = f"In {tn.year_then}: about {a} {tn.kid_label}. In {tn.year_now}: about {b}."
        how_sc = f"{slope_sc}{level_sc}."
        if es:
            lab = v.kid_units.label_es
            verb_es = "subió" if up else "bajó"
            if a_n == b_n:
                how_es = f"Desde {tn.year_then} {verb_es} {less_than_one_es(lab)}."
            elif abs((b_n - a_n) - change) > 0.5:
                how_es = f"Desde {tn.year_then} {verb_es} {_unos_es(lab)} {amount_es(size, lab)}."
            else:
                how_es = (f"En {tn.year_then}: {_unos_es(lab)} {kid_value_es(tn.value_then, tn.kid_scale, lab)}. "
                          f"En {tn.year_now}: {_unos_es(lab)} {kid_value_es(tn.value_now, tn.kid_scale, lab)}.")
            how_sc_es = f"{slope_sc_es}{level_sc_es}."
    elif certainty == "too_soon":
        # Weatherhead's n* is evaluated at the OBSERVED slope, which here is not significant: when that slope is
        # tiny, n* explodes (hundreds of years) and the number means nothing. Give a number only while it is
        # plausible -- at most as many more years as we already have, and at most MAX_MORE_YEARS.
        more = math.ceil(x.years_needed - x.years_available) if x.years_needed is not None else None
        if more is not None and 0 < more <= min(MAX_MORE_YEARS, x.years_available):
            how_s = f"We need to watch for about {more} more years."
            how_sc = (f"{slope_sc}. Years to detection ≈ {x.years_needed:.0f} vs {x.years_available:.0f} "
                      "available (Weatherhead et al. 1998), evaluated at the observed slope.")
            if es:
                how_es = f"Necesitamos mirar unos {more} años más."
                how_sc_es = (f"{slope_sc_es}. Años hasta la detección ≈ {x.years_needed:.0f} frente a "
                             f"{x.years_available:.0f} disponibles (Weatherhead et al. 1998), con la pendiente observada.")
        elif more is not None and more > 0:
            how_s = "This change is too small to see in these years."
            how_sc = (f"{slope_sc}. Not significant at α = {x.alpha}; at the observed slope, detection would need far "
                      f"longer than the {x.years_available:.0f} years available, so no waiting time is given.")
            if es:
                how_es = "Este cambio es demasiado pequeño para verlo en estos años."
                how_sc_es = (f"{slope_sc_es}. No significativo con α = {x.alpha}; con la pendiente observada, detectarlo "
                             f"necesitaría mucho más que los {x.years_available:.0f} años disponibles, así que no damos un tiempo de espera.")
        else:
            how_s = "The normal ups and downs are still bigger than the change."
            how_sc = f"{slope_sc}. Not significant at α = {x.alpha}."
            if es:
                how_es = "Los altibajos normales aún son mayores que el cambio."
                how_sc_es = f"{slope_sc_es}. No significativo con α = {x.alpha}."
    else:
        how_s = f"From {y0} to {y1} it changed a little each year."
        how_sc = f"{slope_sc}."
        if es:
            how_es = f"De {y0} a {y1} cambió un poco cada año."
            how_sc_es = f"{slope_sc_es}."

    # --- "Tell me more" sentence
    sci_core = (
        f"{v.name.scientific}, {region_sc}, {x.window.start} to {x.window.end}{season_sc}: {slope_sc}. "
        f"Mann–Kendall (Hamed–Rao) p {fmt_p(x.p_a)}; OLS with n_eff = {x.n_eff:.0f} (r₁ = {x.r1:.2f}) p {fmt_p(x.p_b)}."
    )
    chip_reasons_s = " ".join(c.text.simple for c in x.warning_chips)
    chip_reasons_sc = " ".join(c.text.scientific for c in x.warning_chips)
    per10 = f"about {amount} {v.units.simple} every 10 years"
    if es:
        sci_core_es = (
            f"{name_sc_es}, {region_sc_es}, {x.window.start} a {x.window.end}{season_sc_es}: {slope_sc_es}. "
            f"Mann–Kendall con corrección de Hamed–Rao p {fmt_p(x.p_a)}; MCO con n_eff = {x.n_eff:.0f} "
            f"(r₁ = {x.r1:.2f}) p {fmt_p(x.p_b)}."
        )
        chip_reasons_es = " ".join(c.text.simple_es or c.text.simple for c in x.warning_chips)
        chip_reasons_sc_es = " ".join(c.text.scientific_es or c.text.scientific for c in x.warning_chips)
        per10_es = f"unos {amount} {u_es} cada 10 años"
        ran_es = ""
        if x.checks_run:
            names = ", ".join(CHECK_NAMES_ES.get(c, c) for c in x.checks_run)
            ran_es = f" Comprobaciones de robustez hechas ({names}): ninguna contradice la tendencia."
    if label == "significant":
        more_s = f"From {y0} to {y1} it changed by {per10}. It is very unlikely this is luck."
        ran = f" Robustness checks run ({', '.join(x.checks_run)}): none contradicts the trend." if x.checks_run else ""
        more_sc = f"{sci_core} Both decisive tests reject no-trend at α = {x.alpha}.{ran}"
        headline_sc = f"Significant {direction}"
        if es:
            more_es = (f"De {y0} a {y1} cambió {per10_es}. "
                       "Es muy poco probable que esto sea pura suerte.")
            more_sc_es = f"{sci_core_es} Las dos pruebas decisivas rechazan la ausencia de tendencia con α = {x.alpha}.{ran_es}"
            headline_sc_es = f"{direction_es.capitalize()} {adj_es}"
    elif label == "significant_fragile":
        more_s = f"From {y0} to {y1} it changed by {per10}. But be careful. {chip_reasons_s}"
        more_sc = f"{sci_core} Both decisive tests reject no-trend at α = {x.alpha}, but: {chip_reasons_sc}"
        headline_sc = f"Significant {direction}, not robust"
        if es:
            more_es = f"De {y0} a {y1} cambió {per10_es}. Pero hay que tener cuidado. {chip_reasons_es}"
            more_sc_es = (f"{sci_core_es} Las dos pruebas decisivas rechazan la ausencia de tendencia con "
                          f"α = {x.alpha}, pero: {chip_reasons_sc_es}")
            headline_sc_es = f"{direction_es.capitalize()} {adj_es}, no robust{'o' if up else 'a'}"
    elif label == "borderline":
        more_s = f"It may be changing by {per10}. One of our two checks agrees. The other does not."
        more_sc = f"{sci_core} Only one decisive test rejects no-trend at α = {x.alpha}; treat as a lead."
        headline_sc = "Borderline: tests disagree"
        if es:
            more_es = f"Quizás cambie {per10_es}. Una de nuestras dos revisiones lo confirma. La otra no."
            more_sc_es = (f"{sci_core_es} Solo una prueba decisiva rechaza la ausencia de tendencia con "
                          f"α = {x.alpha}; tómese como una pista.")
            headline_sc_es = "En el límite: las pruebas discrepan"
    elif label == "possibly_changing":
        more_s = f"It may be changing by {per10}. But normal ups and downs are still bigger."
        more_sc = f"{sci_core} Not significant at α = {x.alpha}."
        headline_sc = "Not significant yet"
        if es:
            more_es = f"Quizás cambie {per10_es}. Pero los altibajos normales aún son mayores."
            more_sc_es = f"{sci_core_es} No significativo con α = {x.alpha}."
            headline_sc_es = "Aún no significativo"
    else:
        more_s = "Normal ups and downs are bigger than any change so far. That does not mean nothing is changing."
        more_sc = (f"{sci_core} Not significant at α = {x.alpha}; record short relative to detection time. "
                   "Absence of evidence is not evidence of no trend.")
        headline_sc = "No detectable trend"
        if es:
            more_es = ("Los altibajos normales son mayores que cualquier cambio hasta ahora. "
                       "Eso no quiere decir que nada cambie.")
            more_sc_es = (f"{sci_core_es} No significativo con α = {x.alpha}; registro corto respecto del tiempo de "
                          "detección. La ausencia de evidencia no es evidencia de ausencia de tendencia.")
            headline_sc_es = "Sin tendencia detectable"

    notes: list[Text] = []
    if x.p_c is not None and x.p_c < x.alpha and not (x.p_a < x.alpha and x.p_b < x.alpha):
        notes.append(Text(
            simple="A quicker check sees a change. Slow swings can fool it, so we don't trust it alone.",
            scientific=f"Seasonal Mann–Kendall p {fmt_p(x.p_c)} ignores autocorrelation and is not decisive; "
                       "it may reflect multi-year variability.",
            simple_es="Una revisión más rápida ve un cambio. Los vaivenes lentos pueden engañarla, "
                      "así que no confiamos solo en ella.",
            scientific_es=f"El Mann–Kendall estacional, p {fmt_p(x.p_c)}, ignora la autocorrelación y no es decisivo; "
                          "puede reflejar variabilidad de varios años.",
        ))
    notes.extend(short_record_note(label, x))
    if v.source.type == "model":
        notes.append(Text(
            simple="This is a computer model estimate, not a direct measurement.",
            scientific="Model/reanalysis output; agreement with other products is not independent evidence.",
            simple_es="Esta es una estimación de un modelo de computadora, no una medición directa.",
            scientific_es="Salida de modelo/reanálisis; la coincidencia con otros productos no es evidencia independiente.",
        ))
    return Verdict(
        label=label,
        certainty=certainty,
        answer=Text(simple=answer_s, scientific=answer_sc, simple_es=answer_es, scientific_es=answer_sc_es),
        how_much=Text(simple=how_s, scientific=how_sc, simple_es=how_es, scientific_es=how_sc_es),
        headline=Text(simple=METER_WORDS[certainty], scientific=headline_sc,
                      simple_es=METER_WORDS_ES[certainty], scientific_es=headline_sc_es),
        sentence=Text(simple=more_s, scientific=more_sc, simple_es=more_es, scientific_es=more_sc_es),
        notes=notes,
    )


def cant_tell(variable: VariableCard, region: RegionCard, reasons: list[Text]) -> Verdict:
    first = reasons[0] if reasons else Text(
        simple="We don't have enough data.", scientific="Not assessable.",
        simple_es="No tenemos suficientes datos.", scientific_es="No evaluable.",
    )
    rsc = " ".join(r.scientific for r in reasons)
    rsc_es = " ".join(r.scientific_es or r.scientific for r in reasons)
    first_es = first.simple_es or first.simple
    return Verdict(
        label="cant_tell",
        certainty="cant_tell",
        answer=Text(simple=f"We can't answer this for {_place(region)} yet.",
                    scientific=f"{variable.name.scientific}, {region.name.scientific}: not assessable.",
                    simple_es=f"Aún no podemos responder esto para {_place_es(region)}.",
                    scientific_es=f"{variable.name.scientific_es or variable.name.scientific}, "
                                  f"{region.name.scientific_es or region.name.scientific}: no evaluable."),
        how_much=Text(simple=first.simple, scientific=rsc, simple_es=first_es, scientific_es=rsc_es),
        headline=Text(simple=METER_WORDS["cant_tell"], scientific="Not assessable",
                      simple_es=METER_WORDS_ES["cant_tell"], scientific_es="No evaluable"),
        sentence=Text(simple=first.simple, scientific=f"Failed gates. {rsc}",
                      simple_es=first_es, scientific_es=f"Comprobaciones no superadas. {rsc_es}"),
    )
