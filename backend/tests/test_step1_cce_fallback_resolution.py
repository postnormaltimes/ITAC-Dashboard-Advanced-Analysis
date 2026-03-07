import json
import pandas as pd

from app.api import advanced_analytics
from app.models.schemas import AdvancedStep1Request


def _base_row(arc: str, pconserved: float, implementation_cost: float = 1000.0):
    return {
        'arc': arc,
        'impstatus': 'Implemented',
        'implementation_cost': implementation_cost,
        'psaved': 100.0,
        'ssaved': 0.0,
        'tsaved': 0.0,
        'qsaved': 0.0,
        'pconserved': pconserved,
        'sconserved': 0.0,
        'tconserved': 0.0,
        'qconserved': 0.0,
        'psourccode': 'EC',
        'ssourccode': '',
        'tsourccode': '',
        'qsourccode': '',
    }


def test_step1_resolves_cce_from_prefix_when_exact_is_invalid(monkeypatch):
    exact_df = pd.DataFrame([_base_row('M1', pconserved=0.0)])

    def fake_load_naics_df(_naics, con=None):
        return exact_df

    def fake_load_measure_distribution_df(naics_code, arc_code, con=None):
        if arc_code != 'M1':
            return pd.DataFrame()
        if naics_code == '33231':
            return pd.DataFrame([_base_row('M1', pconserved=0.0)])
        if naics_code == '3323':
            return pd.DataFrame([_base_row('M1', pconserved=1000.0 + i * 10, implementation_cost=1200 + i * 50) for i in range(6)])
        return pd.DataFrame()

    class _FakeCon:
        def close(self):
            pass

    monkeypatch.setattr(advanced_analytics, '_load_naics_df', fake_load_naics_df)
    monkeypatch.setattr(advanced_analytics, '_load_measure_distribution_df', fake_load_measure_distribution_df)
    monkeypatch.setattr(advanced_analytics, 'get_db_connection', lambda: _FakeCon())

    resp = advanced_analytics.evaluate_step1(AdvancedStep1Request(naics_code='33231'))
    measure = resp.measures[0]

    assert measure.arc == 'M1'
    assert measure.cce_primary is not None
    assert measure.cce_scope_used == 'prefix'
    assert measure.cce_naics_prefix_used == '3323'
    assert measure.cce_valid_count == 6


def test_step1_serializes_null_cce_when_no_valid_data_anywhere(monkeypatch):
    exact_df = pd.DataFrame([_base_row('M1', pconserved=0.0)])

    def fake_load_naics_df(_naics, con=None):
        return exact_df

    def fake_load_measure_distribution_df(_naics_code, _arc_code, con=None):
        return pd.DataFrame([_base_row('M1', pconserved=0.0)])

    class _FakeCon:
        def close(self):
            pass

    monkeypatch.setattr(advanced_analytics, '_load_naics_df', fake_load_naics_df)
    monkeypatch.setattr(advanced_analytics, '_load_measure_distribution_df', fake_load_measure_distribution_df)
    monkeypatch.setattr(advanced_analytics, 'get_db_connection', lambda: _FakeCon())

    resp = advanced_analytics.evaluate_step1(AdvancedStep1Request(naics_code='33231'))
    payload = json.loads(resp.model_dump_json())
    measure = payload['measures'][0]

    assert measure['cce_primary'] is None
    assert measure['cce_scope_used'] == 'none'
    assert measure['cce_valid_count'] == 0


def test_prefix_generator_truncates_to_three_digits():
    assert advanced_analytics._candidate_naics_prefixes('32221', min_digits=3) == ['32221', '3222', '322']
    assert advanced_analytics._candidate_naics_prefixes('32-221', min_digits=3) == ['32221', '3222', '322']


def test_step1_uses_demo_fallback_when_db_connection_unavailable(monkeypatch):
    def raise_connect():
        raise RuntimeError('db offline')

    monkeypatch.setattr(advanced_analytics, 'get_db_connection', raise_connect)

    resp = advanced_analytics.evaluate_step1(AdvancedStep1Request(naics_code='32221'))
    assert len(resp.measures) > 0
