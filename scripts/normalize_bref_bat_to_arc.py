#!/usr/bin/env python3
"""
Normalize BREF BAT-to-ARC mapping CSV → JSON.

Usage:
    python scripts/normalize_bref_bat_to_arc.py

Reads:  data/lookups/bref_bat_to_arc.csv
Writes: data/lookups/bref_bat_to_arc.json

Validation:
- confidence in [0, 1]
- arc_key parsed into (arcCode, arcAppCode)
- arcCode checked against arc_codes.json
- De-duplicated on (naics, bref_id, bat_id, arc_key, match_role)
"""
import csv
import json
import re
import sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
LOOKUPS = ROOT / "data" / "lookups"
CSV_PATH = LOOKUPS / "bref_bat_to_arc.csv"
JSON_PATH = LOOKUPS / "bref_bat_to_arc.json"
ARC_CODES_PATH = LOOKUPS / "arc_codes.json"

VALID_MATCH_ROLES = {"primary", "secondary"}
VALID_MATCH_TYPES = {"direct", "partial", "proxy"}


def parse_arc_key(arc_key: str) -> dict:
    """Parse arc_key like '2.2437.1' into arcCode + arcAppCode."""
    arc_key = arc_key.strip()
    # Check if last segment is a single digit 1-4 (app code suffix)
    match = re.match(r'^(.+)\.([1-4])$', arc_key)
    if match:
        return {"arcCode": match.group(1), "arcAppCode": int(match.group(2))}
    return {"arcCode": arc_key, "arcAppCode": None}


def load_valid_arc_codes() -> set:
    """Load known ARC codes from arc_codes.json."""
    if not ARC_CODES_PATH.exists():
        print(f"WARNING: {ARC_CODES_PATH} not found — skipping arcCode validation")
        return set()
    with open(ARC_CODES_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return {item["arcCode"] for item in data.get("codes", [])}


def main():
    if not CSV_PATH.exists():
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    valid_arcs = load_valid_arc_codes()
    rows = []
    rejected = []
    seen_keys = set()

    naics_counts = Counter()
    type_counts = Counter()

    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            errors = []

            # Confidence validation
            try:
                conf = float(row["confidence"])
                if not (0.0 <= conf <= 1.0):
                    errors.append(f"confidence={conf} out of [0,1]")
            except (ValueError, KeyError):
                errors.append(f"invalid confidence: {row.get('confidence')}")
                conf = 0.0

            # Match role/type validation
            match_role = row.get("match_role", "").strip().lower()
            match_type = row.get("match_type", "").strip().lower()
            if match_role not in VALID_MATCH_ROLES:
                errors.append(f"invalid match_role: {match_role}")
            if match_type not in VALID_MATCH_TYPES:
                errors.append(f"invalid match_type: {match_type}")

            # Arc key parsing
            arc_key = row.get("arc_key", "").strip()
            parsed = parse_arc_key(arc_key)
            arc_code = parsed["arcCode"]

            # ARC code existence check
            if valid_arcs and arc_code not in valid_arcs:
                errors.append(f"arcCode '{arc_code}' not found in arc_codes.json")

            # De-duplication
            dedup_key = (
                row.get("naics", "").strip(),
                row.get("bref_id", "").strip(),
                row.get("bat_id", "").strip(),
                arc_key,
                match_role,
            )
            if dedup_key in seen_keys:
                errors.append("duplicate row")

            if errors:
                rejected.append({"line": i, "arc_key": arc_key, "errors": errors})
                continue

            seen_keys.add(dedup_key)
            naics = row.get("naics", "").strip()
            naics_counts[naics] += 1
            type_counts[match_type] += 1

            rows.append({
                "naics": naics,
                "industryLabel": row.get("industry_label", "").strip(),
                "brefId": row.get("bref_id", "").strip(),
                "brefTitle": row.get("bref_title", "").strip(),
                "batId": row.get("bat_id", "").strip(),
                "batTitle": row.get("bat_title", "").strip(),
                "batText": row.get("bat_text", "").strip(),
                "arcKey": arc_key,
                "arcCode": arc_code,
                "arcAppCode": parsed["arcAppCode"],
                "matchRole": match_role,
                "matchType": match_type,
                "confidence": conf,
                "notes": row.get("notes", "").strip(),
            })

    # Write JSON
    output = {
        "metadata": {
            "source": "bref_bat_to_arc.csv",
            "totalRows": len(rows),
            "rejectedRows": len(rejected),
        },
        "mappings": rows,
    }
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # Report
    print(f"=== BREF BAT→ARC Normalization Report ===")
    print(f"  Total accepted: {len(rows)}")
    print(f"  Rejected:       {len(rejected)}")
    print(f"\n  By NAICS:")
    for naics, count in sorted(naics_counts.items()):
        print(f"    {naics}: {count}")
    print(f"\n  By match_type:")
    for mt, count in sorted(type_counts.items()):
        print(f"    {mt}: {count}")
    if rejected:
        print(f"\n  Rejected rows:")
        for r in rejected:
            print(f"    Line {r['line']} (arc_key={r['arc_key']}): {', '.join(r['errors'])}")
    print(f"\nOutput: {JSON_PATH}")


if __name__ == "__main__":
    main()
