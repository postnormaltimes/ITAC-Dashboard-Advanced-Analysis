import pandas as pd

from app.api import advanced_analytics


def test_load_measure_distribution_df_supports_prefix_demo_fallback(monkeypatch):
    class _EmptyConn:
        def execute(self, *_args, **_kwargs):
            class _Res:
                @staticmethod
                def fetch_df():
                    return pd.DataFrame()

            return _Res()

    demo = pd.DataFrame([
        {"arc": "M-1", "implementation_cost": 1000, "psaved": 10, "ssaved": 5, "tsaved": 0, "qsaved": 0,
         "pconserved": 1000, "sconserved": 100, "tconserved": 0, "qconserved": 0,
         "psourccode": "EC", "ssourccode": "E2", "tsourccode": "", "qsourccode": ""},
        {"arc": "OTHER", "implementation_cost": 500, "psaved": 1, "ssaved": 1, "tsaved": 0, "qsaved": 0,
         "pconserved": 100, "sconserved": 10, "tconserved": 0, "qconserved": 0,
         "psourccode": "EC", "ssourccode": "E2", "tsourccode": "", "qsourccode": ""},
    ])

    monkeypatch.setattr(advanced_analytics, "_get_demo_data", lambda _naics: demo)

    df = advanced_analytics._load_measure_distribution_df("332", "M-1", con=_EmptyConn())

    assert not df.empty
    assert set(df["arc"].unique()) == {"M-1"}


def test_load_measure_distribution_df_supports_all_industries_demo_fallback(monkeypatch):
    class _EmptyConn:
        def execute(self, *_args, **_kwargs):
            class _Res:
                @staticmethod
                def fetch_df():
                    return pd.DataFrame()

            return _Res()

    demo_3323 = pd.DataFrame([
        {"arc": "M-ALL", "implementation_cost": 500, "psaved": 10, "ssaved": 0, "tsaved": 0, "qsaved": 0,
         "pconserved": 1000, "sconserved": 0, "tconserved": 0, "qconserved": 0,
         "psourccode": "EC", "ssourccode": "", "tsourccode": "", "qsourccode": ""},
    ])
    demo_32221 = pd.DataFrame([
        {"arc": "M-ALL", "implementation_cost": 700, "psaved": 10, "ssaved": 0, "tsaved": 0, "qsaved": 0,
         "pconserved": 1200, "sconserved": 0, "tconserved": 0, "qconserved": 0,
         "psourccode": "EC", "ssourccode": "", "tsourccode": "", "qsourccode": ""},
    ])

    def _demo_for(naics: str):
        if naics == "3323":
            return demo_3323
        if naics == "32221":
            return demo_32221
        return pd.DataFrame()

    monkeypatch.setattr(advanced_analytics, "_get_demo_data", _demo_for)

    df = advanced_analytics._load_measure_distribution_df("", "M-ALL", con=_EmptyConn())

    assert len(df) == 2
