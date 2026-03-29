import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import app


class ChatApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("backend.api.chat.answer_chat_question", return_value="AI assistant encountered an error. Please try again.")
    @patch("backend.api.radar._load_latest_result", return_value={})
    @patch("backend.api.radar._jobs", {
        "job1": {
            "status": "done",
            "result": {
                "act": [
                    {"symbol": "RELIANCE", "score": 0.82},
                    {"symbol": "INFY", "score": 0.74},
                ],
                "watch": [],
                "exit_radar": [],
            },
            "error": None,
        }
    })
    def test_fallback_with_citations_returns_actionable_answer(self, *_mocks):
        res = self.client.post(
            "/api/chat/ask",
            json={
                "question": "What should I focus on?",
                "portfolio": ["RELIANCE", "INFY"],
            },
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["analysis_mode"], "fallback")
        self.assertIn("Top focus stocks from the latest radar", body["answer"])
        self.assertGreaterEqual(len(body.get("citations", [])), 2)
        self.assertEqual(body.get("evidence_quality"), "medium")
        self.assertIn("retrieval_plan", body)
        self.assertIn("steps", body["retrieval_plan"])

        first = body.get("citations", [{}])[0]
        self.assertIn("source_type", first)
        self.assertIn("timestamp", first)

    @patch("backend.api.chat.answer_chat_question", return_value="AI assistant encountered an error. Please try again.")
    @patch("backend.api.radar._jobs", {})
    @patch("backend.api.radar._load_latest_result", return_value={
        "act": [
            {"symbol": "TCS", "score": 0.79},
            {"symbol": "HDFCBANK", "score": 0.68},
        ],
        "watch": [],
        "exit_radar": [],
    })
    def test_uses_cached_latest_scan_when_jobs_empty(self, *_mocks):
        res = self.client.post(
            "/api/chat/ask",
            json={
                "question": "Top focus stocks?",
                "portfolio": ["TCS", "HDFCBANK"],
            },
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["analysis_mode"], "fallback")
        self.assertIn("Top focus stocks from the latest radar", body["answer"])
        self.assertGreaterEqual(len(body.get("citations", [])), 2)

    @patch("backend.api.chat.answer_chat_question", return_value="AI assistant encountered an error. Please try again.")
    @patch("backend.api.radar._jobs", {})
    @patch("backend.api.radar._load_latest_result", return_value=None)
    def test_empty_context_returns_no_signal_message(self, *_mocks):
        res = self.client.post(
            "/api/chat/ask",
            json={
                "question": "Top focus stocks?",
                "portfolio": ["RELIANCE"],
            },
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body.get("citations"), [])
        self.assertEqual(body.get("evidence_quality"), "none")
        self.assertEqual(
            body["answer"],
            "No strong radar-linked focus stocks are available yet. Run a fresh scan and ask again.",
        )

    @patch("backend.api.chat.answer_chat_question", return_value="BUY ABCD now. RELIANCE remains strong.")
    @patch("backend.api.radar._jobs", {
        "job1": {
            "status": "done",
            "result": {
                "act": [
                    {"symbol": "RELIANCE", "score": 0.81},
                    {"symbol": "INFY", "score": 0.66},
                ],
                "watch": [],
                "exit_radar": [],
            },
        }
    })
    def test_blocks_unsupported_symbol_claims(self, *_mocks):
        res = self.client.post(
            "/api/chat/ask",
            json={
                "question": "What should I buy?",
                "portfolio": ["RELIANCE", "INFY"],
            },
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["analysis_mode"], "fallback")
        self.assertIn("unsupported symbol claims", body["answer"])
        self.assertIn("ABCD", body["answer"])


if __name__ == "__main__":
    unittest.main()
