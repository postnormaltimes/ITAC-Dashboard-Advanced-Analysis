import pandas as pd # Still needed for some cleanup if necessary, but mainly using openpyxl and csv
import duckdb
import os
import glob
import logging
import csv
import openpyxl
from pathlib import Path

# Setup logging
logging.basicConfig(
    filename='logs/ingestion.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
console = logging.StreamHandler()
console.setLevel(logging.INFO)
logging.getLogger('').addHandler(console)

DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "warehouse.duckdb"

def clean_column_name(col):
    """Normalize column name to snake_case."""
    if not col: return "unknown"
    return str(col).strip().lower().replace(' ', '_').replace('-', '_').replace('/', '_')

def excel_to_csv(sheet, csv_path):
    """Streams an openpyxl worksheet to a CSV file."""
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        rows = sheet.rows
        
        # Read header
        try:
            header_row = next(rows)
            headers = [clean_column_name(cell.value) for cell in header_row]
            writer.writerow(headers)
        except StopIteration:
            return headers # Empty sheet

        # Write data rows
        for row in rows:
            writer.writerow([cell.value for cell in row])
            
    return headers

def ingest_data():
    """Finds Excel file, converts sheets to CSV, and loads into DuckDB."""
    excel_files = list(DATA_DIR.glob("*.xlsx"))
    if not excel_files:
        logging.error("No Excel file found in data/ directory.")
        return

    # Prioritize ITAC_Database.xlsx if present
    itac_db = DATA_DIR / "ITAC_Database.xlsx"
    file_path = itac_db if itac_db.exists() else excel_files[0]
    
    logging.info(f"Starting ingestion for: {file_path}")

    try:
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheet_names = wb.sheetnames
        
        recc_sheet_name = "RECC"
        assess_sheet_name = "ASSESS" if "ASSESS" in sheet_names else "IAC"
        
        if recc_sheet_name not in sheet_names or assess_sheet_name not in sheet_names:
            logging.error(f"Missing required sheets: {recc_sheet_name} or {assess_sheet_name}")
            return

        # 1. Convert to CSV
        recc_csv = DATA_DIR / "recc.csv"
        assess_csv = DATA_DIR / "assess.csv"
        
        logging.info(f"Converting sheet {recc_sheet_name} to CSV...")
        excel_to_csv(wb[recc_sheet_name], recc_csv)
        
        logging.info(f"Converting sheet {assess_sheet_name} to CSV...")
        excel_to_csv(wb[assess_sheet_name], assess_csv)
        
        logging.info("CSV conversion complete.")
        
        # 2. Load into DuckDB
        con = duckdb.connect(str(DB_PATH))
        
        # Create staging tables with explicit null handling for 'nan' strings if any
        con.execute(f"CREATE OR REPLACE TABLE recc AS SELECT * FROM read_csv_auto('{recc_csv}', normalize_names=True, null_padding=True)")
        con.execute(f"CREATE OR REPLACE TABLE assess AS SELECT * FROM read_csv_auto('{assess_csv}', normalize_names=True, null_padding=True)")
        
        # 3. Create Final Table (Join)
        logging.info("Creating final table recommendations...")
        con.execute("DROP TABLE IF EXISTS recommendations")
        
        # We perform explicit casting and aliasing to match the application schema
        # Schema requires: id, fy, arc, description, yearly_savings, implementation_cost, impstatus, payback, center, state
        # Plus detail fields: naics, sales, employees, products, plant_area, psaved, ssaved
        
        # Note: clean_column_name lowercases everything. 
        # RECC cols: id, fy, arc2, impstatus, impcost, tsaved, psaved, ssaved, payback
        # ASSESS cols: id, center, fy, sic, naics, state, sales, employees, plant_area, products
        
        query = """
            CREATE TABLE recommendations AS 
            SELECT 
                CAST(r.id AS VARCHAR) as id,
                COALESCE(TRY_CAST(r.fy AS INTEGER), 0) as fy,
                
                -- ARC: Cast to string, ensure not null
                COALESCE(CAST(r.arc2 AS VARCHAR), '') as arc,
                
                -- Description: Cast ARC to string for description
                CAST('Measure ' || COALESCE(CAST(r.arc2 AS VARCHAR), 'Unknown') AS VARCHAR) as description,
                
                -- Metrics: Try cast to double, default 0
                COALESCE(TRY_CAST(r.tsaved AS DOUBLE), 0) as yearly_savings, -- This might be 'TSAVED' (Total?) or Tertiary. User said "TSAVED" is a column.
                -- User formula for Gross Savings is Sum(PSAVED, SSAVED, TSAVED, QSAVED). 
                -- So we should ingest them all individually.

                COALESCE(TRY_CAST(r.impcost AS DOUBLE), 0) as implementation_cost,
                COALESCE(TRY_CAST(r.payback AS DOUBLE), 0) as payback,
                
                -- Status: Cast to string, nullif 'nan'
                NULLIF(CAST(r.impstatus AS VARCHAR), 'nan') as impstatus,
                
                -- Detail Metrics (Savings $)
                COALESCE(TRY_CAST(r.psaved AS DOUBLE), 0) as psaved,
                COALESCE(TRY_CAST(r.ssaved AS DOUBLE), 0) as ssaved,
                COALESCE(TRY_CAST(r.tsaved AS DOUBLE), 0) as tsaved,
                COALESCE(TRY_CAST(r.qsaved AS DOUBLE), 0) as qsaved,

                -- Detail Metrics (Conserved Units)
                COALESCE(TRY_CAST(r.pconserved AS DOUBLE), 0) as pconserved,
                COALESCE(TRY_CAST(r.sconserved AS DOUBLE), 0) as sconserved,
                COALESCE(TRY_CAST(r.tconserved AS DOUBLE), 0) as tconserved,
                COALESCE(TRY_CAST(r.qconserved AS DOUBLE), 0) as qconserved,

                -- Source Codes
                NULLIF(CAST(r.psourccode AS VARCHAR), 'nan') as psourccode,
                NULLIF(CAST(r.ssourccode AS VARCHAR), 'nan') as ssourccode,
                NULLIF(CAST(r.tsourccode AS VARCHAR), 'nan') as tsourccode,
                NULLIF(CAST(r.qsourccode AS VARCHAR), 'nan') as qsourccode,
                
                -- Facility Info (from Assess)
                NULLIF(CAST(a.center AS VARCHAR), 'nan') as center,
                NULLIF(CAST(a.state AS VARCHAR), 'nan') as state,
                NULLIF(CAST(a.naics AS VARCHAR), 'nan') as naics,
                NULLIF(CAST(a.sic AS VARCHAR), 'nan') as sic,
                COALESCE(TRY_CAST(a.sales AS DOUBLE), 0) as sales,
                COALESCE(TRY_CAST(a.employees AS INTEGER), 0) as employees,
                NULLIF(CAST(a.products AS VARCHAR), 'nan') as products,
                NULLIF(CAST(a.plant_area AS VARCHAR), 'nan') as plant_area

            FROM recc r
            LEFT JOIN assess a ON CAST(r.id AS VARCHAR) = CAST(a.id AS VARCHAR)
        """
        
        con.execute(query)
        
        # Post-processing / Cleanup
        # Remove rows with no ID if any
        con.execute("DELETE FROM recommendations WHERE id IS NULL")

        # Create indexes
        logging.info("Creating indexes...")
        con.execute("CREATE INDEX IF NOT EXISTS idx_arc ON recommendations(arc)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_status ON recommendations(impstatus)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_state ON recommendations(state)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_fy ON recommendations(fy)")

        count = con.execute("SELECT COUNT(*) FROM recommendations").fetchone()[0]
        logging.info(f"Ingestion complete. Total rows in DB: {count}")
        
        con.close()
        
        # Cleanup CSVs (optional, keeping for now for debugging)
        # os.remove(recc_csv)
        # os.remove(assess_csv)

    except Exception as e:
        logging.exception(f"Ingestion failed: {e}")

if __name__ == "__main__":
    ingest_data()
