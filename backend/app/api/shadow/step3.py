from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from app.db.connection import get_db
from pydantic import BaseModel
import math

router = APIRouter()

# Simplified Economic Assumptions (to be replaced by flexible assumptions in future)
ELECTRICITY_PRICE = 0.12 # $/kWh
DISCOUNT_RATE = 0.07 # 7%
LIFETIME = 15 # years

class Step3WaterfallItem(BaseModel):
    category: str
    value: float
    isTotal: bool = False

class Step3CostCurveItem(BaseModel):
    x: float # Cumulative Savings (MWh)
    y: float # Cast of Conservved Energy ($/MWh) or NPV/Investment
    width: float # Width of bar (Savings)
    height: float # Height (CCE)
    label: str

class Step3Response(BaseModel):
    waterfall_data: List[Step3WaterfallItem]
    cost_curve_data: List[Step3CostCurveItem]
    kpis: dict # ROI, Payback, NPV, TotalCapex

@router.get("/step3", response_model=Step3Response)
def get_step3_data(
    naics_code: str = Query(...),
    arc_code: str = Query(...),
    firm_size: str = Query(...),
    conn=Depends(get_db)
):
    """
    Step 3: Economic Engine
    Filter by NAICS + ARC + Firm Size.
    Calculate advanced economic metrics.
    """
    
    query = """
        SELECT 
            SUM(assessment_count) as assess_count,
            SUM(total_energy_savings) as energy_savings, -- MWh
            AVG(median_payback) as avg_payback -- Years
        FROM mv_naics_arc_crosswalk
        WHERE naics_3 = ? AND arc_2 = ? AND firm_size = ?
    """
    
    row = conn.execute(query, [naics_code, arc_code, firm_size]).fetchone()
    
    count = row[0] or 0
    energy_mwh = row[1] or 0
    payback_yrs = row[2] or 0.1 # avoid div by zero
    
    # --- Financial Model ---
    
    # 1. Monetize Savings
    annual_savings_usd = energy_mwh * 1000 * ELECTRICITY_PRICE # MWh -> kWh * Price
    
    # 2. Derive CAPEX from Payback
    # Payback = CAPEX / Annual_Savings
    # CAPEX = Payback * Annual_Savings
    capex = payback_yrs * annual_savings_usd
    
    # 3. Calculate NPV
    # NPV = -CAPEX + sum(Savings / (1+r)^t)
    # Annuity factor = (1 - (1+r)^-n) / r
    if DISCOUNT_RATE > 0:
        annuity_factor = (1 - (1 + DISCOUNT_RATE)**(-LIFETIME)) / DISCOUNT_RATE
    else:
        annuity_factor = LIFETIME
        
    npv = -capex + (annual_savings_usd * annuity_factor)
    
    # 4. ROI
    roi = (npv / capex) * 100 if capex > 0 else 0
    
    # --- Waterfall Components ---
    # Breakdown of Value Creation
    waterfall_data = [
        Step3WaterfallItem(category="Investment (CAPEX)", value=-capex),
        Step3WaterfallItem(category="Energy Savings (15y)", value=annual_savings_usd * LIFETIME),
        Step3WaterfallItem(category="Net Present Value", value=npv, isTotal=True)
    ]
    
    # --- Cost Curve Data (Mocking multiple sub-measures or opportunities within this bucket) ---
    # In reality, this bucket (NAICS+ARC+Size) might contain multiple Assessment recommendations.
    # For now, we return it as a SINGLE block in the cost curve, or split it artificially for demo.
    
    # Let's create a single block for this specific opportunity
    cce = capex / (energy_mwh * LIFETIME) if energy_mwh > 0 else 0 # Simple CCE $/MWh
    
    cost_curve_data = [
        Step3CostCurveItem(
            x=energy_mwh,
            y=cce,
            width=energy_mwh,
            height=cce,
            label=f"{arc_code}"
        )
    ]
    
    return Step3Response(
        waterfall_data=waterfall_data,
        cost_curve_data=cost_curve_data,
        kpis={
            "roi": round(roi, 1),
            "payback": round(payback_yrs, 1),
            "npv": round(npv, 0),
            "capex": round(capex, 0)
        }
    )
