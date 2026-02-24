# EnergySense — Real-Time Multi-Block Energy Intelligence

A premium, real-time sustainability dashboard that transforms raw energy streams into actionable insights using Pathway streaming, contextual anomaly detection, and a secure FastAPI backend.

## What’s Included
- **Pathway streaming engine** for real-time ingestion, per-block rolling baselines, and continuous recomputation.
- **FastAPI backend** with JWT auth, org mapping, and live SSE stream.
- **Admin dashboard** with live status cards, waste heatmap, savings counter, and sustainability metrics.
- **Predictive anomaly engine** with LSTM-style sequence forecasting, avoidable anomaly estimation, and per-block risk scoring.
- **Lovable + Vite + Tailwind** front-end with a premium neon UI.

## Local Setup (Mac)

### 1) Backend (FastAPI + Pathway)
> **Important:** Use **Python 3.11 or 3.12**. Python 3.14 does not yet have prebuilt `pyarrow` wheels, which Pathway needs.
```bash
cd /Users/arularavind/Documents/hackathons/hfg/smart-energy-sense-main
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m backend.app
```
Backend runs on `http://localhost:8000`.

### 2) Frontend (Vite)
```bash
cd /Users/arularavind/Documents/hackathons/hfg/smart-energy-sense-main
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

### Demo Credentials
- **Username:** `admin`
- **Password:** `admin123`

## API Overview
- `POST /auth/login` → JWT login
- `GET /health` → service + predictive model state
- `GET /dashboard/current-status` → per-block live status
- `GET /dashboard/stream?token=...` → live SSE stream
- `POST /ingest` → push sensor events (admin only)
- `POST /assistant/ask` → energy copilot Q&A (with citations)
- `POST /assistant/explain` → explain block anomalies
- `GET /alerts` → live alerts
- `POST /alerts/{id}/ack` → acknowledge alert
- `POST /alerts/{id}/resolve` → resolve alert
- `GET /reports` → daily/weekly summaries

## Pathway Usage Highlights
- Streaming input table via `pw.io.python.read`
- Per-block sliding windows via `windowby` + `pw.temporal.sliding`
- Continuous recomputation and live subscriptions via `pw.io.subscribe`
- Multi-source ingestion for weather, tariff, and carbon intensity feeds
- Custom connector that tails `backend/data/sensor_stream.csv`

## Copilot Docs
- Add/modify documents in `backend/knowledge/*.md` to update the RAG corpus live.
- Optional LLM: set `OPENAI_API_KEY` (and `OPENAI_BASE_URL` if needed) before starting backend.
  - If you want LLM responses, install the client: `pip install openai`

## Predictive LSTM Notes
- The app always runs predictive anomaly scoring from live history.
- If TensorFlow is installed, it uses a stacked LSTM sequence model.
- Without TensorFlow, it automatically falls back to a lightweight temporal regressor (no crash/no feature loss).
- Optional Mac install for full LSTM acceleration:
```bash
pip install tensorflow-macos tensorflow-metal
```

## Live Feeds (Multi-Source)
- **Sensor CSV**: append rows to `backend/data/sensor_stream.csv` (auto-ingested).
- **Weather JSON**: edit `backend/data/weather.json` (outside temp + humidity updates).
- **Tariff/Carbon**: edit `backend/data/tariffs.json` and `backend/data/carbon_intensity.json` to simulate time-of-use & grid intensity changes.

---
Built for real-time sustainability intelligence and hackathon-grade demos.
