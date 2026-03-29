# Growth Artha

Growth Artha is an AI-assisted market intelligence platform for Indian equities.
It combines radar-style opportunity detection, chart pattern intelligence, portfolio-aware chat, and an early-stage AI video pipeline.

The stack is split into:
- Backend: FastAPI + data/signal pipelines + AI orchestration
- Frontend: React + TypeScript + Vite

## What this project does

Growth Artha focuses on helping users identify high-conviction setups quickly, without replacing investor judgment.

Core capabilities already implemented:
- Opportunity radar scan with Act, Watch, and Exit buckets
- Signal scoring from technical, fundamental, sentiment, and bulk-deal context
- Pattern detection with per-symbol backtest data surface
- Portfolio-aware chat response schema with citations and guardrails
- Audit trail for tool calls and scan reasoning
- Video storyboard/render job pipeline (JSON/MP4 depending on ffmpeg availability)

Roadmap capabilities (in progress across phase documents):
- Broader filings and quarterly event ingestion
- Insider/regulatory signal expansion
- Commentary shift analysis
- Fuller video studio UX and pipeline automation

## Architecture overview

### Backend

Entry point:
- `backend/main.py`

Domain routers:
- `backend/api/radar.py`: run scans, poll jobs, latest results, audit trail
- `backend/api/stocks.py`: market overview, OHLC, stock info, backtest, explanation, sentiment, live price
- `backend/api/portfolio.py`: save/get portfolio by session
- `backend/api/chat.py`: ask market questions with retrieval plan, citations, portfolio impact, schema validation
- `backend/api/video.py`: storyboard generation and async render jobs (create/status/retry/cancel/download)

Pipeline modules:
- `backend/data/`: NSE/Yahoo fetchers, fundamentals, universe expansion
- `backend/patterns/`: pattern detection + backtesting
- `backend/signals/`: sentiment and convergence scoring
- `backend/agents/`: orchestrator, tool executor, multi-step agent flow
- `backend/ai/gemini_client.py`: Gemini integration with fallback behavior

### Frontend

Location:
- `frontend/`

Frontend responsibilities:
- Dashboard and radar views
- Stock detail and pattern/backtest presentation
- Chat experience with evidence and portfolio impact
- Video page integration with backend job endpoints

The frontend calls the backend using:
- `VITE_API_BASE_URL` (defaults to `http://localhost:8002/api`)

## Data and persistence

Primary cache directory:
- `data/cache/`

Important cached artifacts:
- `latest_radar_result.json`: last radar output snapshot
- `radar_jobs.json`: persisted radar job states
- `video_jobs.json`: persisted video job states
- `videos/`: generated video artifacts (`.json` or `.mp4`)

Notes:
- The app is resilient to AI quota/auth failures and can switch to deterministic non-AI fallback pipelines.
- Cached results can be used when live scans fail.

## API quick map

Base URL:
- `http://localhost:8002`

Useful endpoints:
- `GET /health`
- `POST /api/radar/run`
- `GET /api/radar/status/{job_id}`
- `GET /api/radar/latest`
- `GET /api/radar/jobs`
- `GET /api/radar/audit/{job_id}`
- `POST /api/chat/ask`
- `GET /api/stocks/market/overview`
- `GET /api/stocks/{symbol}/ohlc`
- `GET /api/stocks/{symbol}/backtest`
- `GET /api/stocks/{symbol}/sentiment`
- `POST /api/video/storyboard`
- `POST /api/video/jobs`
- `GET /api/video/jobs`
- `GET /api/video/jobs/{job_id}`
- `POST /api/video/jobs/{job_id}/retry`
- `POST /api/video/jobs/{job_id}/cancel`
- `GET /api/video/jobs/{job_id}/download`

## Development workflow

Typical local flow:
1. Start backend on port `8002`.
2. Start frontend Vite dev server on port `5173`.
3. Run a radar scan and poll status.
4. Use latest radar output in chat and stock detail screens.
5. Create a video job and download JSON/MP4 artifact.

## Tech stack

Backend:
- Python
- FastAPI
- Uvicorn
- Pandas, NumPy, SciPy
- yfinance, nsetools, requests
- google-genai and google-generativeai integration paths

Frontend:
- React 19
- TypeScript
- Vite
- Zustand
- TanStack Query
- Tailwind

## Testing

Current tests are located in backend test modules.

Example run:
- `source venv/bin/activate && python -m unittest discover -s backend/tests -v`

If you are using `pytest`, install it first and run your preferred command.

## Installation

See the full setup guide for macOS and Windows in:
- `INSTALLATION.md`

## Known implementation notes

- The backend dependency file in this repository is currently named with a leading space: ` requirements.txt`.
- Use quoted paths when installing backend dependencies.
- Optional `ffmpeg` unlocks MP4 output in video jobs; without it, video jobs render JSON artifacts.

## License

No explicit license file is included at the repository root yet.
Add a `LICENSE` file if you plan public distribution.