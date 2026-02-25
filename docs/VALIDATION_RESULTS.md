# Validation Results (Demo + Development)

## Validation Scope
This document records what has been validated during local development and demo preparation.

## Local Engineering Checks

| Check | Status | Notes |
|---|---|---|
| Backend syntax compile (`python -m compileall backend`) | Pass | Validates Python syntax integrity |
| Frontend production build (`npm run build`) | Pass | Validates TypeScript + bundling |
| Pathway pipeline startup | Pass | Stream initializes and emits updates |
| JWT login flow | Pass | Admin login verified with demo credentials |
| SSE dashboard stream | Pass | Live status updates visible in admin dashboard |

## Functional Validation Scenarios

| Scenario | Input Condition | Expected Result | Observed |
|---|---|---|---|
| Low occupancy + high deviation | Simulated block event | `WASTE` / `POSSIBLE_WASTE` classification | Observed in heatmap |
| High occupancy + high temp | Simulated block event | `NECESSARY` classification | Observed in block cards |
| Persistent waste window | Repeated waste events | Alert raised | Observed in alerts panel |
| ADR lifecycle | Propose -> execute -> verify -> resolve | Verified savings recorded | Observed in ADR panel |
| Predictive anomaly panel | Sufficient history | LSTM/hybrid risk output visible | Observed in dashboard |

## Demo Mode Disclosure
- Daily/Weekly report cards currently rotate through **5 synthetic summary variants** for presentation stability.
- These cards are explicitly labeled `Demo Mode` in the UI.
- Core metrics referenced in synthetic summaries are derived from live dashboard state.

## Data Sources Validated
- Sensor CSV (`backend/data/sensor_stream.csv`)
- Synthetic event fallback stream
- Weather JSON (`backend/data/weather.json`)
- Tariff schedule JSON (`backend/data/tariffs.json`)
- Carbon intensity JSON (`backend/data/carbon_intensity.json`)

## Known Demo Constraints
- External LLM calls may fall back to local synthetic text if provider/model access fails.
- LSTM uses hybrid fallback when TensorFlow is not installed.
- Report cards are synthetic in demo mode by design.

## Next Validation Step (Pilot-Oriented)
1. Integrate one real campus meter feed.
2. Measure detection latency and false-positive rate over 1 week.
3. Compare verified ADR savings against baseline-only heuristics.
