from __future__ import annotations

import csv
import json
import logging
import queue
import random
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from threading import Thread
from typing import Dict, List

import pathway as pw

from .store import BlockSnapshot, BlockStateStore

logger = logging.getLogger(__name__)


@dataclass
class BlockProfile:
    block_id: str
    label: str
    baseline_kwh: float


def load_blocks(config_path: Path) -> List[BlockProfile]:
    if not config_path.exists():
        logger.warning("Blocks config is missing: %s", config_path)
        return []
    try:
        raw = json.loads(config_path.read_text())
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to parse blocks config %s: %s", config_path, exc)
        return []

    blocks = []
    for item in raw:
        try:
            blocks.append(
                BlockProfile(
                    block_id=item["id"],
                    label=item["label"],
                    baseline_kwh=float(item["baseline_kwh"]),
                )
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Skipping invalid block profile %s: %s", item, exc)
    return blocks


class EnergySubject(pw.io.python.ConnectorSubject):
    def __init__(
        self,
        event_queue: queue.Queue,
        blocks: List[BlockProfile],
        interval_seconds: float = 1.5,
        file_path: Path | None = None,
    ):
        super().__init__()
        self.event_queue = event_queue
        self.blocks = blocks
        self.interval_seconds = interval_seconds
        self.file_path = file_path
        self._file_offset = 0
        self._file_mtime = 0.0
        self._fieldnames: list[str] | None = None

    def run(self) -> None:
        while True:
            try:
                event = self.event_queue.get(timeout=self.interval_seconds)
                if event is None:
                    continue
                self.next(**event)
            except queue.Empty:
                if self.file_path:
                    file_events = self._read_file_events()
                    if file_events:
                        for event in file_events:
                            self.next(**event)
                        continue
                if not self.blocks:
                    time.sleep(self.interval_seconds)
                    continue
                event = synth_event(random.choice(self.blocks))
                self.next(**event)
                time.sleep(self.interval_seconds)

    @property
    def _deletions_enabled(self) -> bool:  # type: ignore[override]
        return False

    def _read_file_events(self) -> list[dict]:
        if not self.file_path or not self.file_path.exists():
            return []
        file_size = self.file_path.stat().st_size
        if self._file_offset > file_size:
            # File was rotated or rewritten; restart from beginning.
            self._file_offset = 0
            self._fieldnames = None

        mtime = self.file_path.stat().st_mtime
        if mtime <= self._file_mtime:
            return []
        self._file_mtime = mtime
        events: list[dict] = []
        with self.file_path.open("r", newline="") as handle:
            handle.seek(self._file_offset)
            if self._fieldnames is None:
                reader = csv.DictReader(handle)
                self._fieldnames = reader.fieldnames
            else:
                reader = csv.DictReader(handle, fieldnames=self._fieldnames)
            for row in reader:
                if not row.get("block"):
                    continue
                try:
                    ts = row.get("ts") or datetime.utcnow().isoformat()
                    events.append(
                        {
                            "block": row["block"],
                            "energy_kwh": float(row["energy_kwh"]),
                            "occupancy": float(row.get("occupancy", 0)),
                            "temperature": float(row.get("temperature", 0)),
                            "ts": datetime.fromisoformat(ts),
                        }
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Skipping malformed CSV event %s: %s", row, exc)
            self._file_offset = handle.tell()
        return events


def synth_event(block: BlockProfile) -> dict:
    temperature = round(random.uniform(22, 36), 1)
    occupancy = random.randint(5, 95)

    baseline = block.baseline_kwh
    temp_factor = max(0.0, (temperature - 24) / 12) * 0.18
    occ_factor = (occupancy / 100) * 0.35
    anomaly = 0.0

    if random.random() < 0.22:
        anomaly = random.uniform(0.15, 0.55)

    energy = baseline * (1 + temp_factor + occ_factor + anomaly)

    return {
        "block": block.block_id,
        "energy_kwh": round(energy, 2),
        "occupancy": occupancy,
        "temperature": temperature,
        "ts": datetime.utcnow(),
    }


class EnergyPipeline:
    def __init__(
        self,
        store: BlockStateStore,
        blocks: List[BlockProfile],
        baseline_window_minutes: int = 10,
        baseline_hop_seconds: int = 5,
        stream_interval_seconds: float = 1.5,
        file_stream_path: Path | None = None,
    ):
        self.store = store
        self.blocks = blocks
        self.baseline_window_minutes = baseline_window_minutes
        self.baseline_hop_seconds = baseline_hop_seconds
        self.stream_interval_seconds = stream_interval_seconds
        self.file_stream_path = file_stream_path
        self._thread: Thread | None = None
        self._queue: queue.Queue = queue.Queue()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = Thread(target=self._run, daemon=True)
        self._thread.start()

    def ingest(self, payload: dict) -> None:
        self._queue.put(payload)

    def _log_baselines(self) -> None:
        if not self.blocks:
            logger.warning("No block profiles loaded. Waiting for external ingestion.")
            return
        for block in self.blocks:
            logger.info(
                "Baseline validation: block_id=%s block_label=%s baseline_kwh=%.2f",
                block.block_id,
                block.label,
                block.baseline_kwh,
            )
        first = self.blocks[0]
        self.store.set_baseline_example(first.block_id, first.label, first.baseline_kwh)

    def _run(self) -> None:
        self._log_baselines()

        class EnergySchema(pw.Schema):
            block: str
            energy_kwh: float
            occupancy: float
            temperature: float
            ts: pw.DateTimeNaive

        class WeatherSchema(pw.Schema):
            outside_temp: float
            humidity: float
            ts: pw.DateTimeNaive

        class TariffSchema(pw.Schema):
            tariff_inr_per_kwh: float
            ts: pw.DateTimeNaive

        class CarbonSchema(pw.Schema):
            carbon_intensity_kg_per_kwh: float
            ts: pw.DateTimeNaive

        subject = EnergySubject(
            self._queue,
            self.blocks,
            interval_seconds=self.stream_interval_seconds,
            file_path=self.file_stream_path,
        )
        events = pw.io.python.read(subject, schema=EnergySchema, autocommit_duration_ms=400)

        weather = pw.io.python.read(WeatherSubject(), schema=WeatherSchema, autocommit_duration_ms=1000)
        tariffs = pw.io.python.read(TariffSubject(), schema=TariffSchema, autocommit_duration_ms=1000)
        carbon = pw.io.python.read(CarbonSubject(), schema=CarbonSchema, autocommit_duration_ms=1000)

        windowed = (
            events.windowby(
                events.ts,
                window=pw.temporal.sliding(
                    duration=timedelta(minutes=self.baseline_window_minutes),
                    hop=timedelta(seconds=self.baseline_hop_seconds),
                ),
                instance=events.block,
            )
            .reduce(
                block=pw.this._pw_instance,
                window_end=pw.this._pw_window_end,
                baseline_kwh=pw.reducers.avg(pw.this.energy_kwh),
            )
        )

        baseline_join = events.asof_join(
            windowed,
            events.ts,
            windowed.window_end,
            events.block == windowed.block,
            how=pw.JoinMode.LEFT,
        )

        def safe_baseline(baseline: float | None, energy: float) -> float:
            if baseline is None or baseline <= 0:
                return energy
            return float(baseline)

        def deviation_pct(energy: float, baseline: float | None) -> float:
            if baseline is None or baseline <= 0:
                return 0.0
            return float((energy - baseline) / baseline * 100.0)

        def compute_savings(energy: float, baseline: float | None) -> float:
            if baseline is None or baseline <= 0:
                return 0.0
            return float(max(energy - baseline, 0.0))

        def classify(energy: float, baseline: float | None, occupancy: float, temperature: float) -> str:
            if baseline is None or baseline <= 0:
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

        def adr_recommendation(status_name: str, occupancy: float, temperature: float, deviation: float) -> tuple[str, str]:
            if status_name == "WASTE" and occupancy <= 20 and temperature < 30:
                return (
                    "Shed non-critical lighting and plug loads for 15 minutes.",
                    f"Low occupancy ({occupancy:.0f}%) with {deviation:.1f}% deviation indicates avoidable discretionary demand.",
                )
            if status_name == "WASTE" and occupancy <= 30 and temperature >= 30:
                return (
                    "Increase HVAC setpoint by +1.5C and enforce zone schedule.",
                    f"High deviation ({deviation:.1f}%) under low occupancy ({occupancy:.0f}%) suggests HVAC overcooling.",
                )
            if status_name == "POSSIBLE_WASTE":
                return (
                    "Run 10-minute adaptive load shed and observe post-action baseline convergence.",
                    f"Potentially avoidable load with {deviation:.1f}% deviation; targeted demand response recommended.",
                )
            return (
                "Activate temporary demand response for discretionary loads.",
                f"Contextual anomaly detected with {deviation:.1f}% deviation.",
            )

        baseline_expr = pw.apply(safe_baseline, windowed.baseline_kwh, events.energy_kwh)

        baseline_table = baseline_join.select(
            block=events.block,
            energy_kwh=events.energy_kwh,
            occupancy=events.occupancy,
            temperature=events.temperature,
            baseline_kwh=baseline_expr,
            deviation_pct=pw.apply(deviation_pct, events.energy_kwh, baseline_expr),
            savings_kwh=pw.apply(compute_savings, events.energy_kwh, baseline_expr),
            ts=events.ts,
        )

        weather_tariff_join = weather.asof_join(
            tariffs,
            weather.ts,
            tariffs.ts,
            how=pw.JoinMode.LEFT,
        )
        weather_tariff = weather_tariff_join.select(
            outside_temp=weather.outside_temp,
            humidity=weather.humidity,
            tariff_inr_per_kwh=tariffs.tariff_inr_per_kwh,
            ts=weather.ts,
        )

        env_join = weather_tariff.asof_join(
            carbon,
            weather_tariff.ts,
            carbon.ts,
            how=pw.JoinMode.LEFT,
        )
        env_table = env_join.select(
            outside_temp=weather_tariff.outside_temp,
            humidity=weather_tariff.humidity,
            tariff_inr_per_kwh=weather_tariff.tariff_inr_per_kwh,
            carbon_intensity_kg_per_kwh=carbon.carbon_intensity_kg_per_kwh,
            ts=weather_tariff.ts,
        )

        enriched_join = baseline_table.asof_join(
            env_table,
            baseline_table.ts,
            env_table.ts,
            how=pw.JoinMode.LEFT,
        )

        def safe_value(value: float | None, fallback: float) -> float:
            if value is None:
                return fallback
            return float(value)

        status = enriched_join.select(
            block=baseline_table.block,
            energy_kwh=baseline_table.energy_kwh,
            occupancy=baseline_table.occupancy,
            temperature=baseline_table.temperature,
            baseline_kwh=baseline_table.baseline_kwh,
            deviation_pct=baseline_table.deviation_pct,
            savings_kwh=baseline_table.savings_kwh,
            tariff_inr_per_kwh=pw.apply(safe_value, env_table.tariff_inr_per_kwh, 6.5),
            carbon_intensity_kg_per_kwh=pw.apply(safe_value, env_table.carbon_intensity_kg_per_kwh, 0.82),
            status=pw.apply(
                classify,
                baseline_table.energy_kwh,
                baseline_table.baseline_kwh,
                baseline_table.occupancy,
                baseline_table.temperature,
            ),
            outside_temp=pw.apply(safe_value, env_table.outside_temp, 28.0),
            humidity=pw.apply(safe_value, env_table.humidity, 55.0),
            ts=baseline_table.ts,
        )

        label_map: Dict[str, str] = {block.block_id: block.label for block in self.blocks}

        def on_change(key, row, time, is_addition):  # noqa: ARG001
            if not is_addition:
                return
            block_id = row["block"]
            event_ts = row.get("ts")
            if hasattr(event_ts, "isoformat"):
                updated_at = event_ts.isoformat()
            else:
                updated_at = datetime.utcnow().isoformat()
            tariff_rate = float(row.get("tariff_inr_per_kwh") or 6.5)
            carbon_intensity = float(row.get("carbon_intensity_kg_per_kwh") or 0.82)
            cost_inr = float(row["energy_kwh"]) * tariff_rate
            waste_cost = float(row["savings_kwh"]) * tariff_rate
            co2_kg = float(row["energy_kwh"]) * carbon_intensity

            snapshot = BlockSnapshot(
                block_id=block_id,
                block_label=label_map.get(block_id, block_id),
                energy_kwh=float(row["energy_kwh"]),
                baseline_kwh=float(row["baseline_kwh"]),
                occupancy=float(row["occupancy"]),
                temperature=float(row["temperature"]),
                status=str(row["status"]),
                savings_kwh=float(row["savings_kwh"]),
                deviation_pct=float(row["deviation_pct"]),
                tariff_inr_per_kwh=tariff_rate,
                cost_inr=cost_inr,
                waste_cost_inr=waste_cost,
                carbon_intensity_kg_per_kwh=carbon_intensity,
                co2_kg=co2_kg,
                root_cause=build_root_cause(
                    float(row["energy_kwh"]),
                    float(row["baseline_kwh"]),
                    float(row["occupancy"]),
                    float(row["temperature"]),
                ),
                forecast_peak_deviation=0.0,
                forecast_waste_risk="LOW",
                updated_at=updated_at,
            )
            self.store.update(snapshot)
            self.store.set_environment(
                outside_temp=float(row.get("outside_temp") or 28.0),
                humidity=float(row.get("humidity") or 55.0),
                tariff_inr_per_kwh=tariff_rate,
                carbon_intensity_kg_per_kwh=carbon_intensity,
            )

            status_name = str(row["status"])
            occupancy = float(row["occupancy"])
            deviation = float(row["deviation_pct"])
            should_propose = status_name == "WASTE" or (
                status_name == "POSSIBLE_WASTE" and (occupancy <= 30 or tariff_rate >= 7.0)
            )
            if should_propose:
                recommendation, rationale = adr_recommendation(
                    status_name,
                    occupancy=occupancy,
                    temperature=float(row["temperature"]),
                    deviation=deviation,
                )
                raw_savings = float(row["savings_kwh"])
                baseline = float(row["baseline_kwh"])
                proposed_reduction = max(min(raw_savings * 0.75, baseline * 0.35), 0.5)
                self.store.propose_action(
                    block_id=block_id,
                    block_label=label_map.get(block_id, block_id),
                    mode="AUTOMATED",
                    recommendation=recommendation,
                    rationale=rationale,
                    source="pathway_adr_policy_v1",
                    dr_event_code=f"ADR-{datetime.utcnow().strftime('%H%M%S')}",
                    proposed_reduction_kwh=proposed_reduction,
                    expected_inr_per_hour=proposed_reduction * tariff_rate,
                    expected_co2_kg_per_hour=proposed_reduction * carbon_intensity,
                )

        waste_events = status.filter(status.status == "WASTE")
        waste_window = (
            waste_events.windowby(
                waste_events.ts,
                window=pw.temporal.sliding(duration=timedelta(minutes=5), hop=timedelta(seconds=30)),
                instance=waste_events.block,
            )
            .reduce(
                block=pw.this._pw_instance,
                count=pw.reducers.count(),
            )
        )

        def on_alert(_key, row, _time, is_addition):  # noqa: ARG001
            if not is_addition:
                return
            if row["count"] < 3:
                return
            block_id = row["block"]
            self.store.raise_alert(
                block_id=block_id,
                block_label=label_map.get(block_id, block_id),
                severity="HIGH",
                message="Persistent WASTE detected for 5 minutes.",
            )

        pw.io.subscribe(status, on_change)
        pw.io.subscribe(waste_window, on_alert)
        pw.run()


class WeatherSubject(pw.io.python.ConnectorSubject):
    def __init__(self, interval_seconds: int = 120):
        super().__init__()
        self.interval_seconds = interval_seconds

    def run(self) -> None:
        while True:
            outside_temp, humidity = fetch_weather()
            self.next(outside_temp=outside_temp, humidity=humidity, ts=datetime.utcnow())
            time.sleep(self.interval_seconds)


class TariffSubject(pw.io.python.ConnectorSubject):
    def __init__(self, interval_seconds: int = 60):
        super().__init__()
        self.interval_seconds = interval_seconds

    def run(self) -> None:
        while True:
            tariff_rate = current_tariff_rate()
            self.next(tariff_inr_per_kwh=tariff_rate, ts=datetime.utcnow())
            time.sleep(self.interval_seconds)


class CarbonSubject(pw.io.python.ConnectorSubject):
    def __init__(self, interval_seconds: int = 120):
        super().__init__()
        self.interval_seconds = interval_seconds

    def run(self) -> None:
        while True:
            intensity = current_carbon_intensity()
            self.next(carbon_intensity_kg_per_kwh=intensity, ts=datetime.utcnow())
            time.sleep(self.interval_seconds)


def fetch_weather() -> tuple[float, float]:
    api_url = Path(__file__).resolve().parent / "data" / "weather.json"
    if api_url.exists():
        try:
            data = json.loads(api_url.read_text())
            return float(data.get("outside_temp", 28.0)), float(data.get("humidity", 55.0))
        except Exception:  # noqa: BLE001
            return 28.0, 55.0
    # fallback simulation
    base_temp = 27 + random.uniform(-2, 4)
    humidity = 50 + random.uniform(-10, 15)
    return round(base_temp, 1), round(humidity, 1)


def current_tariff_rate() -> float:
    schedule_path = Path(__file__).resolve().parent / "data" / "tariffs.json"
    if schedule_path.exists():
        try:
            schedule = json.loads(schedule_path.read_text()).get("schedule", [])
            now = datetime.now()
            current = now.hour * 60 + now.minute
            for slot in schedule:
                start_h, start_m = map(int, slot["start"].split(":"))
                end_h, end_m = map(int, slot["end"].split(":"))
                start = start_h * 60 + start_m
                end = end_h * 60 + end_m
                if start <= current < end:
                    return float(slot["rate"])
        except Exception:  # noqa: BLE001
            return 6.5
    return 6.5


def current_carbon_intensity() -> float:
    schedule_path = Path(__file__).resolve().parent / "data" / "carbon_intensity.json"
    if schedule_path.exists():
        try:
            schedule = json.loads(schedule_path.read_text()).get("schedule", [])
            now = datetime.now()
            current = now.hour * 60 + now.minute
            for slot in schedule:
                start_h, start_m = map(int, slot["start"].split(":"))
                end_h, end_m = map(int, slot["end"].split(":"))
                start = start_h * 60 + start_m
                end = end_h * 60 + end_m
                if start <= current < end:
                    return float(slot["intensity"])
        except Exception:  # noqa: BLE001
            return 0.82
    return 0.82


def build_root_cause(energy: float, baseline: float, occupancy: float, temperature: float) -> str:
    if baseline <= 0:
        return "Insufficient baseline data."
    deviation = (energy - baseline) / baseline * 100
    if deviation < 10:
        return "Energy usage is aligned with baseline."
    if occupancy < 25 and temperature < 30:
        return "Low occupancy with moderate temperature indicates avoidable load."
    if occupancy < 25 and temperature >= 30:
        return "Low occupancy but high ambient heat suggests HVAC overuse."
    if occupancy > 60 and temperature >= 30:
        return "High occupancy and heat justify higher energy draw."
    return "Mixed context; investigate equipment or scheduling."
