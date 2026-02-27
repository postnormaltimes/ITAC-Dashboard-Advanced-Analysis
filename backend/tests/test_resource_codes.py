import pytest
from app.lookups.resource_codes import get_resource_label, is_electricity, is_natural_gas, _resource_codes_db

def test_database_loaded():
    assert len(_resource_codes_db) >= 28, "Resource codes database should be loaded and have at least 28 entries"

def test_get_resource_label():
    label_ec = get_resource_label("EC")
    assert "EC — Electrical Consumption" in label_ec
    assert "KWH(site)" in label_ec or "kWh" in label_ec.lower()
    
    label_e2 = get_resource_label("E2")
    assert "E2 — Natural Gas" in label_e2
    assert "MMBtu" in label_e2

    label_unknown = get_resource_label("UNKNOWN_CODE")
    assert label_unknown == "UNKNOWN_CODE"

def test_electricity_classification():
    assert is_electricity("EC") is True
    assert is_electricity("E1") is True
    assert is_electricity("E2") is False
    assert is_electricity("W1") is False

def test_natural_gas_classification():
    assert is_natural_gas("E2") is True
    assert is_natural_gas("EC") is False
    assert is_natural_gas("E3") is False
