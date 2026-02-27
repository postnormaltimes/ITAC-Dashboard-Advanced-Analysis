
from fastapi import APIRouter, Depends
from typing import List
from app.db.connection import get_db
from app.models.schemas import (
    SearchFilters, KPIMetrics, AnalyticsChartsResponse, ChartDataPoint
)
from app.api.endpoints import build_where_clause

router = APIRouter()

@router.post("/kpi", response_model=KPIMetrics)
def get_kpis(filters: SearchFilters, conn=Depends(get_db)):
    where_clause, params = build_where_clause(filters)

    # Calculate KPIs
    # impstatus='Implemented' check for savings
    query = f"""
        SELECT 
            SUM(yearly_savings), 
            SUM(implementation_cost), 
            COUNT(*), 
            AVG(payback),
            SUM(CASE WHEN impstatus = 'Implemented' THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100,
            SUM(CASE WHEN impstatus = 'Implemented' THEN yearly_savings ELSE 0 END)
        FROM recommendations
        {where_clause}
    """
    row = conn.execute(query, params).fetchone()
    
    # Top ARC by count or savings? Let's use count for "Top ARC" as in "Most Common Opportunity"
    # Or typically "Top Savings Opportunity". Let's use Savings.
    top_arc_query = f"""
        SELECT arc
        FROM recommendations
        {where_clause}
        GROUP BY arc
        ORDER BY SUM(yearly_savings) DESC
        LIMIT 1
    """
    top_arc_row = conn.execute(top_arc_query, params).fetchone()
    top_arc = top_arc_row[0] if top_arc_row else None

    return KPIMetrics(
        total_savings=row[0] or 0,
        total_cost=row[1] or 0,
        count=row[2] or 0,
        avg_payback=row[3] or 0,
        percent_implemented=row[4] or 0,
        implemented_savings=row[5] or 0,
        top_arc=top_arc
    )

@router.post("/charts", response_model=AnalyticsChartsResponse)
def get_charts(filters: SearchFilters, conn=Depends(get_db)):
    where_clause, params = build_where_clause(filters)

    # 1. Savings by ARC (Top 10)
    arc_query = f"""
        SELECT COALESCE(arc, 'Unknown'), SUM(yearly_savings)
        FROM recommendations
        {where_clause}
        GROUP BY arc
        ORDER BY SUM(yearly_savings) DESC
        LIMIT 10
    """
    arc_rows = conn.execute(arc_query, params).fetchall()
    savings_by_arc = [ChartDataPoint(label=r[0] or "Unknown", value=r[1]) for r in arc_rows]

    # 2. Savings by Payback (Bins: <1, 1-2, 2-3... >5?)
    # Simple histogram by flooring payback
    payback_query = f"""
        SELECT 
            CASE 
                WHEN payback < 1 THEN '< 1 yr'
                WHEN payback >= 1 AND payback < 2 THEN '1-2 yrs'
                WHEN payback >= 2 AND payback < 3 THEN '2-3 yrs'
                WHEN payback >= 3 AND payback < 5 THEN '3-5 yrs'
                ELSE '> 5 yrs'
            END as bin,
            SUM(yearly_savings)
        FROM recommendations
        {where_clause}
        GROUP BY bin
        ORDER BY MIN(payback) -- Sort logic is tricky with strings, relies on min payback in group
    """
    # Fix sorting:
    payback_query = f"""
        SELECT 
            CASE 
                WHEN payback < 1 THEN '< 1 yr'
                WHEN payback < 2 THEN '1-2 yrs'
                WHEN payback < 3 THEN '2-3 yrs'
                WHEN payback < 5 THEN '3-5 yrs'
                ELSE '> 5 yrs'
            END as bin,
            SUM(yearly_savings),
            MIN(payback) as sort_key
        FROM recommendations
        {where_clause}
        GROUP BY bin
        ORDER BY sort_key
    """
    payback_rows = conn.execute(payback_query, params).fetchall()
    savings_by_payback = [ChartDataPoint(label=r[0], value=r[1]) for r in payback_rows]

    # 3. Savings by State
    state_query = f"""
        SELECT COALESCE(state, 'Unknown'), SUM(yearly_savings)
        FROM recommendations
        {where_clause}
        GROUP BY state
        ORDER BY SUM(yearly_savings) DESC
    """
    state_rows = conn.execute(state_query, params).fetchall()
    savings_by_state = [ChartDataPoint(label=r[0] or "Unknown", value=r[1]) for r in state_rows]

    return AnalyticsChartsResponse(
        savings_by_arc=savings_by_arc,
        savings_by_payback=savings_by_payback,
        savings_by_state=savings_by_state
    )
