from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
import duckdb
import numpy as np
import pandas as pd
from app.models.schemas import AdvancedStep1Request, AdvancedStep1Response, AdvancedMeasure
from app.db.connection import DB_PATH
from app.lookups.arc_codes import get_arc_label

router = APIRouter()

def get_db_connection():
    return duckdb.connect(str(DB_PATH), read_only=True)

# --- Helper Logic ---

def _process_dataset(df, naics, fixed_energy_cost: Optional[float] = None):
    """
    Core logic to calculate metrics, scores, and rankings from a DataFrame.
    """
    # 1. Industry Median Energy Cost (Proxy for Bill/Energy)
    # We will use the median of (Total Savings / Total Conserved Energy) for implemented projects as the industry proxy.
    industry_energy_cost = 0.10 # Default $/Unit (approx $/kWh or $/MMBtu mix)

    # 2. Group by ARC
    # Ensure columns exist (handle demo data or missing ingest)
    required_cols = ['psaved', 'ssaved', 'tsaved', 'qsaved', 
                    'pconserved', 'sconserved', 'tconserved', 'qconserved',
                    'psourccode', 'ssourccode', 'tsourccode', 'qsourccode']
    
    # Fill missing columns with 0/Nan if not present (robustness)
    for col in required_cols:
        if col not in df.columns:
            df[col] = 0 if 'sourccode' not in col else None

    # Calculate Total Gross Savings ($) per row
    df['total_savings'] = (
        df['psaved'].fillna(0) + 
        df['ssaved'].fillna(0) + 
        df['tsaved'].fillna(0) + 
        df['qsaved'].fillna(0)
    )

    # Calculate Total Conserved Energy (MMBtu) per row
    # We need to normalize units. 
    # EC (Electricity) = kWh -> 0.003412 MMBtu
    # E* (Fuel) = MMBtu -> 1.0
    # Others -> Ignore for "Energy" CCE? Or treat as 0? 
    # For now, let's strictly convert EC and sum E*.
    
    def get_mmbtu(val, code):
        if pd.isna(val) or val == 0: return 0
        if not isinstance(code, str): return 0 # or assume MMBtu?
        code = code.upper().strip()
        if code == 'EC' or code == 'E13': # Electricity
            return val * 0.003412
        if code.startswith('E'): # Other Energy (E2, E3...)
            return val
        return 0 # Non-energy (Water, Waste, etc.)

    # Vectorized approach or apply is fine for dataset size
    # Let's use simple apply for readability for P, S, T, Q
    df['total_energy_conserved'] = (
        df.apply(lambda x: get_mmbtu(x['pconserved'], x['psourccode']), axis=1) +
        df.apply(lambda x: get_mmbtu(x['sconserved'], x['ssourccode']), axis=1) +
        df.apply(lambda x: get_mmbtu(x['tconserved'], x['tsourccode']), axis=1) +
        df.apply(lambda x: get_mmbtu(x['qconserved'], x['qsourccode']), axis=1)
    )

    grouped = df.groupby('arc')

    # Constants for CCE
    r = 0.07
    t = 15
    crf = (r * (1 + r)**t) / ((1 + r)**t - 1)

    measures = []
    
    for arc, group in grouped:
        count = len(group)
        
        # Implementation Rate: Occurrences of "I" / Total Count
        # IMPSTATUS can be 'I', 'Implemented', etc. Check for "I" or "Implemented".
        # User said: occurances of "I" in "IMPSTATUS".
        # Our ingest normalizes to "Implemented" or keeps raw? 
        # Ingest script had: NULLIF(CAST(impstatus AS VARCHAR), 'nan')
        # Let's check string content broadly.
        implemented = group['impstatus'].astype(str).str.upper().apply(lambda x: 'I' in x or 'IMPL' in x)
        imp_rate = implemented.sum() / count if count > 0 else 0
        
        # Gross Savings: Median of Sums(P+S+T+Q SAVED)
        # Using the pre-calculated 'total_savings' column
        gross_savings = group['total_savings'].median()
        
        # Payback: Median of (IMPCOST / Sum(SAVED))
        # Filter for rows with savings > 0 to avoid Div/0
        valid_payback = group[group['total_savings'] > 0].copy()
        if not valid_payback.empty:
            valid_payback['calc_payback'] = valid_payback['implementation_cost'] / valid_payback['total_savings']
            payback = valid_payback['calc_payback'].median()
        else:
            payback = 0.0
            
        # CCE: Median of (IMPCOST * CRF / Total Conserved)
        # Filter for rows with Energy Conserved > 0
        valid_cce = group[group['total_energy_conserved'] > 0].copy()
        if not valid_cce.empty:
            valid_cce['calc_cce'] = (valid_cce['implementation_cost'] * crf) / valid_cce['total_energy_conserved']
            cce = valid_cce['calc_cce'].median()
        else:
            cce = 0.0 # Or infinite?
            
        def get_elec_mwh(val, code):
            if pd.isna(val) or val == 0: return 0.0
            if isinstance(code, str) and (code.upper() in ['EC', 'E13'] or code.upper() == 'E1'):
                return val * 0.003412
            return 0.0

        def get_gas_mmbtu(val, code):
            if pd.isna(val) or val == 0: return 0.0
            if isinstance(code, str) and code.upper() == 'E2':
                return float(val)
            return 0.0

        def get_dollar_portion(val, code, is_elec_func):
            if pd.isna(val) or val == 0: return 0.0
            if is_elec_func:
                if isinstance(code, str) and (code.upper() in ['EC', 'E13'] or code.upper() == 'E1'): return float(val)
            else:
                if isinstance(code, str) and code.upper() == 'E2': return float(val)
            return 0.0

        # Create localized dataframes for CCE Gas vs Elec
        group_elec = group.copy()
        group_elec['elec_mwh'] = (
            group_elec.apply(lambda x: get_elec_mwh(x['pconserved'], x['psourccode']), axis=1) +
            group_elec.apply(lambda x: get_elec_mwh(x['sconserved'], x['ssourccode']), axis=1) +
            group_elec.apply(lambda x: get_elec_mwh(x['tconserved'], x['tsourccode']), axis=1) +
            group_elec.apply(lambda x: get_elec_mwh(x['qconserved'], x['qsourccode']), axis=1)
        )
        group_elec['elec_dollars'] = (
            group_elec.apply(lambda x: get_dollar_portion(x['psaved'], x['psourccode'], True), axis=1) +
            group_elec.apply(lambda x: get_dollar_portion(x['ssaved'], x['ssourccode'], True), axis=1) +
            group_elec.apply(lambda x: get_dollar_portion(x['tsaved'], x['tsourccode'], True), axis=1) +
            group_elec.apply(lambda x: get_dollar_portion(x['qsaved'], x['qsourccode'], True), axis=1)
        )
        cce_elec_vals = group_elec[group_elec['elec_mwh'] > 0]
        if not cce_elec_vals.empty:
            # Prop cost = total cost * (elec_dollars / total_savings)
            prop_cost = cce_elec_vals['implementation_cost'] * (cce_elec_vals['elec_dollars'] / cce_elec_vals['total_savings'].replace(0, 1))
            cce_elec_vals['calc'] = (prop_cost * crf) / cce_elec_vals['elec_mwh']
            cce_elec = cce_elec_vals['calc'].median()
        else:
            cce_elec = None

        group_gas = group.copy()
        group_gas['gas_mmbtu'] = (
            group_gas.apply(lambda x: get_gas_mmbtu(x['pconserved'], x['psourccode']), axis=1) +
            group_gas.apply(lambda x: get_gas_mmbtu(x['sconserved'], x['ssourccode']), axis=1) +
            group_gas.apply(lambda x: get_gas_mmbtu(x['tconserved'], x['tsourccode']), axis=1) +
            group_gas.apply(lambda x: get_gas_mmbtu(x['qconserved'], x['qsourccode']), axis=1)
        )
        group_gas['gas_dollars'] = (
            group_gas.apply(lambda x: get_dollar_portion(x['psaved'], x['psourccode'], False), axis=1) +
            group_gas.apply(lambda x: get_dollar_portion(x['ssaved'], x['ssourccode'], False), axis=1) +
            group_gas.apply(lambda x: get_dollar_portion(x['tsaved'], x['tsourccode'], False), axis=1) +
            group_gas.apply(lambda x: get_dollar_portion(x['qsaved'], x['qsourccode'], False), axis=1)
        )
        cce_gas_vals = group_gas[group_gas['gas_mmbtu'] > 0]
        if not cce_gas_vals.empty:
            prop_cost = cce_gas_vals['implementation_cost'] * (cce_gas_vals['gas_dollars'] / cce_gas_vals['total_savings'].replace(0, 1))
            cce_gas_vals['calc'] = (prop_cost * crf) / cce_gas_vals['gas_mmbtu']
            cce_gas = cce_gas_vals['calc'].median()
        else:
            cce_gas = None

        # Extract Non-Energy Resource Codes
        neb_codes = set()
        for src_col in ['psourccode', 'ssourccode', 'tsourccode', 'qsourccode']:
            if src_col in group.columns:
                for code in group[src_col].dropna().unique():
                    code_str = str(code).upper().strip()
                    # Skip blank, 0, or main electricity/gas codes
                    if code_str and code_str != '0' and code_str not in ('E1', 'EC', 'E2'):
                        neb_codes.add(code_str)

        measures.append({
            'arc': arc,
            'description': get_arc_label(arc), 
            'count': count,
            'imp_rate': imp_rate,
            'gross_savings': gross_savings,
            'payback': payback,
            'cce': cce,
            'cce_elec': cce_elec,
            'cce_gas': cce_gas,
            'neb_codes': sorted(list(neb_codes))
        })

    if not measures:
        return [], industry_energy_cost

    # 3. Validation & Scoring
    results_df = pd.DataFrame(measures)
    
    def normalize_max_better(series):
        if series.max() == series.min(): return 1.0
        return (series - series.min()) / (series.max() - series.min())
        
    def normalize_min_better(series):
        if series.max() == series.min(): return 1.0
        return (series.max() - series) / (series.max() - series.min())
    
    # Handle NaNs if any column is all 0/NaN
    results_df = results_df.fillna(0)
        
    results_df['norm_count'] = normalize_max_better(results_df['count'])
    results_df['norm_imp'] = normalize_max_better(results_df['imp_rate'])
    results_df['norm_savings'] = normalize_max_better(results_df['gross_savings'])
    results_df['norm_cce'] = normalize_min_better(results_df['cce'])
    results_df['norm_payback'] = normalize_min_better(results_df['payback'])
    
    results_df['score'] = 100 * (
        results_df['norm_count'] * 0.30 +
        results_df['norm_imp'] * 0.25 +
        results_df['norm_cce'] * 0.20 +
        results_df['norm_payback'] * 0.15 +
        results_df['norm_savings'] * 0.10
    )
    
    results_df = results_df.sort_values('score', ascending=False)
    
    final_measures = []
    for _, row in results_df.iterrows():
        final_measures.append(AdvancedMeasure(
            arc=row['arc'],
            description=row['description'],
            count=int(row['count']),
            imp_rate=float(row['imp_rate']),
            gross_savings=float(row['gross_savings']),
            payback=float(row['payback']),
            cce=float(row['cce']),
            score=float(row['score']),
            cce_elec=float(row['cce_elec']) if pd.notnull(row['cce_elec']) else None,
            cce_gas=float(row['cce_gas']) if pd.notnull(row['cce_gas']) else None,
            neb_codes=row['neb_codes']
        ))
        
    return final_measures, industry_energy_cost

def _get_demo_data(naics, seed=42):
    np.random.seed(seed)
    n_rows = 500
    return pd.DataFrame({
        'arc': np.random.choice(['2.222', '2.423', '2.7142', '2.111', '3.1', '5.2', '7.1', '8.9', '1.1', '9.9'], n_rows),
        'yearly_savings': np.random.exponential(1000, n_rows),
        'implementation_cost': np.random.exponential(50000, n_rows),
        'impstatus': np.random.choice(['Implemented', 'Recommended'], n_rows, p=[0.4, 0.6]),
        'payback': np.random.uniform(0.5, 5.0, n_rows),
        'sales': np.random.uniform(1e6, 1e8, n_rows),
        'employees': np.random.randint(10, 1000, n_rows),
        # New Detailed Cols
        'psaved': np.random.exponential(500, n_rows),
        'ssaved': np.random.exponential(200, n_rows),
        'tsaved': np.zeros(n_rows),
        'qsaved': np.zeros(n_rows),
        'pconserved': np.random.exponential(10000, n_rows), # kWh?
        'sconserved': np.random.exponential(500, n_rows), # MMBtu?
        'tconserved': np.zeros(n_rows),
        'qconserved': np.zeros(n_rows),
        'psourccode': np.random.choice(['EC', 'E2'], n_rows),
        'ssourccode': np.random.choice(['E2', 'R1'], n_rows),
        'tsourccode': [''] * n_rows,
        'qsourccode': [''] * n_rows
    })

# --- Endpoints ---

@router.post("/step1_evaluate", response_model=AdvancedStep1Response)
def evaluate_step1(request: AdvancedStep1Request):
    naics = request.naics_code
    con = get_db_connection()
    try:
        query = "SELECT * FROM recommendations WHERE naics LIKE ?"
        df = con.execute(query, [f"{naics}%"]).fetch_df()
    except Exception as e:
        print(f"DB Error: {e}")
        df = pd.DataFrame()
    finally:
        con.close()

    if df.empty and naics in ["3323", "32221"]:
        df = _get_demo_data(naics)
    elif df.empty:
        return AdvancedStep1Response(measures=[], naics_code=naics, industry_median_energy_cost=0.0)

    measures, cost = _process_dataset(df, naics)
    return AdvancedStep1Response(measures=measures, naics_code=naics, industry_median_energy_cost=cost)


# --- Step 2: Distributions ---

class DistributionRequest(BaseModel):
    measure_ids: List[str]
    naics_code: str

class HistogramData(BaseModel):
    bin_edges: List[float]
    counts: List[int]

class Step2Response(BaseModel):
    employees: HistogramData
    sales: HistogramData

@router.post("/step2_distributions", response_model=Step2Response)
def get_distributions(request: DistributionRequest):
    con = get_db_connection()
    try:
        if not request.measure_ids:
            return Step2Response(employees=HistogramData(bin_edges=[], counts=[]), sales=HistogramData(bin_edges=[], counts=[]))
            
        placeholders = ','.join(['?'] * len(request.measure_ids))
        query = f"SELECT sales, employees FROM recommendations WHERE naics LIKE ? AND arc IN ({placeholders})"
        params = [f"{request.naics_code}%"] + request.measure_ids
        df = con.execute(query, params).fetch_df()
        
        if df.empty and request.naics_code in ['3323', '32221']:
            df = _get_demo_data(request.naics_code)[['sales', 'employees']]
        elif df.empty:
             return Step2Response(employees=HistogramData(bin_edges=[], counts=[]), sales=HistogramData(bin_edges=[], counts=[]))

        def make_histogram(data):
            data = data.dropna()
            if len(data) == 0: return HistogramData(bin_edges=[], counts=[])
            try:
                p95 = np.percentile(data, 95)
                if p95 == data.min(): p95 = data.max()
                filtered = data[data <= p95]
                if len(filtered) == 0: filtered = data
                counts, bin_edges = np.histogram(filtered, bins=20)
                return HistogramData(bin_edges=bin_edges.tolist(), counts=counts.tolist())
            except:
                return HistogramData(bin_edges=[], counts=[])

        return Step2Response(employees=make_histogram(df['employees']), sales=make_histogram(df['sales']))
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        con.close()


# --- Step 3: Filtered Evaluation (Comparison) ---

class FilteredRequest(BaseModel):
    naics_code: str
    min_employees: float
    max_employees: float
    min_sales: float
    max_sales: float

class AdvancedStep3Response(BaseModel):
    cluster_metrics: List[AdvancedMeasure]
    cluster_median_energy_cost: float = 0.0
    cluster_size: int

# Fix type hint
from typing import Any
AdvancedStep3Response.__annotations__['cluster_median_energy_cost'] = float

@router.post("/step3_filtered_evaluate", response_model=AdvancedStep3Response)
def evaluate_filtered(request: FilteredRequest):
    naics = request.naics_code
    con = get_db_connection()
    try:
        # Query with filters
        query = """
            SELECT * FROM recommendations 
            WHERE naics LIKE ? 
            AND employees BETWEEN ? AND ?
            AND sales BETWEEN ? AND ?
        """
        params = [
            f"{naics}%", 
            request.min_employees, request.max_employees,
            request.min_sales, request.max_sales
        ]
        df = con.execute(query, params).fetch_df()
    except Exception as e:
        print(f"DB Error: {e}")
        df = pd.DataFrame()
    finally:
        con.close()

    # Fallback/Demo logic for filtering
    if df.empty and naics in ["3323", "32221"]:
        # Generate full demo data then filter in pandas
        full_df = _get_demo_data(naics)
        df = full_df[
            (full_df['employees'] >= request.min_employees) & 
            (full_df['employees'] <= request.max_employees) &
            (full_df['sales'] >= request.min_sales) & 
            (full_df['sales'] <= request.max_sales)
        ]
    
    if df.empty:
        return AdvancedStep3Response(cluster_metrics=[], cluster_median_energy_cost=0.0, cluster_size=0)

    measures, cost = _process_dataset(df, naics)
    
    return AdvancedStep3Response(
        cluster_metrics=measures,
        cluster_median_energy_cost=cost,
        cluster_size=len(df)
    )

# --- Step 4: Curves & Gap Analysis ---

class CurveRequest(BaseModel):
    naics_code: str
    selected_measure_ids: List[str]
    resource_type: str = "all" # "all", "electricity", "natural_gas"
    
class CurvePoint(BaseModel):
    x: float # Cumulative Savings
    y: float # CCE
    width: float # Savings of this measure
    label: str
    id: str
    resource_type: str
    units: str

class Step4Response(BaseModel):
    baseline_curve: List[CurvePoint]
    electricity_curve: List[CurvePoint]
    gas_curve: List[CurvePoint]
    
@router.post("/step4_curves", response_model=Step4Response)
def get_curves(request: CurveRequest):
    con = get_db_connection()
    try:
        if not request.selected_measure_ids:
            return Step4Response(baseline_curve=[], electricity_curve=[], gas_curve=[])
            
        placeholders = ','.join(['?'] * len(request.selected_measure_ids))
        query = f"SELECT * FROM recommendations WHERE naics LIKE ? AND arc IN ({placeholders})"
        params = [f"{request.naics_code}%"] + request.selected_measure_ids
        df = con.execute(query, params).fetch_df()
        
        # Demo Fallback implementation omitted for brevity, keeping simple if empty
        if df.empty and request.naics_code in ['3323', '32221']:
             full_df = _get_demo_data(request.naics_code)
             df = full_df[full_df['arc'].isin(request.selected_measure_ids)]
             
        if df.empty:
            return Step4Response(baseline_curve=[], electricity_curve=[], gas_curve=[])

        from app.lookups.resource_codes import is_electricity, is_natural_gas

        r = 0.07
        t = 15
        crf = (r * (1 + r)**t) / ((1 + r)**t - 1)
        
        # 1. Fill missing
        required_cols = ['psaved', 'ssaved', 'tsaved', 'qsaved', 
                         'pconserved', 'sconserved', 'tconserved', 'qconserved',
                         'psourccode', 'ssourccode', 'tsourccode', 'qsourccode']
        for col in required_cols:
            if col not in df.columns:
                df[col] = 0 if 'sourccode' not in col else None
                
        def get_elec(val, code):
            if pd.isna(val) or val == 0: return 0.0
            if is_electricity(code): return val * 0.001 # kWh to MWh
            return 0.0
            
        def get_gas(val, code):
            if pd.isna(val) or val == 0: return 0.0
            if is_natural_gas(code): return float(val) # MMBtu
            return 0.0
            
        def get_elec_dollars(val, code):
            if pd.isna(val) or val == 0: return 0.0
            if is_electricity(code): return float(val)
            return 0.0
            
        def get_gas_dollars(val, code):
            if pd.isna(val) or val == 0: return 0.0
            if is_natural_gas(code): return float(val)
            return 0.0

        df['elec_saved_mwh'] = (
            df.apply(lambda x: get_elec(x['pconserved'], x['psourccode']), axis=1) +
            df.apply(lambda x: get_elec(x['sconserved'], x['ssourccode']), axis=1) +
            df.apply(lambda x: get_elec(x['tconserved'], x['tsourccode']), axis=1) +
            df.apply(lambda x: get_elec(x['qconserved'], x['qsourccode']), axis=1)
        )
        
        df['gas_saved_mmbtu'] = (
            df.apply(lambda x: get_gas(x['pconserved'], x['psourccode']), axis=1) +
            df.apply(lambda x: get_gas(x['sconserved'], x['ssourccode']), axis=1) +
            df.apply(lambda x: get_gas(x['tconserved'], x['tsourccode']), axis=1) +
            df.apply(lambda x: get_gas(x['qconserved'], x['qsourccode']), axis=1)
        )
        
        df['elec_dollars'] = (
            df.apply(lambda x: get_elec_dollars(x['psaved'], x['psourccode']), axis=1) +
            df.apply(lambda x: get_elec_dollars(x['ssaved'], x['ssourccode']), axis=1) +
            df.apply(lambda x: get_elec_dollars(x['tsaved'], x['tsourccode']), axis=1) +
            df.apply(lambda x: get_elec_dollars(x['qsaved'], x['qsourccode']), axis=1)
        )
        
        df['gas_dollars'] = (
            df.apply(lambda x: get_gas_dollars(x['psaved'], x['psourccode']), axis=1) +
            df.apply(lambda x: get_gas_dollars(x['ssaved'], x['ssourccode']), axis=1) +
            df.apply(lambda x: get_gas_dollars(x['tsaved'], x['tsourccode']), axis=1) +
            df.apply(lambda x: get_gas_dollars(x['qsaved'], x['qsourccode']), axis=1)
        )
        
        df['total_dollars'] = df['elec_dollars'] + df['gas_dollars']
        
        # Allocations
        df['elec_ratio'] = 0.0
        df['gas_ratio'] = 0.0
        
        mask_dollars = df['total_dollars'] > 0
        df.loc[mask_dollars, 'elec_ratio'] = df.loc[mask_dollars, 'elec_dollars'] / df.loc[mask_dollars, 'total_dollars']
        df.loc[mask_dollars, 'gas_ratio'] = df.loc[mask_dollars, 'gas_dollars'] / df.loc[mask_dollars, 'total_dollars']
        
        # Fallback to physical energy ratio if dollars missing
        mask_no_dollars = (~mask_dollars) & ((df['elec_saved_mwh'] > 0) | (df['gas_saved_mmbtu'] > 0))
        # Convert MMBtu back to kWh roughly for ratio? Or 50/50? Let's use 50/50 fallback if no dollars to simplify.
        df.loc[mask_no_dollars, 'elec_ratio'] = np.where(df.loc[mask_no_dollars, 'elec_saved_mwh'] > 0, 0.5, 0.0)
        df.loc[mask_no_dollars, 'gas_ratio'] = np.where(df.loc[mask_no_dollars, 'gas_saved_mmbtu'] > 0, 0.5, 0.0)
        # Normalize to 1 if one is 0.5 and other is 0
        df['sum_ratio'] = df['elec_ratio'] + df['gas_ratio']
        mask_fix = (df['sum_ratio'] > 0) & (df['sum_ratio'] < 1.0)
        df.loc[mask_fix, 'elec_ratio'] = df.loc[mask_fix, 'elec_ratio'] / df.loc[mask_fix, 'sum_ratio']
        df.loc[mask_fix, 'gas_ratio'] = df.loc[mask_fix, 'gas_ratio'] / df.loc[mask_fix, 'sum_ratio']

        df['elec_cost'] = df['implementation_cost'] * df['elec_ratio']
        df['gas_cost'] = df['implementation_cost'] * df['gas_ratio']

        elec_points = []
        gas_points = []
        
        grouped = df.groupby('arc')
        for arc, group in grouped:
            # Electricity CCE
            e_group = group[group['elec_saved_mwh'] > 0].copy()
            if not e_group.empty:
                e_group['cce'] = (e_group['elec_cost'] * crf) / e_group['elec_saved_mwh']
                median_cce = e_group['cce'].median()
                median_savings = e_group['elec_saved_mwh'].median()
                elec_points.append({
                    'id': str(arc), 'label': get_arc_label(arc),
                    'y': median_cce, 'width': median_savings,
                    'resource_type': 'electricity', 'units': 'MWh'
                })
                
            # Gas CCE
            g_group = group[group['gas_saved_mmbtu'] > 0].copy()
            if not g_group.empty:
                g_group['cce'] = (g_group['gas_cost'] * crf) / g_group['gas_saved_mmbtu']
                median_cce = g_group['cce'].median()
                median_savings = g_group['gas_saved_mmbtu'].median()
                gas_points.append({
                    'id': str(arc), 'label': get_arc_label(arc),
                    'y': median_cce, 'width': median_savings,
                    'resource_type': 'natural_gas', 'units': 'MMBtu'
                })

        def build_curve(points: List[dict]) -> List[CurvePoint]:
            points.sort(key=lambda p: p['y'])
            cum = 0
            final = []
            for p in points:
                final.append(CurvePoint(
                    id=p['id'], label=p['label'], y=p['y'], width=p['width'],
                    x=cum + p['width'], resource_type=p['resource_type'], units=p['units']
                ))
                cum += p['width']
            return final

        e_curve = build_curve(elec_points)
        g_curve = build_curve(gas_points)
        
        # Determine which to return in "baseline_curve" for backward compat
        return Step4Response(
            baseline_curve=e_curve if request.resource_type == "electricity" else g_curve if request.resource_type == "natural_gas" else e_curve,
            electricity_curve=e_curve,
            gas_curve=g_curve
        )

    except Exception as e:
        print(f"Error in curves: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        con.close()
