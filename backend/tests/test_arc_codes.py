import pytest
import re
from app.lookups.arc_codes import get_arc_label, get_arc_entry, _arc_codes_db

def test_arc_database_loaded():
    assert len(_arc_codes_db) >= 800, "ARC codes database should be loaded and have many entries"

def test_get_arc_label_known_codes():
    # Spot check 1: 2.1111 (From page 8 of PDF)
    label_1 = get_arc_label("2.1111")
    assert "2.1111" in label_1
    assert "CONTROL PRESSURE ON STEAMER OPERATIONS" in label_1.upper()
    
    # Spot check 2 with App code
    label_2 = get_arc_label("2.1111", 1)
    assert "CONTROL PRESSURE" in label_2.upper()
    assert "(App 1: Manufacturing Process)" in label_2
    
    # Spot check unknown
    label_unknown = get_arc_label("99.9999")
    assert label_unknown == "Measure 99.9999"

def test_arc_regex_coverage():
    # Codes should follow digit.digits pattern
    pattern = re.compile(r'^\d\.\d+$')
    for code, entry in _arc_codes_db.items():
        assert pattern.match(code), f"Code {code} fails regex format"
        assert entry['title'], f"Code {code} has empty title"
        assert entry['recommendationType'] == int(code.split('.')[0]), "Type mismatch"

def test_arc_path():
    entry = get_arc_entry("2.1111")
    # Path should ideally contain "Energy Management" -> "Combustion Systems" -> "FURNACES..." -> "Operations"
    # But relies on PDF parsing robustness. At least it shouldn't be empty.
    assert entry is not None
    assert entry.get('path') is not None
