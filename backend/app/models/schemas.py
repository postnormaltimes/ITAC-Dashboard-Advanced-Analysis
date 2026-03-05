
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
    cce: float            # Median (legacy, MMBtu-based)
    cce_primary: float = 0.0  # Median CCE in $/GJ_primary (normalized)
    score: float          # 0-100
    cce_gas: Optional[float] = None
    cce_elec: Optional[float] = None
    neb_codes: List[str] = []

class AdvancedStep1Response(BaseModel):
    measures: List[AdvancedMeasure]
    naics_code: str
    industry_median_energy_cost: float # Derived from data

# --- Measure Distribution (per-ARC) ---

class MeasureDistributionRequest(BaseModel):
    naics_code: str
    arc_code: str
    categories: Optional[List[str]] = None  # firm size categories for filtering

class MeasureDistributionResponse(BaseModel):
    gross_savings: List[float]
    payback: List[float]
    cce_primary: List[float]
    count: int

# --- Category-based Filtering ---

class CategoryFilterRequest(BaseModel):
    naics_code: str
    categories: List[str]  # ["micro", "small", "medium", "large"]

class AdvancedStep3Response(BaseModel):
    cluster_metrics: List[AdvancedMeasure]
    cluster_median_energy_cost: float = 0.0
    cluster_size: int

# --- Primary Curve ---

class PrimaryCurveRequest(BaseModel):
    naics_code: str
    selected_measure_ids: List[str]
    categories: Optional[List[str]] = None
    electricity_price_mwh: float = 70.0
    gas_price_mmbtu: float = 5.0
    pef_elec: float = 2.348
    pef_gas: float = 1.047

class PrimaryCurvePoint(BaseModel):
    x: float          # cumulative GJ_primary
    y: float          # CCE $/GJ_primary
    width: float      # GJ_primary
    label: str
    id: str
    units: str = "GJ_primary"

class EconomicSummary(BaseModel):
    total_technical_gj: float
    economic_gj: float
    share_economic: float
    count_economic: int
    count_total: int
    cutoff_price: float

class PrimaryCurveResponse(BaseModel):
    primary_curve: List[PrimaryCurvePoint]
    cutoff_price_gj_primary: float
    economic_summary: EconomicSummary
    # Keep legacy fields for backward compat
    baseline_curve: List[PrimaryCurvePoint] = []
    electricity_curve: List[PrimaryCurvePoint] = []
    gas_curve: List[PrimaryCurvePoint] = []

# --- NEB Details ---

class NEBMeasureDetail(BaseModel):
    arc: str
    description: str
    imp_cost_median: Optional[float] = None
    energy_savings_median: Optional[float] = None
    other_energy_median: Optional[float] = None
    waste_costs_median: Optional[float] = None
    production_costs_median: Optional[float] = None
    resource_costs_median: Optional[float] = None
    # Distribution arrays
    waste_values: List[float] = []
    production_values: List[float] = []
    resource_values: List[float] = []

class NEBDetailsRequest(BaseModel):
    naics_code: str
    selected_measure_ids: List[str]
    categories: Optional[List[str]] = None

class NEBDetailsResponse(BaseModel):
    measures: List[NEBMeasureDetail]


# --- BAT Alignment (Step 5B) ---

class BatLink(BaseModel):
    naics: str
    brefId: str
    brefTitle: str
    batId: str
    batTitle: str
    batText: str = ""
    arcKey: str
    arcAppCode: Optional[int] = None
    matchRole: str  # primary | secondary
    matchType: str  # direct | partial | proxy
    confidence: float
    notes: str = ""

class BatAlignmentMeasure(BaseModel):
    arc: str
    description: str
    score: float  # Criticality Index from Step 5
    count: int  # recommendedCount
    implemented_count: int
    imp_rate: float
    imp_gap: float
    improvement_index: Optional[int] = None
    avg_confidence: float = 1.0
    is_bat_linked: bool = False
    bat_links: List[BatLink] = []

class BrefInfo(BaseModel):
    brefId: str
    brefTitle: str

class Step5BRequest(BaseModel):
    naics_code: str
    categories: Optional[List[str]] = None
    bref_id: Optional[str] = None  # filter by BREF
    bat_only: bool = True  # show only BAT-linked measures

class Step5BResponse(BaseModel):
    measures: List[BatAlignmentMeasure]
    available_brefs: List[BrefInfo]

# --- Priority Index (Step 5C) ---

class Step5CRequest(BaseModel):
    naics_code: str
    categories: Optional[List[str]] = None
    bref_id: Optional[str] = None
    w_improvement: int = 20  # wCriticality = 100 - wImprovement

class PriorityMeasure(BaseModel):
    arc: str
    description: str
    criticality_index: float
    improvement_index: Optional[int] = None
    priority_score: int  # always present; equals criticality for non-BAT
    bat_link_count: int = 0
    is_bat_linked: bool = False

class Step5CResponse(BaseModel):
    measures: List[PriorityMeasure]

