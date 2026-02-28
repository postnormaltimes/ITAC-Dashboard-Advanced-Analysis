"""
Energy constants and conversion factors for primary-energy normalization.
Based on National Academies Chapter 14 CCE framing.
"""

# --- Physical Constants ---
KWH_TO_MJ = 3.6          # 1 kWh = 3.6 MJ
MMBTU_TO_GJ = 1.055056   # 1 MMBtu = 1.055056 GJ
MJ_PER_GJ = 1000.0       # 1 GJ = 1000 MJ
THERM_TO_MJ = 105.5      # 1 Therm ≈ 105.5 MJ (approx, for reference)

# --- Primary Energy Factors (site → source) ---
# US grid average; configurable per project
PEF_ELEC = 2.348   # site kWh → primary kWh (US grid avg)
PEF_GAS = 1.047    # site MMBtu → primary MMBtu (natural gas)

# --- Default Financial Parameters ---
DEFAULT_DISCOUNT_RATE = 0.07
DEFAULT_LIFETIME = 15

# --- Default Energy Prices ---
DEFAULT_ELEC_PRICE_MWH = 70.0    # $/MWh (site)
DEFAULT_GAS_PRICE_MMBTU = 5.0    # $/MMBtu (site)

# --- Firm Size Category Thresholds ---
FIRM_SIZE_CATEGORIES = {
    "micro":  {"max_employees": 10,  "max_turnover": 2_000_000},
    "small":  {"max_employees": 50,  "max_turnover": 10_000_000},
    "medium": {"max_employees": 250, "max_turnover": 50_000_000},
    # large = everything above medium
}

# --- Source Code Classification ---
ELECTRICITY_CODES = frozenset({"EC", "E1", "E13"})
NATURAL_GAS_CODES = frozenset({"E2"})
# Other energy codes (E3-E12) are MMBtu-based fuels
OTHER_ENERGY_MMBTU_CODES = frozenset({f"E{i}" for i in range(3, 13)})
# Demand / fees codes (non-physical energy)
DEMAND_FEE_CODES = frozenset({"ED", "EF"})
# Non-energy resource categories
WASTE_PREFIX = "W"
PRODUCTION_PREFIX = "P"
RESOURCE_PREFIX = "R"


def compute_crf(r: float = DEFAULT_DISCOUNT_RATE, t: int = DEFAULT_LIFETIME) -> float:
    """Capital Recovery Factor: CRF = r(1+r)^t / ((1+r)^t - 1)"""
    if r <= 0 or t <= 0:
        return 1.0 / max(t, 1)
    factor = (1 + r) ** t
    return (r * factor) / (factor - 1)
