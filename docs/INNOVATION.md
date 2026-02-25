# Innovation Summary

## 1) Pathway-Native Streaming Intelligence (Core Innovation)
This project uses Pathway as an actual streaming compute engine, not a decorative import.

Implemented with Pathway:
- streaming ingestion (`pw.io.python.read`)
- per-block sliding windows (`windowby` + `pw.temporal.sliding`)
- `asof_join` for stream enrichment (baseline, weather, tariff, carbon)
- event-driven subscriptions (`pw.io.subscribe`)

## 2) Contextual Waste Classification
Classification is based on combined signals:
- energy deviation from rolling baseline
- occupancy
- temperature

This enables a meaningful distinction between:
- `NECESSARY` high usage (e.g., high occupancy + high heat)
- `WASTE` high usage (e.g., low occupancy + moderate conditions)

## 3) Multi-Source Sustainability Awareness
The engine incorporates:
- weather conditions
- time-of-use tariff schedule
- carbon intensity schedule

This lets operators prioritize interventions by both cost and climate impact.

## 4) Closed-Loop ADR Verification
Most energy demos stop at "detect anomaly".
This project continues to:
- propose an action
- execute it
- verify measured savings
- resolve and log the outcome

This produces measurable operational evidence.

## 5) Predictive Anomaly Engine (LSTM/Hybrid)
The predictive module estimates near-future avoidable anomaly risk using sequence features built from:
- deviation
- energy
- baseline
- occupancy
- temperature

If TensorFlow is available: stacked LSTM.
If not: fallback regressor with the same dashboard contract.

## 6) Demo Reliability by Design
To keep demos stable under hackathon conditions:
- synthetic stream fallback is built in
- "Waiting for data" states are explicit
- report cards can run in labeled synthetic `Demo Mode`

This improves presentation reliability without hiding what is synthetic.
