from fastapi import APIRouter, Depends
from typing import List
from app.db.connection import get_db
from app.models.schemas import (
    SensitivityRequest, SensitivityResponse, SensitivityMetrics, SensitivityParams
)
from app.api.endpoints import build_where_clause

router = APIRouter()

def calculate_npv(investment: float, annual_savings: float, r: float, n: int) -> float:
    if r == 0:
        return -investment + (annual_savings * n)
    
    # PV calculation using annuity formula: PV = PMT * ((1 - (1+r)^-n) / r)
    pv_savings = annual_savings * ((1 - (1 + r) ** -n) / r)
    return -investment + pv_savings

@router.post("/compute", response_model=SensitivityResponse)
def compute_sensitivity(request: SensitivityRequest, conn=Depends(get_db)):
    filters = request.filters
    params = request.scenario_params
    
    where_clause, sql_params = build_where_clause(filters)
    
    query = f"""
        SELECT 
            yearly_savings, 
            implementation_cost
        FROM recommendations
        {where_clause}
        WHERE yearly_savings > 0 
          AND implementation_cost >= 0
    """
    rows = conn.execute(query, sql_params).fetchall()
    
    # --- Baseline Calculation ---
    # Assumptions for Baseline:
    # Energy Price = $0.10/kWh (used to derive units)
    # Discount Rate = 0.07 (Standard)
    # Time Horizon = 15 years
    base_price = 0.10
    base_r = 0.07
    base_n = 15
    
    base_inv = 0.0
    base_savings = 0.0
    base_npv = 0.0
    
    # --- Scenario Calculation ---
    scen_inv = 0.0
    scen_savings = 0.0
    scen_npv = 0.0
    
    for row in rows:
        savings_dollars = float(row[0])
        cost_dollars = float(row[1])
        
        # 1. Baseline Accumulation
        base_inv += cost_dollars
        base_savings += savings_dollars
        base_npv += calculate_npv(cost_dollars, savings_dollars, base_r, base_n)
        
        # 2. Scenario Accumulation
        # Infer physical units:
        energy_units = savings_dollars / base_price
        
        # New Savings based on input scenario price
        new_annual_savings = energy_units * params.energy_price
        
        # Costs are assumed constant (setup costs don't change with energy price)
        # But we could apply inflation if needed? For now, keep CapEx fixed.
        
        scen_inv += cost_dollars
        scen_savings += new_annual_savings
        scen_npv += calculate_npv(cost_dollars, new_annual_savings, params.discount_rate, params.investment_years)

    # Metrics Construction
    baseline_metrics = SensitivityMetrics(
        total_investment=base_inv,
        total_annual_savings=base_savings,
        portfolio_npv=base_npv,
        roi=((base_npv / base_inv) * 100) if base_inv > 0 else 0,
        payback=(base_inv / base_savings) if base_savings > 0 else 0
    )
    
    scenario_metrics = SensitivityMetrics(
        total_investment=scen_inv,
        total_annual_savings=scen_savings,
        portfolio_npv=scen_npv,
        roi=((scen_npv / scen_inv) * 100) if scen_inv > 0 else 0,
        payback=(scen_inv / scen_savings) if scen_savings > 0 else 0
    )
    
    return SensitivityResponse(
        baseline=baseline_metrics,
        scenario=scenario_metrics
    )
