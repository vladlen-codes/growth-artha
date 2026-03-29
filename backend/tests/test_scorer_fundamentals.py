import unittest

import pandas as pd

from backend.signals.scorer import EVENT_WEIGHTS, _score_events


class ScorerFundamentalsTests(unittest.TestCase):
    def _price_df(self, days: int = 70) -> pd.DataFrame:
        close = pd.Series([100 + i * 1.5 for i in range(days)])
        volume = pd.Series([1_000_000 for _ in range(days)])
        return pd.DataFrame({"Close": close, "Volume": volume})

    def test_fundamental_confidence_scales_weight_with_bounds(self):
        df = self._price_df()
        bulk = pd.DataFrame(columns=["symbol", "dealType", "clientName", "quantity"])

        events = _score_events(
            "RELIANCE",
            df,
            bulk,
            fundamental_signals=[
                {
                    "name": "margin_expansion_3q",
                    "evidence": "3-quarter margin expansion",
                    "source": "Quarterly Results",
                    "confidence": 5.0,
                }
            ],
        )

        found = [e for e in events if e.get("name") == "margin_expansion_3q"]
        self.assertEqual(len(found), 1)
        event = found[0]
        self.assertEqual(event["source"], "Quarterly Results")
        self.assertEqual(event["confidence"], 1.2)
        self.assertEqual(event["weight"], round(EVENT_WEIGHTS["margin_expansion_3q"] * 1.2, 3))

    def test_real_earnings_signal_skips_proxy_generation(self):
        df = self._price_df()
        bulk = pd.DataFrame(columns=["symbol", "dealType", "clientName", "quantity"])

        events = _score_events(
            "INFY",
            df,
            bulk,
            fundamental_signals=[
                {
                    "name": "earnings_surprise_15",
                    "evidence": "Quarterly momentum evidence",
                    "source": "Quarterly Results",
                    "confidence": 0.9,
                }
            ],
        )

        earnings_events = [e for e in events if e.get("name") == "earnings_surprise_15"]
        self.assertEqual(len(earnings_events), 1)
        self.assertEqual(earnings_events[0]["source"], "Quarterly Results")
        self.assertEqual(earnings_events[0]["weight"], round(EVENT_WEIGHTS["earnings_surprise_15"] * 0.9, 3))


if __name__ == "__main__":
    unittest.main()
