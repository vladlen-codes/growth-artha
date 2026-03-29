import unittest

import pandas as pd

from backend.data.fundamentals import (
    _extract_filing_signals,
    _extract_insider_signals,
    _extract_management_commentary_shift,
    _extract_quarterly_signals,
    _extract_regulatory_signals,
)


class _TickerStub:
    def __init__(self, quarterly_df: pd.DataFrame | None = None, insider_df: pd.DataFrame | None = None):
        self.quarterly_income_stmt = quarterly_df if quarterly_df is not None else pd.DataFrame()
        self.quarterly_financials = pd.DataFrame()
        self.insider_transactions = insider_df if insider_df is not None else pd.DataFrame()


class FundamentalsSignalsTests(unittest.TestCase):
    def test_filing_taxonomy_detects_multiple_event_classes(self):
        news_items = [
            {"title": "Company cuts guidance after weak demand", "publisher": "Exchange Filing"},
            {"title": "Major order win from global customer", "publisher": "Business Wire"},
            {"title": "Board approves share buyback plan", "publisher": "Company Release"},
        ]

        events = _extract_filing_signals(news_items)
        names = {e["name"] for e in events}

        self.assertIn("guidance_cut", names)
        self.assertIn("contract_win", names)
        self.assertIn("buyback_announcement", names)
        for e in events:
            self.assertEqual(e.get("source_type"), "filing_news")
            self.assertIsNotNone(e.get("taxonomy"))

    def test_quarterly_signals_include_yoy_and_acceleration(self):
        cols = pd.to_datetime([
            "2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31", "2024-12-31"
        ])
        q = pd.DataFrame(
            {
                cols[0]: [1320.0, 220.0, 180.0],
                cols[1]: [1100.0, 160.0, 140.0],
                cols[2]: [1040.0, 150.0, 132.0],
                cols[3]: [1020.0, 148.0, 128.0],
                cols[4]: [980.0, 130.0, 120.0],
            },
            index=["Total Revenue", "Net Income", "Operating Income"],
        )
        ticker = _TickerStub(quarterly_df=q)

        events = _extract_quarterly_signals(ticker)
        names = {e["name"] for e in events}

        self.assertIn("earnings_surprise_15", names)
        self.assertIn("earnings_acceleration", names)
        self.assertIn("margin_expansion_3q", names)
        self.assertTrue(any(e.get("taxonomy") == "earnings_yoy" for e in events))

    def test_insider_materiality_maps_to_weighted_event_names(self):
        insider = pd.DataFrame(
            [
                {
                    "Insider": "Promoter A",
                    "Text": "Purchase in open market",
                    "Shares": 1_500_000,
                    "Value": 90_000_000,
                },
                {
                    "Insider": "Director B",
                    "Text": "Sale of shares",
                    "Shares": -120_000,
                    "Value": -5_000_000,
                },
            ]
        )
        ticker = _TickerStub(insider_df=insider)

        events = _extract_insider_signals(ticker)
        names = {e["name"] for e in events}

        self.assertIn("insider_buy_heavy", names)
        self.assertIn("insider_sell", names)
        self.assertTrue(all(e.get("source_type") == "insider_trades" for e in events))

    def test_management_tone_shift_detection(self):
        news = [
            {"title": "Management confident as strong demand and improving margin continue"},
            {"title": "Management remains cautious citing weak outlook and margin pressure"},
        ]
        events = _extract_management_commentary_shift(news)
        names = {e["name"] for e in events}
        self.assertIn("mgmt_tone_improving", names)
        self.assertIn("mgmt_tone_deteriorating", names)

    def test_regulatory_signal_severity_mapping(self):
        news = [
            {"title": "Regulatory penalty and show cause notice issued", "providerPublishTime": datetime_now_unix()},
            {"title": "Company receives regulatory approval and policy support", "providerPublishTime": datetime_now_unix()},
        ]
        events = _extract_regulatory_signals(news)
        names = {e["name"] for e in events}
        self.assertTrue("regulatory_probe" in names or "regulatory_risk_high" in names)
        self.assertIn("regulatory_relief", names)


def datetime_now_unix() -> float:
    import time
    return time.time()


if __name__ == "__main__":
    unittest.main()
