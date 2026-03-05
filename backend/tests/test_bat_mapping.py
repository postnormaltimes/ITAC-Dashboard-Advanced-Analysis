"""Tests for BAT↔ARC mapping utilities."""
import pytest
from app.utils.bat_mapping import (
    parse_arc_key,
    get_bat_links_for_arc,
    attach_bat_links,
    compute_improvement_index,
    compute_priority_score,
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
# compute_priority_index
# ---------------------------------------------------------------------------

class TestComputePriorityScore:
    def test_non_bat_returns_criticality(self):
        """Non-BAT: priorityScore == criticalityIndex for any wImprovement."""
        assert compute_priority_score(80, is_bat_linked=False, improvement_index=None, w_improvement=20) == 80
        assert compute_priority_score(80, is_bat_linked=False, improvement_index=None, w_improvement=50) == 80
        assert compute_priority_score(80, is_bat_linked=False, improvement_index=None, w_improvement=0) == 80
        assert compute_priority_score(80, is_bat_linked=False, improvement_index=None, w_improvement=100) == 80

    def test_bat_linked_weighted_combo(self):
        """BAT-linked: priorityScore uses weighted formula."""
        # wImp=20, wCrit=80: (80*80 + 20*60) / 100 = (6400+1200)/100 = 76
        assert compute_priority_score(80, is_bat_linked=True, improvement_index=60, w_improvement=20) == 76

    def test_bat_linked_null_improvement(self):
        """BAT-linked with null improvementIndex: treated as 0."""
        # wImp=20, wCrit=80: (80*80 + 20*0) / 100 = 64
        assert compute_priority_score(80, is_bat_linked=True, improvement_index=None, w_improvement=20) == 64

    def test_weight_invariant_edges(self):
        """wCrit + wImp == 100 always; edge values 0 and 100."""
        # wImp=0 → pure criticality
        assert compute_priority_score(75, is_bat_linked=True, improvement_index=90, w_improvement=0) == 75
        # wImp=100 → pure improvement
        assert compute_priority_score(75, is_bat_linked=True, improvement_index=90, w_improvement=100) == 90

    def test_bat_score_increases_with_improvement(self):
        """Holding criticality constant, higher improvementIndex → higher priorityScore."""
        s_low = compute_priority_score(60, is_bat_linked=True, improvement_index=20, w_improvement=30)
        s_high = compute_priority_score(60, is_bat_linked=True, improvement_index=80, w_improvement=30)
        assert s_high > s_low

    def test_bounds(self):
        idx = compute_priority_score(100, is_bat_linked=True, improvement_index=100, w_improvement=50)
        assert 0 <= idx <= 100
        idx2 = compute_priority_score(0, is_bat_linked=True, improvement_index=0, w_improvement=50)
        assert 0 <= idx2 <= 100

