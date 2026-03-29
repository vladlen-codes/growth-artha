import unittest
from unittest.mock import patch

import pandas as pd

from backend.patterns.backtester import backtest_pattern


class BacktesterTests(unittest.TestCase):
    @patch("backend.patterns.backtester.detect_patterns")
    @patch("backend.patterns.backtester.fetch_ohlc")
    def test_backtest_returns_explainability_fields(self, mock_fetch_ohlc, mock_detect_patterns):
        dates = pd.date_range("2025-01-01", periods=120, freq="D")
        close = [100 + i * 0.5 for i in range(120)]
        df = pd.DataFrame(
            {
                "Open": close,
                "High": [c + 1 for c in close],
                "Low": [c - 1 for c in close],
                "Close": close,
                "Volume": [100000] * 120,
            },
            index=dates,
        )
        mock_fetch_ohlc.return_value = df

        mock_detect_patterns.return_value = [{"pattern": "Double Bottom"}]

        result = backtest_pattern("TEST", "Double Bottom", forward_days=10)

        self.assertEqual(result["expected_horizon_days"], 10)
        self.assertIn("median_move_pct", result)
        self.assertIn("p25_move_pct", result)
        self.assertIn("p75_move_pct", result)
        self.assertIn("similar_instances", result)
        self.assertLessEqual(len(result["similar_instances"]), 3)

    def test_empty_backtest_has_new_fields(self):
        with patch("backend.patterns.backtester.fetch_ohlc", return_value=pd.DataFrame()):
            result = backtest_pattern("TEST", "Double Bottom")

        self.assertEqual(result["expected_horizon_days"], 20)
        self.assertEqual(result["similar_instances"], [])
        self.assertIsNone(result["median_move_pct"])


if __name__ == "__main__":
    unittest.main()
