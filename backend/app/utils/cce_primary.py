"""
Pure functions for primary-energy CCE computation, firm-size classification,
and NEB category extraction. All functions are deterministic and side-effect free.
"""
import math
from typing import Optional, Dict, List, Tuple, Any

from app.utils.energy_constants import (
    KWH_TO_MJ, MMBTU_TO_GJ, MJ_PER_GJ,
    PEF_ELEC, PEF_GAS,
    ELECTRICITY_CODES, NATURAL_GAS_CODES, OTHER_ENERGY_MMBTU_CODES,
    DEMAND_FEE_CODES, WASTE_PREFIX, PRODUCTION_PREFIX, RESOURCE_PREFIX,
    FIRM_SIZE_CATEGORIES, compute_crf,
)


# ---------------------------------------------------------------------------
# 1) Site → Primary energy conversion
# ---------------------------------------------------------------------------

def site_to_primary_mj(
    conserved: float,
    source_code: Optional[str],
    pef_elec: float = PEF_ELEC,
    pef_gas: float = PEF_GAS,
) -> float:
    """
    Convert a single stream's conserved quantity to MJ_primary.

    Args:
        conserved: physical quantity saved (kWh for elec, MMBtu for gas/fuels)
        source_code: IAC resource identification code (e.g. "EC", "E2", "W1")
        pef_elec: primary energy factor for electricity
        pef_gas: primary energy factor for natural gas

    Returns:
        MJ_primary (>= 0). Returns 0 for non-energy or unrecognised codes.
    """
    if conserved is None or math.isnan(conserved) or conserved == 0:
        return 0.0
    if not source_code or not isinstance(source_code, str):
        return 0.0

    code = source_code.upper().strip()

    if code in ELECTRICITY_CODES:
        # conserved is in kWh(site)
        mj_site = conserved * KWH_TO_MJ
        return mj_site * pef_elec

    if code in NATURAL_GAS_CODES:
        # conserved is in MMBtu
        gj_site = conserved * MMBTU_TO_GJ
        mj_site = gj_site * MJ_PER_GJ
        return mj_site * pef_gas

    if code in OTHER_ENERGY_MMBTU_CODES:
        # Other fuels (E3-E12) in MMBtu, treat with gas PEF as approximation
        gj_site = conserved * MMBTU_TO_GJ
        mj_site = gj_site * MJ_PER_GJ
        return mj_site * pef_gas

    # ED, EF, W*, P*, R* → not physical energy savings
    return 0.0


def observation_primary_energy_gj(
    row: Dict[str, Any],
    pef_elec: float = PEF_ELEC,
    pef_gas: float = PEF_GAS,
) -> float:
    """
    Compute total primary energy savings (GJ_primary) for one observation (row).
    Sums across all 4 streams (P, S, T, Q).
    """
    total_mj = 0.0
    for prefix in ("p", "s", "t", "q"):
        conserved = row.get(f"{prefix}conserved", 0) or 0
        code = row.get(f"{prefix}sourccode", None)
        total_mj += site_to_primary_mj(conserved, code, pef_elec, pef_gas)
    return total_mj / MJ_PER_GJ  # MJ → GJ


# ---------------------------------------------------------------------------
# 2) CCE primary computation
# ---------------------------------------------------------------------------

def compute_cce_primary(
    annualized_cost: float,
    e_primary_total_gj: float,
) -> Optional[float]:
    """
    CCE_primary = annualized_cost / e_primary_total_gj  ($/GJ_primary)

    Returns None if e_primary_total_gj <= 0.
    Allows negative CCE (e.g. when NEB adjustments make AC negative).
    """
    if e_primary_total_gj <= 0:
        return None
    return annualized_cost / e_primary_total_gj


def compute_obs_cce_primary(
    row: Dict[str, Any],
    crf: float,
    pef_elec: float = PEF_ELEC,
    pef_gas: float = PEF_GAS,
) -> Optional[float]:
    """
    Full per-observation CCE_primary computation.
    annualized_cost = implementation_cost * CRF
    """
    imp_cost = row.get("implementation_cost", 0) or 0
    if imp_cost <= 0:
        return None
    annualized = imp_cost * crf
    e_gj = observation_primary_energy_gj(row, pef_elec, pef_gas)
    return compute_cce_primary(annualized, e_gj)


# ---------------------------------------------------------------------------
# 3) Primary fuel price cutoff
# ---------------------------------------------------------------------------

def compute_primary_price_cutoff(
    p_elec_mwh: float,
    p_gas_mmbtu: float,
    pef_elec: float = PEF_ELEC,
    pef_gas: float = PEF_GAS,
    weight_elec: float = 0.5,
    weight_gas: float = 0.5,
) -> float:
    """
    Compute weighted average primary fuel price in $/GJ_primary.

    Steps:
      1) $/MWh_site → $/GJ_site → $/GJ_primary (elec)
      2) $/MMBtu_site → $/GJ_site → $/GJ_primary (gas)
      3) Weighted average
    """
    # Electricity: $/MWh → $/GJ_site = $/MWh / 3.6 ; then / PEF
    p_elec_gj_site = p_elec_mwh / (KWH_TO_MJ * MJ_PER_GJ / MJ_PER_GJ)
    # $/MWh / 3.6 = $/kWh * 1000 / 3.6 ... let's be explicit:
    # 1 MWh = 1000 kWh = 1000 * 3.6 MJ = 3600 MJ = 3.6 GJ
    p_elec_gj_site = p_elec_mwh / 3.6  # $/GJ_site
    p_elec_gj_primary = p_elec_gj_site / pef_elec

    # Gas: $/MMBtu → $/GJ_site = $/MMBtu / 1.055056 ; then / PEF
    p_gas_gj_site = p_gas_mmbtu / MMBTU_TO_GJ
    p_gas_gj_primary = p_gas_gj_site / pef_gas

    # Weighted average
    total_weight = weight_elec + weight_gas
    if total_weight <= 0:
        return 0.0
    return (weight_elec * p_elec_gj_primary + weight_gas * p_gas_gj_primary) / total_weight


# ---------------------------------------------------------------------------
# 4) Firm size classification
# ---------------------------------------------------------------------------

def classify_firm_size(employees: int, sales: float) -> str:
    """
    Classify a firm into micro/small/medium/large.
    Uses EU-style thresholds (employees AND turnover).
    Categories are mutually exclusive; checked in order micro → small → medium.
    """
    employees = employees or 0
    sales = sales or 0

    for category in ("micro", "small", "medium"):
        limits = FIRM_SIZE_CATEGORIES[category]
        if employees < limits["max_employees"] and sales <= limits["max_turnover"]:
            return category
    return "large"


# ---------------------------------------------------------------------------
# 5) NEB category extraction (per observation)
# ---------------------------------------------------------------------------

def _classify_neb_code(code: Optional[str]) -> Optional[str]:
    """Classify a source code into an NEB category, or None if energy."""
    if not code or not isinstance(code, str):
        return None
    c = code.upper().strip()
    if c in DEMAND_FEE_CODES:
        return "other_energy"
    if c.startswith(WASTE_PREFIX):
        return "waste"
    if c.startswith(PRODUCTION_PREFIX):
        return "production"
    if c.startswith(RESOURCE_PREFIX):
        return "resource"
    return None  # Energy codes or unrecognised


def compute_neb_categories(row: Dict[str, Any]) -> Dict[str, float]:
    """
    Extract NEB category dollar sums from one observation.
    Looks at all 4 streams (P, S, T, Q) source codes and saved values.

    Returns dict with keys: other_energy, waste, production, resource
    """
    result = {"other_energy": 0.0, "waste": 0.0, "production": 0.0, "resource": 0.0}
    for prefix in ("p", "s", "t", "q"):
        code = row.get(f"{prefix}sourccode")
        saved = row.get(f"{prefix}saved", 0) or 0
        category = _classify_neb_code(code)
        if category and saved != 0:
            result[category] += float(saved)
    return result


# ---------------------------------------------------------------------------
# 6) Per-observation metrics (for distribution arrays)
# ---------------------------------------------------------------------------

def compute_obs_metrics(
    row: Dict[str, Any],
    crf: float,
    pef_elec: float = PEF_ELEC,
    pef_gas: float = PEF_GAS,
) -> Dict[str, Optional[float]]:
    """
    Compute per-observation metrics used for distributions.
    Returns dict with: gross_savings, payback, cce_primary, e_primary_gj, imp_cost
    """
    psaved = float(row.get("psaved", 0) or 0)
    ssaved = float(row.get("ssaved", 0) or 0)
    tsaved = float(row.get("tsaved", 0) or 0)
    qsaved = float(row.get("qsaved", 0) or 0)
    gross_savings = psaved + ssaved + tsaved + qsaved

    imp_cost = float(row.get("implementation_cost", 0) or 0)
    payback = imp_cost / gross_savings if gross_savings > 0 else None

    e_gj = observation_primary_energy_gj(row, pef_elec, pef_gas)
    cce_primary = compute_cce_primary(imp_cost * crf, e_gj) if e_gj > 0 and imp_cost > 0 else None

    return {
        "gross_savings": gross_savings,
        "payback": payback,
        "cce_primary": cce_primary,
        "e_primary_gj": e_gj,
        "imp_cost": imp_cost,
    }


# ---------------------------------------------------------------------------
# 7) Economic potential summary
# ---------------------------------------------------------------------------

def compute_economic_potential_summary(
    measures: List[Dict[str, float]],
    cutoff_price: float,
) -> Dict[str, Any]:
    """
    Compute economic potential from a list of measure dicts with keys:
    - cce_primary ($/GJ)
    - width (GJ_primary)

    Returns:
        total_technical_gj, economic_gj, share_economic, count_economic, count_total
    """
    total_gj = 0.0
    economic_gj = 0.0
    count_economic = 0

    for m in measures:
        w = m.get("width", 0) or 0
        cce = m.get("cce_primary")
        if cce is None:
            continue
        total_gj += w
        if cce <= cutoff_price:
            economic_gj += w
            count_economic += 1

    share = economic_gj / total_gj if total_gj > 0 else 0.0

    return {
        "total_technical_gj": total_gj,
        "economic_gj": economic_gj,
        "share_economic": share,
        "count_economic": count_economic,
        "count_total": len(measures),
    }
