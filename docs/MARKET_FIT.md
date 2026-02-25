# Market Fit

## Target Users
- Campus facility managers
- Institutional energy managers
- Admin / sustainability officers
- BMS operations teams for colleges, offices, hospitals, and industrial campuses

## Core Pain
- Monthly bills identify waste too late.
- Existing dashboards show usage but not whether it is necessary.
- No immediate block-level accountability for avoidable consumption.

## Why This Is a Real Need
- High tariff windows increase impact of short waste events.
- Energy waste during low occupancy is frequent and operationally preventable.
- Sustainability teams need measurable CO2 and cost outcomes, not only charts.

## Job To Be Done
"Tell me, in real time, which blocks are wasting energy, why, what it is costing right now, and what action should be taken."

## Value Proposition
- Real-time contextual classification (`NORMAL`, `NECESSARY`, `POSSIBLE_WASTE`, `WASTE`)
- Estimated savings and waste cost in INR
- Carbon-aware prioritization
- Predictive anomaly warning (next-hour avoidable load)
- Operator workflow with verification (ADR closed loop)

## Buyer Value (Institutional)
- Lower electricity cost
- Faster response to waste events
- Auditable intervention history
- Improved sustainability reporting confidence

## Pilot Rollout Fit
- Starts with CSV/IoT simulated streams (low integration friction)
- Can upgrade to MQTT/Kafka/SCADA connectors
- Works per block and scales to campus-level aggregation
