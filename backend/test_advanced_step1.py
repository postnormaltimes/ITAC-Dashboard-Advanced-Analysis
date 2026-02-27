import requests
import json

BASE_URL = "http://localhost:8000/api/advanced"

def test_step1():
    print("Testing Step 1 Evaluate...")
    
    # Test Demo Case 3323
    payload = {"naics_code": "3323"}
    try:
        response = requests.post(f"{BASE_URL}/step1_evaluate", json=payload)
        response.raise_for_status()
        data = response.json()
        
        print(f"Status: {response.status_code}")
        print(f"Measures Found: {len(data['measures'])}")
        print(f"Industry Median Price: {data['industry_median_energy_cost']}")
        
        if len(data['measures']) > 0:
            top = data['measures'][0]
            print("Top Measure:")
            print(json.dumps(top, indent=2))
            
            # Verify Score Range
            assert 0 <= top['score'] <= 100, "Score out of range"
            print("Score verification passed.")
            
        else:
            print("WARNING: No measures returned. Database might be empty and fallback didn't trigger?")

    except Exception as e:
        print(f"FAILED: {e}")
        if hasattr(e, 'response') and e.response:
             print(e.response.text)

if __name__ == "__main__":
    test_step1()
