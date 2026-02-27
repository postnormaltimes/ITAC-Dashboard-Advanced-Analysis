import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_curves_electricity_resource():
    """Test standard curve generation for Electricity"""
    payload = {
        "naics_code": "3323",
        "selected_measure_ids": ["2.1111", "2.1224", "2.1123"],
        "resource_type": "electricity"
    }
    
    response = client.post("/api/advanced/step4_curves", json=payload)
    assert response.status_code == 200
    data = response.json()
    
    # Depending on DB state, the curve might be empty if those measures don't exist for 3323.
    # But it shouldn't crash.
    assert "baseline_curve" in data
    assert "electricity_curve" in data
    assert "gas_curve" in data
    
    # The electricity curve points should be returned in baseline_curve
    assert len(data['electricity_curve']) == len(data['baseline_curve'])

def test_get_curves_natural_gas_resource():
    """Test standard curve generation for Natural Gas"""
    payload = {
        "naics_code": "3323",
        "selected_measure_ids": ["2.1111", "2.1224", "2.1123"],
        "resource_type": "natural_gas"
    }
    
    response = client.post("/api/advanced/step4_curves", json=payload)
    assert response.status_code == 200
    data = response.json()
    
    # The gas curve points should be returned in baseline_curve now
    assert len(data['gas_curve']) == len(data['baseline_curve'])
