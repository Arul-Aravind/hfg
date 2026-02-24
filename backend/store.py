from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta
from threading import Lock
from typing import Dict, List, Optional
import uuid


@dataclass
class BlockSnapshot:
    block_id: str
    block_label: str
    energy_kwh: float
    baseline_kwh: float
    occupancy: float
    temperature: float
    status: str
    savings_kwh: float
    deviation_pct: float
    tariff_inr_per_kwh: float
    cost_inr: float
    waste_cost_inr: float
    carbon_intensity_kg_per_kwh: float
    co2_kg: float
    root_cause: str
    forecast_peak_deviation: float
    forecast_waste_risk: str
    updated_at: str
    lstm_predicted_deviation_pct: float = 0.0
    lstm_anomaly_probability: float = 0.0
    lstm_risk: str = "LOW"
    lstm_avoidable_kwh: float = 0.0
    lstm_confidence: float = 0.0
    lstm_model_name: str = "LSTM-SeqForecaster-v1"
    lstm_model_ready: bool = False
    lstm_reason: str = "Insufficient sequence history."


@dataclass
class HistoryPoint:
    ts: datetime
    deviation_pct: float
    energy_kwh: float
    baseline_kwh: float
    occupancy: float
    temperature: float


@dataclass
class Alert:
    id: str
    block_id: str
    block_label: str
    severity: str
    message: str
    created_at: str
    last_seen: str
    acknowledged: bool
    resolved: bool
    count: int
    ack_by: Optional[str] = None
    resolved_by: Optional[str] = None


@dataclass
class Report:
    report_type: str
    content: str
    generated_at: str


@dataclass
class DemandResponseAction:
    id: str
    block_id: str
    block_label: str
    mode: str
    status: str
    recommendation: str
    rationale: str
    source: str
    dr_event_code: str
    proposed_reduction_kwh: float
    expected_inr_per_hour: float
    expected_co2_kg_per_hour: float
    proposed_at: str
    executed_at: Optional[str] = None
    verified_at: Optional[str] = None
    resolved_at: Optional[str] = None
    operator: Optional[str] = None
    pre_energy_kwh: Optional[float] = None
    post_energy_kwh: Optional[float] = None
    verified_savings_kwh: float = 0.0
    verified_savings_inr: float = 0.0
    verified_co2_kg: float = 0.0
    verification_note: Optional[str] = None


class BlockStateStore:
    def __init__(
        self,
        org_id: str,
        org_name: str,
        co2_per_kwh_kg: float = 0.82,
        history_window_seconds: int = 300,
        history_max_points: int = 240,
    ):
        self._lock = Lock()
        self._blocks: Dict[str, BlockSnapshot] = {}
        self._history: Dict[str, deque[HistoryPoint]] = {}
        self._alerts: Dict[str, Alert] = {}
        self._reports: Dict[str, Report] = {}
        self._actions: Dict[str, DemandResponseAction] = {}
        self._environment: Dict[str, float] = {
            "outside_temp": 28.0,
            "humidity": 55.0,
            "tariff_inr_per_kwh": 6.5,
            "carbon_intensity_kg_per_kwh": 0.82,
        }
        self._baseline_example: Optional[dict] = None
        self._last_update: Optional[datetime] = None
        self._action_cooldown_seconds = 300
        self.org_id = org_id
        self.org_name = org_name
        self.co2_per_kwh_kg = co2_per_kwh_kg
        self.history_window_seconds = history_window_seconds
        self.history_max_points = history_max_points

    def update(self, snapshot: BlockSnapshot) -> None:
        with self._lock:
            self._blocks[snapshot.block_id] = snapshot
            self._append_history(snapshot)
            self._last_update = datetime.utcnow()
            self._auto_verify_actions(snapshot)

    def last_update(self) -> Optional[datetime]:
        with self._lock:
            return self._last_update

    def snapshot(self) -> List[BlockSnapshot]:
        with self._lock:
            return list(sorted(self._blocks.values(), key=lambda b: b.block_id))

    def history(self, block_id: str) -> List[HistoryPoint]:
        with self._lock:
            return list(self._history.get(block_id, []))

    def history_map(self) -> Dict[str, List[HistoryPoint]]:
        with self._lock:
            return {block_id: list(points) for block_id, points in self._history.items()}

    def _append_history(self, snapshot: BlockSnapshot) -> None:
        try:
            ts = datetime.fromisoformat(snapshot.updated_at)
        except Exception:  # noqa: BLE001
            ts = datetime.utcnow()

        history = self._history.setdefault(snapshot.block_id, deque())
        history.append(
            HistoryPoint(
                ts=ts,
                deviation_pct=snapshot.deviation_pct,
                energy_kwh=snapshot.energy_kwh,
                baseline_kwh=snapshot.baseline_kwh,
                occupancy=snapshot.occupancy,
                temperature=snapshot.temperature,
            )
        )

        cutoff = datetime.utcnow() - timedelta(seconds=self.history_window_seconds)
        while history and history[0].ts < cutoff:
            history.popleft()

        while len(history) > self.history_max_points:
            history.popleft()

    def stats(self) -> dict:
        blocks = self.snapshot()
        total_energy = sum(b.energy_kwh for b in blocks)
        total_savings = sum(b.savings_kwh for b in blocks)
        total_cost = sum(b.cost_inr for b in blocks)
        total_waste_cost = sum(b.waste_cost_inr for b in blocks)
        total_co2 = sum(b.co2_kg for b in blocks)
        waste_blocks = sum(1 for b in blocks if b.status in {"WASTE", "POSSIBLE_WASTE"})
        efficiency_score = 100.0
        if total_energy > 0:
            efficiency_score = max(0.0, 100.0 * (1.0 - (total_savings / total_energy)))
        co2_kg = total_savings * self.co2_per_kwh_kg
        monthly_avoided_kwh = total_savings * 24 * 30
        adr = self.adr_summary()

        return {
            "total_energy_kwh": round(total_energy, 2),
            "total_savings_kwh": round(total_savings, 2),
            "co2_kg": round(co2_kg, 2),
            "total_cost_inr": round(total_cost, 2),
            "total_waste_cost_inr": round(total_waste_cost, 2),
            "total_co2_kg": round(total_co2, 2),
            "efficiency_score": round(efficiency_score, 1),
            "monthly_avoided_kwh": round(monthly_avoided_kwh, 1),
            "waste_blocks": waste_blocks,
            "block_count": len(blocks),
            "adr_open_actions": adr["open_actions"],
            "adr_verified_savings_kwh": adr["verified_savings_kwh"],
            "adr_verified_savings_inr": adr["verified_savings_inr"],
            "adr_verified_co2_kg": adr["verified_co2_kg"],
        }

    def environment(self) -> dict:
        with self._lock:
            return dict(self._environment)

    def set_environment(self, **kwargs: float) -> None:
        with self._lock:
            self._environment.update({k: float(v) for k, v in kwargs.items()})

    def set_baseline_example(self, block_id: str, block_label: str, baseline_kwh: float) -> None:
        with self._lock:
            self._baseline_example = {
                "block_id": block_id,
                "block_label": block_label,
                "baseline_kwh": float(baseline_kwh),
            }

    def pathway_state(self) -> dict:
        with self._lock:
            now = datetime.utcnow()
            cutoff = now - timedelta(minutes=1)
            events_last_minute = 0
            blocks_updated = 0

            for history in self._history.values():
                events_last_minute += sum(1 for point in history if point.ts >= cutoff)

            for snapshot in self._blocks.values():
                try:
                    updated = datetime.fromisoformat(snapshot.updated_at)
                except Exception:  # noqa: BLE001
                    continue
                if updated >= cutoff:
                    blocks_updated += 1

            if self._last_update is None:
                stream_status = "WAITING_FOR_DATA"
            elif events_last_minute == 0:
                stream_status = "IDLE"
            else:
                stream_status = "LIVE"

            return {
                "stream_status": stream_status,
                "last_ingest_at": self._last_update.isoformat() if self._last_update else None,
                "events_last_minute": events_last_minute,
                "event_rate_per_minute": round(float(events_last_minute), 2),
                "blocks_updated": blocks_updated,
                "baseline_example": self._baseline_example,
            }

    def raise_alert(self, block_id: str, block_label: str, severity: str, message: str) -> Alert:
        with self._lock:
            existing = next(
                (alert for alert in self._alerts.values() if alert.block_id == block_id and not alert.resolved),
                None,
            )
            now = datetime.utcnow().isoformat()
            if existing:
                existing.last_seen = now
                existing.count += 1
                return existing

            alert = Alert(
                id=str(uuid.uuid4()),
                block_id=block_id,
                block_label=block_label,
                severity=severity,
                message=message,
                created_at=now,
                last_seen=now,
                acknowledged=False,
                resolved=False,
                count=1,
            )
            self._alerts[alert.id] = alert
            return alert

    def list_alerts(self) -> List[Alert]:
        with self._lock:
            return list(sorted(self._alerts.values(), key=lambda a: a.created_at, reverse=True))

    def acknowledge_alert(self, alert_id: str, user: str) -> Optional[Alert]:
        with self._lock:
            alert = self._alerts.get(alert_id)
            if not alert:
                return None
            alert.acknowledged = True
            alert.ack_by = user
            return alert

    def resolve_alert(self, alert_id: str, user: str) -> Optional[Alert]:
        with self._lock:
            alert = self._alerts.get(alert_id)
            if not alert:
                return None
            alert.resolved = True
            alert.resolved_by = user
            return alert

    def set_report(self, report_type: str, content: str) -> None:
        with self._lock:
            self._reports[report_type] = Report(
                report_type=report_type,
                content=content,
                generated_at=datetime.utcnow().isoformat(),
            )

    def get_reports(self) -> List[Report]:
        with self._lock:
            return list(self._reports.values())

    def propose_action(
        self,
        block_id: str,
        block_label: str,
        mode: str,
        recommendation: str,
        rationale: str,
        source: str,
        dr_event_code: str,
        proposed_reduction_kwh: float,
        expected_inr_per_hour: float,
        expected_co2_kg_per_hour: float,
    ) -> DemandResponseAction:
        with self._lock:
            now = datetime.utcnow()
            for action in self._actions.values():
                if action.block_id != block_id or action.status not in {"PROPOSED", "EXECUTED"}:
                    continue
                try:
                    proposed_at = datetime.fromisoformat(action.proposed_at)
                except Exception:  # noqa: BLE001
                    continue
                if (now - proposed_at).total_seconds() <= self._action_cooldown_seconds:
                    return action

            action = DemandResponseAction(
                id=str(uuid.uuid4()),
                block_id=block_id,
                block_label=block_label,
                mode=mode,
                status="PROPOSED",
                recommendation=recommendation,
                rationale=rationale,
                source=source,
                dr_event_code=dr_event_code,
                proposed_reduction_kwh=float(max(proposed_reduction_kwh, 0.0)),
                expected_inr_per_hour=float(max(expected_inr_per_hour, 0.0)),
                expected_co2_kg_per_hour=float(max(expected_co2_kg_per_hour, 0.0)),
                proposed_at=now.isoformat(),
            )
            self._actions[action.id] = action
            return action

    def list_actions(self, limit: Optional[int] = None) -> List[DemandResponseAction]:
        with self._lock:
            actions = list(sorted(self._actions.values(), key=lambda a: a.proposed_at, reverse=True))
            if limit is not None:
                return actions[:limit]
            return actions

    def execute_action(self, action_id: str, user: str) -> Optional[DemandResponseAction]:
        with self._lock:
            action = self._actions.get(action_id)
            if not action:
                return None
            if action.status not in {"PROPOSED"}:
                return action
            snapshot = self._blocks.get(action.block_id)
            action.status = "EXECUTED"
            action.executed_at = datetime.utcnow().isoformat()
            action.operator = user
            action.pre_energy_kwh = snapshot.energy_kwh if snapshot else None
            return action

    def verify_action(self, action_id: str, user: str) -> Optional[DemandResponseAction]:
        with self._lock:
            action = self._actions.get(action_id)
            if not action:
                return None
            if action.status not in {"EXECUTED", "VERIFIED"}:
                return action
            snapshot = self._blocks.get(action.block_id)
            if not snapshot:
                return action
            self._apply_verification(action, snapshot, user=user)
            return action

    def resolve_action(self, action_id: str, user: str) -> Optional[DemandResponseAction]:
        with self._lock:
            action = self._actions.get(action_id)
            if not action:
                return None
            action.status = "RESOLVED"
            action.resolved_at = datetime.utcnow().isoformat()
            action.operator = user
            return action

    def adr_summary(self) -> dict:
        with self._lock:
            actions = list(self._actions.values())
            open_actions = sum(1 for a in actions if a.status in {"PROPOSED", "EXECUTED"})
            verified = [a for a in actions if a.status in {"VERIFIED", "RESOLVED"}]
            return {
                "open_actions": open_actions,
                "executed_actions": sum(1 for a in actions if a.status == "EXECUTED"),
                "verified_actions": len(verified),
                "verified_savings_kwh": round(sum(a.verified_savings_kwh for a in verified), 2),
                "verified_savings_inr": round(sum(a.verified_savings_inr for a in verified), 2),
                "verified_co2_kg": round(sum(a.verified_co2_kg for a in verified), 2),
            }

    def _auto_verify_actions(self, snapshot: BlockSnapshot) -> None:
        for action in self._actions.values():
            if action.block_id != snapshot.block_id:
                continue
            if action.status != "EXECUTED" or not action.executed_at:
                continue
            try:
                executed_at = datetime.fromisoformat(action.executed_at)
            except Exception:  # noqa: BLE001
                continue
            if (datetime.utcnow() - executed_at).total_seconds() < 30:
                continue
            self._apply_verification(action, snapshot)

    def _apply_verification(self, action: DemandResponseAction, snapshot: BlockSnapshot, user: Optional[str] = None) -> None:
        pre_energy = action.pre_energy_kwh if action.pre_energy_kwh is not None else snapshot.baseline_kwh
        post_energy = snapshot.energy_kwh
        savings = max(pre_energy - post_energy, 0.0)
        action.post_energy_kwh = float(post_energy)
        action.verified_savings_kwh = round(float(savings), 3)
        action.verified_savings_inr = round(float(savings * snapshot.tariff_inr_per_kwh), 3)
        action.verified_co2_kg = round(float(savings * snapshot.carbon_intensity_kg_per_kwh), 3)
        action.verified_at = datetime.utcnow().isoformat()
        action.status = "VERIFIED"
        if user:
            action.operator = user
        if savings > 0:
            action.verification_note = "Measured post-action drop confirms demand response gain."
        else:
            action.verification_note = "No measurable drop yet; review control execution and context."
