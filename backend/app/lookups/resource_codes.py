import json
import os
from pathlib import Path

# Load JSON once at module startup
LOOKUPS_DIR = Path(__file__).parent.parent.parent.parent / "data" / "lookups"
JSON_PATH = LOOKUPS_DIR / "resource_identification_codes.json"

_resource_codes_db = {}
_metadata = {}

def _load_db():
    global _resource_codes_db, _metadata
    if not _resource_codes_db and JSON_PATH.exists():
        with open(JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            _metadata = data.get("metadata", {})
            for item in data.get("codes", []):
                _resource_codes_db[item["code"]] = item

_load_db()

ELECTRICITY_CODES = {"E1", "EC", "E15"} # E15 added for robustness if raw PDF leak happens
NATURAL_GAS_CODES = {"E2"}

def get_resource_label(code: str) -> str:
    """Returns human-readable formatting: 'EC — Electrical Consumption (kWh)'"""
    if not code:
        return "Unknown"
    
    code = str(code).upper().strip()
    entry = _resource_codes_db.get(code)
    
    if not entry:
        return code
        
    name = entry.get("streamName", "")
    units = entry.get("consumptionUnits", "")
    
    label = f"{code} — {name}"
    if units and units.lower() != "n/a":
        label += f" ({units})"
        
    return label

def is_electricity(code: str) -> bool:
    if not code: return False
    return str(code).upper().strip() in ELECTRICITY_CODES

def is_natural_gas(code: str) -> bool:
    if not code: return False
    return str(code).upper().strip() in NATURAL_GAS_CODES

def get_all_resource_codes():
    return _resource_codes_db
