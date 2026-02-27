
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from app.db.connection import get_db
from app.models.schemas import (
    SearchFilters, WaterfallResponse, WaterfallL1Item, WaterfallL2Item, WaterfallL3Item
)
from app.api.endpoints import build_where_clause

router = APIRouter()

@router.post("/analyze", response_model=WaterfallResponse)
def get_waterfall_analysis(filters: SearchFilters, conn=Depends(get_db)):
    """
    Returns data for the 3-step waterfall analysis.
    - If no specific hierarchy filters, returns Level 1 (ARC).
    - If ARC selected, returns Level 2 (NAICS) for that ARC.
    - If ARC & NAICS selected, returns Level 3 (Sensitivity) for that intersection.
    """
    where_clause, params = build_where_clause(filters)
    
    response = WaterfallResponse()

    # Level 1: ARC2 Aggregation
    # calculate implementation rate = sum(case whenever impstatus='Implemented' then 1 else 0) / count(*)
    # calculate avg_lcoe = avg(implementation_cost / yearly_savings) where yearly_savings > 0
    # Note: LCOE typically involves CRF. For simplicity per user request "Annual investment capital recovery / annual energy savings"
    # We assume 'implementation_cost' is the capital cost. Capital Recovery = Cost * CRF. 
    # Let's use CRF = 0.1 (appx 7% for 15 yrs is ~0.11) or just simply Cost/Savings/Payback if LCOE logic isn't strictly defined.
    # User said: "average levelised cost of conserved energy (Annual investment capital recovery / annual energy savings per measure)"
    # CRF (7%, 15yr) = 0.1098 ~ 0.11
    CRF = 0.11 

    if not filters.arc:
        # Step 1: User hasn't selected an ARC yet. Show ARC Tables.
        query = f"""
            SELECT 
                arc,
                COUNT(*) as total_count,
                SUM(CASE WHEN impstatus = 'Implemented' THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as imp_rate,
                AVG(CASE WHEN yearly_savings > 0 THEN (implementation_cost * {CRF}) / yearly_savings ELSE NULL END) as avg_lcoe
            FROM recommendations
            {where_clause}
            GROUP BY arc
            ORDER BY imp_rate DESC
        """
        rows = conn.execute(query, params).fetchall()
        response.l1_data = [
            WaterfallL1Item(arc=r[0], count=r[1], implementation_rate=r[2], avg_lcoe=r[3] or 0)
            for r in rows
        ]
        return response

    if filters.arc and not filters.naics:
        # Step 2: User selected ARC. Show NAICS Tables within that ARC.
        # We need to filter by ARC, which is already handled by build_where_clause if filters.arc is set.
        query = f"""
            SELECT 
                naics,
                COUNT(*) as total_count,
                SUM(CASE WHEN impstatus = 'Implemented' THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as imp_rate,
                AVG(CASE WHEN yearly_savings > 0 THEN (implementation_cost * {CRF}) / yearly_savings ELSE NULL END) as avg_lcoe
            FROM recommendations
            {where_clause}
            GROUP BY naics
            ORDER BY imp_rate DESC
        """
        rows = conn.execute(query, params).fetchall()
        response.l2_data = [
            WaterfallL2Item(naics=r[0], count=r[1], implementation_rate=r[2] or 0, avg_lcoe=r[3] or 0)
            for r in rows
        ]
        return response

    if filters.arc and filters.naics:
        # Step 3: User selected ARC and NAICS. Show Sensitivity Scatter.
        query = f"""
            SELECT 
                id, employees, sales, yearly_savings, impstatus,
                CASE WHEN yearly_savings > 0 THEN (implementation_cost * {CRF}) / yearly_savings ELSE 0 END as lcoe
            FROM recommendations
            {where_clause}
        """
        rows = conn.execute(query, params).fetchall()
        response.l3_data = [
            WaterfallL3Item(
                id=r[0], 
                employees=r[1], 
                sales=r[2], 
                yearly_savings=r[3], 
                impstatus=r[4],
                lcoe=r[5]
            )
            for r in rows
        ]
        return response

    return response
