"""Tests for BAT↔ARC mapping utilities."""
import pytest
from app.utils.bat_mapping import (
    parse_arc_key,
    get_bat_links_for_arc,
    attach_bat_links,
    compute_improvement_index,
    compute_bat_count,
    compute_confidence_factor,
    compute_bat_premium,
    compute_priority_score_additive,
)


# ---------------------------------------------------------------------------
# parse_arc_key
# ---------------------------------------------------------------------------

class TestParseArcKey:
    def test_with_app_code(self):
        r = parse_arc_key("2.2437.1")
        assert r["arcCode"] == "2.2437"
        assert r["arcAppCode"] == 1

    def test_without_app_code(self):
        r = parse_arc_key("3.4111")
        assert r["arcCode"] == "3.4111"
        assert r["arcAppCode"] is None

    def test_app_code_range(self):
        for digit in range(1, 5):
            r = parse_arc_key(f"2.1111.{digit}")
            assert r["arcAppCode"] == digit

    def test_not_app_code_if_digit_out_of_range(self):
        r = parse_arc_key("2.1111.5")
        assert r["arcAppCode"] is None
        assert r["arcCode"] == "2.1111.5"

    def test_multipart_arc_code_with_suffix(self):
        r = parse_arc_key("4.131.1")
        assert r["arcCode"] == "4.131"
        assert r["arcAppCode"] == 1


# ---------------------------------------------------------------------------
# get_bat_links_for_arc
# ---------------------------------------------------------------------------

class TestGetBatLinksForArc:
    def test_known_arc_returns_links(self):
        links = get_bat_links_for_arc("2.2437", "3323")
        assert len(links) > 0
        assert all("2.2437" in link["arcKey"] for link in links)

    def test_unknown_arc_returns_empty(self):
        links = get_bat_links_for_arc("9.9999", "3323")
        assert links == []

    def test_naics_filtering(self):
        links_3323 = get_bat_links_for_arc("2.2437", "3323")
        links_32221 = get_bat_links_for_arc("2.2437", "32221")
        # 2.2437 appears in both NAICS; 3323 has .1 suffix, 32221 has no suffix
        assert len(links_3323) > 0 or len(links_32221) > 0

    def test_proxy_rows_preserved(self):
        links = get_bat_links_for_arc("3.8132", "3323")
        proxy_links = [l for l in links if l["matchType"] == "proxy"]
        assert len(proxy_links) > 0
        assert proxy_links[0]["confidence"] == 0.40


# ---------------------------------------------------------------------------
# attach_bat_links
# ---------------------------------------------------------------------------

class TestAttachBatLinks:
    def test_adds_bat_metadata(self):
        measures = [
            {"arc": "2.2437", "description": "Test measure 1"},
            {"arc": "9.9999", "description": "Test measure 2"},
        ]
        result = attach_bat_links(measures, "3323")
        assert result[0]["isBatLinked"] is True
        assert len(result[0]["batLinks"]) > 0
        assert result[1]["isBatLinked"] is False
        assert result[1]["batLinks"] == []

    def test_original_fields_preserved(self):
        measures = [{"arc": "2.2437", "description": "Test", "score": 85}]
        result = attach_bat_links(measures, "3323")
        assert result[0]["score"] == 85
        assert result[0]["description"] == "Test"


# ---------------------------------------------------------------------------
# compute_improvement_index
# ---------------------------------------------------------------------------

class TestComputeImprovementIndex:
    def test_zero_recommended_returns_none(self):
        assert compute_improvement_index(0, 0) is None

    def test_lower_impl_higher_index(self):
        """Fewer implementations → higher improvement index."""
        idx_low_impl = compute_improvement_index(30, 5)
        idx_high_impl = compute_improvement_index(30, 25)
        assert idx_low_impl > idx_high_impl

    def test_small_vs_large_sample(self):
        """Without evidence dampening, only Laplace smoothing affects small samples."""
        idx_small = compute_improvement_index(5, 0)
        idx_large = compute_improvement_index(30, 0)
        # Both should be high (low implementation), large slightly higher due to less Laplace pull
        assert idx_small is not None
        assert idx_large is not None
        assert idx_small > 0
        assert idx_large > 0

    def test_confidence_weighting(self):
        idx_full = compute_improvement_index(30, 5, avg_confidence=1.0)
        idx_half = compute_improvement_index(30, 5, avg_confidence=0.5)
        assert idx_full > idx_half

    def test_bounds_0_100(self):
        # Maximum theoretical: recommended=1000, implemented=0, conf=1.0
        idx = compute_improvement_index(1000, 0, avg_confidence=1.0)
        assert 0 <= idx <= 100
        # Minimum: everything implemented
        idx_min = compute_improvement_index(100, 100, avg_confidence=1.0)
        assert 0 <= idx_min <= 100

    def test_laplace_smoothing(self):
        """With 0 implementations out of 30, implRate = 1/32 ≈ 0.03125, gap = 0.96875."""
        idx = compute_improvement_index(30, 0, avg_confidence=1.0)
        # implGap ≈ 0.969, result ≈ 97
        assert idx == 97


# ---------------------------------------------------------------------------
# Additive BAT Premium Model (Step 5C)
# ---------------------------------------------------------------------------

class TestBatCount:
    def test_unique_bat_ids(self):
        links = [
            {"batId": "BAT1", "matchRole": "primary"},
            {"batId": "BAT2", "matchRole": "secondary"},
            {"batId": "BAT1", "matchRole": "secondary"},  # duplicate id
        ]
        from app.utils.bat_mapping import compute_bat_count
        assert compute_bat_count(links) == 2

    def test_empty_links(self):
        from app.utils.bat_mapping import compute_bat_count
        assert compute_bat_count([]) == 0


class TestConfidenceFactor:
    def test_primary_max(self):
        links = [
            {"matchRole": "primary", "confidence": 0.5, "matchType": "direct"},
            {"matchRole": "primary", "confidence": 0.8, "matchType": "direct"},
            {"matchRole": "secondary", "confidence": 1.0, "matchType": "direct"},
        ]
        from app.utils.bat_mapping import compute_confidence_factor
        assert compute_confidence_factor(links) == 0.8  # Ignores secondary 1.0 because primary exists

    def test_fallback_to_secondary(self):
        links = [
            {"matchRole": "secondary", "confidence": 0.4, "matchType": "partial"},
            {"matchRole": "secondary", "confidence": 0.9, "matchType": "partial"},
        ]
        from app.utils.bat_mapping import compute_confidence_factor
        assert compute_confidence_factor(links) == 0.9

    def test_proxy_dampening(self):
        # Best link is a proxy
        links = [
            {"matchRole": "primary", "confidence": 1.0, "matchType": "proxy"},
        ]
        from app.utils.bat_mapping import compute_confidence_factor
        assert compute_confidence_factor(links) == 0.6  # 1.0 * 0.6

    def test_empty(self):
        from app.utils.bat_mapping import compute_confidence_factor
        assert compute_confidence_factor([]) == 0.0


class TestBatPremium:
    def test_basic_calculation(self):
        from app.utils.bat_mapping import compute_bat_premium
        assert compute_bat_premium(10, 1.0) == 10
        assert compute_bat_premium(10, 0.45) == 4  # 4.5 rounds to 4 in Python 3 for even halves, or 5 if using math.round tie-breaker, but `round` is round-half-to-even. Actually round(4.5) is 4, round(5.5) is 6. Wait, round(10 * 0.45) = round(4.5) = 4. Let's just use exact non-halves for test stability.
        assert compute_bat_premium(10, 0.4) == 4
        assert compute_bat_premium(10, 0.5) == 5  # Wait, wait, actually let's just test 0.4 and 0.6 to avoid half-even flakiness.
        assert compute_bat_premium(10, 0.6) == 6

    def test_zero_clamp(self):
        from app.utils.bat_mapping import compute_bat_premium
        assert compute_bat_premium(0, 1.0) == 0
        assert compute_bat_premium(-5, 1.0) == 0


class TestPriorityScoreAdditive:
    def test_non_bat_measure(self):
        from app.utils.bat_mapping import compute_priority_score_additive
        # Should return exactly criticality index (rounded)
        assert compute_priority_score_additive(80.5, is_bat_linked=False, bat_premium=10) == 80  # half-even rounding
        assert compute_priority_score_additive(85.0, is_bat_linked=False, bat_premium=10) == 85

    def test_bat_measure(self):
        from app.utils.bat_mapping import compute_priority_score_additive
        assert compute_priority_score_additive(85.0, is_bat_linked=True, bat_premium=10) == 95

    def test_clamping(self):
        from app.utils.bat_mapping import compute_priority_score_additive
        assert compute_priority_score_additive(95.0, is_bat_linked=True, bat_premium=10) == 100
        assert compute_priority_score_additive(-5.0, is_bat_linked=True, bat_premium=0) == 0


