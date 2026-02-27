
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
import duckdb
from app.db.connection import get_db
from app.models.schemas import (
    SearchFilters, SearchResponse, Recommendation, RecommendationDetail, FacetsResponse, FacetCount, ValueFilter,
    AggregatesResponse, KPIMetrics, ChartDataPoint,
    CostCurveRequest, CostCurveResponse, CostCurvePoint, CostCurveParams
)

router = APIRouter()

def build_where_clause(filters: SearchFilters):
    conditions = []
    params = []

    print(f"DEBUG: Received filters: {filters}")

    if filters.arc:
        conditions.append("arc LIKE ?")
        params.append(f"%{filters.arc}%")
    
    if filters.status:
        placeholders = ",".join(["?"] * len(filters.status))
        conditions.append(f"impstatus IN ({placeholders})")
        params.extend(filters.status)

    if filters.center:
        placeholders = ",".join(["?"] * len(filters.center))
        conditions.append(f"center IN ({placeholders})")
        params.extend(filters.center)

    if filters.state:
        placeholders = ",".join(["?"] * len(filters.state))
        conditions.append(f"state IN ({placeholders})")
        params.extend(filters.state)

    if filters.naics:
        conditions.append("naics LIKE ?")
        params.append(f"%{filters.naics}%")

    if filters.year:
        op = filters.year.operator
        if op in ["==", ">=", "<=", ">", "<"]:
            conditions.append(f"fy {op} ?")
            params.append(filters.year.value)

    if filters.savings:
        op = filters.savings.operator
        if op in ["==", ">=", "<=", ">", "<"]:
             # yearly_savings is a float
            conditions.append(f"yearly_savings {op} ?")
            params.append(filters.savings.value)
    
    if filters.cost:
        op = filters.cost.operator
        if op in ["==", ">=", "<=", ">", "<"]:
            conditions.append(f"implementation_cost {op} ?")
            params.append(filters.cost.value)
    
    if filters.search_query:
        # Simple case-insensitive search on description
        conditions.append("(lower(description) LIKE ? OR lower(center) LIKE ?)")
        search_term = f"%{filters.search_query.lower()}%"
        params.extend([search_term, search_term])

    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
    return where_clause, params

@router.post("/search", response_model=SearchResponse)
def search_recommendations(
    filters: SearchFilters,
    page: int = 1,
    size: int = 20,
    conn=Depends(get_db)
):
    where_clause, params = build_where_clause(filters)
    
    # Count total
    count_query = f"SELECT COUNT(*) FROM recommendations {where_clause}"
    total = conn.execute(count_query, params).fetchone()[0]
    
    # Fetch subset
    offset = (page - 1) * size
    query = f"""
        SELECT 
            id, fy, arc, description, yearly_savings, 
            implementation_cost, impstatus, payback, center, state
        FROM recommendations 
        {where_clause}
        ORDER BY fy DESC, id ASC
    """
    
    # Pagination
    limit = size
    offset = (page - 1) * size
    
    final_query = f"{query} LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    print(f"DEBUG: Executing query: {final_query} with params {params}")
    
    rows = conn.execute(final_query, params).fetchall()
    
    # Map to pydantic
    items = []
    for r in rows:
        items.append(Recommendation(
            id=r[0],
            year=r[1],
            arc=r[2],
            description=r[3],
            yearly_savings=r[4],
            implementation_cost=r[5],
            impstatus=r[6],
            payback=r[7],
            center=r[8],
            state=r[9]
        ))
    
    total_pages = (total + size - 1) // size
    
    return SearchResponse(
        total=total,
        items=items,
        page=page,
        size=size,
        total_pages=total_pages
    )

@router.post("/facets", response_model=FacetsResponse)
def get_facets(filters: SearchFilters, conn=Depends(get_db)):
    """
    Returns counts for filterable fields, respecting current other filters?
    Usually facets show counts for the *current* selection context.
    For simplicity, we can apply all filters.
    Or typically for a specific facet (e.g. State), we exclude the State filter itself 
    to show what *would* be available if we switched states.
    For MVP, let's just apply all filters (showing the distribution of the current result set).
    """
    where_clause, params = build_where_clause(filters)
    
    def get_group_counts(field):
        sql = f"""
            SELECT {field}, COUNT(*) 
            FROM recommendations 
            {where_clause} 
            GROUP BY {field} 
            ORDER BY COUNT(*) DESC 
            LIMIT 50
        """
        result = conn.execute(sql, params).fetchall()
        return [FacetCount(value=str(r[0]), count=r[1]) for r in result if r[0] is not None]

    return FacetsResponse(
        status=get_group_counts("impstatus"),
        center=get_group_counts("center"),
        state=get_group_counts("state"),
        arc=get_group_counts("arc")
    )

@router.get("/recommendation/{id}", response_model=RecommendationDetail)
def get_recommendation_detail(id: str, conn=Depends(get_db)):
    query = """
        SELECT 
            id, fy, arc, description, yearly_savings, 
            implementation_cost, impstatus, payback, center, state,
            naics, sales, employees, products, plant_area,
            psaved, ssaved
        FROM recommendations 
        WHERE id = ?
    """
    row = conn.execute(query, [id]).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Recommendation not found")
        
    return RecommendationDetail(
        id=row[0],
        year=row[1],
        arc=row[2],
        description=row[3],
        yearly_savings=row[4],
        implementation_cost=row[5],
        impstatus=row[6],
        payback=row[7],
        center=row[8],
        state=row[9],
        naics=row[10],
        sales=row[11] or 0,
        employees=row[12] or 0,
        products=str(row[13]) if row[13] else None,
        plant_area=str(row[14]) if row[14] else None,
        psaved=row[15] or 0,
        ssaved=row[16] or 0
    )


@router.post("/aggregates", response_model=AggregatesResponse)
def get_aggregates(filters: SearchFilters, conn=Depends(get_db)):
    where_clause, params = build_where_clause(filters)

    # 1. KPIs
    kpi_query = f"""
        SELECT 
            SUM(yearly_savings), 
            SUM(implementation_cost), 
            COUNT(*), 
            AVG(payback),
            SUM(CASE WHEN impstatus = 'Implemented' THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100
        FROM recommendations
        {where_clause}
    """
    kpi_row = conn.execute(kpi_query, params).fetchone()
    kpis = KPIMetrics(
        total_savings=kpi_row[0] or 0,
        total_cost=kpi_row[1] or 0,
        count=kpi_row[2] or 0,
        avg_payback=kpi_row[3] or 0,
        percent_implemented=kpi_row[4] or 0
    )

    # 2. Savings by Year
    year_query = f"""
        SELECT fy, SUM(yearly_savings)
        FROM recommendations
        {where_clause}
        GROUP BY fy
        ORDER BY fy
    """
    year_rows = conn.execute(year_query, params).fetchall()
    savings_by_year = [ChartDataPoint(label=str(r[0]), value=r[1]) for r in year_rows]

    # 3. Payback Distribution (Histogram-like)
    # We'll just return raw values for frontend binning or simple database binning
    # For simplicity, let's use DuckDB's histogram or just simple flooring
    payback_query = f"""
        SELECT FLOOR(payback) as bin, COUNT(*)
        FROM recommendations
        {where_clause}
        WHERE payback < 20
        GROUP BY bin
        ORDER BY bin
    """
    payback_rows = conn.execute(payback_query, params).fetchall()
    payback_dist = [ChartDataPoint(label=str(int(r[0])), value=r[1]) for r in payback_rows]

    # 4. Top ARCs
    arc_query = f"""
        SELECT arc, SUM(yearly_savings)
        FROM recommendations
        {where_clause}
        GROUP BY arc
        ORDER BY SUM(yearly_savings) DESC
        LIMIT 10
    """
    arc_rows = conn.execute(arc_query, params).fetchall()
    top_arcs = [ChartDataPoint(label=r[0], value=r[1]) for r in arc_rows]

    return AggregatesResponse(
        kpis=kpis,
        savings_by_year=savings_by_year,
        payback_distribution=payback_dist,
        top_arcs=top_arcs
    )
