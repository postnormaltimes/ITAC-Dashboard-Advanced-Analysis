from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict
from app.db.connection import get_db
from app.models.schemas import (
    CostCurveRequest, CostCurveResponse, CostCurvePoint, 
    SearchFilters
)
from app.api.endpoints import build_where_clause

router = APIRouter()

@router.post("/compute", response_model=CostCurveResponse)
def compute_cost_curves(request: CostCurveRequest, conn=Depends(get_db)):
    filters = request.filters
    params = request.params
    
    where_clause, sql_params = build_where_clause(filters)
    
    # 1. Fetch relevant data
    # We fetch id, description, yearly_savings ($), implementation_cost ($)
    # We also fetch useful metadata for labels if needed
    query = f"""
        SELECT 
            id, 
            description, 
            yearly_savings, 
            implementation_cost
        FROM recommendations
        {where_clause}
        WHERE yearly_savings > 0 
          AND implementation_cost >= 0
    """
    rows = conn.execute(query, sql_params).fetchall()
    
    # 2. Parameters for CCE
    r = params.discount_rate
    n = params.lifetime
    energy_price = params.energy_price # $/kWh
    
    # CRF Calculation
    # Avoid division by zero if r is 0
    if abs(r) < 1e-9:
        crf = 1 / n if n > 0 else 1.0
    else:
        # CRF = r(1+r)^n / ((1+r)^n - 1)
        # Check against n=0
        if n <= 0:
            crf = 1.0 # fallback
        else:
            numerator = r * ((1 + r) ** n)
            denominator = ((1 + r) ** n) - 1
            crf = numerator / denominator
        
    cost_multiplier = 1.0
    if params.include_program_costs:
        cost_multiplier += params.program_cost_adder
    
    # Transaction costs are added to the capital cost usually
    cost_multiplier += params.transaction_cost_adder
    
    points = []
    
    # Pre-calculate price per MWh for conversion
    # energy_price is $/kWh. 1 MWh = 1000 kWh.
    # So value of 1 MWh = energy_price * 1000
    price_per_mwh = energy_price * 1000.0
    
    for row in rows:
        rec_id = str(row[0])
        desc = str(row[1]) if row[1] else "Unknown"
        savings_dollars = float(row[2])
        imp_cost = float(row[3])
        
        # INFER PHYSICAL ENERGY SAVINGS (MWh)
        # savings_dollars ($/yr) / price_per_mwh ($/MWh) = MWh/yr
        if price_per_mwh <= 0.0001: 
             # Safety fallback if price is zero/negative to avoid crash
            annual_energy_savings_mwh = 0.0
        else:
            annual_energy_savings_mwh = savings_dollars / price_per_mwh
            
        # Annualized Cost ($/yr)
        annualized_cost = imp_cost * cost_multiplier * crf
        
        # CCE ($/MWh) = Annualized Cost / Annual Energy Savings
        if annual_energy_savings_mwh > 1e-9:
            cce = annualized_cost / annual_energy_savings_mwh
        else:
            # If savings are effectively zero, cost per unit is infinite
            cce = 999999.0 
            
        points.append({
            "id": rec_id,
            "description": desc,
            "cce": cce,
            "savings": annual_energy_savings_mwh,
            "label": desc
        })
        
    # 3. Sort by CCE ascending (Supply Curve logic)
    points.sort(key=lambda x: x["cce"])
    
    # 4. Compute Cumulative Savings (X-axis)
    cumulative = 0.0
    final_points = []
    
    for p in points:
        # Accumulate x-axis
        cumulative += p["savings"]
        
        final_points.append(CostCurvePoint(
            id=p["id"],
            description=p["description"],
            cce=p["cce"],
            savings=p["savings"],
            cumulative_savings=cumulative,
            label=p["label"]
        ))
        
    # 5. Supply-Side Benchmarks & Stats
    # Provide the retail price benchmark so frontend can draw a line
    benchmarks = [
        {"label": "Retail Tariff", "value": price_per_mwh},
        # TODO: Add "Avoided Cost" if we have a way to estimate it or input it
    ]
    
    # 6. Calculate Potentials
    technical_potential = cumulative
    
    # Economic Potential: All measures where CCE < Retail Price
    economic_measures = [p for p in final_points if p.cce < price_per_mwh]
    economic_potential_mwh = sum(p.savings for p in economic_measures)
    
    # Market Potential: Rough estimate (e.g. 50% of Economic)
    # In real world, this would use adoption curves (Bass diffusion)
    market_potential_mwh = economic_potential_mwh * 0.5
    
    response_stats = {
        "technical_potential_mwh": technical_potential,
        "economic_potential_mwh": economic_potential_mwh,
        "market_potential_mwh": market_potential_mwh,
        "avg_cce": (sum(p.cce * p.savings for p in final_points) / technical_potential) if technical_potential > 0 else 0
    }
    
    return CostCurveResponse(
        demand_curve=final_points,
        supply_benchmarks=[{"label": k["label"], "value": k["value"]} for k in benchmarks], # Explicit mapping if needed
        stats={k: v for k, v in response_stats.items()}
    )
