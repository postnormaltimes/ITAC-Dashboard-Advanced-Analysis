export interface Recommendation {
    id: string;
    fy: number;
    arc: string;
    description: string;
    yearly_savings: number;
    implementation_cost: number;
    impstatus: string;
    payback: number;
    center: string;
    state: string;
}

export interface RecommendationDetail extends Recommendation {
    naics?: string;
    sales: number;
    employees: number;
    products?: string;
    plant_area?: string;
    psaved: number;
    ssaved: number;
}

export interface SearchResponse {
    total: number;
    items: Recommendation[];
    page: number;
    size: number;
    total_pages: number;
}

export interface FacetCount {
    value: string;
    count: number;
}

export interface IFacetsResponse {
    status: FacetCount[];
    center: FacetCount[];
    state: FacetCount[];
    arc: FacetCount[];
}

export type Operator = ">=" | "<=" | "==" | ">" | "<";

export interface ValueFilter {
    operator: Operator;
    value: number | string;
}

export interface SearchFilters {
    arc?: string;
    status?: string[];
    center?: string[];
    state?: string[];
    year?: ValueFilter;
    savings?: ValueFilter;
    cost?: ValueFilter;
    payback?: ValueFilter;
    naics?: string;
    sic?: string;
    search_query?: string;
}

export const _types_version = 1;

export interface CostCurveParams {
    discount_rate: number;
    lifetime: number;
    energy_price: number;
    include_program_costs: boolean;
    program_cost_adder: number;
    transaction_cost_adder: number;
}

export interface CostCurvePoint {
    id: string;
    description: string;
    cce: number;
    savings: number;
    cumulative_savings: number;
    label: string;
}

export interface CostCurveResponse {
    demand_curve: CostCurvePoint[];
    supply_benchmarks: { label: string; value: number }[];
    stats: Record<string, number>;
}

// --- Waterfall Analytics ---

export interface WaterfallL1Item {
    arc: string;
    implementation_rate: number;
    avg_lcoe: number;
    count: number;
}

export interface WaterfallL2Item {
    naics: string;
    implementation_rate: number;
    avg_lcoe: number;
    count: number;
}

export interface WaterfallL3Item {
    id: string;
    employees: number;
    sales: number;
    yearly_savings: number;
    lcoe: number;
    impstatus: string;
}

export interface WaterfallResponse {
    l1_data: WaterfallL1Item[];
    l2_data: WaterfallL2Item[];
    l3_data: WaterfallL3Item[];
}

// --- Visual Analytics ---

export interface KPIMetrics {
    total_savings: number;
    total_cost: number;
    count: number;
    avg_payback: number;
    percent_implemented: number;
    implemented_savings: number;
    top_arc?: string;
}

export interface ChartDataPoint {
    label: string | number;
    value: number;
    extra?: number;
}

export interface AnalyticsChartsResponse {
    savings_by_arc: ChartDataPoint[];
    savings_by_payback: ChartDataPoint[];
    savings_by_state: ChartDataPoint[];
}

// --- Sensitivity Lab ---

export interface SensitivityParams {
    energy_price: number;
    discount_rate: number;
    inflation_rate: number;
    investment_years: number;
}

export interface SensitivityMetrics {
    total_investment: number;
    total_annual_savings: number;
    portfolio_npv: number;
    roi: number;
    payback: number;
}

export interface SensitivityResponse {
    scenario: SensitivityMetrics;
    baseline: SensitivityMetrics;
}

// --- Shadow Dashboard (Step 0) ---

export interface Step0TableItem {
    id: string;
    description: string;
    count_assessments: number;
    count_recommendations: number;
    metric_value: number;
}

export interface Step0SankeyLink {
    source: string;
    target: string;
    value: number;
}

export interface Step0Response {
    naics_ranking: Step0TableItem[];
    arc_ranking: Step0TableItem[];
    sankey_data: Step0SankeyLink[];
}

// --- Step 1 (Bipartite Pivot) ---

export interface Step1TableItem {
    id: string;
    description: string;
    count: number;
    energy: number;
    payback: number;
    propensity: number;
}

export interface Step1ScatterPoint {
    id: string;
    x: number; // e.g. Payback
    y: number; // e.g. Count/Propensity
    size: number; // Energy
    label: string;
}

export interface Step1Response {
    ranking: Step1TableItem[];
    scatter_data: Step1ScatterPoint[];
}

// --- Step 2 (Firm Size) ---

export interface Step2BarItem {
    size_bucket: string;
    count: number;
    energy: number;
    avg_payback: number;
}

export interface Step2Response {
    firm_size_distribution: Step2BarItem[];
}

// --- Step 3 (Economic Engine) ---

export interface Step3WaterfallItem {
    category: string;
    value: number;
    isTotal: boolean;
}

export interface Step3CostCurveItem {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
}

export interface Step3Response {
    waterfall_data: Step3WaterfallItem[];
    cost_curve_data: Step3CostCurveItem[];
    kpis: {
        roi: number;
        payback: number;
        npv: number;
        capex: number;
    };
}

// --- Advanced Dashboard ---
export type FirmSizeCategory = 'micro' | 'small' | 'medium' | 'large';

export interface AdvancedMeasure {
    arc: string;
    description: string;
    count: number;
    imp_rate: number;
    gross_savings: number;
    payback: number;
    cce: number;
    cce_primary: number;  // $/GJ_primary (normalized)
    score: number;
    cce_gas?: number | null;
    cce_elec?: number | null;
    neb_codes?: string[];
}

export interface AdvancedStep1Response {
    measures: AdvancedMeasure[];
    naics_code: string;
    industry_median_energy_cost: number;
}

export interface HistogramData {
    bin_edges: number[];
    counts: number[];
}

export interface AdvancedStep2Response {
    employees: HistogramData;
    sales: HistogramData;
}

export interface AdvancedStep3Response {
    cluster_metrics: AdvancedMeasure[];
    cluster_median_energy_cost: number;
    cluster_size: number;
}

// --- Per-Measure Distribution ---
export interface MeasureDistributionResponse {
    gross_savings: number[];
    payback: number[];
    cce_primary: number[];
    count: number;
}

// --- Primary Curve ---
export interface PrimaryCurvePoint {
    x: number;
    y: number;
    width: number;
    label: string;
    id: string;
    units: string;
}

export interface EconomicSummary {
    total_technical_gj: number;
    economic_gj: number;
    share_economic: number;
    count_economic: number;
    count_total: number;
    cutoff_price: number;
}

export interface PrimaryCurveResponse {
    primary_curve: PrimaryCurvePoint[];
    cutoff_price_gj_primary: number;
    economic_summary: EconomicSummary;
    baseline_curve: PrimaryCurvePoint[];
    electricity_curve: PrimaryCurvePoint[];
    gas_curve: PrimaryCurvePoint[];
}

// --- NEB Details ---
export interface NEBMeasureDetail {
    arc: string;
    description: string;
    imp_cost_median: number | null;
    energy_savings_median: number | null;
    other_energy_median: number | null;
    waste_costs_median: number | null;
    production_costs_median: number | null;
    resource_costs_median: number | null;
    waste_values: number[];
    production_values: number[];
    resource_values: number[];
}

export interface NEBDetailsResponse {
    measures: NEBMeasureDetail[];
}

// Legacy types kept for backward compat
export interface CurvePoint {
    x: number;
    y: number;
    width: number;
    label: string;
    id: string;
    resource_type: string;
    units: string;
}

export interface AdvancedStep4Response {
    baseline_curve: CurvePoint[];
    electricity_curve: CurvePoint[];
    gas_curve: CurvePoint[];
}

// --- BAT Alignment (Step 5B) ---

export interface BatLink {
    naics: string;
    brefId: string;
    brefTitle: string;
    batId: string;
    batTitle: string;
    batText: string;
    arcKey: string;
    arcAppCode: number | null;
    matchRole: 'primary' | 'secondary';
    matchType: 'direct' | 'partial' | 'proxy';
    confidence: number;
    notes: string;
}

export interface BatAlignmentMeasure {
    arc: string;
    description: string;
    score: number;  // Criticality Index
    count: number;  // recommendedCount
    implemented_count: number;
    imp_rate: number;
    imp_gap: number;
    improvement_index: number | null;
    avg_confidence: number;
    is_bat_linked: boolean;
    bat_links: BatLink[];
}

export interface BrefInfo {
    brefId: string;
    brefTitle: string;
}

export interface Step5BResponse {
    measures: BatAlignmentMeasure[];
    available_brefs: BrefInfo[];
}

// --- Priority Index (Step 5C) ---

export interface PriorityMeasure {
    arc: string;
    description: string;
    criticality_index: number;
    improvement_index: number | null;
    priority_index: number | null;
    bat_link_count: number;
    is_bat_linked: boolean;
}

export interface Step5CResponse {
    measures: PriorityMeasure[];
}
