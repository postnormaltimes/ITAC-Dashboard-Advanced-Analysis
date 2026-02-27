from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from app.db.connection import get_db
from pydantic import BaseModel

router = APIRouter()

class Step1TableItem(BaseModel):
    id: str
    description: str
    count: float
    energy: float
    payback: float # Median Payback
    propensity: float # e.g. Count(Matches) / Count(Total) in segment

class Step1ScatterPoint(BaseModel):
    id: str # NAICS or ARC code
    x: float # Median Payback
    y: float # Count (Propensity proxy for now)
    size: float # Energy Savings
    label: str

class Step1Response(BaseModel):
    ranking: List[Step1TableItem]
    scatter_data: List[Step1ScatterPoint]

@router.get("/step1", response_model=Step1Response)
def get_step1_data(
    pivot_type: str = Query(..., enum=["naics", "arc"]),
    pivot_id: str = Query(...),
    conn=Depends(get_db)
):
    """
    Step 1: Bipartite Pivot
    If pivot_type=naics_3, return ranked ARCs for that NAICS.
    If pivot_type=arc_2, return ranked NAICS for that ARC.
    Also return Scatter Plot data (Payback vs Count).
    """
    
    # 1. Determine Target Dimension
    if pivot_type == "naics":
        target_col = "arc_2"
        filter_col = "naics_3"
    else:
        target_col = "naics_3"
        filter_col = "arc_2"

    # 2. Query Logic
    # We query the Materialized View for aggregation
    # Note: MV has aggregations. We need to filter by the pivot_id.
    
    query = f"""
        SELECT 
            {target_col},
            SUM(assessment_count) as assess_count,
            SUM(recommendation_count) as rec_count,
            SUM(total_energy_savings) as energy_savings,
            AVG(median_payback) as avg_payback 
            -- Note: Averaging medians is not statistically perfect but acceptable for pivot
        FROM mv_naics_arc_crosswalk
        WHERE {filter_col} = ?
        GROUP BY {target_col}
        ORDER BY assess_count DESC
        LIMIT 100
    """
    
    rows = conn.execute(query, [pivot_id]).fetchall()
    
    ranking = []
    scatter_data = []
    
    for r in rows:
        target_id = r[0] or "Unknown"
        count = r[1] or 0
        rec_count = r[2] or 0
        energy = r[3] or 0
        payback = r[4] or 0
        
        # Propensity Proxy: Count of Assessments
        # Refinement: count / total_assessments_for_pivot
        # We can calculate total later or just use raw count for now.
        propensity = count
        
        ranking.append(Step1TableItem(
            id=target_id,
            description=f"{target_col.upper()} {target_id}",
            count=count,
            energy=energy,
            payback=payback,
            propensity=propensity
        ))
        
        scatter_data.append(Step1ScatterPoint(
            id=target_id,
            x=payback,
            y=propensity,
            size=energy,
            label=f"{target_col.upper()} {target_id}"
        ))

    return Step1Response(
        ranking=ranking,
        scatter_data=scatter_data
    )
