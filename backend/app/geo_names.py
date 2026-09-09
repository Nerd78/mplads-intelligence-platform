"""Single shared state-name canonicalization table.

The `work.state` values already in Postgres are the authoritative spelling
(verified against the live DB -- e.g. "Odisha" not "Orissa", "Puducherry"
not "Pondicherry"). Common TopoJSON/GeoJSON sources for India spell some of
these differently (union territory naming in particular). This module is the
ONE place that reconciles the two, imported by geo.py; the frontend map
fetches the same table via GET /geo/state-name-map so it never invents its
own aliases.

Adding a new alias: add it to ALIASES below (lowercased, trimmed key ->
canonical DB spelling). Never hardcode a second copy of this table anywhere
else.
"""
from __future__ import annotations

# Canonical spellings, exactly as they appear in `work.state`.
CANONICAL_STATES = [
    "Andaman And Nicobar Islands",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chhattisgarh",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu And Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Ladakh",
    "Lakshadweep",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Puducherry",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "The Dadra And Nagar Haveli And Daman And Diu",
    "Tripura",
    "Uttarakhand",
    "Uttar Pradesh",
    "West Bengal",
]

# Alternate spellings a TopoJSON/GeoJSON source might use -> canonical DB spelling.
ALIASES: dict[str, str] = {
    "orissa": "Odisha",
    "pondicherry": "Puducherry",
    "nct of delhi": "Delhi",
    "delhi (nct)": "Delhi",
    "national capital territory of delhi": "Delhi",
    "jammu & kashmir": "Jammu And Kashmir",
    "jammu and kashmir": "Jammu And Kashmir",
    "andaman & nicobar islands": "Andaman And Nicobar Islands",
    "andaman and nicobar": "Andaman And Nicobar Islands",
    "dadra and nagar haveli and daman and diu": "The Dadra And Nagar Haveli And Daman And Diu",
    "dadra & nagar haveli and daman & diu": "The Dadra And Nagar Haveli And Daman And Diu",
    "dadra and nagar haveli": "The Dadra And Nagar Haveli And Daman And Diu",
    "daman and diu": "The Dadra And Nagar Haveli And Daman And Diu",
    "uttaranchal": "Uttarakhand",
}

# The bundled public/geo/india-states.json TopoJSON predates Telangana's 2014
# split from Andhra Pradesh and Ladakh's 2019 split from Jammu & Kashmir --
# there is no separate polygon for either. This is a MAP-RENDERING fallback
# only (which polygon to color when a state has no polygon of its own) and
# must never be used for data aggregation -- Telangana/Ladakh keep their own
# rows everywhere else (tables, KPIs, state picker, /geo/states), so this is
# deliberately kept out of ALIASES/canonicalize() above.
MAP_POLYGON_FALLBACK: dict[str, str] = {
    "Telangana": "Andhra Pradesh",
    "Ladakh": "Jammu And Kashmir",
}

_NORMALIZED: dict[str, str] = {s.strip().lower(): s for s in CANONICAL_STATES}
_NORMALIZED.update(ALIASES)


def canonicalize(name: str | None) -> str | None:
    """Maps any known spelling of a state name to the canonical DB spelling.
    Returns None for blank/unrecognized input rather than guessing."""
    if not name:
        return None
    key = name.strip().lower()
    return _NORMALIZED.get(key)


def state_name_map() -> dict:
    """Everything the frontend map needs to reconcile state names against
    this exact table: `aliases` (normalized-key -> canonical DB spelling, for
    matching a TopoJSON feature to the right DB state) and
    `polygon_fallback` (canonical DB states with no polygon of their own in
    the bundled TopoJSON -- which polygon to color instead, display-only)."""
    return {"aliases": dict(_NORMALIZED), "polygon_fallback": dict(MAP_POLYGON_FALLBACK)}
