import duckdb
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Resolve absolute path: scripts/setup_shadow_db.py -> repo_root/data/warehouse.duckdb
_SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = str(_SCRIPT_DIR.parent / "data" / "warehouse.duckdb")

def setup_shadow_views():
    con = duckdb.connect(DB_PATH)
    logger.info("Connected to DuckDB.")

    # 1. Define Firm Size Logic (in-memory macro or view)
    # We'll bake this into the materialized view for speed.
    # Micro: <10 employees AND annual_sales <= 2,000,000
    # Small: <50 employees AND annual_sales <= 10,000,000
    # Medium: <250 employees AND annual_sales <= 50,000,000
    # Large: >=250 employees AND annual_sales > 50,000,000
    # Note: Logic must handle the "Else" carefully (e.g. if Missing).
    # If missing, we label 'Unknown'.

    # 2. Extract Dimensions
    # NAICS: First 3 digits.
    # ARC: Is 'arc' already the 2-digit code? We assume 'arc' col is the ARC2 code based on ingest.

    logger.info("Creating materialized view: mv_naics_arc_crosswalk")
    
    query = """
    CREATE OR REPLACE TABLE mv_naics_arc_crosswalk AS
    WITH enriched AS (
        SELECT
            *,
            SUBSTR(naics, 1, 3) as naics_3,
            arc as arc_2, -- Assuming 'arc' is already the granularity we want
            CASE
                WHEN employees IS NULL OR sales IS NULL THEN 'Unknown'
                WHEN employees < 10 AND sales <= 2000000 THEN 'Micro'
                WHEN employees < 50 AND sales <= 10000000 THEN 'Small'
                WHEN employees < 250 AND sales <= 50000000 THEN 'Medium'
                ELSE 'Large'
            END as firm_size
        FROM recommendations
    )
    SELECT
        naics_3,
        arc_2,
        firm_size,
        COUNT(DISTINCT id) as assessment_count,
        COUNT(*) as recommendation_count,
        SUM(yearly_savings) as total_energy_savings,
        SUM(CASE WHEN impstatus = 'Implemented' THEN yearly_savings ELSE 0 END) as implemented_energy_savings,
        SUM(CASE WHEN impstatus = 'Implemented' THEN 1 ELSE 0 END) as implemented_count,
        MEDIAN(payback) as median_payback,
        MEDIAN(implementation_cost / NULLIF(yearly_savings, 0)) as median_capital_intensity
    FROM enriched
    GROUP BY naics_3, arc_2, firm_size
    """

    try:
        con.execute(query)
        logger.info("Materialized view created successfully.")
        
        # Verify
        count = con.execute("SELECT COUNT(*) FROM mv_naics_arc_crosswalk").fetchone()[0]
        logger.info(f"Row count in materialized view: {count}")
        
    except Exception as e:
        logger.error(f"Failed to create view: {e}")
    finally:
        con.close()

if __name__ == "__main__":
    setup_shadow_views()
