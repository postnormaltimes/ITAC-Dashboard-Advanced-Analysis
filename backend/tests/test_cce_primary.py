"""
Unit tests for backend/app/utils/cce_primary.py
"""
import math
import pytest
import sys, os

# Ensure backend/app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.utils.energy_constants import (
    KWH_TO_MJ, MMBTU_TO_GJ, MJ_PER_GJ,
    PEF_ELEC, PEF_GAS,
    compute_crf,
)
from app.utils.cce_primary import (
    site_to_primary_mj,
    observation_primary_energy_gj,
    compute_cce_primary,
    compute_obs_cce_primary,
    compute_primary_price_cutoff,
    classify_firm_size,
    compute_neb_categories,
    compute_obs_metrics,
    compute_economic_potential_summary,
)


# ============================================================
# energy_constants
# ============================================================

class TestComputeCRF:
    def test_standard_values(self):
        crf = compute_crf(0.07, 15)
        assert round(crf, 6) == round((0.07 * 1.07**15) / (1.07**15 - 1), 6)

    def test_zero_rate(self):
        crf = compute_crf(0, 15)
        assert crf == pytest.approx(1.0 / 15)

    def test_zero_lifetime(self):
        crf = compute_crf(0.07, 0)
        assert crf == 1.0


# ============================================================
# site_to_primary_mj
# ============================================================

class TestSiteToPrimaryMJ:
    def test_electricity_ec(self):
        # 1000 kWh * 3.6 MJ/kWh * PEF_ELEC
        result = site_to_primary_mj(1000, "EC")
        expected = 1000 * KWH_TO_MJ * PEF_ELEC
        assert result == pytest.approx(expected)

    def test_electricity_e1(self):
        result = site_to_primary_mj(500, "E1")
        expected = 500 * KWH_TO_MJ * PEF_ELEC
        assert result == pytest.approx(expected)

    def test_natural_gas_e2(self):
        # 100 MMBtu * 1.055056 GJ/MMBtu * 1000 MJ/GJ * PEF_GAS
        result = site_to_primary_mj(100, "E2")
        expected = 100 * MMBTU_TO_GJ * MJ_PER_GJ * PEF_GAS
        assert result == pytest.approx(expected)

    def test_other_fuel_e5(self):
        # E5 = #2 Fuel Oil, MMBtu, treated with gas PEF
        result = site_to_primary_mj(50, "E5")
        expected = 50 * MMBTU_TO_GJ * MJ_PER_GJ * PEF_GAS
        assert result == pytest.approx(expected)

    def test_non_energy_waste(self):
        assert site_to_primary_mj(9999, "W1") == 0.0

    def test_non_energy_production(self):
        assert site_to_primary_mj(9999, "P3") == 0.0

    def test_demand_ed(self):
        assert site_to_primary_mj(100, "ED") == 0.0

    def test_zero_conserved(self):
        assert site_to_primary_mj(0, "EC") == 0.0

    def test_none_conserved(self):
        assert site_to_primary_mj(None, "EC") == 0.0

    def test_nan_conserved(self):
        assert site_to_primary_mj(float("nan"), "EC") == 0.0

    def test_none_code(self):
        assert site_to_primary_mj(100, None) == 0.0


# ============================================================
# observation_primary_energy_gj
# ============================================================

class TestObservationPrimaryEnergyGJ:
    def test_mixed_elec_gas(self):
        row = {
            "pconserved": 1000, "psourccode": "EC",   # 1000 kWh
            "sconserved": 10,   "ssourccode": "E2",   # 10 MMBtu
            "tconserved": 0,    "tsourccode": None,
            "qconserved": 0,    "qsourccode": None,
        }
        result = observation_primary_energy_gj(row)
        elec_mj = 1000 * KWH_TO_MJ * PEF_ELEC
        gas_mj = 10 * MMBTU_TO_GJ * MJ_PER_GJ * PEF_GAS
        expected_gj = (elec_mj + gas_mj) / MJ_PER_GJ
        assert result == pytest.approx(expected_gj)

    def test_pure_elec(self):
        row = {
            "pconserved": 5000, "psourccode": "E1",
            "sconserved": 0,    "ssourccode": None,
            "tconserved": 0,    "tsourccode": None,
            "qconserved": 0,    "qsourccode": None,
        }
        result = observation_primary_energy_gj(row)
        expected_gj = (5000 * KWH_TO_MJ * PEF_ELEC) / MJ_PER_GJ
        assert result == pytest.approx(expected_gj)


# ============================================================
# compute_cce_primary
# ============================================================

class TestComputeCCEPrimary:
    def test_normal(self):
        # $100 annualized / 10 GJ = $10/GJ
        assert compute_cce_primary(100, 10) == pytest.approx(10.0)

    def test_zero_energy(self):
        assert compute_cce_primary(100, 0) is None

    def test_negative_energy(self):
        assert compute_cce_primary(100, -5) is None

    def test_negative_cost(self):
        # Negative CCE is allowed (NEB adjustments)
        assert compute_cce_primary(-50, 10) == pytest.approx(-5.0)


# ============================================================
# classify_firm_size
# ============================================================

class TestClassifyFirmSize:
    def test_micro(self):
        assert classify_firm_size(5, 1_000_000) == "micro"

    def test_micro_boundary_employees(self):
        # 10 employees is NOT micro (< 10 required)
        assert classify_firm_size(10, 1_000_000) != "micro"

    def test_small(self):
        assert classify_firm_size(20, 5_000_000) == "small"

    def test_medium(self):
        assert classify_firm_size(100, 30_000_000) == "medium"

    def test_large(self):
        assert classify_firm_size(500, 100_000_000) == "large"

    def test_large_by_turnover_only(self):
        # 30 employees but $60M turnover → not small (turnover > 10M)
        # 30 < 50 but 60M > 10M → fails small
        # 30 < 250 but 60M > 50M → fails medium
        assert classify_firm_size(30, 60_000_000) == "large"

    def test_zero_values(self):
        assert classify_firm_size(0, 0) == "micro"


# ============================================================
# compute_neb_categories
# ============================================================

class TestComputeNEBCategories:
    def test_waste_stream(self):
        row = {
            "psourccode": "W1", "psaved": 500,
            "ssourccode": None, "ssaved": 0,
            "tsourccode": None, "tsaved": 0,
            "qsourccode": None, "qsaved": 0,
        }
        result = compute_neb_categories(row)
        assert result["waste"] == 500.0
        assert result["production"] == 0.0

    def test_multiple_categories(self):
        row = {
            "psourccode": "W2", "psaved": 100,
            "ssourccode": "P1", "ssaved": 200,
            "tsourccode": "R3", "tsaved": 300,
            "qsourccode": "ED", "qsaved": 50,
        }
        result = compute_neb_categories(row)
        assert result["waste"] == 100.0
        assert result["production"] == 200.0
        assert result["resource"] == 300.0
        assert result["other_energy"] == 50.0

    def test_energy_codes_ignored(self):
        row = {
            "psourccode": "EC", "psaved": 1000,
            "ssourccode": "E2", "ssaved": 500,
            "tsourccode": None, "tsaved": 0,
            "qsourccode": None, "qsaved": 0,
        }
        result = compute_neb_categories(row)
        assert all(v == 0.0 for v in result.values())


# ============================================================
# compute_primary_price_cutoff
# ============================================================

class TestComputePrimaryPriceCutoff:
    def test_equal_weights(self):
        result = compute_primary_price_cutoff(
            p_elec_mwh=70.0,
            p_gas_mmbtu=5.0,
            pef_elec=PEF_ELEC,
            pef_gas=PEF_GAS,
            weight_elec=0.5,
            weight_gas=0.5,
        )
        p_elec_primary = (70.0 / 3.6) / PEF_ELEC
        p_gas_primary = (5.0 / MMBTU_TO_GJ) / PEF_GAS
        expected = 0.5 * p_elec_primary + 0.5 * p_gas_primary
        assert result == pytest.approx(expected)

    def test_all_elec_weight(self):
        result = compute_primary_price_cutoff(70.0, 5.0, weight_elec=1.0, weight_gas=0.0)
        p_elec_primary = (70.0 / 3.6) / PEF_ELEC
        assert result == pytest.approx(p_elec_primary)


# ============================================================
# compute_economic_potential_summary
# ============================================================

class TestEconomicPotentialSummary:
    def test_basic(self):
        measures = [
            {"cce_primary": 5.0, "width": 100},
            {"cce_primary": 15.0, "width": 200},
            {"cce_primary": 25.0, "width": 50},
        ]
        result = compute_economic_potential_summary(measures, cutoff_price=20.0)
        assert result["total_technical_gj"] == 350
        assert result["economic_gj"] == 300  # first two
        assert result["count_economic"] == 2
        assert result["count_total"] == 3
        assert result["share_economic"] == pytest.approx(300 / 350)

    def test_empty(self):
        result = compute_economic_potential_summary([], cutoff_price=10.0)
        assert result["total_technical_gj"] == 0
        assert result["economic_gj"] == 0
        assert result["count_economic"] == 0


# ============================================================
# Integration: mixed elec + gas → combined curve
# ============================================================

class TestIntegrationMixedCurve:
    """Verify that mixed electric+gas measures produce correct combined primary savings."""

    def test_combined_width(self):
        crf = compute_crf()
        # Elec measure: 10000 kWh, $5000 imp cost
        row_elec = {
            "pconserved": 10000, "psourccode": "EC",
            "sconserved": 0, "ssourccode": None,
            "tconserved": 0, "tsourccode": None,
            "qconserved": 0, "qsourccode": None,
            "implementation_cost": 5000,
            "psaved": 1000, "ssaved": 0, "tsaved": 0, "qsaved": 0,
        }
        # Gas measure: 100 MMBtu, $3000 imp cost
        row_gas = {
            "pconserved": 100, "psourccode": "E2",
            "sconserved": 0, "ssourccode": None,
            "tconserved": 0, "tsourccode": None,
            "qconserved": 0, "qsourccode": None,
            "implementation_cost": 3000,
            "psaved": 800, "ssaved": 0, "tsaved": 0, "qsaved": 0,
        }

        gj_elec = observation_primary_energy_gj(row_elec)
        gj_gas = observation_primary_energy_gj(row_gas)

        assert gj_elec > 0
        assert gj_gas > 0

        cce_elec = compute_cce_primary(5000 * crf, gj_elec)
        cce_gas = compute_cce_primary(3000 * crf, gj_gas)

        assert cce_elec is not None
        assert cce_gas is not None

        # Both should produce valid $/GJ_primary
        assert cce_elec > 0
        assert cce_gas > 0

        # Total width should be sum of both
        total_width = gj_elec + gj_gas
        assert total_width > 0
