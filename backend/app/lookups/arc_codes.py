import json
import os
from pathlib import Path

LOOKUPS_DIR = Path(__file__).parent.parent.parent.parent / "data" / "lookups"
ARC_CODES_PATH = LOOKUPS_DIR / "arc_codes.json"
APP_CODES_PATH = LOOKUPS_DIR / "arc_application_codes.json"

_arc_codes_db = {}
_app_codes_db = {}
_metadata = {}

def _load_db():
    global _arc_codes_db, _app_codes_db, _metadata
    
    if not _arc_codes_db and ARC_CODES_PATH.exists():
        with open(ARC_CODES_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            _metadata = data.get("metadata", {})
            for item in data.get("codes", []):
                _arc_codes_db[item["arcCode"]] = item
                
    if not _app_codes_db and APP_CODES_PATH.exists():
        with open(APP_CODES_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Json keys are strings, convert to string/int lookup
            for k, v in data.items():
                _app_codes_db[str(k)] = v
                try:
                    _app_codes_db[int(k)] = v
                except ValueError:
                    pass

_load_db()

def get_arc_label(arc_code: str, app_code: str = None) -> str:
    """Returns human-readable formatting: '2.1111 — CONTROL PRESSURE ON STEAMER OPERATIONS (App 1: Manufacturing Process)'"""
    if not arc_code:
        return "Unknown Measure"
    
    arc_code = str(arc_code).strip()
    entry = _arc_codes_db.get(arc_code)
    
    if not entry:
        return f"Measure {arc_code}"
        
    title = entry.get("title", "")
    
    label = f"{arc_code} — {title}"
    
    if app_code:
        app_name = _app_codes_db.get(app_code)
        if app_name:
            label += f" (App {app_code}: {app_name})"
        else:
            label += f" (App {app_code})"
            
    return label
    
def get_arc_entry(arc_code: str):
    return _arc_codes_db.get(str(arc_code).strip())

def get_all_arc_codes():
    return _arc_codes_db

def get_all_app_codes():
    return _app_codes_db
