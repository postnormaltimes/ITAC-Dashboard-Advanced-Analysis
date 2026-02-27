from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from app.db.connection import get_db
from pydantic import BaseModel

router = APIRouter()

class Step2BarItem(BaseModel):
    size_bucket: str # Micro, Small, Medium, Large
    count: float
    energy: float
    avg_payback: float

class Step2Response(BaseModel):
    firm_size_distribution: List[Step2BarItem]

@router.get("/step2", response_model=Step2Response)
def get_step2_data(
    naics_code: str = Query(...),
    arc_code: str = Query(..., description="Selected ARC from Step 1"), # Optional? No, funnel implies strict path.
    conn=Depends(get_db)
):
    """
    Step 2: Firm Size Segmentation
    Filter by NAICS + ARC.
    Group by Firm Size.
    Return distribution stats for the Bar Chart.
    """
    
    # In shadow-dashboard-migration.md: "Filter: NAICS + ARC -> Top Firm Sizes"
    # Actually, Step 1 selects ARC (if NAICS selected first).
    # So now we have (NAICS, ARC) pair.
    
    query = """
        SELECT 
            firm_size,
            SUM(assessment_count) as assess_count,
            SUM(total_energy_savings) as energy,
            AVG(median_payback) as avg_payback
        FROM mv_naics_arc_crosswalk
        WHERE naics_3 = ? AND arc_2 = ?
        GROUP BY firm_size
        ORDER BY 
            CASE firm_size 
                WHEN 'Micro' THEN 1
                WHEN 'Small' THEN 2
                WHEN 'Medium' THEN 3
                WHEN 'Large' THEN 4
                ELSE 5 
            END
    """
    
    rows = conn.execute(query, [naics_code, arc_code]).fetchall()
    
    distribution = []
    
    for r in rows:
        distribution.append(Step2BarItem(
            size_bucket=r[0] or "Unknown",
            count=r[1] or 0,
            energy=r[2] or 0,
            avg_payback=r[3] or 0
        ))

    return Step2Response(
        firm_size_distribution=distribution
    )
