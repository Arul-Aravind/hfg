# Success Criteria

## Objective
Demonstrate a real-time, context-aware energy intelligence system that can detect avoidable waste, prioritize action, and quantify impact.

## Technical Success Criteria

| Metric | Target | How Measured |
|---|---:|---|
| Live stream update cadence | <= 2-3s UI refresh | SSE updates in dashboard |
| Per-block baseline recomputation | Continuous | Pathway sliding window output |
| Alert generation for persistent waste | Trigger when WASTE persists in configured window | Pathway alert window + store state |
| Multi-source enrichment | Weather + tariff + carbon active | Environment panel values update |
| Predictive anomaly signal | Per-block risk and avoidable kWh shown | LSTM/hybrid card + block drilldown |

## Product Success Criteria

| Metric | Target | Why It Matters |
|---|---:|---|
| Waste classification interpretability | Human-readable root-cause for each flagged block | Operator trust |
| Savings visibility | kWh + INR shown in real time | Operational prioritization |
| Sustainability visibility | CO2 metrics shown | Climate reporting relevance |
| Accountability workflow | Alerts and actions can be acknowledged/resolved | Actionability over passive monitoring |

## Demo Success Criteria
- End-to-end flow works without internet dependency for core analytics.
- At least one waste hotspot is visible.
- One ADR action can be executed and verified.
- Predictive panel shows a ranked hotspot or clearly reports no medium/high risk.
- Pathway proof panel shows live ingest state.

## Stretch Criteria
- External LLM-powered grounded explanations
- Live connector migration (MQTT/Kafka)
- On-chain audit trail for report hashes (if enabled in evaluation platform)
