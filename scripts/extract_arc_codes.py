import pdfplumber
import json
import os
import re
import hashlib
from datetime import datetime, timezone

PDF_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ARC List - V21.1.pdf")
JSON_OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "lookups", "arc_codes.json")
APP_JSON_OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "lookups", "arc_application_codes.json")

def get_file_hash(filepath):
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        hasher.update(f.read())
    return hasher.hexdigest()

def extract_arc_codes():
    if not os.path.exists(PDF_PATH):
        raise FileNotFoundError(f"Missing PDF: {PDF_PATH}")

    pdf_hash = get_file_hash(PDF_PATH)
    
    codes = []
    
    # Hierarchy tracker
    path_levels = {
        1: "",
        2: "",
        3: "",
        4: ""
    }
    
    # regex matches e.g. "2.1111 CONTROL PRESSURE ON STEAMER OPERATIONS"
    # match.group(1) = "2.1111"
    # match.group(2) = "CONTROL PRESSURE..."
    code_pattern = re.compile(r'^(\d\.\d+)\s+(.+)$')
    # level 1 is just digit dot space, e.g. "2. Energy Management"
    l1_pattern = re.compile(r'^(\d\.)\s+(.+)$')
    
    with pdfplumber.open(PDF_PATH) as pdf:
        # We only need pages 7 to 42 for actual ARC codes (based on manual index)
        # But we can just scan all pages and rely on regex.
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if not text:
                continue
                
            lines = text.split('\n')
            for line in lines:
                line = line.strip()
                
                # Check for Level 1 (e.g. "2. Energy Management")
                l1_match = l1_pattern.match(line)
                if l1_match:
                    path_levels[1] = l1_match.group(2).strip()
                    path_levels[2] = ""
                    path_levels[3] = ""
                    path_levels[4] = ""
                    continue
                    
                match = code_pattern.match(line)
                if match:
                    code_str = match.group(1)
                    title = match.group(2).strip()
                    
                    # Determine level based on number of digits after '.'
                    decimals = len(code_str.split('.')[1])
                    
                    if decimals == 1:
                        path_levels[2] = title
                        path_levels[3] = ""
                        path_levels[4] = ""
                    elif decimals == 2:
                        path_levels[3] = title
                        path_levels[4] = ""
                    elif decimals == 3:
                        path_levels[4] = title
                    
                    # Build path from active levels (excluding current level)
                    # For a 4-decimal code, we use levels 1, 2, 3, 4
                    # For a 3-decimal code, we use levels 1, 2, 3
                    active_path = []
                    for level in range(1, decimals + 1):
                        if path_levels.get(level):
                            active_path.append(path_levels[level])
                    
                    path_str = " > ".join(active_path)
                    
                    category_digit = int(code_str.split('.')[0])
                    recommendation_type = category_digit  # 2: energy, 3: waste, 4: productivity, etc.
                    
                    # Store everything 2 decimals or longer as an entry? 
                    # Usually ARC codes used are 3 or 4 decimals. We'll store all to be safe.
                    codes.append({
                        "arcCode": code_str,
                        "title": title,
                        "path": path_str,
                        "recommendationType": recommendation_type
                    })
    
    # Application codes hardcoded from page 43
    app_codes = {
        1: "Manufacturing Process",
        2: "Process Support",
        3: "Building and Grounds",
        4: "Administrative"
    }
    
    # Validation
    if len(codes) < 100:
        raise ValueError(f"Validation failed. Only found {len(codes)} codes.")
        
    # Check for duplicates
    seen = set()
    for c in codes:
        if c['arcCode'] in seen:
            # Maybe some pages have repetition (e.g. index/TOC vs body)
            # Actually, TOC starts early. Let's filter out TOC pages or just dedup.
            pass 
        seen.add(c['arcCode'])
        
    # Dedup taking the last seen (usually the body has the real one, or they are identical)
    unique_codes = {}
    for c in codes:
        unique_codes[c['arcCode']] = c
    final_codes = list(unique_codes.values())
    
    output = {
        "metadata": {
            "source": "ARC List - V21.1.pdf",
            "md5": pdf_hash,
            "extractedAt": datetime.now(timezone.utc).isoformat()
        },
        "codes": final_codes
    }
    
    with open(JSON_OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)
        
    with open(APP_JSON_OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(app_codes, f, indent=2)
        
    print(f"Successfully extracted {len(final_codes)} unique ARC codes to {JSON_OUT_PATH}")

if __name__ == "__main__":
    extract_arc_codes()
