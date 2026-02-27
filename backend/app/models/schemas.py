
from pydantic import BaseModel, Field
from typing import List, Optional, Union, Any, Dict

# --- Filters ---

class ValueFilter(BaseModel):
    operator: str  # e.g., '>=', '<=', '==', 'contains'
    value: Union[float, int, str]

class SearchFilters(BaseModel):
    arc: Optional[str] = None
    status: Optional[List[str]] = None
    center: Optional[List[str]] = None
    state: Optional[List[str]] = None
    year: Optional[ValueFilter] = None
    savings: Optional[ValueFilter] = None
    cost: Optional[ValueFilter] = None
    payback: Optional[ValueFilter] = None
    naics: Optional[str] = None
    sic: Optional[str] = None
    # Industry Type logic can be complex (derived from SIC/NAICS), simplified for now
    search_query: Optional[str] = None # Full text search

# --- Responses ---

class Recommendation(BaseModel):
    id: str
    year: int = Field(alias='fy')
    arc: Optional[str]
    description: Optional[str]
    yearly_savings: float
    implementation_cost: float
    impstatus: str
    payback: float
    center: Optional[str]
    state: Optional[str] # Add state for display
    
    class Config:
        populate_by_name = True

class RecommendationDetail(Recommendation):
    naics: Optional[str]
    sales: float = 0
    employees: int = 0
    products: Optional[str]
    plant_area: Optional[str] # Sometimes string or float
    # Breakout savings
    psaved: float = 0 # Electricity
    ssaved: float = 0 # Natural Gas


class SearchResponse(BaseModel):
    total: int
    items: List[Recommendation]
    page: int
    size: int
    total_pages: int

class FacetCount(BaseModel):
    value: str
    count: int

class FacetsResponse(BaseModel):
    status: List[FacetCount]
    center: List[FacetCount]
    state: List[FacetCount]
    arc: List[FacetCount] # Top N ARCs


class KPIMetrics(BaseModel):
    total_savings: float
    total_cost: float
    count: int
    avg_payback: float
    percent_implemented: float
    implemented_savings: float
    top_arc: Optional[str]

class ChartDataPoint(BaseModel):
    label: Optional[Union[str, int, float]] = "Unknown"
    value: float
    extra: Optional[float] = None # e.g. for bubble size or secondary metric

class AnalyticsChartsResponse(BaseModel):
    savings_by_arc: List[ChartDataPoint]
    savings_by_payback: List[ChartDataPoint]
    savings_by_state: List[ChartDataPoint]

class AggregatesResponse(BaseModel):
    kpis: KPIMetrics
    savings_by_year: List[ChartDataPoint]
    payback_distribution: List[ChartDataPoint]
    top_arcs: List[ChartDataPoint]


# --- Cost Curves ---

class CostCurveParams(BaseModel):
    discount_rate: float = 0.07  # 7%
    lifetime: int = 15
    energy_price: float = 0.10   # $/kWh
    include_program_costs: bool = False
    program_cost_adder: float = 0.20 # 20% of cap cost
    transaction_cost_adder: float = 0.0 # % of cap cost

class CostCurveRequest(BaseModel):
    filters: SearchFilters
    params: CostCurveParams

class CostCurvePoint(BaseModel):
    id: str
    description: str
    cce: float  # Y-axis ($/MWh)
    savings: float # Incremental X-axis (MWh)
    cumulative_savings: float # X-axis (MWh)
    label: str # For tooltip

class CostCurveResponse(BaseModel):
    demand_curve: List[CostCurvePoint]
    supply_benchmarks: List[Dict[str, Union[str, float]]] # e.g., [{"label": "Retail", "value": 100}]
    stats: Dict[str, float] # Technical Potential, Economic Potential, etc.

# --- Waterfall Analytics ---

class WaterfallL1Item(BaseModel):
    arc: str
    implementation_rate: float # Implemented / Recommended * 100
    avg_lcoe: float # Mean of (Annual Cost / Annual Savings)
    count: int

class WaterfallL2Item(BaseModel):
    naics: str
    implementation_rate: float
    avg_lcoe: float
    count: int

class WaterfallL3Item(BaseModel):
    id: str
    employees: int
    sales: float
    yearly_savings: float
    lcoe: float
    impstatus: str

class WaterfallResponse(BaseModel):
    l1_data: List[WaterfallL1Item] = []
    l2_data: List[WaterfallL2Item] = [] # Only populated if filtered by ARC
    l3_data: List[WaterfallL3Item] = [] # Only populated if filtered by ARC & NAICS

# --- Sensitivity Lab ---

class SensitivityParams(BaseModel):
    energy_price: float = 0.10   # $/kWh
    discount_rate: float = 0.07  # 7%
    inflation_rate: float = 0.02 # 2%
    investment_years: int = 15   # Analysis horizon

class SensitivityRequest(BaseModel):
    filters: SearchFilters
    scenario_params: SensitivityParams

class SensitivityMetrics(BaseModel):
    total_investment: float
    total_annual_savings: float # Adjusted for energy price
    portfolio_npv: float
    roi: float
    payback: float

class SensitivityResponse(BaseModel):
    baseline: SensitivityMetrics
    scenario: SensitivityMetrics

# --- Advanced Dashboard (9-Step Flow) ---

class AdvancedStep1Request(BaseModel):
    naics_code: str

class AdvancedMeasure(BaseModel):
    arc: str
    description: str
    count: int
    imp_rate: float
    gross_savings: float  # Median
    payback: float        # Median
    cce: float            # Median
    score: float          # 0-100
    cce_gas: Optional[float] = None
    cce_elec: Optional[float] = None
    neb_codes: List[str] = []

class AdvancedStep1Response(BaseModel):
    measures: List[AdvancedMeasure]
    naics_code: str
    industry_median_energy_cost: float # Derived from data
