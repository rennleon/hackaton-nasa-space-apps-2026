"""Is a "second opinion" really independent? A model that ingests the other instrument's data is not.

MERRA-2 (and so NASA POWER temperature, rain and humidity) assimilates AIRS radiances from 1 Sep 2002, so
POWER vs AIRS is a weaker check than two separate instruments (Gelaro et al. 2017, Table 1). The fact lives on the
instrument card (`assimilates`); this module only reads it. The contrast text uses `independence_note`.
"""

from __future__ import annotations

from .catalog import Catalog, VariableCard
from .contract import Text

# What is known about specific pairs: (assimilating model, instrument it ingests) -> (English, Spanish) detail.
DETAIL = {
    ("merra2", "airs"): (
        ("MERRA-2 (the model behind NASA POWER) assimilates AIRS and AMSU-A radiances from Aqua from 1 Sep 2002 "
         "(Gelaro et al. 2017, doi:10.1175/JCLI-D-16-0758.1, Table 1)."),
        ("MERRA-2 (el modelo detrás de NASA POWER) asimila radiancias de AIRS y AMSU-A de Aqua desde el 1 de "
         "septiembre de 2002 (Gelaro et al. 2017, doi:10.1175/JCLI-D-16-0758.1, Tabla 1)."),
    ),
}


def independence_note(a: VariableCard, b: VariableCard, catalog: Catalog) -> Text | None:
    """A note when one of the two variables comes from a model that assimilates the other's instrument, else None."""
    ia = catalog.instruments.get(a.source.instrument_id or "")
    ib = catalog.instruments.get(b.source.instrument_id or "")
    if ia is None or ib is None:
        return None
    for model, source in ((ia, ib), (ib, ia)):
        if source.id in model.assimilates:
            detail_en, detail_es = DETAIL.get((model.id, source.id), (
                f"{model.name.scientific} assimilates data from {source.name.scientific}.",
                (f"{model.name.scientific_es or model.name.scientific} asimila datos de "
                 f"{source.name.scientific_es or source.name.scientific}."),
            ))
            return Text(
                simple="These two partly share data, so they are not fully separate checks.",
                scientific=f"{detail_en} The two series are therefore not fully independent: agreement is weaker "
                           "evidence than between two separate instruments, so compare the direction only.",
                simple_es="Estos dos comparten parte de sus datos, así que no son revisiones del todo separadas.",
                scientific_es=f"{detail_es} Por eso las dos series no son del todo independientes: que coincidan es "
                              "una evidencia más débil que entre dos instrumentos separados, así que se compara solo la dirección.",
            )
    return None
