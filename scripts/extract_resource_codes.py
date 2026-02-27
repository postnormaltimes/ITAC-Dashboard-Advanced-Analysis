import pdfplumber
import json
import os
import hashlib
from datetime import datetime, timezone

PDF_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "IAC_DatabaseManualv10.2.pdf")
JSON_OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "lookups", "resource_identification_codes.json")

# Ensure output directory exists
os.makedirs(os.path.dirname(JSON_OUT_PATH), exist_ok=True)

def get_file_hash(filepath):
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        buf = f.read()
        hasher.update(buf)
    return hasher.hexdigest()

def extract_resource_codes():
    if not os.path.exists(PDF_PATH):
        raise FileNotFoundError(f"Missing PDF: {PDF_PATH}")

    pdf_hash = get_file_hash(PDF_PATH)
    
    codes = []
    current_stream_type = None
    
    with pdfplumber.open(PDF_PATH) as pdf:
        # Page 22 (0-indexed 21)
        page = pdf.pages[21]
        tables = page.extract_tables()
        
        main_table = tables[0]
        
        # Skip header row
        for row in main_table[1:]:
            # pdfplumber might output many empty string columns.
            # Based on probe: index 1 is TYPE, 4 is STREAM, 7 is CODE, 10 is UNITS
            # But let's be more robust: remove all None/empty strings, then assign based on length remaining.
            # Actually, fixed indices work better if the table is consistent.
            
            stream_type_raw = row[1]
            stream_name_raw = row[4]
            code_raw = row[7]
            units_raw = row[10]
            
            # Clean stream type
            if stream_type_raw and str(stream_type_raw).strip():
                current_stream_type = str(stream_type_raw).strip().replace('\n', ' ')
            
            if not code_raw or not str(code_raw).strip():
                continue # Skip rows without a code
                
            stream_name = str(stream_name_raw).strip().replace('\n', ' ')
            code = str(code_raw).strip().replace('\n', '')
            units = str(units_raw).strip().replace('\n', ' ')
            
            # Fix superscript 5 on E1
            if code == "E15" and "Electricity" in stream_name:
                code = "E1"
                
            notes = ""
            if code == "E1":
                notes = "E1 was replaced with EC, ED, and EF as of FY 95 (9/30/95)."
                
            codes.append({
                "streamType": current_stream_type,
                "streamName": stream_name,
                "code": code,
                "consumptionUnits": units,
                "notes": notes
            })
            
    # Validation against expected codes (user constraint)
    expected_codes = {
        "EC", "ED", "EF", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "E11", "E12",
        "W1", "W2", "W3", "W4", "W5", "W6",
        "R1", "R2", "R3", "R4", "R5", "R6",
        "P1", "P2", "P3"
    }
    extracted_codes = {c['code'] for c in codes}
    
    missing = expected_codes - extracted_codes
    if missing:
        raise ValueError(f"Validation failed. Missing expected codes: {missing}")
        
    output = {
        "metadata": {
            "source": "IAC_DatabaseManualv10.2.pdf",
            "page": 22,
            "md5": pdf_hash,
            "extractedAt": datetime.now(timezone.utc).isoformat()
        },
        "codes": codes
    }
    
    with open(JSON_OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)
        
    print(f"Successfully extracted {len(codes)} codes to {JSON_OUT_PATH}")

if __name__ == "__main__":
    extract_resource_codes()
