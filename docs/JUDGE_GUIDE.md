# Judge Guide (Quick Evaluation Path)

## What This Project Solves
Energy dashboards usually show usage after the fact. This project adds real-time contextual intelligence to classify whether energy is necessary or avoidable while it is happening.

## 3-Minute Demo Flow
1. Login as admin (`admin / admin123`).
2. Show live Pathway proof card:
   - last ingest timestamp
   - event rate
   - blocks updated
3. Show Waste Heatmap and Block-Level Live Status.
4. Open one block drill-down modal and show:
   - last 5-minute deviation sparkline
   - root cause
   - LSTM predictive anomaly risk
5. Show ADR panel:
   - propose/execute/verify/resolve flow
6. Show synthetic report cards (clearly labeled `Demo Mode`) rotating 5 variants.

## What Judges Should Verify
- Pathway is used for streaming windows and joins:
  - `backend/pipeline.py`
- Alerts + accountability workflow:
  - `GET /alerts`, ack/resolve endpoints
- ADR closed-loop action verification:
  - `GET /actions`, execute/verify/resolve endpoints
- Predictive engine with sequence features:
  - `backend/lstm_predictor.py`
- Multi-source ingestion:
  - energy stream + weather + tariff + carbon schedules

## Core Endpoints
- `POST /auth/login`
- `GET /dashboard/current-status`
- `GET /dashboard/stream?token=...`
- `POST /ingest`
- `GET /alerts`
- `GET /actions`
- `POST /assistant/ask`
- `POST /assistant/explain`
- `GET /reports`

## Notes on Demo Mode
- The Daily/Weekly report cards in the UI are intentionally set to synthetic rotating summaries (`5` variants) for demo consistency.
- The rest of the dashboard metrics are live from streaming state.
