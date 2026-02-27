import pandas as pd
import os

data_dir = "data"
os.makedirs(data_dir, exist_ok=True)
file_path = os.path.join(data_dir, "sample.xlsx")

# Create RECC sheet data
recc_data = {
    "ID": ["1001", "1002", "1003", "1004", "1005"],
    "FY": [2023, 2023, 2024, 2024, 2025],
    "ARC2": ["Compressors", "HVAC", "Lighting", "Motors", "Process Cooling"],
    "DESCRIPTION": ["Install VFD", "Upgrade Chiller", "LED Retrofit", "High Eff Motor", "Free Cooling"],
    "IMPCOST": [5000, 15000, 2000, 4000, 8000],
    "PSAVED": [1000, 5000, 500, 800, 2000],
    "SSAVED": [0, 0, 0, 0, 0],
    "TSAVED": [0, 0, 0, 0, 0],
    "QSAVED": [0, 0, 0, 0, 0],
    "PAYBACK": [5.0, 3.0, 4.0, 5.0, 4.0],
    "IMPSTATUS": ["Implemented", "Recommended", "Implemented", "Void", "Implemented"]
}

# Create IAC sheet data (Facility info)
iac_data = {
    "ID": ["1001", "1002", "1003", "1004", "1005"],
    "CENTER": ["Center A", "Center A", "Center B", "Center B", "Center C"],
    "STATE": ["CA", "CA", "TX", "TX", "NY"],
    "NAICS": ["3112", "3112", "3251", "3251", "3344"],
    "EMPLOYEES": [250, 250, 500, 500, 100],
    "SALES": [50000000.0, 50000000.0, 150000000.0, 150000000.0, 20000000.0]
}

recc_df = pd.DataFrame(recc_data)
iac_df = pd.DataFrame(iac_data)

with pd.ExcelWriter(file_path) as writer:
    recc_df.to_excel(writer, sheet_name="RECC", index=False)
    iac_df.to_excel(writer, sheet_name="IAC", index=False)

print(f"Created {file_path}")
