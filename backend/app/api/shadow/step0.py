from fastapi import APIRouter, Depends, Query
from typing import List, Optional, Dict
from app.db.connection import get_db
from pydantic import BaseModel

router = APIRouter()

class Step0TableItem(BaseModel):
    id: str # NAICS code or ARC code
    description: str # For now use code as description if missing
    count_assessments: float # Use float to handle potential aggregation sums
    count_recommendations: float
    metric_value: float # The sorting metric (Count or Energy)

class Step0SankeyLink(BaseModel):
    source: str # NAICS
    target: str # ARC
    value: float

class Step0Response(BaseModel):
    naics_ranking: List[Step0TableItem]
    arc_ranking: List[Step0TableItem]
    sankey_data: List[Step0SankeyLink]

@router.get("/step0", response_model=Step0Response)
def get_step0_data(
    metric: str = Query("count", enum=["count", "energy"]),
    limit: int = 25,
    conn=Depends(get_db)
):
    """
    Returns data for Step 0 Macro Triage:
    1. NAICS Ranking
    2. ARC Ranking
    3. Sankey Links
    """
    
    # 1. NAICS Ranking
    # Group by NAICS_3
    if metric == "count":
        naics_sort = "SUM(assessment_count)"
    else:
        naics_sort = "SUM(total_energy_savings)"

    naics_query = f"""
        SELECT 
            naics_3, 
            SUM(assessment_count) as assess_count,
            SUM(recommendation_count) as rec_count,
            {naics_sort} as sort_val
        FROM mv_naics_arc_crosswalk
        GROUP BY naics_3
        ORDER BY sort_val DESC
        LIMIT ?
    """
    naics_rows = conn.execute(naics_query, [limit]).fetchall()
    naics_ranking = [
        Step0TableItem(
            id=r[0] or "Unknown",
            description=f"NAICS {r[0] or 'Unknown'}", # Placeholder description
            count_assessments=r[1],
            count_recommendations=r[2],
            metric_value=r[3]
        ) for r in naics_rows
    ]

    # 2. ARC Ranking
    if metric == "count":
        arc_sort = "SUM(recommendation_count)" # ARC ranking usually rec count
    else:
        arc_sort = "SUM(total_energy_savings)"

    arc_query = f"""
        SELECT 
            arc_2, 
            SUM(assessment_count) as assess_count,
            SUM(recommendation_count) as rec_count,
            {arc_sort} as sort_val
        FROM mv_naics_arc_crosswalk
        GROUP BY arc_2
        ORDER BY sort_val DESC
        LIMIT ?
    """
    arc_rows = conn.execute(arc_query, [limit]).fetchall()
    arc_ranking = [
        Step0TableItem(
            id=r[0] or "Unknown",
            description=f"ARC {r[0] or 'Unknown'}", # Placeholder
            count_assessments=r[1],
            count_recommendations=r[2],
            metric_value=r[3]
        ) for r in arc_rows
    ]

    # 3. Sankey Data
    # Links between Top N NAICS and Top N ARC
    # To avoid visual clutter, we might want to filter only flows between the top items
    # But for now let's just return the top flows globally
    
    if metric == "count":
        flow_metric = "SUM(recommendation_count)"
    else:
        flow_metric = "SUM(total_energy_savings)"

    sankey_query = f"""
        SELECT 
            naics_3,
            arc_2,
            {flow_metric} as val
        FROM mv_naics_arc_crosswalk
        GROUP BY naics_3, arc_2
        ORDER BY val DESC
        LIMIT 50 
    """
    # Restricting to top 50 flows for readability in Step 0
    sankey_rows = conn.execute(sankey_query).fetchall()
    sankey_data = [
        Step0SankeyLink(source=r[0] or "Unknown", target=r[1] or "Unknown", value=r[2])
        for r in sankey_rows
    ]

    return Step0Response(
        naics_ranking=naics_ranking,
        arc_ranking=arc_ranking,
        sankey_data=sankey_data
    )
