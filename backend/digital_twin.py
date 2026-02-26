from __future__ import annotations

import random
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from typing import Any, Dict, Optional


def _utc_now() -> datetime:
    return datetime.utcnow()


@dataclass
class TwinBlockState:
    block_id: str
    block_label: str
    baseline_kwh: float
    hvac_mode: str = "NORMAL"
    hvac_setpoint_c: float = 24.0
    lights_on: bool = True
    ventilation_mode: str = "NORMAL"
    last_action_id: Optional[str] = None
    last_action_at: Optional[str] = None


@dataclass
class TwinControlEffect:
    id: str
    block_id: str
    block_label: str
    action_id: Optional[str]
    control_type: str
    source: str
    started_at: float
    ramp_seconds: float
    duration_seconds: float
    target_reduction_pct: float
    resolved: bool = False
    resolved_at: Optional[float] = None


@dataclass
class TwinSourceTrace:
    block_id: str
    ts_unix: float
    ts_iso: str
    source: str
    raw_energy_kwh: float
    simulated_energy_kwh: float
    reduction_pct: float
    stage: str
    active_effects: int
    progress_pct: float
    applied: bool


class DigitalTwinEngine:
    """Hackathon-friendly building digital twin supporting two modes.

    Option A: Overlay preview (counterfactual display/verification preview)
    Option B: Source twin (mutates generated/ingested sensor values before Pathway)
    """

    def __init__(
        self,
        option_a_overlay_enabled: bool = True,
        option_b_source_enabled: bool = True,
        seed: int = 20260226,
    ):
        self._lock = Lock()
        self._rand = random.Random(seed)
        self._block_states: Dict[str, TwinBlockState] = {}
        self._effects: Dict[str, TwinControlEffect] = {}
        self._source_traces: Dict[str, deque[TwinSourceTrace]] = {}
        self._recent_action_events: deque[dict] = deque(maxlen=20)
        self.option_a_overlay_enabled = option_a_overlay_enabled
        self.option_b_source_enabled = option_b_source_enabled

    def register_blocks(self, blocks: list[Any]) -> None:
        with self._lock:
            for block in blocks:
                block_id = getattr(block, "block_id", None) or getattr(block, "id", None)
                if not block_id:
                    continue
                label = getattr(block, "label", block_id)
                baseline = float(getattr(block, "baseline_kwh", 0.0) or 0.0)
                if block_id not in self._block_states:
                    self._block_states[block_id] = TwinBlockState(
                        block_id=block_id,
                        block_label=str(label),
                        baseline_kwh=baseline,
                    )
                else:
                    state = self._block_states[block_id]
                    state.block_label = str(label)
                    state.baseline_kwh = baseline

    def set_modes(
        self,
        option_a_overlay_enabled: Optional[bool] = None,
        option_b_source_enabled: Optional[bool] = None,
    ) -> dict:
        with self._lock:
            if option_a_overlay_enabled is not None:
                self.option_a_overlay_enabled = bool(option_a_overlay_enabled)
            if option_b_source_enabled is not None:
                self.option_b_source_enabled = bool(option_b_source_enabled)
            return {
                "option_a_overlay_enabled": self.option_a_overlay_enabled,
                "option_b_source_enabled": self.option_b_source_enabled,
            }

    def activate_from_action(
        self,
        *,
        action_id: Optional[str],
        block_id: str,
        block_label: Optional[str],
        recommendation: str,
        occupancy: Optional[float] = None,
        temperature: Optional[float] = None,
        source: str = "ADR_EXECUTE",
    ) -> dict:
        with self._lock:
            now = _utc_now()
            self._cleanup_locked(now)
            state = self._block_states.setdefault(
                block_id,
                TwinBlockState(block_id=block_id, block_label=block_label or block_id, baseline_kwh=0.0),
            )
            if block_label:
                state.block_label = block_label
            specs = self._parse_effects_from_recommendation(recommendation)
            if not specs:
                specs = [("LOAD_SHED", 0.09, 35.0, 15 * 60)]

            created: list[dict] = []
            for control_type, target_pct, ramp_seconds, duration_seconds in specs:
                effect = TwinControlEffect(
                    id=str(uuid.uuid4()),
                    block_id=block_id,
                    block_label=state.block_label,
                    action_id=action_id,
                    control_type=control_type,
                    source=source,
                    started_at=now.timestamp(),
                    ramp_seconds=ramp_seconds,
                    duration_seconds=duration_seconds,
                    target_reduction_pct=target_pct,
                )
                self._effects[effect.id] = effect
                created.append(
                    {
                        "effect_id": effect.id,
                        "control_type": effect.control_type,
                        "target_reduction_pct": round(effect.target_reduction_pct * 100, 1),
                        "ramp_seconds": int(effect.ramp_seconds),
                        "duration_seconds": int(effect.duration_seconds),
                    }
                )
                self._apply_control_state_locked(state, effect.control_type)

            state.last_action_id = action_id
            state.last_action_at = now.isoformat()

            reduction = self._compute_block_reduction_locked(
                block_id=block_id,
                occupancy=occupancy or 0.0,
                temperature=temperature or 28.0,
                now=now,
            )

            action_event = {
                "ts": now.isoformat(),
                "action_id": action_id,
                "block_id": block_id,
                "block_label": state.block_label,
                "source": source,
                "recommendation": recommendation,
                "effects": created,
                "expected_reduction_pct": round(reduction["reduction_pct"] * 100, 1),
                "stage": reduction["stage"],
            }
            self._recent_action_events.appendleft(action_event)

            return {
                "activated": True,
                "option_a_overlay_enabled": self.option_a_overlay_enabled,
                "option_b_source_enabled": self.option_b_source_enabled,
                "block_id": block_id,
                "block_label": state.block_label,
                "effects": created,
                "expected_reduction_pct": round(reduction["reduction_pct"] * 100, 1),
                "stage": reduction["stage"],
            }

    def resolve_action(self, action_id: str) -> dict:
        with self._lock:
            now_ts = _utc_now().timestamp()
            count = 0
            for effect in self._effects.values():
                if effect.action_id == action_id and not effect.resolved:
                    effect.resolved = True
                    effect.resolved_at = now_ts
                    count += 1
            return {"action_id": action_id, "resolved_effects": count}

    def apply_manual_controls(
        self,
        *,
        block_id: str,
        block_label: Optional[str],
        hvac_eco: bool,
        lights_off: bool,
        ventilation_eco: bool,
        hvac_setpoint_delta_c: float = 2.0,
        duration_minutes: int = 15,
        replace_existing: bool = True,
        occupancy: Optional[float] = None,
        temperature: Optional[float] = None,
    ) -> dict:
        with self._lock:
            now = _utc_now()
            self._cleanup_locked(now)
            state = self._block_states.setdefault(
                block_id,
                TwinBlockState(block_id=block_id, block_label=block_label or block_id, baseline_kwh=0.0),
            )
            if block_label:
                state.block_label = block_label

            if replace_existing:
                self._clear_block_effects_locked(block_id)

            duration_minutes = int(max(1, min(duration_minutes, 60)))
            duration_seconds = float(duration_minutes * 60)
            delta = float(max(0.5, min(hvac_setpoint_delta_c, 4.0)))

            specs: list[tuple[str, float, float, float]] = []
            if hvac_eco:
                hvac_reduction = min(0.08 + (delta - 0.5) * 0.04, 0.18)
                hvac_ramp = 120.0 + delta * 25.0
                specs.append((f"HVAC_SETPOINT_PLUS_{int(round(delta))}C", hvac_reduction, hvac_ramp, duration_seconds))
            if lights_off:
                specs.append(("LIGHTS_OFF", 0.06, 8.0, duration_seconds))
            if ventilation_eco:
                specs.append(("VENT_ECO", 0.08, 60.0, duration_seconds))

            created: list[dict] = []
            if not specs:
                self._recent_action_events.appendleft(
                    {
                        "ts": now.isoformat(),
                        "action_id": None,
                        "block_id": block_id,
                        "block_label": state.block_label,
                        "source": "MANUAL_TWIN_PANEL",
                        "recommendation": "Reset manual twin controls to NORMAL operation.",
                        "effects": [],
                        "expected_reduction_pct": 0.0,
                        "stage": "IDLE",
                    }
                )
                self._cleanup_locked(now)
                return {
                    "activated": True,
                    "manual": True,
                    "block_id": block_id,
                    "block_label": state.block_label,
                    "effects": [],
                    "expected_reduction_pct": 0.0,
                    "stage": "IDLE",
                    "controls": {
                        "hvac_eco": False,
                        "lights_off": False,
                        "ventilation_eco": False,
                        "hvac_setpoint_delta_c": delta,
                        "duration_minutes": duration_minutes,
                    },
                }

            for control_type, target_pct, ramp_seconds, effect_duration_seconds in specs:
                effect = TwinControlEffect(
                    id=str(uuid.uuid4()),
                    block_id=block_id,
                    block_label=state.block_label,
                    action_id=None,
                    control_type=control_type,
                    source="MANUAL_TWIN_PANEL",
                    started_at=now.timestamp(),
                    ramp_seconds=ramp_seconds,
                    duration_seconds=effect_duration_seconds,
                    target_reduction_pct=target_pct,
                )
                self._effects[effect.id] = effect
                created.append(
                    {
                        "effect_id": effect.id,
                        "control_type": effect.control_type,
                        "target_reduction_pct": round(effect.target_reduction_pct * 100, 1),
                        "ramp_seconds": int(effect.ramp_seconds),
                        "duration_seconds": int(effect.duration_seconds),
                    }
                )
                self._apply_control_state_locked(state, effect.control_type)

            reduction = self._compute_block_reduction_locked(
                block_id=block_id,
                occupancy=occupancy or 0.0,
                temperature=temperature or 28.0,
                now=now,
            )

            self._recent_action_events.appendleft(
                {
                    "ts": now.isoformat(),
                    "action_id": None,
                    "block_id": block_id,
                    "block_label": state.block_label,
                    "source": "MANUAL_TWIN_PANEL",
                    "recommendation": self._manual_recommendation_text(
                        hvac_eco=hvac_eco,
                        lights_off=lights_off,
                        ventilation_eco=ventilation_eco,
                        hvac_setpoint_delta_c=delta,
                        duration_minutes=duration_minutes,
                    ),
                    "effects": created,
                    "expected_reduction_pct": round(reduction["reduction_pct"] * 100, 1),
                    "stage": reduction["stage"],
                }
            )

            state.last_action_id = None
            state.last_action_at = now.isoformat()

            return {
                "activated": True,
                "manual": True,
                "block_id": block_id,
                "block_label": state.block_label,
                "effects": created,
                "expected_reduction_pct": round(reduction["reduction_pct"] * 100, 1),
                "stage": reduction["stage"],
                "controls": {
                    "hvac_eco": hvac_eco,
                    "lights_off": lights_off,
                    "ventilation_eco": ventilation_eco,
                    "hvac_setpoint_delta_c": delta,
                    "duration_minutes": duration_minutes,
                },
            }

    def apply_source_event(self, event: dict, source: str) -> dict:
        block_id = str(event.get("block"))
        energy_raw = float(event.get("energy_kwh") or 0.0)
        occupancy = float(event.get("occupancy") or 0.0)
        temperature = float(event.get("temperature") or 0.0)
        ts = event.get("ts")
        if not isinstance(ts, datetime):
            ts = _utc_now()

        with self._lock:
            self._cleanup_locked(ts)
            reduction = self._compute_block_reduction_locked(
                block_id=block_id,
                occupancy=occupancy,
                temperature=temperature,
                now=ts,
            )
            applied = bool(self.option_b_source_enabled and reduction["active_effects"] > 0)
            simulated_energy = energy_raw
            if applied and energy_raw > 0:
                # Small noise avoids obviously deterministic drops.
                noise = self._rand.uniform(-0.003, 0.003) * energy_raw
                simulated_energy = max(0.15, energy_raw * (1.0 - reduction["reduction_pct"]) + noise)

            trace = TwinSourceTrace(
                block_id=block_id,
                ts_unix=ts.timestamp(),
                ts_iso=ts.isoformat(),
                source=source,
                raw_energy_kwh=round(energy_raw, 4),
                simulated_energy_kwh=round(simulated_energy, 4),
                reduction_pct=float(reduction["reduction_pct"]),
                stage=str(reduction["stage"]),
                active_effects=int(reduction["active_effects"]),
                progress_pct=float(reduction["progress_pct"]),
                applied=applied,
            )
            traces = self._source_traces.setdefault(block_id, deque(maxlen=40))
            traces.append(trace)

        payload = dict(event)
        payload["energy_kwh"] = round(simulated_energy, 2)
        return payload

    def match_source_trace(self, block_id: str, event_ts: Any) -> Optional[dict]:
        try:
            event_dt = event_ts if isinstance(event_ts, datetime) else datetime.fromisoformat(str(event_ts))
            event_unix = event_dt.timestamp()
        except Exception:  # noqa: BLE001
            event_unix = None

        with self._lock:
            traces = self._source_traces.get(block_id)
            if not traces:
                return None
            best: Optional[TwinSourceTrace] = None
            if event_unix is not None:
                best = min(traces, key=lambda t: abs(t.ts_unix - event_unix))
                if abs(best.ts_unix - event_unix) > 8.0:
                    best = None
            if best is None:
                best = traces[-1]
            return self._trace_to_dict(best)

    def overlay_preview(self, snapshot: Any) -> Optional[dict]:
        if not self.option_a_overlay_enabled:
            return None
        now = _utc_now()
        block_id = getattr(snapshot, "block_id", None)
        if not block_id:
            return None
        try:
            occupancy = float(getattr(snapshot, "occupancy", 0.0) or 0.0)
            temperature = float(getattr(snapshot, "temperature", 0.0) or 0.0)
            energy_kwh = float(getattr(snapshot, "energy_kwh", 0.0) or 0.0)
            baseline_kwh = float(getattr(snapshot, "baseline_kwh", 0.0) or 0.0)
            tariff = float(getattr(snapshot, "tariff_inr_per_kwh", 6.5) or 6.5)
            carbon = float(getattr(snapshot, "carbon_intensity_kg_per_kwh", 0.82) or 0.82)
        except Exception:  # noqa: BLE001
            return None

        with self._lock:
            self._cleanup_locked(now)
            reduction = self._compute_block_reduction_locked(
                block_id=block_id,
                occupancy=occupancy,
                temperature=temperature,
                now=now,
            )

        if reduction["active_effects"] <= 0:
            return {
                "enabled": True,
                "applied": False,
                "reduction_pct": 0.0,
                "stage": "IDLE",
                "active_effects": 0,
                "progress_pct": 0.0,
            }

        overlay_energy = max(0.15, energy_kwh * (1.0 - reduction["reduction_pct"]))
        overlay_deviation = 0.0
        if baseline_kwh > 0:
            overlay_deviation = (overlay_energy - baseline_kwh) / baseline_kwh * 100.0
        overlay_savings = max(overlay_energy - baseline_kwh, 0.0)

        return {
            "enabled": True,
            "applied": True,
            "reduction_pct": round(float(reduction["reduction_pct"] * 100.0), 1),
            "stage": reduction["stage"],
            "active_effects": int(reduction["active_effects"]),
            "progress_pct": round(float(reduction["progress_pct"] * 100.0), 1),
            "energy_kwh": round(float(overlay_energy), 2),
            "deviation_pct": round(float(overlay_deviation), 1),
            "savings_kwh": round(float(overlay_savings), 2),
            "cost_inr": round(float(overlay_energy * tariff), 2),
            "waste_cost_inr": round(float(overlay_savings * tariff), 2),
            "co2_kg": round(float(overlay_energy * carbon), 2),
            "status": self._classify_status(
                energy=overlay_energy,
                baseline=baseline_kwh,
                occupancy=occupancy,
                temperature=temperature,
            ),
        }

    def block_control_state(self, block_id: str) -> Optional[dict]:
        now = _utc_now()
        with self._lock:
            self._cleanup_locked(now)
            state = self._block_states.get(block_id)
            if not state:
                return None
            active = [
                effect
                for effect in self._effects.values()
                if effect.block_id == block_id and not self._is_effect_expired(effect, now)
            ]
            reduction = self._compute_block_reduction_locked(block_id, 0.0, 28.0, now)
            return {
                "block_id": block_id,
                "block_label": state.block_label,
                "hvac_mode": state.hvac_mode,
                "hvac_setpoint_c": state.hvac_setpoint_c,
                "lights_on": state.lights_on,
                "ventilation_mode": state.ventilation_mode,
                "active_effects": len(active),
                "stage": reduction["stage"],
                "last_action_id": state.last_action_id,
                "last_action_at": state.last_action_at,
            }

    def state_summary(self, snapshots: Optional[list[Any]] = None) -> dict:
        now = _utc_now()
        with self._lock:
            self._cleanup_locked(now)
            active_effects = [e for e in self._effects.values() if not self._is_effect_expired(e, now)]
            controlled_blocks = sorted({e.block_id for e in active_effects})
            effects_payload = []
            for effect in sorted(active_effects, key=lambda e: e.started_at, reverse=True)[:12]:
                progress = self._effect_progress(effect, now)
                stage = "STEADY" if progress >= 0.98 else ("WARMUP" if progress < 0.15 else "RAMPING")
                remaining = max(0, int((effect.started_at + effect.duration_seconds) - now.timestamp()))
                effects_payload.append(
                    {
                        "effect_id": effect.id,
                        "action_id": effect.action_id,
                        "block_id": effect.block_id,
                        "block_label": effect.block_label,
                        "control_type": effect.control_type,
                        "target_reduction_pct": round(effect.target_reduction_pct * 100, 1),
                        "progress_pct": round(progress * 100, 1),
                        "stage": stage,
                        "remaining_seconds": remaining,
                        "source": effect.source,
                    }
                )

            source_traces = [t for traces in self._source_traces.values() for t in traces]
            source_traces.sort(key=lambda t: t.ts_unix, reverse=True)
            last_source = self._trace_to_dict(source_traces[0]) if source_traces else None

        overlay_preview_kwh = 0.0
        overlay_preview_blocks = 0
        if snapshots and self.option_a_overlay_enabled:
            for snapshot in snapshots:
                preview = self.overlay_preview(snapshot)
                if preview and preview.get("applied"):
                    try:
                        overlay_preview_kwh += max(
                            0.0,
                            float(getattr(snapshot, "energy_kwh", 0.0) or 0.0) - float(preview.get("energy_kwh") or 0.0),
                        )
                    except Exception:  # noqa: BLE001
                        pass
                    overlay_preview_blocks += 1

        return {
            "option_a_overlay_enabled": self.option_a_overlay_enabled,
            "option_b_source_enabled": self.option_b_source_enabled,
            "active_effects": len(effects_payload),
            "controlled_blocks": len(controlled_blocks),
            "controlled_block_ids": controlled_blocks,
            "overlay_preview_delta_kwh_now": round(overlay_preview_kwh, 2),
            "overlay_preview_blocks": overlay_preview_blocks,
            "last_source_trace": last_source,
            "active_effect_details": effects_payload,
            "recent_actions": list(self._recent_action_events),
        }

    def _trace_to_dict(self, trace: TwinSourceTrace) -> dict:
        return {
            "block_id": trace.block_id,
            "ts": trace.ts_iso,
            "source": trace.source,
            "raw_energy_kwh": round(trace.raw_energy_kwh, 2),
            "simulated_energy_kwh": round(trace.simulated_energy_kwh, 2),
            "reduction_pct": round(trace.reduction_pct * 100, 1),
            "stage": trace.stage,
            "active_effects": trace.active_effects,
            "progress_pct": round(trace.progress_pct * 100, 1),
            "applied": trace.applied,
        }

    def _cleanup_locked(self, now: datetime) -> None:
        expired_ids: list[str] = []
        for effect_id, effect in self._effects.items():
            if self._is_effect_expired(effect, now):
                expired_ids.append(effect_id)
        for effect_id in expired_ids:
            del self._effects[effect_id]

        active_by_block: Dict[str, list[TwinControlEffect]] = {}
        for effect in self._effects.values():
            active_by_block.setdefault(effect.block_id, []).append(effect)

        for block_id, state in self._block_states.items():
            block_effects = active_by_block.get(block_id, [])
            if not block_effects:
                state.hvac_mode = "NORMAL"
                state.hvac_setpoint_c = 24.0
                state.lights_on = True
                state.ventilation_mode = "NORMAL"
                continue
            # Recompute state based on active effects.
            state.hvac_mode = "ECO" if any("HVAC" in e.control_type for e in block_effects) else "NORMAL"
            state.hvac_setpoint_c = 26.0 if state.hvac_mode == "ECO" else 24.0
            state.lights_on = not any("LIGHTS" in e.control_type for e in block_effects)
            state.ventilation_mode = "ECO" if any("VENT" in e.control_type for e in block_effects) else "NORMAL"

    def _clear_block_effects_locked(self, block_id: str) -> None:
        remove_ids = [effect_id for effect_id, effect in self._effects.items() if effect.block_id == block_id]
        for effect_id in remove_ids:
            del self._effects[effect_id]

    def _manual_recommendation_text(
        self,
        *,
        hvac_eco: bool,
        lights_off: bool,
        ventilation_eco: bool,
        hvac_setpoint_delta_c: float,
        duration_minutes: int,
    ) -> str:
        parts: list[str] = []
        if hvac_eco:
            parts.append(f"HVAC eco mode (+{hvac_setpoint_delta_c:.1f}C setpoint)")
        if lights_off:
            parts.append("lights off / shed non-critical lighting")
        if ventilation_eco:
            parts.append("ventilation eco mode")
        if not parts:
            return "Manual twin reset to normal building operation."
        return f"Manual twin control: {', '.join(parts)} for ~{duration_minutes} minutes."

    def _is_effect_expired(self, effect: TwinControlEffect, now: datetime) -> bool:
        if effect.resolved:
            return True
        return now.timestamp() > (effect.started_at + effect.duration_seconds)

    def _effect_progress(self, effect: TwinControlEffect, now: datetime) -> float:
        elapsed = max(0.0, now.timestamp() - effect.started_at)
        if effect.ramp_seconds <= 0:
            return 1.0
        return max(0.0, min(1.0, elapsed / effect.ramp_seconds))

    def _compute_block_reduction_locked(
        self,
        block_id: str,
        occupancy: float,
        temperature: float,
        now: datetime,
    ) -> dict:
        effects = [
            effect
            for effect in self._effects.values()
            if effect.block_id == block_id and not self._is_effect_expired(effect, now)
        ]
        if not effects:
            return {
                "reduction_pct": 0.0,
                "active_effects": 0,
                "progress_pct": 0.0,
                "stage": "IDLE",
            }

        total = 0.0
        progress_values: list[float] = []
        for effect in effects:
            progress = self._effect_progress(effect, now)
            progress_values.append(progress)
            context_scale = self._context_scale(effect.control_type, occupancy, temperature)
            total += effect.target_reduction_pct * progress * context_scale

        total = min(max(total, 0.0), 0.35)
        avg_progress = sum(progress_values) / len(progress_values) if progress_values else 0.0
        if avg_progress < 0.15:
            stage = "WARMUP"
        elif avg_progress < 0.98:
            stage = "RAMPING"
        else:
            stage = "STEADY"

        return {
            "reduction_pct": total,
            "active_effects": len(effects),
            "progress_pct": avg_progress,
            "stage": stage,
        }

    def _context_scale(self, control_type: str, occupancy: float, temperature: float) -> float:
        if occupancy >= 80:
            occ_scale = 0.35
        elif occupancy >= 60:
            occ_scale = 0.55
        elif occupancy >= 35:
            occ_scale = 0.8
        else:
            occ_scale = 1.0

        if "HVAC" in control_type:
            if temperature >= 36:
                temp_scale = 0.5
            elif temperature >= 33:
                temp_scale = 0.7
            elif temperature >= 30:
                temp_scale = 0.9
            else:
                temp_scale = 1.0
            return max(0.3, occ_scale * temp_scale)

        if "LIGHTS" in control_type:
            return max(0.5, occ_scale)

        if "VENT" in control_type:
            temp_scale = 0.75 if temperature >= 34 else 1.0
            return max(0.35, occ_scale * temp_scale)

        return max(0.4, occ_scale)

    def _parse_effects_from_recommendation(self, recommendation: str) -> list[tuple[str, float, float, float]]:
        text = (recommendation or "").lower()
        specs: list[tuple[str, float, float, float]] = []

        hvac_keywords = ("hvac", "setpoint", "overcool", "cooling")
        light_keywords = ("light", "lighting")
        vent_keywords = ("vent", "ventilation", "fan")

        if any(k in text for k in hvac_keywords):
            specs.append(("HVAC_SETPOINT_PLUS_2C", 0.14, 150.0, 20 * 60))
        if any(k in text for k in light_keywords):
            specs.append(("LIGHTS_OFF", 0.06, 8.0, 15 * 60))
        if any(k in text for k in vent_keywords):
            specs.append(("VENT_ECO", 0.08, 60.0, 15 * 60))
        if "shed" in text and not specs:
            specs.append(("LOAD_SHED", 0.09, 35.0, 15 * 60))
        return specs

    def _apply_control_state_locked(self, state: TwinBlockState, control_type: str) -> None:
        if "HVAC" in control_type:
            state.hvac_mode = "ECO"
            state.hvac_setpoint_c = 26.0
        if "LIGHTS" in control_type:
            state.lights_on = False
        if "VENT" in control_type:
            state.ventilation_mode = "ECO"

    def _classify_status(self, energy: float, baseline: float, occupancy: float, temperature: float) -> str:
        if baseline <= 0:
            return "NORMAL"
        deviation = (energy - baseline) / baseline
        if deviation <= 0.12:
            return "NORMAL"
        high_occ = occupancy >= 60
        low_occ = occupancy <= 25
        high_temp = temperature >= 30
        moderate_temp = 24 <= temperature < 30
        if deviation > 0.12 and high_occ and high_temp:
            return "NECESSARY"
        if deviation > 0.12 and low_occ and high_temp:
            return "POSSIBLE_WASTE"
        if deviation > 0.12 and low_occ and moderate_temp:
            return "WASTE"
        if deviation > 0.2 and low_occ:
            return "WASTE"
        return "POSSIBLE_WASTE"
