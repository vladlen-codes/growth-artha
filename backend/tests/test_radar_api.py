import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import app


class RadarApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("backend.api.radar._jobs", {
        "oldjob": {
            "status": "done",
            "created_at": "2026-03-27T08:00:00",
            "started_at": "2026-03-27T08:01:00",
            "finished_at": "2026-03-27T08:02:00",
            "result": {
                "scanned_at": "2026-03-27T08:02:00",
                "total_scanned": 50,
                "total_signals": 7,
                "using_cached_data": False,
                "using_non_ai_fallback": False,
            },
            "error": None,
        },
        "newjob": {
            "status": "done",
            "created_at": "2026-03-28T09:00:00",
            "started_at": "2026-03-28T09:01:00",
            "finished_at": "2026-03-28T09:02:00",
            "result": {
                "scanned_at": "2026-03-28T09:02:00",
                "total_scanned": 50,
                "total_signals": 11,
                "using_cached_data": True,
                "using_non_ai_fallback": True,
            },
            "error": None,
        },
    })
    def test_jobs_endpoint_returns_recent_first(self):
        res = self.client.get("/api/radar/jobs?limit=5")
        self.assertEqual(res.status_code, 200)
        body = res.json()

        self.assertEqual(body["count"], 2)
        self.assertEqual(body["jobs"][0]["job_id"], "newjob")
        self.assertEqual(body["jobs"][1]["job_id"], "oldjob")

    @patch("backend.api.radar._jobs", {
        "job1": {
            "status": "running",
            "created_at": "2026-03-28T09:00:00",
            "started_at": "2026-03-28T09:01:00",
            "result": None,
            "error": None,
        }
    })
    def test_jobs_endpoint_includes_safe_defaults(self):
        res = self.client.get("/api/radar/jobs?limit=2")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["count"], 1)

        row = body["jobs"][0]
        self.assertEqual(row["job_id"], "job1")
        self.assertEqual(row["status"], "running")
        self.assertEqual(row["total_scanned"], 0)
        self.assertEqual(row["total_signals"], 0)
        self.assertFalse(row["using_cached_data"])
        self.assertFalse(row["using_non_ai_fallback"])


if __name__ == "__main__":
    unittest.main()
