from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
import duckdb
import numpy as np
import pandas as pd
from app.models.schemas import (
    AdvancedStep1Request, AdvancedStep1Response, AdvancedMeasure,
    MeasureDistributionRequest, MeasureDistributionResponse,
    CategoryFilterRequest, AdvancedStep3Response,
    PrimaryCurveRequest, PrimaryCurveResponse, PrimaryCurvePoint, EconomicSummary,
    NEBDetailsRequest, NEBDetailsResponse, NEBMeasureDetail,
)
from app.db.connection import DB_PATH
from app.lookups.arc_codes import get_arc_label
from app.utils.energy_constants import (
    PEF_ELEC, PEF_GAS, compute_crf,
    DEFAULT_DISCOUNT_RATE, DEFAULT_LIFETIME,
)
from app.utils.cce_primary import (
    observation_primary_energy_gj, compute_cce_primary,
    compute_obs_metrics, compute_neb_categories,
    classify_firm_size, compute_primary_price_cutoff,
    compute_economic_potential_summary,
)

router = APIRouter()

def get_db_connection():
    return duckdb.connect(str(DB_PATH), read_only=True)


# ===================================================================
# Helpers: category filtering
# ===================================================================

def _apply_category_filter(df: pd.DataFrame, categories: Optional[List[str]]) -> pd.DataFrame:
    """Filter DataFrame by firm-size categories. Returns df unchanged if categories is None/empty."""
    if not categories:
        return df
    df = df.copy()
    df["_firm_category"] = df.apply(
        lambda r: classify_firm_size(int(r.get("employees", 0) or 0), float(r.get("sales", 0) or 0)),
        axis=1,
    )
    return df[df["_firm_category"].isin(categories)]


# ===================================================================
# Core: _process_dataset
# ===================================================================

def _process_dataset(df, naics, fixed_energy_cost: Optional[float] = None):
    """
    Core logic to calculate metrics, scores, and rankings from a DataFrame.
    Now includes cce_primary ($/GJ_primary) alongside legacy cce.
    """
    industry_energy_cost = 0.0  # No longer used for display; kept for backward compat

    required_cols = ['psaved', 'ssaved', 'tsaved', 'qsaved',
                     'pconserved', 'sconserved', 'tconserved', 'qconserved',
                     'psourccode', 'ssourccode', 'tsourccode', 'qsourccode']
    for col in required_cols:
        if col not in df.columns:
            df[col] = 0 if 'sourccode' not in col else None

    # Total Gross Savings ($) per row
    df['total_savings'] = (
        df['psaved'].fillna(0) +
        df['ssaved'].fillna(0) +
        df['tsaved'].fillna(0) +
        df['qsaved'].fillna(0)
    )

    # Legacy: Total Conserved Energy (MMBtu-mixed) per row
    def get_mmbtu(val, code):
        if pd.isna(val) or val == 0: return 0
        if not isinstance(code, str): return 0
        code = code.upper().strip()
        if code == 'EC' or code == 'E13' or code == 'E1':
            return val * 0.003412
        if code.startswith('E'):
            return val
        return 0

    df['total_energy_conserved'] = (
        df.apply(lambda x: get_mmbtu(x['pconserved'], x['psourccode']), axis=1) +
        df.apply(lambda x: get_mmbtu(x['sconserved'], x['ssourccode']), axis=1) +
        df.apply(lambda x: get_mmbtu(x['tconserved'], x['tsourccode']), axis=1) +
        df.apply(lambda x: get_mmbtu(x['qconserved'], x['qsourccode']), axis=1)
    )

    # Primary energy (GJ) per row — using new utility
    df['e_primary_gj'] = df.apply(
        lambda x: observation_primary_energy_gj(x.to_dict()), axis=1
    )

    grouped = df.groupby('arc')

    crf = compute_crf(DEFAULT_DISCOUNT_RATE, DEFAULT_LIFETIME)

    measures = []

    for arc, group in grouped:
        count = len(group)

        # Implementation Rate
        implemented = group['impstatus'].astype(str).str.upper().apply(lambda x: 'I' in x or 'IMPL' in x)
        imp_rate = implemented.sum() / count if count > 0 else 0

        # Gross Savings: Median
        gross_savings = group['total_savings'].median()

        # Payback: Median
        valid_payback = group[group['total_savings'] > 0].copy()
        if not valid_payback.empty:
            valid_payback['calc_payback'] = valid_payback['implementation_cost'] / valid_payback['total_savings']
            payback = valid_payback['calc_payback'].median()
        else:
            payback = 0.0

        # Legacy CCE (MMBtu-mixed)
        valid_cce = group[group['total_energy_conserved'] > 0].copy()
        if not valid_cce.empty:
            valid_cce['calc_cce'] = (valid_cce['implementation_cost'] * crf) / valid_cce['total_energy_conserved']
            cce = valid_cce['calc_cce'].median()
        else:
            cce = 0.0

        # NEW: CCE Primary ($/GJ_primary)
        valid_primary = group[group['e_primary_gj'] > 0].copy()
        if not valid_primary.empty:
            valid_primary['calc_cce_primary'] = (valid_primary['implementation_cost'] * crf) / valid_primary['e_primary_gj']
            cce_primary = valid_primary['calc_cce_primary'].median()
        else:
            cce_primary = 0.0

        # Legacy: separate elec/gas CCE
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

        group_copy = group.copy()
        group_copy['elec_mwh'] = (
            group_copy.apply(lambda x: get_elec_mwh(x['pconserved'], x['psourccode']), axis=1) +
            group_copy.apply(lambda x: get_elec_mwh(x['sconserved'], x['ssourccode']), axis=1) +
            group_copy.apply(lambda x: get_elec_mwh(x['tconserved'], x['tsourccode']), axis=1) +
            group_copy.apply(lambda x: get_elec_mwh(x['qconserved'], x['qsourccode']), axis=1)
        )
        group_copy['elec_dollars'] = (
            group_copy.apply(lambda x: get_dollar_portion(x['psaved'], x['psourccode'], True), axis=1) +
            group_copy.apply(lambda x: get_dollar_portion(x['ssaved'], x['ssourccode'], True), axis=1) +
            group_copy.apply(lambda x: get_dollar_portion(x['tsaved'], x['tsourccode'], True), axis=1) +
            group_copy.apply(lambda x: get_dollar_portion(x['qsaved'], x['qsourccode'], True), axis=1)
        )
        cce_elec_vals = group_copy[group_copy['elec_mwh'] > 0]
        if not cce_elec_vals.empty:
            prop_cost = cce_elec_vals['implementation_cost'] * (cce_elec_vals['elec_dollars'] / cce_elec_vals['total_savings'].replace(0, 1))
            cce_elec = (prop_cost * crf / cce_elec_vals['elec_mwh']).median()
        else:
            cce_elec = None

        group_copy['gas_mmbtu'] = (
            group_copy.apply(lambda x: get_gas_mmbtu(x['pconserved'], x['psourccode']), axis=1) +
            group_copy.apply(lambda x: get_gas_mmbtu(x['sconserved'], x['ssourccode']), axis=1) +
            group_copy.apply(lambda x: get_gas_mmbtu(x['tconserved'], x['tsourccode']), axis=1) +
            group_copy.apply(lambda x: get_gas_mmbtu(x['qconserved'], x['qsourccode']), axis=1)
        )
        group_copy['gas_dollars'] = (
            group_copy.apply(lambda x: get_dollar_portion(x['psaved'], x['psourccode'], False), axis=1) +
            group_copy.apply(lambda x: get_dollar_portion(x['ssaved'], x['ssourccode'], False), axis=1) +
            group_copy.apply(lambda x: get_dollar_portion(x['tsaved'], x['tsourccode'], False), axis=1) +
            group_copy.apply(lambda x: get_dollar_portion(x['qsaved'], x['qsourccode'], False), axis=1)
        )
        cce_gas_vals = group_copy[group_copy['gas_mmbtu'] > 0]
        if not cce_gas_vals.empty:
            prop_cost = cce_gas_vals['implementation_cost'] * (cce_gas_vals['gas_dollars'] / cce_gas_vals['total_savings'].replace(0, 1))
            cce_gas = (prop_cost * crf / cce_gas_vals['gas_mmbtu']).median()
        else:
            cce_gas = None

        # NEB codes
        neb_codes = set()
        for src_col in ['psourccode', 'ssourccode', 'tsourccode', 'qsourccode']:
            if src_col in group.columns:
                for code in group[src_col].dropna().unique():
                    code_str = str(code).upper().strip()
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
            'cce_primary': cce_primary,
            'cce_elec': cce_elec,
            'cce_gas': cce_gas,
            'neb_codes': sorted(list(neb_codes))
        })

    if not measures:
        return [], industry_energy_cost

    # Scoring
    results_df = pd.DataFrame(measures)

    def normalize_max_better(series):
        if series.max() == series.min(): return 1.0
        return (series - series.min()) / (series.max() - series.min())

    def normalize_min_better(series):
        if series.max() == series.min(): return 1.0
        return (series.max() - series) / (series.max() - series.min())

    results_df = results_df.fillna(0)

    results_df['norm_count'] = normalize_max_better(results_df['count'])
    results_df['norm_imp'] = normalize_max_better(results_df['imp_rate'])
    results_df['norm_savings'] = normalize_max_better(results_df['gross_savings'])
    results_df['norm_cce'] = normalize_min_better(results_df['cce_primary'])
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
            cce_primary=float(row['cce_primary']),
            score=float(row['score']),
            cce_elec=float(row['cce_elec']) if pd.notnull(row['cce_elec']) else None,
            cce_gas=float(row['cce_gas']) if pd.notnull(row['cce_gas']) else None,
            neb_codes=row['neb_codes']
        ))

    return final_measures, industry_energy_cost


# ===================================================================
# Demo data generator
# ===================================================================

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
        'psaved': np.random.exponential(500, n_rows),
        'ssaved': np.random.exponential(200, n_rows),
        'tsaved': np.zeros(n_rows),
        'qsaved': np.zeros(n_rows),
        'pconserved': np.random.exponential(10000, n_rows),
        'sconserved': np.random.exponential(500, n_rows),
        'tconserved': np.zeros(n_rows),
        'qconserved': np.zeros(n_rows),
        'psourccode': np.random.choice(['EC', 'E2'], n_rows),
        'ssourccode': np.random.choice(['E2', 'R1'], n_rows),
        'tsourccode': [''] * n_rows,
        'qsourccode': [''] * n_rows
    })


def _load_naics_df(naics: str, con=None) -> pd.DataFrame:
    """Load recommendations for a given NAICS from DB, falling back to demo data."""
    close_con = False
    if con is None:
        con = get_db_connection()
        close_con = True
    try:
        query = "SELECT * FROM recommendations WHERE naics LIKE ?"
        df = con.execute(query, [f"{naics}%"]).fetch_df()
    except Exception as e:
        print(f"DB Error: {e}")
        df = pd.DataFrame()
    finally:
        if close_con:
            con.close()

    if df.empty and naics in ["3323", "32221"]:
        df = _get_demo_data(naics)
    return df


# ===================================================================
# Endpoints
# ===================================================================

# --- Step 1: Evaluate ---

@router.post("/step1_evaluate", response_model=AdvancedStep1Response)
def evaluate_step1(request: AdvancedStep1Request):
    naics = request.naics_code
    df = _load_naics_df(naics)

    if df.empty:
        return AdvancedStep1Response(measures=[], naics_code=naics, industry_median_energy_cost=0.0)

    measures, cost = _process_dataset(df, naics)
    return AdvancedStep1Response(measures=measures, naics_code=naics, industry_median_energy_cost=cost)


# --- Step 2: Distributions (employees/sales – legacy) ---

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


# --- NEW: Per-measure distributions (Gross Savings, Payback, CCE_primary) ---

@router.post("/step2_measure_distributions", response_model=MeasureDistributionResponse)
def get_measure_distributions(request: MeasureDistributionRequest):
    """Get per-observation distribution arrays for a single ARC measure."""
    con = get_db_connection()
    try:
        query = "SELECT * FROM recommendations WHERE naics LIKE ? AND arc = ?"
        df = con.execute(query, [f"{request.naics_code}%", request.arc_code]).fetch_df()

        if df.empty and request.naics_code in ['3323', '32221']:
            full_df = _get_demo_data(request.naics_code)
            df = full_df[full_df['arc'] == request.arc_code]

        if df.empty:
            return MeasureDistributionResponse(gross_savings=[], payback=[], cce_primary=[], count=0)

        # Apply category filter
        df = _apply_category_filter(df, request.categories)
        if df.empty:
            return MeasureDistributionResponse(gross_savings=[], payback=[], cce_primary=[], count=0)

        crf = compute_crf()
        gs_list, pb_list, cce_list = [], [], []

        for _, row in df.iterrows():
            metrics = compute_obs_metrics(row.to_dict(), crf)
            gs = metrics["gross_savings"]
            if gs and gs > 0:
                gs_list.append(float(gs))
            pb = metrics["payback"]
            if pb is not None and pb > 0:
                pb_list.append(float(pb))
            cce = metrics["cce_primary"]
            if cce is not None:
                cce_list.append(float(cce))

        return MeasureDistributionResponse(
            gross_savings=gs_list,
            payback=pb_list,
            cce_primary=cce_list,
            count=len(df),
        )
    except Exception as e:
        print(f"Error in measure distributions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        con.close()


# --- Step 3: Filtered Evaluation (Category-based + legacy range-based) ---

class FilteredRequest(BaseModel):
    naics_code: str
    min_employees: float = 0
    max_employees: float = 1e9
    min_sales: float = 0
    max_sales: float = 1e15
    categories: Optional[List[str]] = None  # NEW: category-based filtering

@router.post("/step3_filtered_evaluate", response_model=AdvancedStep3Response)
def evaluate_filtered(request: FilteredRequest):
    naics = request.naics_code
    df = _load_naics_df(naics)

    if df.empty:
        return AdvancedStep3Response(cluster_metrics=[], cluster_median_energy_cost=0.0, cluster_size=0)

    # Apply category filter if provided, else fall back to range
    if request.categories:
        df = _apply_category_filter(df, request.categories)
    else:
        df = df[
            (df['employees'] >= request.min_employees) &
            (df['employees'] <= request.max_employees) &
            (df['sales'] >= request.min_sales) &
            (df['sales'] <= request.max_sales)
        ]

    if df.empty:
        return AdvancedStep3Response(cluster_metrics=[], cluster_median_energy_cost=0.0, cluster_size=0)

    measures, cost = _process_dataset(df, naics)

    return AdvancedStep3Response(
        cluster_metrics=measures,
        cluster_median_energy_cost=cost,
        cluster_size=len(df)
    )


# --- Step 4: Primary Curves + Economic Potential ---

@router.post("/step4_curves", response_model=PrimaryCurveResponse)
def get_primary_curves(request: PrimaryCurveRequest):
    con = get_db_connection()
    try:
        if not request.selected_measure_ids:
            empty_summary = EconomicSummary(
                total_technical_gj=0, economic_gj=0, share_economic=0,
                count_economic=0, count_total=0, cutoff_price=0
            )
            return PrimaryCurveResponse(
                primary_curve=[], cutoff_price_gj_primary=0, economic_summary=empty_summary
            )

        placeholders = ','.join(['?'] * len(request.selected_measure_ids))
        query = f"SELECT * FROM recommendations WHERE naics LIKE ? AND arc IN ({placeholders})"
        params = [f"{request.naics_code}%"] + request.selected_measure_ids
        df = con.execute(query, params).fetch_df()

        if df.empty and request.naics_code in ['3323', '32221']:
            full_df = _get_demo_data(request.naics_code)
            df = full_df[full_df['arc'].isin(request.selected_measure_ids)]

        if df.empty:
            empty_summary = EconomicSummary(
                total_technical_gj=0, economic_gj=0, share_economic=0,
                count_economic=0, count_total=0, cutoff_price=0
            )
            return PrimaryCurveResponse(
                primary_curve=[], cutoff_price_gj_primary=0, economic_summary=empty_summary
            )

        # Apply category filter
        if request.categories:
            df = _apply_category_filter(df, request.categories)

        pef_elec = request.pef_elec
        pef_gas = request.pef_gas
        crf = compute_crf()

        # Compute primary energy per row
        df['e_primary_gj'] = df.apply(
            lambda x: observation_primary_energy_gj(x.to_dict(), pef_elec, pef_gas), axis=1
        )

        # Group by ARC and compute median primary CCE + width
        grouped = df.groupby('arc')
        curve_points = []
        total_primary_elec = 0.0
        total_primary_gas = 0.0

        for arc, group in grouped:
            valid = group[group['e_primary_gj'] > 0].copy()
            if valid.empty:
                continue

            valid['cce_p'] = (valid['implementation_cost'] * crf) / valid['e_primary_gj']
            median_cce = valid['cce_p'].median()
            median_width = valid['e_primary_gj'].median()

            curve_points.append({
                'id': str(arc),
                'label': get_arc_label(arc),
                'cce_primary': float(median_cce),
                'width': float(median_width),
            })

            # Track weights for cutoff price
            for _, r in valid.iterrows():
                row_dict = r.to_dict()
                for prefix in ("p", "s", "t", "q"):
                    conserved = row_dict.get(f"{prefix}conserved", 0) or 0
                    code = row_dict.get(f"{prefix}sourccode", "")
                    if not code or conserved == 0:
                        continue
                    c = str(code).upper().strip()
                    from app.utils.energy_constants import ELECTRICITY_CODES, NATURAL_GAS_CODES, KWH_TO_MJ, MMBTU_TO_GJ, MJ_PER_GJ
                    if c in ELECTRICITY_CODES:
                        total_primary_elec += conserved * KWH_TO_MJ * pef_elec / MJ_PER_GJ
                    elif c in NATURAL_GAS_CODES:
                        total_primary_gas += conserved * MMBTU_TO_GJ * pef_gas

        # Sort by CCE ascending
        curve_points.sort(key=lambda p: (p['cce_primary'], -p['width']))

        # Build staircase
        cum_x = 0.0
        primary_curve = []
        for pt in curve_points:
            primary_curve.append(PrimaryCurvePoint(
                x=cum_x, y=pt['cce_primary'], width=pt['width'],
                label=pt['label'], id=pt['id'],
            ))
            cum_x += pt['width']

        # Compute cutoff price
        total_primary = total_primary_elec + total_primary_gas
        w_elec = total_primary_elec / total_primary if total_primary > 0 else 0.5
        w_gas = 1.0 - w_elec

        cutoff = compute_primary_price_cutoff(
            request.electricity_price_mwh, request.gas_price_mmbtu,
            pef_elec, pef_gas, w_elec, w_gas,
        )

        # Economic summary
        summary_data = compute_economic_potential_summary(
            [{'cce_primary': p['cce_primary'], 'width': p['width']} for p in curve_points],
            cutoff,
        )

        return PrimaryCurveResponse(
            primary_curve=primary_curve,
            cutoff_price_gj_primary=cutoff,
            economic_summary=EconomicSummary(
                total_technical_gj=summary_data['total_technical_gj'],
                economic_gj=summary_data['economic_gj'],
                share_economic=summary_data['share_economic'],
                count_economic=summary_data['count_economic'],
                count_total=summary_data['count_total'],
                cutoff_price=cutoff,
            ),
        )

    except Exception as e:
        print(f"Error in primary curves: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        con.close()


# --- Step 8: NEB Details ---

@router.post("/step8_neb_details", response_model=NEBDetailsResponse)
def get_neb_details(request: NEBDetailsRequest):
    con = get_db_connection()
    try:
        if not request.selected_measure_ids:
            return NEBDetailsResponse(measures=[])

        placeholders = ','.join(['?'] * len(request.selected_measure_ids))
        query = f"SELECT * FROM recommendations WHERE naics LIKE ? AND arc IN ({placeholders})"
        params = [f"{request.naics_code}%"] + request.selected_measure_ids
        df = con.execute(query, params).fetch_df()

        if df.empty and request.naics_code in ['3323', '32221']:
            full_df = _get_demo_data(request.naics_code)
            df = full_df[full_df['arc'].isin(request.selected_measure_ids)]

        if df.empty:
            return NEBDetailsResponse(measures=[])

        # Apply category filter
        if request.categories:
            df = _apply_category_filter(df, request.categories)

        # Ensure required cols
        for col in ['psaved', 'ssaved', 'tsaved', 'qsaved',
                     'psourccode', 'ssourccode', 'tsourccode', 'qsourccode']:
            if col not in df.columns:
                df[col] = 0 if 'sourccode' not in col else None

        df['total_savings'] = (
            df['psaved'].fillna(0) + df['ssaved'].fillna(0) +
            df['tsaved'].fillna(0) + df['qsaved'].fillna(0)
        )

        grouped = df.groupby('arc')
        neb_measures = []

        for arc, group in grouped:
            # Imp cost median
            imp_costs = group['implementation_cost'].dropna()
            imp_costs = imp_costs[imp_costs > 0]
            imp_cost_median = float(imp_costs.median()) if not imp_costs.empty else None

            # Energy savings median
            es = group['total_savings'].dropna()
            es = es[es > 0]
            energy_savings_median = float(es.median()) if not es.empty else None

            # NEB categories per observation
            waste_vals, prod_vals, res_vals, other_e_vals = [], [], [], []
            for _, row in group.iterrows():
                neb = compute_neb_categories(row.to_dict())
                if neb['waste'] != 0:
                    waste_vals.append(neb['waste'])
                if neb['production'] != 0:
                    prod_vals.append(neb['production'])
                if neb['resource'] != 0:
                    res_vals.append(neb['resource'])
                if neb['other_energy'] != 0:
                    other_e_vals.append(neb['other_energy'])

            def safe_median(vals):
                if not vals:
                    return None
                return float(np.median(vals))

            neb_measures.append(NEBMeasureDetail(
                arc=str(arc),
                description=get_arc_label(arc),
                imp_cost_median=imp_cost_median,
                energy_savings_median=energy_savings_median,
                other_energy_median=safe_median(other_e_vals),
                waste_costs_median=safe_median(waste_vals),
                production_costs_median=safe_median(prod_vals),
                resource_costs_median=safe_median(res_vals),
                waste_values=waste_vals,
                production_values=prod_vals,
                resource_values=res_vals,
            ))

        return NEBDetailsResponse(measures=neb_measures)

    except Exception as e:
        print(f"Error in NEB details: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if con is not None:
            con.close()


# ===================================================================
# Step 5B: BAT Alignment & Improvement Gap
# ===================================================================

from app.models.schemas import (
    Step5BRequest, Step5BResponse, BatAlignmentMeasure, BatLink, BrefInfo,
    Step5CRequest, Step5CResponse, PriorityMeasure,
)
from app.utils.bat_mapping import (
    get_bat_links_for_arc, get_available_brefs, compute_improvement_index,
    compute_bat_count, compute_confidence_factor, compute_bat_premium,
    compute_priority_score_additive,
)

@router.post("/step5b_bat_alignment", response_model=Step5BResponse)
def step5b_bat_alignment(request: Step5BRequest):
    """Compute BAT alignment + Improvement Index for cluster-scoped measures."""
    con = None
    try:
        con = get_db_connection()
        query = "SELECT * FROM recommendations WHERE naics LIKE ?"
        df = con.execute(query, [f"{request.naics_code}%"]).fetch_df()

        if df.empty:
            brefs = [BrefInfo(**b) for b in get_available_brefs(request.naics_code)]
            return Step5BResponse(measures=[], available_brefs=brefs)

        # Apply cluster filter
        df = _apply_category_filter(df, request.categories)

        # Process measures (get scores, descriptions, etc.)
        measure_data, _ = _process_dataset(df, request.naics_code)

        # Build per-ARC implementation counts from raw data
        arc_stats = {}
        for arc, group in df.groupby('arc'):
            count = len(group)
            implemented = group['impstatus'].astype(str).str.upper().apply(lambda x: 'I' in x or 'IMPL' in x)
            arc_stats[arc] = {
                'recommended': count,
                'implemented': int(implemented.sum()),
            }

        # Get available BREFs
        brefs = [BrefInfo(**b) for b in get_available_brefs(request.naics_code)]

        # Build result measures
        result_measures = []
        for m in measure_data:
            arc = m.arc
            bat_links_raw = get_bat_links_for_arc(arc, request.naics_code, request.bref_id)
            is_bat_linked = len(bat_links_raw) > 0

            if request.bat_only and not is_bat_linked:
                continue

            stats = arc_stats.get(arc, {'recommended': 0, 'implemented': 0})
            recommended = stats['recommended']
            implemented = stats['implemented']
            imp_rate = (implemented + 1) / (recommended + 2) if recommended > 0 else 0.0

            # Compute avg confidence from primary links (fallback all)
            primary_confs = [l['confidence'] for l in bat_links_raw if l['matchRole'] == 'primary']
            all_confs = [l['confidence'] for l in bat_links_raw]
            avg_conf = (sum(primary_confs) / len(primary_confs)) if primary_confs else (
                (sum(all_confs) / len(all_confs)) if all_confs else 1.0
            )

            improvement_idx = compute_improvement_index(recommended, implemented, avg_conf)

            bat_links_pydantic = [BatLink(**bl) for bl in bat_links_raw]

            result_measures.append(BatAlignmentMeasure(
                arc=arc,
                description=m.description,
                score=m.score,
                count=recommended,
                implemented_count=implemented,
                imp_rate=round(imp_rate, 4),
                imp_gap=round(1.0 - imp_rate, 4),
                improvement_index=improvement_idx,
                avg_confidence=round(avg_conf, 3),
                is_bat_linked=is_bat_linked,
                bat_links=bat_links_pydantic,
            ))

        # Sort by improvement_index desc (None last)
        result_measures.sort(key=lambda x: (x.improvement_index is not None, x.improvement_index or 0), reverse=True)

        return Step5BResponse(measures=result_measures, available_brefs=brefs)

    except Exception as e:
        print(f"Error in step5b: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if con is not None:
            con.close()


# ===================================================================
# Step 5C: Priority Index
# ===================================================================

@router.post("/step5c_priority_index", response_model=Step5CResponse)
def step5c_priority_index(request: Step5CRequest):
    """Compute Priority Score using additive BAT premium.

    BAT-linked measures: priorityScore = clamp(criticality + batPremium, 0, 100)
    Non-BAT measures: priorityScore = criticalityIndex (unchanged)
    batPremium = batAdditiveMax * confidenceFactor (per-measure)
    """
    con = None
    try:
        con = get_db_connection()
        query = "SELECT * FROM recommendations WHERE naics LIKE ?"
        df = con.execute(query, [f"{request.naics_code}%"]).fetch_df()

        if df.empty:
            return Step5CResponse(measures=[])

        df = _apply_category_filter(df, request.categories)
        measure_data, _ = _process_dataset(df, request.naics_code)

        # Clamp bat_additive_max to [0, 30]
        bat_additive_max = max(0, min(30, request.bat_additive_max))

        result = []
        for m in measure_data:
            arc = m.arc
            bat_links_raw = get_bat_links_for_arc(arc, request.naics_code, request.bref_id)
            is_bat_linked = len(bat_links_raw) > 0

            bat_count = compute_bat_count(bat_links_raw) if is_bat_linked else 0
            conf_factor = compute_confidence_factor(bat_links_raw) if is_bat_linked else 0.0
            premium = compute_bat_premium(bat_additive_max, conf_factor) if is_bat_linked else 0

            criticality = m.score
            priority = compute_priority_score_additive(criticality, is_bat_linked, premium)

            result.append(PriorityMeasure(
                arc=arc,
                description=m.description,
                criticality_index=criticality,
                priority_score=priority,
                bat_count=bat_count,
                is_bat_linked=is_bat_linked,
            ))

        # Sort: priority_score DESC, criticality DESC, bat_count DESC, then arc
        result.sort(key=lambda x: (
            x.priority_score,
            x.criticality_index,
            x.bat_count,
        ), reverse=True)

        return Step5CResponse(measures=result)

    except Exception as e:
        print(f"Error in step5c: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if con is not None:
            con.close()


