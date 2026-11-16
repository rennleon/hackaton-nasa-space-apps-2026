"""The detective guide: a typed sentence -> the question (theme) and variables that can answer it.

R1 (which variables are worth investigating). Deterministic keyword route over names, questions, definitions and a
small synonym map (EN + ES). No external service: the same words always give the same answer.
The browser has a TypeScript twin of this route (web/src/lib/guideKeywords.ts) for offline use.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from .catalog import Catalog

MAX_CHARS = 300
MAX_VARIABLES = 4
MAX_PLACE_CHARS = 60

ROLE_BONUS = {"target": 3.0, "driver": 1.5, "response": 1.0, "cross_check": 0.5}

# --------------------------------------------------------------------------- text helpers

STOPWORDS = frozenset(
    ["a", "an", "the", "is", "are", "was", "be", "it", "its", "this", "that", "these", "those", "of", "in", "on", "at", "to", "for", "from", "by", "with", "and", "or", "not", "no", "do", "does", "how", "what", "why", "when", "where", "which", "who", "i", "my", "me", "we", "our", "you", "your", "want", "wants", "know", "about", "get", "gets", "getting", "here", "there", "more", "less", "very", "much", "many", "can", "could", "would", "should", "will", "just", "like", "see", "look", "find", "out", "tell", "show", "there", "than", "then", "el", "la", "los", "las", "un", "una", "unos", "unas", "es", "son", "de", "del", "en", "y", "o", "no", "por", "para", "con", "que", "como", "mas", "menos", "quiero", "quiero", "saber", "sobre", "aqui", "alli", "ver", "hay", "se", "mi", "mis", "tu", "tus", "nos"]
)


def fold(text: str) -> str:
    """Lower-case and drop accents: 'Sequía' -> 'sequia'."""
    nfd = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def stem(token: str) -> str:
    """Crude plural strip so 'afternoons' matches 'afternoon' and 'lluvias' matches 'lluvia'."""
    if len(token) > 4 and token.endswith("es") and not token.endswith(("ies", "ses")):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokens(text: str) -> list[str]:
    out = []
    for raw in re.findall(r"[a-z0-9]+", fold(text)):
        if len(raw) < 2 or raw in STOPWORDS:
            continue
        out.append(stem(raw))
    return out


# Word -> sub-topic or main theme it points at. Declared here, before any result is seen.
_SYNONYMS_RAW: dict[str, tuple[str, ...]] = {
    "smoke": ("smoke_haze",), "smoky": ("smoke_haze",), "haze": ("smoke_haze",), "hazy": ("smoke_haze",),
    "fire": ("smoke_haze",), "wildfire": ("smoke_haze",), "fires": ("smoke_haze",), "ash": ("smoke_haze",),
    "humo": ("smoke_haze",), "incendio": ("smoke_haze",), "incendios": ("smoke_haze",), "bruma": ("smoke_haze",),
    "neblina": ("smoke_haze",), "smog": ("smoke_haze",), "dust": ("smoke_haze",), "polvo": ("smoke_haze",),
    "pollution": ("air",), "polluted": ("air",), "contaminacion": ("air",), "contaminado": ("air",),
    "breathe": ("air",), "respirar": ("air",), "aerosol": ("air",),
    "burning": ("burning_fuel",), "fuel": ("burning_fuel",), "combustible": ("burning_fuel",),
    "quema": ("burning_fuel",), "traffic": ("burning_fuel",), "trafico": ("burning_fuel",),
    "cars": ("burning_fuel",), "car": ("burning_fuel",), "factory": ("burning_fuel",), "fabrica": ("burning_fuel",),
    "no2": ("burning_fuel",), "coches": ("burning_fuel",), "carros": ("burning_fuel",),
    "hot": ("heat",), "hotter": ("heat",), "heat": ("heat",), "warm": ("heat",), "warmer": ("heat",),
    "warming": ("heat",), "temperature": ("heat",), "cold": ("heat",), "cooler": ("heat",), "colder": ("heat",),
    "calor": ("heat",), "caliente": ("heat",), "caluroso": ("heat",), "temperatura": ("heat",),
    "frio": ("heat",), "fresco": ("heat",), "climate": ("heat",), "clima": ("heat",), "weather": ("heat",), "tiempo": ("heat",),
    "meteorologia": ("heat",), "sunny": ("heat",), "sun": ("heat",), "sol": ("heat",), "summer": ("heat",),
    "verano": ("heat",), "winter": ("heat",), "invierno": ("heat",), "degrees": ("heat",), "grados": ("heat",),
    "snow": ("rain",), "nieve": ("rain",),
    "afternoon": ("hot_afternoons",), "afternoons": ("hot_afternoons",), "daytime": ("hot_afternoons",),
    "midday": ("hot_afternoons",), "tarde": ("hot_afternoons",), "tardes": ("hot_afternoons",),
    "night": ("warm_nights",), "nights": ("warm_nights",), "nighttime": ("warm_nights",),
    "noche": ("warm_nights",), "noches": ("warm_nights",),
    "rain": ("rain",), "rainy": ("rain",), "rainfall": ("rain",), "raining": ("rain",), "storm": ("rain",),
    "storms": ("rain",), "dry": ("rain",), "drier": ("rain",), "drought": ("rain",), "flood": ("rain",),
    "lluvia": ("rain",), "lluvias": ("rain",), "llueve": ("rain",), "llover": ("rain",), "tormenta": ("rain",),
    "sequia": ("rain",), "seco": ("rain",), "seca": ("rain",), "inundacion": ("rain",),
    "humid": ("damp_air",), "humidity": ("damp_air",), "damp": ("damp_air",), "muggy": ("damp_air",),
    "humedo": ("damp_air",), "humeda": ("damp_air",), "humedad": ("damp_air",),
    "wet": ("water",), "wetter": ("water",), "moisture": ("water",),
    "soil": ("soil",), "ground": ("soil",), "farm": ("soil",), "farms": ("soil",), "farming": ("soil",),
    "crop": ("soil",), "crops": ("soil",), "suelo": ("soil",), "cultivo": ("soil",), "cultivos": ("soil",),
    "agricultura": ("soil",), "chacra": ("soil",), "plants": ("soil",), "plantas": ("soil",),
}
SYNONYMS: dict[str, tuple[str, ...]] = {stem(fold(k)): v for k, v in _SYNONYMS_RAW.items()}

_PLACE_RE = re.compile(
    r"(?i:\b(?:in|near|at|around|from|en|cerca de|cerca del|alrededor de|de))\s+"
    r"([A-ZÁÉÍÓÚÑ][\w'’.-]*(?:\s+(?:de |del |la |of )?[A-ZÁÉÍÓÚÑ][\w'’.-]*){0,3})"
)


def clean_place(value: object) -> str | None:
    """A place name only: no digits (never coordinates), short, trimmed."""
    if not isinstance(value, str):
        return None
    v = re.sub(r"\s+", " ", value).strip(" .,;:!?\"'")
    if not v or len(v) > MAX_PLACE_CHARS or any(c.isdigit() for c in v):
        return None
    return v


def place_from_text(text: str) -> str | None:
    m = _PLACE_RE.search(text)
    return clean_place(m.group(1)) if m else None


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()[:MAX_CHARS]


# --------------------------------------------------------------------------- keyword route


def _plain(t: Any, lang: str, view: str = "simple") -> str:
    """A catalog Text in the user's language (Spanish when present), kid register."""
    if lang == "es":
        es = getattr(t, f"{view}_es", None)
        if es:
            return es
    return getattr(t, view)


def _bag(*texts: str) -> set[str]:
    out: set[str] = set()
    for t in texts:
        out.update(tokens(t))
    return out


def _query_weights(text: str, catalog: Catalog) -> dict[str, float]:
    """Typed words weigh 1; words of a matching glossary entry's definition weigh 0.5 (e.g. 'NO2' -> 'burning', 'fuel')."""
    direct = set(tokens(text))
    weights = {t: 1.0 for t in direct}
    for g in catalog.glossary.values():
        term_tokens = _bag(g.term.simple, g.term.simple_es or "", g.term.scientific)
        if term_tokens & direct:
            for t in _bag(g.definition.simple, g.definition.simple_es or ""):
                weights.setdefault(t, 0.5)
    return weights


def _overlap(weights: dict[str, float], bag: set[str]) -> float:
    return sum(w for t, w in weights.items() if t in bag)


def _themes_score(text: str, catalog: Catalog, weights: dict[str, float]) -> dict[str, float]:
    score = {tid: 0.0 for tid in catalog.themes}
    for tid, th in catalog.themes.items():
        name = _bag(th.name.simple, th.name.simple_es or "", th.name.scientific)
        question = _bag(th.question.simple, th.question.simple_es or "")
        score[tid] += 2 * _overlap(weights, name) + 0.5 * _overlap(weights, question)
    for tok in set(tokens(text)):
        for tid in SYNONYMS.get(tok, ()):
            if tid not in score:
                continue
            score[tid] += 4.0
            parent = catalog.themes[tid].parent
            if parent in score:
                score[parent] += 1.5
    return score


def _reason(theme_id: str, catalog: Catalog, lang: str) -> str:
    name = _plain(catalog.themes[theme_id].name, lang)
    if lang == "es":
        return f"Tus palabras encajan con «{name}». Ábrela y miramos los datos."
    return f"Your words match “{name}”. Open it and we will check the data."


NO_MATCH = {
    "en": "I could not match that. Try words like heat, rain or smoke.",
    "es": "No pude entender eso. Prueba con palabras como calor, lluvia o humo.",
}


def keyword_guide(text: str, lang: str = "en", catalog: Catalog | None = None) -> dict:
    """Deterministic route: best theme + up to 4 of its variables. `theme` is None when nothing matches."""
    if catalog is None:
        catalog = _default_catalog()
    lang = "es" if lang == "es" else "en"
    text = clean_text(text)
    weights = _query_weights(text, catalog)
    scores = _themes_score(text, catalog, weights)
    best = max(scores.values(), default=0.0)
    place = place_from_text(text)
    if best <= 0:
        return {"theme": None, "variables": [], "place_hint": place, "reason": NO_MATCH[lang], "source": "keywords"}
    # ties go to the more specific question (a sub-topic), then catalog order
    order = list(catalog.themes)
    theme_id = max(
        (t for t in order if scores[t] == best),
        key=lambda t: (catalog.themes[t].parent is not None, -order.index(t)),
    )
    members = catalog.theme_members(theme_id)
    ranked: list[tuple[float, int, str]] = []
    for i, (v, role) in enumerate(members):
        bag_name = _bag(v.name.simple, v.name.simple_es or "")
        bag_def = _bag(v.definition.simple, v.definition.simple_es or "", getattr(v.words, "subject", "") or "")
        if v.words_es is not None:
            bag_def |= _bag(v.words_es.subject)
        s = 2 * _overlap(weights, bag_name) + _overlap(weights, bag_def) + ROLE_BONUS.get(role, 0.0)
        ranked.append((-s, i, v.id))
    ranked.sort()
    ids = [vid for _s, _i, vid in ranked[:MAX_VARIABLES]]
    return {
        "theme": theme_id,
        "variables": ids,
        "place_hint": place,
        "reason": _reason(theme_id, catalog, lang),
        "source": "keywords",
    }


def _default_catalog() -> Catalog:
    from .engine import EngineContext

    return EngineContext.from_repo().catalog


def guide(text: str, lang: str = "en", catalog: Catalog | None = None) -> dict:
    """{theme, variables, place_hint, reason, source}. Deterministic keyword route; source is always "keywords"."""
    text = clean_text(text)
    if not text:
        raise ValueError("empty text")
    lang = "es" if lang == "es" else "en"
    if catalog is None:
        catalog = _default_catalog()
    return keyword_guide(text, lang, catalog)
