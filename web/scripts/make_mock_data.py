"""Generate MOCK static data for the front end into public/data (all results carry "_mock": true).

Catalog files are converted from ../catalog/*.yaml. Results are synthetic: seasonal cycle + trend + AR(1) noise,
with simplified statistics (OLS slope, normal-approximation p-values). Real data comes from the backend precompute job.
Run: python3 scripts/make_mock_data.py
"""
import json, math, random, os
import yaml

ROOT = os.path.join(os.path.dirname(__file__), "..")
CAT = os.path.join(ROOT, "..", "catalog")
OUT = os.path.join(ROOT, "public", "data")
END = (2026, 10)

def load(n): return yaml.safe_load(open(os.path.join(CAT, n), encoding="utf8"))
def dump(path, obj):
    p = os.path.join(OUT, path); os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(obj, open(p, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))

regions, themes, variables, glossary = load("regions.yaml"), load("themes.yaml"), load("variables.yaml"), load("glossary.yaml")
dump("catalog/regions.json", regions); dump("catalog/themes.json", themes)
dump("catalog/variables.json", variables); dump("catalog/glossary.json", glossary)
vby = {v["id"]: v for v in variables}

# (base, seasonal amplitude, peak month, noise sd) per variable (display units)
PARAMS = {
 "airs_rh_surf_day": (65.5, 8.5, 3, 1.3), "airs_rh_surf_night": (78, 6, 3, 1.2),
 "airs_t_surf_day": (22, 1.8, 11, 0.35), "airs_t_surf_night": (14, 1.2, 11, 0.3), "merra2_t2m": (17, 1.5, 11, 0.3),
 "gpm_precip": (3.2, 2.4, 2, 0.7), "merra2_precip": (3.4, 2.2, 2, 0.8),
 "gldas_soil_moist": (300, 40, 3, 8), "gldas_evap": (2.1, 0.9, 2, 0.15),
 "modis_aqua_aod": (0.12, 0.05, 7, 0.025), "modis_terra_aod": (0.12, 0.05, 7, 0.025),
 "merra2_aod": (0.14, 0.05, 7, 0.02), "merra2_sulfate": (0.9, 0.3, 7, 0.1), "merra2_oc": (0.7, 0.4, 7, 0.12),
 "mopitt_co": (1.8, 0.35, 9, 0.08),
}
# slope per decade, per (region, variable); default is small
SLOPES = {
 ("cajamarca_west", "airs_rh_surf_day"): 0.95, ("cajamarca_highlands", "airs_rh_surf_day"): 0.9,
 ("cajamarca_west", "airs_rh_surf_night"): 0.4, ("cajamarca_highlands", "airs_rh_surf_night"): 0.2,
 ("cajamarca_highlands", "airs_t_surf_day"): 0.25, ("cajamarca_west", "airs_t_surf_day"): 0.22,
 ("cajamarca_highlands", "airs_t_surf_night"): 0.3, ("cajamarca_west", "airs_t_surf_night"): 0.18,
 ("cajamarca_highlands", "merra2_t2m"): 0.28, ("cajamarca_west", "merra2_t2m"): 0.2,
 ("wisconsin", "airs_t_surf_day"): 0.3, ("wisconsin", "airs_t_surf_night"): 0.35, ("wisconsin", "merra2_t2m"): 0.32,
 ("wisconsin", "gpm_precip"): 0.12, ("wisconsin", "merra2_precip"): 0.1, ("wisconsin", "gldas_soil_moist"): 3.0,
 ("wisconsin", "modis_aqua_aod"): -0.006, ("wisconsin", "modis_terra_aod"): -0.007, ("wisconsin", "merra2_sulfate"): -0.12,
}
NO_AIR = {"cajamarca_highlands", "cajamarca_west"}  # mock: aerosol records fail the completeness gate there

def months(a, b):
    y, m = a
    while (y, m) <= b:
        yield y, m
        m += 1
        if m > 12: y, m = y + 1, 1
def ms(y, m): return f"{y}-{m:02d}"
def parse(s): y, m = s.split("-"); return int(y), int(m)
def tx(y, m): return y + (m - 0.5) / 12
def ncdf_p(z): return math.erfc(abs(z) / math.sqrt(2))

def txt(s, sci=None): return {"simple": s, "scientific": sci or s}

def var_ref(v):
    u = v["units"]
    return {"id": v["id"], "giovanni_id": v["giovanni_id"], "name": v["name"], "definition": v["definition"],
            "source_type": v["source"]["type"], "instrument": v["source"]["instrument"],
            "units": {"display": u["display"], "simple": u["simple"], "decimals": u["decimals"]}}

def region_ref(r): return {"id": r["id"], "name": r["name"]}

def window_for(v):
    start = parse(v["record_start"]); end = END; reason = "default"
    for a in v.get("artifacts", []):
        if a["action"] == "end_window_before":
            ay, am = parse(a["start"]); end = (ay, am - 1) if am > 1 else (ay - 1, 12); reason = "drift_cut"
    return start, end, reason

def analyze(region, v, season=None, start=None, end=None, reason=None, seed_extra=""):
    rid, vid = region["id"], v["id"]
    rng = random.Random(f"{rid}/{vid}")
    base, amp, peak, sd = PARAMS[vid]
    slope = SLOPES.get((rid, vid), rng.uniform(-0.2, 0.2) * sd * 2)
    rs = parse(v["record_start"]); ws, we, wreason = window_for(v)
    if start: ws = parse(start)
    if end: we = parse(end)
    if reason: wreason = reason
    allm = list(months(rs, END))
    gate_fail = (rid in NO_AIR and vid in ("modis_aqua_aod", "modis_terra_aod", "merra2_sulfate", "merra2_oc", "merra2_aod", "mopitt_co")) \
        or (rid == "wisconsin" and vid == "mopitt_co")
    base_out = {"_mock": True, "schema_version": "1", "engine_version": "mock-0.1", "region": region_ref(region),
                "variable": var_ref(v), "provenance": {"source_kind": "mock", "source_ref": f"synthetic {rid}/{vid}",
                "title": "Synthetic mock series", "requested_bbox": region["geometry"]["bbox"], "data_bbox": None, "retrieved_at": "2026-11-14"}}
    if gate_fail:
        why = txt("Too few valid grid cells or too many missing months in this region.",
                  "Completeness gate failed: valid-month fraction below threshold for this region.")
        base_out.update(window=None, season=None, series=[], season_series=None, seasonal_share=None, trend=None, tests=[],
            persistence=None, detectability=None, robustness={}, chips=[],
            gates={"passed": False, "checks": [{"code": "completeness", "passed": False, "detail": why}]},
            verdict={"label": "cant_tell", "headline": txt("We can't tell here", "Insufficient data"),
                     "sentence": txt("There is not enough good data in this region to say anything honest about change.",
                                     "The record fails the completeness gate, so no trend is estimated."), "notes": []})
        return base_out, None
    # synthesize
    vals, e = [], 0.0
    for (y, m) in allm:
        e = 0.45 * e + rng.gauss(0, sd)
        t = tx(y, m) - 2015
        seas = amp * math.cos(2 * math.pi * (m - peak) / 12)
        vals.append(base + seas + slope * t / 10 + e)
    inw = [ws <= ym <= we for ym in allm]
    # climatology over window
    clim = {m: [] for m in range(1, 13)}
    for ym, val, w in zip(allm, vals, inw):
        if w: clim[ym[1]].append(val)
    clim = {m: sum(x) / len(x) for m, x in clim.items()}
    anom = [val - clim[ym[1]] for ym, val in zip(allm, vals)]
    series = [{"t": ms(*ym), "value": round(val, 3), "anomaly": round(a, 3), "in_window": w} for ym, val, a, w in zip(allm, vals, anom, inw)]
    tot_var = sum((val - sum(vals) / len(vals)) ** 2 for val in vals) / len(vals)
    an_var = sum(a * a for a in anom) / len(anom)
    seasonal_share = round(max(0.0, 1 - an_var / tot_var), 3)
    if season:
        sm = season["months"]
        years = sorted({ym[0] for ym, w in zip(allm, inw) if w and ym[1] in sm})
        pts = []
        for y in years:
            xs = [a for ym, a, w in zip(allm, anom, inw) if w and ym[0] == y and ym[1] in sm]
            if len(xs) == len(sm): pts.append((y, sum(xs) / len(xs)))
        T = [p[0] + 0.5 for p in pts]; Y = [p[1] for p in pts]
        season_series = [{"year": y, "anomaly": round(a, 3)} for y, a in pts]
    else:
        T = [tx(*ym) for ym, w in zip(allm, inw) if w]; Y = [a for a, w in zip(anom, inw) if w]; season_series = None
    n = len(T); tb = sum(T) / n; yb = sum(Y) / n
    sxx = sum((t - tb) ** 2 for t in T); b = sum((t - tb) * (y - yb) for t, y in zip(T, Y)) / sxx
    a0 = yb - b * tb
    res = [y - (a0 + b * t) for t, y in zip(T, Y)]
    r1 = sum(res[i] * res[i + 1] for i in range(n - 1)) / sum(r * r for r in res)
    neff = max(3.0, n * (1 - r1) / (1 + r1)) if r1 > 0 else float(n)
    s = math.sqrt(sum(r * r for r in res) / (n - 2))
    se = s / math.sqrt(sxx) * math.sqrt(n / neff)
    z = b / se; p_b = max(ncdf_p(z), 1e-6)
    p_a = max(ncdf_p(z * 0.93), 1e-6)
    ci = 1.96 * se * 10
    years_av = round(T[-1] - T[0] + (1 if season else 1 / 12), 2)
    years_needed = None if abs(b) < 1e-9 else round(max(2.0, min(80.0, years_av * (2.8 * se / abs(b)) ** (2 / 3))), 1)
    tb_fit = tb
    if season:
        fit_t = [f"{int(t - 0.5)}-07" for t in T]; fit_x = T
    else:
        fit_t = [ms(*ym) for ym, w in zip(allm, inw) if w]; fit_x = T
    fit = [{"t": ft, "trend": round(a0 + b * x, 4), "low": round(yb + (b - 1.96 * se) * (x - tb_fit), 4), "high": round(yb + (b + 1.96 * se) * (x - tb_fit), 4)}
           for ft, x in zip(fit_t, fit_x)]
    # thin the fit for months (keep every month: ~230 points, fine)
    pmax = max(p_a, p_b)
    nyears = n if season else n / 12
    loo_flip = pmax < 0.05 and pmax > 0.01 and nyears < 25 and rng.random() < 0.0
    if pmax < 0.05:
        label = "significant"
    elif p_a < 0.05 or p_b < 0.05:
        label = "borderline"
    elif pmax < 0.2:
        label = "possibly_changing"
    else:
        label = "no_detectable_change"
    if label == "significant" and pmax > 0.02 and not season: label = "significant_fragile"
    chips = []
    if wreason == "drift_cut" and not start:
        chips.append({"code": "drift_excluded", "severity": "info", "text": txt(
            "We left out the last years because the satellite drifted off its usual orbit.",
            "Window ends before Jan 2022 (Aqua orbit-drift, end_window_before).")})
    if season or nyears < 15:
        chips.append({"code": "rests_on_few_years", "severity": "warning", "text": txt(
            "This answer rests on only a few years of data.", f"Only {int(nyears)} years/seasons enter the fit.")})
    if label == "significant_fragile":
        chips.append({"code": "leave_one_year_out_fragile", "severity": "warning", "text": txt(
            "Dropping one year makes the answer less certain.", "Leave-one-year-out worst-case p exceeds 0.05.")})
    word = (v.get("words") or {}).get("up" if b > 0 else "down", "changing")
    u = v["units"]; dec = u["decimals"]
    sl = round(b * 10, dec + 1)
    heads = {"significant": ("Real change: it is getting " + word, "Significant trend"),
             "significant_fragile": ("Probably a real change, but it is fragile", "Significant but fragile trend"),
             "borderline": ("Maybe changing, not sure yet", "Borderline: one test significant"),
             "possibly_changing": ("Possibly changing", "Weak evidence of a trend"),
             "no_detectable_change": ("No change we can detect yet", "No detectable trend")}
    h = heads[label]
    sentence = txt(
        f"Over about {years_av:.0f} years it changed by about {abs(sl)} {u['simple']} every 10 years." if label != "no_detectable_change"
        else f"The ups and downs are bigger than any slow change, so we cannot see a trend in {years_av:.0f} years.",
        f"Slope {sl:+} {u['display']} per decade (95% CI {b*10-ci:+.{dec+1}f} to {b*10+ci:+.{dec+1}f}); p = {pmax:.3g} (max of decisive tests).")
    detect_note = []
    if years_needed and label in ("no_detectable_change", "possibly_changing", "borderline"):
        detect_note.append(txt(f"At this rate we would need about {years_needed:.0f} years of data to be sure.",
                               f"Estimated detection time at the current slope and noise: {years_needed:.0f} years."))
    tests = [{"name": "mk_hamed_rao", "p": p_a, "statistic": round(z * 0.93, 3), "decisive": True},
             {"name": "ols_neff", "p": p_b, "statistic": round(z, 3), "decisive": True}]
    if not season: tests.append({"name": "seasonal_mk", "p": min(1.0, p_a * 1.4), "statistic": round(z * 0.85, 3), "decisive": False})
    rob = {"leave_one_year_out": {"slope_min": round(sl * 0.8, 3), "slope_max": round(sl * 1.2, 3), "worst_p": min(1.0, pmax * 2.5), "flip_years": []},
           "drift_label_with_late_years": ("borderline" if wreason == "drift_cut" else None)}
    out = dict(base_out)
    out.update(
        window={"start": ms(*ws), "end": ms(*we), "reason": wreason, "years": years_av},
        season=({"id": season["id"], "name": season["name"], "months": season["months"]} if season else None),
        gates={"passed": True, "checks": [
            {"code": "coverage", "passed": True, "detail": txt("Enough of the region is covered.", "Valid-cell coverage above threshold.")},
            {"code": "record_length", "passed": True, "detail": txt("The record is long enough.", f"{years_av:.1f} years >= minimum.")}]},
        series=series, season_series=season_series, seasonal_share=seasonal_share,
        trend={"slope_per_decade": sl, "ci_low": round(b * 10 - ci, 4), "ci_high": round(b * 10 + ci, 4), "fit": fit},
        tests=tests, persistence={"r1": round(r1, 3), "n": n, "n_eff": round(neff, 1)},
        detectability={"years_needed": years_needed, "years_available": years_av},
        robustness=rob, chips=chips,
        verdict={"label": label, "headline": txt(h[0], h[1]), "sentence": sentence, "notes": detect_note})
    return out, (label, sl, pmax)

SHORT = {"significant": "changing", "significant_fragile": "changing", "borderline": "possibly_changing",
         "possibly_changing": "possibly_changing", "no_detectable_change": "no_detectable_change", "cant_tell": "cant_tell"}

for r in regions:
    rid = r["id"]
    for th in themes:
        entries = []
        for v in variables:
            role = v["themes"].get(th["id"])
            if not role: continue
            res, st = analyze(r, v)
            dump(f"results/{rid}/{v['id']}.json", res)
            if st is None:
                entries.append({"variable_id": v["id"], "name": v["name"], "role": role, "source_type": v["source"]["type"],
                    "shortlist_label": "cant_tell", "verdict_label": "cant_tell", "slope_per_decade": None,
                    "units": res["variable"]["units"], "p_decisive": None, "p_adjusted": None,
                    "reason": res["gates"]["checks"][0]["detail"]})
            else:
                label, sl, p = st
                entries.append({"variable_id": v["id"], "name": v["name"], "role": role, "source_type": v["source"]["type"],
                    "shortlist_label": SHORT[label], "verdict_label": label, "slope_per_decade": sl,
                    "units": res["variable"]["units"], "p_decisive": p, "p_adjusted": min(1.0, p * 1.5), "reason": None})
            for ds in r.get("declared_seasons", []):
                if ds["variable"] == v["id"] and st is not None:
                    sres, _ = analyze(r, v, season={"id": ds["id"], "name": ds["name"], "months": ds["months"]})
                    dump(f"results/{rid}/{v['id']}__{ds['id']}.json", sres)
        if entries:
            dump(f"results/{rid}/scan_{th['id']}.json", {"_mock": True, "schema_version": "1", "engine_version": "mock-0.1",
                 "region": region_ref(r), "theme_id": th["id"], "alpha": 0.05, "method": "benjamini_hochberg", "entries": entries})
print("done")
