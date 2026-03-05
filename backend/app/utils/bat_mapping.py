"""
BAT↔ARC mapping utilities.

Loads the normalized bref_bat_to_arc.json and provides:
- parse_arc_key(arc_key) → (arcCode, arcAppCode)
- get_bat_links_for_arc(arc_code, naics) → list of BatLink dicts
- attach_bat_links(measures, naics) → measures with isBatLinked + batLinks
- compute_improvement_index(recommended, implemented, avg_confidence, n0=30)
"""
import json
import re
from pathlib import Path
from typing import Optional

LOOKUPS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "lookups"
JSON_PATH = LOOKUPS_DIR / "bref_bat_to_arc.json"

_mapping_data: dict = {}


def _load_mapping():
    global _mapping_data
    if _mapping_data:
        return
    if not JSON_PATH.exists():
        print(f"WARNING: BAT mapping not found at {JSON_PATH}")
        _mapping_data = {"mappings": [], "metadata": {}}
        return
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        _mapping_data = json.load(f)


def parse_arc_key(arc_key: str) -> dict:
    """Parse arc_key like '2.2437.1' into {arcCode, arcAppCode}."""
    arc_key = arc_key.strip()
    match = re.match(r'^(.+)\.([1-4])$', arc_key)
    if match:
        return {"arcCode": match.group(1), "arcAppCode": int(match.group(2))}
    return {"arcCode": arc_key, "arcAppCode": None}


def get_bat_links_for_arc(arc_code: str, naics: str, bref_id: Optional[str] = None) -> list:
    """Get all BAT links for a given ARC code and NAICS.

    Matching: a mapping row matches if its arcCode == arc_code AND
    its naics starts with the given naics prefix.
    """
    _load_mapping()
    links = []
    for m in _mapping_data.get("mappings", []):
        if m["arcCode"] != arc_code:
            continue
        # NAICS prefix matching (e.g., "3323" matches "33231" etc.)
        if not m["naics"].startswith(naics) and not naics.startswith(m["naics"]):
            continue
        if bref_id and m["brefId"] != bref_id:
            continue
        links.append({
            "naics": m["naics"],
            "brefId": m["brefId"],
            "brefTitle": m["brefTitle"],
            "batId": m["batId"],
            "batTitle": m["batTitle"],
            "batText": m["batText"],
            "arcKey": m["arcKey"],
            "arcAppCode": m["arcAppCode"],
            "matchRole": m["matchRole"],
            "matchType": m["matchType"],
            "confidence": m["confidence"],
            "notes": m["notes"],
        })
    return links


def get_available_brefs(naics: str) -> list:
    """Get distinct BREF entries available for a NAICS code."""
    _load_mapping()
    seen = set()
    brefs = []
    for m in _mapping_data.get("mappings", []):
        if not m["naics"].startswith(naics) and not naics.startswith(m["naics"]):
            continue
        key = m["brefId"]
        if key not in seen:
            seen.add(key)
            brefs.append({"brefId": m["brefId"], "brefTitle": m["brefTitle"]})
    return brefs


def attach_bat_links(measures: list, naics: str, bref_id: Optional[str] = None) -> list:
    """Attach BAT linkage metadata to a list of measure dicts.

    Each measure must have an 'arc' field (the ARC code string).
    Returns a new list with added 'isBatLinked' and 'batLinks' fields.
    """
    result = []
    for m in measures:
        arc = m.get("arc", "")
        links = get_bat_links_for_arc(arc, naics, bref_id)
        enriched = dict(m)
        enriched["isBatLinked"] = len(links) > 0
        enriched["batLinks"] = links
        result.append(enriched)
    return result


def compute_improvement_index(
    recommended_count: int,
    implemented_count: int,
    avg_confidence: float = 1.0,
    n0: int = 30,
) -> Optional[int]:
    """Compute the Improvement Index (0-100).

    Formula:
    - implRate = (implemented + 1) / (recommended + 2)  [Laplace smoothing]
    - implGap = 1 - implRate
    - evidence = min(1, recommended / n0)
    - index = round(100 * implGap * evidence * avgConfidence)
    - Clamp [0, 100]

    Returns None if recommended_count == 0 (insufficient data).
    """
    if recommended_count == 0:
        return None

    impl_rate = (implemented_count + 1) / (recommended_count + 2)
    impl_gap = 1.0 - impl_rate
    evidence = min(1.0, recommended_count / n0)
    raw = 100.0 * impl_gap * evidence * avg_confidence
    return max(0, min(100, round(raw)))


def compute_priority_index(
    criticality_index: float,
    improvement_index: Optional[int],
    w_criticality: float = 60.0,
    w_improvement: float = 40.0,
    include_missing: bool = False,
) -> Optional[int]:
    """Compute Priority Index (0-100).

    priorityIndex = round((wCrit * critIdx + wImp * impIdx) / 100)
    """
    if improvement_index is None:
        if not include_missing:
            return None
        improvement_index = 0

    raw = (w_criticality * criticality_index + w_improvement * improvement_index) / 100.0
    return max(0, min(100, round(raw)))
