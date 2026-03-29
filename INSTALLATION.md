# Growth Artha Installation Guide

This guide explains how to install and run Growth Artha locally on macOS and Windows.

## 1. Prerequisites

Install the following before setup:
- Python 3.10 or newer
- Node.js 20 or newer (includes npm)
- Git

Optional but recommended:
- ffmpeg (required for MP4 video rendering in `/api/video/jobs`; without ffmpeg, jobs still render JSON artifacts)

## 2. Clone the repository

```bash
git clone <your-repo-url>
cd growth-artha
```

## 3. Configure environment variables

Create or update `.env` in the repository root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Notes:
- If `GEMINI_API_KEY` is not set or invalid, the backend still runs and falls back to non-AI behavior for supported flows.
- Keep `.env` out of version control.

## 4. Backend setup (Python)

Important: in this repository, the requirements file currently has a leading space in its name:
- ` requirements.txt`

Always quote the filename during installation.

### macOS

```bash
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r " requirements.txt"
```

Start backend:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8002 --reload
```

Backend URL:
- http://localhost:8002

Health check:
- http://localhost:8002/health

### Windows (PowerShell)

```powershell
py -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r " requirements.txt"
```

If PowerShell blocks activation, run once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Start backend:

```powershell
uvicorn backend.main:app --host 0.0.0.0 --port 8002 --reload
```

Backend URL:
- http://localhost:8002

Health check:
- http://localhost:8002/health

## 5. Frontend setup (React + Vite)

Open a second terminal and run:

```bash
cd frontend
npm install
```

Create `frontend/.env` (optional if using default backend URL):

```env
VITE_API_BASE_URL=http://localhost:8002/api
```

Start frontend:

```bash
npm run dev
```

Frontend URL (default):
- http://localhost:5173

## 6. Run both services together

You need two active terminals:
- Terminal 1: backend on port 8002
- Terminal 2: frontend on port 5173

Default integration works out of the box because frontend falls back to:
- `http://localhost:8002/api`

## 7. Quick verification steps

1. Open backend health URL:
   - `http://localhost:8002/health`
2. Open frontend URL:
   - `http://localhost:5173`
3. Trigger a radar scan from UI or API.
4. Confirm `data/cache/latest_radar_result.json` updates.
5. Optionally create a video job and verify artifact output in `data/cache/videos/`.

## 8. Common issues and fixes

### 1) Dependency install fails because requirements file is not found

Use quoted file path with leading space:

```bash
pip install -r " requirements.txt"
```

### 2) Backend starts but AI responses are unavailable

Check:
- `.env` exists at repository root
- `GEMINI_API_KEY` is valid

Even without valid AI credentials, deterministic fallback paths should still work for many endpoints.

### 3) Video job returns JSON artifact instead of MP4

Install `ffmpeg` and retry the job.

macOS (Homebrew):

```bash
brew install ffmpeg
```

Windows:
- Install ffmpeg and add it to your system PATH.
- Restart terminal and verify with `ffmpeg -version`.

### 4) Port conflict on 8002 or 5173

Stop existing processes and restart services.

### 5) Frontend cannot reach backend

Confirm `VITE_API_BASE_URL` in `frontend/.env` points to:
- `http://localhost:8002/api`

Then restart `npm run dev`.

## 9. Optional test run

From repository root:

macOS/Linux:

```bash
source venv/bin/activate
python -m unittest discover -s backend/tests -v
```

Windows (PowerShell):

```powershell
.\venv\Scripts\Activate.ps1
python -m unittest discover -s backend/tests -v
```

## 10. Production notes

This setup is development-first.
For production hardening, consider:
- Managed secrets storage
- Persistent database for portfolio/jobs beyond JSON cache files
- Reverse proxy and HTTPS
- Observability (structured logs, metrics, tracing)
- CI pipeline for tests and linting
