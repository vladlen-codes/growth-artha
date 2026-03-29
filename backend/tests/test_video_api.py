import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import app


class VideoApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("backend.api.video._jobs", {
        "job1": {
            "status": "done",
            "result": {
                "scanned_at": "2026-03-28T10:00:00",
                "total_scanned": 50,
                "total_signals": 12,
                "act": [{"symbol": "RELIANCE", "score": 0.84}],
                "watch": [{"symbol": "TCS", "score": 0.55}],
                "exit_radar": [{"symbol": "WIPRO", "score": -0.45}],
            },
        }
    })
    def test_storyboard_daily_wrap_shape(self):
        res = self.client.post(
            "/api/video/storyboard",
            json={"template": "daily_wrap", "duration_seconds": 45, "portfolio": ["RELIANCE"]},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()

        self.assertEqual(body["duration_seconds"], 45)
        self.assertEqual(body["storyboard"]["template"], "daily_wrap")
        self.assertGreaterEqual(len(body["storyboard"]["scenes"]), 3)
        self.assertEqual(body["render_manifest"]["status"], "planned")

    @patch("backend.api.video._jobs", {})
    @patch("backend.api.video._load_latest_result", return_value={
        "scanned_at": "2026-03-28T11:00:00",
        "total_scanned": 40,
        "total_signals": 9,
        "act": [{"symbol": "INFY", "score": 0.72}],
        "watch": [],
        "exit_radar": [],
    })
    def test_storyboard_movers_uses_cached_scan(self, *_mocks):
        res = self.client.post(
            "/api/video/storyboard",
            json={"template": "movers", "duration_seconds": 35},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()

        self.assertEqual(body["storyboard"]["template"], "movers")
        self.assertEqual(body["duration_seconds"], 35)
        self.assertGreaterEqual(len(body["storyboard"]["scenes"]), 3)

    @patch("backend.api.video._save_video_jobs", lambda *_args, **_kwargs: None)
    @patch("backend.api.video._run_video_job", lambda job_id: None)
    @patch("backend.api.video._video_jobs", {})
    def test_video_job_create_and_status(self):
        create_res = self.client.post(
            "/api/video/jobs",
            json={"template": "daily_wrap", "duration_seconds": 40, "portfolio": ["INFY"], "title": "Test Render", "render_mode": "json"},
        )
        self.assertEqual(create_res.status_code, 200)
        body = create_res.json()
        self.assertIn("job_id", body)
        self.assertEqual(body["status"], "queued")
        self.assertEqual(body.get("render_mode"), "json")

        job_id = body["job_id"]
        status_res = self.client.get(f"/api/video/jobs/{job_id}")
        self.assertEqual(status_res.status_code, 200)
        status_body = status_res.json()
        self.assertEqual(status_body["job_id"], job_id)
        self.assertEqual(status_body["status"], "queued")

        list_res = self.client.get("/api/video/jobs?limit=5")
        self.assertEqual(list_res.status_code, 200)
        jobs = list_res.json().get("jobs", [])
        self.assertTrue(any(j.get("job_id") == job_id for j in jobs))

    @patch("backend.api.video._save_video_jobs", lambda *_args, **_kwargs: None)
    @patch("backend.api.video._run_video_job", lambda job_id: None)
    @patch("backend.api.video._video_jobs", {})
    def test_video_job_invalid_render_mode_defaults_to_auto(self):
        create_res = self.client.post(
            "/api/video/jobs",
            json={"template": "movers", "duration_seconds": 45, "render_mode": "invalid_mode"},
        )
        self.assertEqual(create_res.status_code, 200)
        body = create_res.json()
        self.assertEqual(body.get("render_mode"), "auto")

    @patch("backend.api.video._save_video_jobs", lambda *_args, **_kwargs: None)
    @patch("backend.api.video._run_video_job", lambda job_id: None)
    @patch("backend.api.video._video_jobs", {
        "video_retry_1": {
            "job_id": "video_retry_1",
            "status": "error",
            "attempt_count": 1,
            "max_attempts": 3,
            "request": {"template": "daily_wrap", "duration_seconds": 45, "portfolio": [], "render_mode": "json"},
        }
    })
    def test_video_job_retry_endpoint(self):
        res = self.client.post("/api/video/jobs/video_retry_1/retry")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["status"], "queued")

        status_res = self.client.get("/api/video/jobs/video_retry_1")
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json().get("status"), "queued")

    @patch("backend.api.video._save_video_jobs", lambda *_args, **_kwargs: None)
    @patch("backend.api.video._video_jobs", {
        "video_cancel_1": {
            "job_id": "video_cancel_1",
            "status": "queued",
            "attempt_count": 0,
            "max_attempts": 2,
            "request": {"template": "daily_wrap", "duration_seconds": 45, "portfolio": [], "render_mode": "auto"},
        }
    })
    def test_video_job_cancel_endpoint(self):
        res = self.client.post("/api/video/jobs/video_cancel_1/cancel")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get("status"), "cancelled")


if __name__ == "__main__":
    unittest.main()
