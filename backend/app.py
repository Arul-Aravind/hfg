from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime
from pathlib import Path
from threading import Thread
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from .assistant import Copilot
from .lstm_predictor import LSTMAnomalyPredictor
from .pipeline import EnergyPipeline, load_blocks
from .security import create_access_token, decode_token, hash_password, verify_password
from .store import BlockSnapshot, BlockStateStore, DemandResponseAction

DATA_DIR = Path(__file__).resolve().parent / "data"
USERS_FILE = DATA_DIR / "users.json"
BLOCKS_FILE = DATA_DIR / "blocks.json"
DOCS_DIR = Path(__file__).resolve().parent / "knowledge"

JWT_SECRET = "dev-change-this-secret"
ACCESS_TOKEN_EXPIRE_MINUTES = 720

DEFAULT_ADMIN = {
    "username": "admin",
    "password": "admin123",
    "role": "admin",
    "org_id": "org_campus",
    "org_name": "CIT Campus",
}


class LoginRequest(BaseModel):
    username: str
    password: str


class IngestEvent(BaseModel):
    block: str
    energy_kwh: float
    occupancy: float
    temperature: float
    ts: Optional[datetime] = None


class AssistantRequest(BaseModel):
    question: str


class ExplainRequest(BaseModel):
    block_id: str


class ActionProposeRequest(BaseModel):
    block_id: Optional[str] = None
    recommendation: Optional[str] = None
    rationale: Optional[str] = None
    reduction_kwh: Optional[float] = None


class User(BaseModel):
    username: str
    role: str
    org_id: str
    org_name: str
    password_hash: str


security = HTTPBearer()

app = FastAPI(title="EnergySense API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


USER_CACHE: dict[str, User] = {}


def ensure_users() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if USERS_FILE.exists():
        raw = json.loads(USERS_FILE.read_text())
        for item in raw:
            USER_CACHE[item["username"]] = User(**item)
        return

    password_hash = hash_password(DEFAULT_ADMIN["password"])
    user = User(
        username=DEFAULT_ADMIN["username"],
        role=DEFAULT_ADMIN["role"],
        org_id=DEFAULT_ADMIN["org_id"],
        org_name=DEFAULT_ADMIN["org_name"],
        password_hash=password_hash,
    )
    USERS_FILE.write_text(json.dumps([user.model_dump()], indent=2))
    USER_CACHE[user.username] = user


def get_user(username: str) -> Optional[User]:
    return USER_CACHE.get(username)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    token = credentials.credentials
    try:
        payload = decode_token(token, JWT_SECRET)
        username = payload.get("sub")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    user = get_user(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def validate_token(token: str) -> User:
    try:
        payload = decode_token(token, JWT_SECRET)
        username = payload.get("sub")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    user = get_user(username)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


blocks = load_blocks(BLOCKS_FILE)
store = BlockStateStore(org_id=DEFAULT_ADMIN["org_id"], org_name=DEFAULT_ADMIN["org_name"])
pipeline = EnergyPipeline(
    store=store,
    blocks=blocks,
    file_stream_path=DATA_DIR / "sensor_stream.csv",
)
copilot = Copilot(DOCS_DIR)
lstm_predictor = LSTMAnomalyPredictor(
    sequence_length=18,
    horizon_steps=4,
    min_samples=80,
    retrain_cooldown_seconds=45,
)


@app.on_event("startup")
def startup() -> None:
    ensure_users()
    pipeline.start()
    start_lstm_training()
    start_reporting()


def compute_forecast(history: list[dict]) -> tuple[float, str]:
    if len(history) < 2:
        return 0.0, "LOW"
    first = history[0]
    last = history[-1]
    try:
        t1 = datetime.fromisoformat(first["ts"])
        t2 = datetime.fromisoformat(last["ts"])
    except Exception:  # noqa: BLE001
        return 0.0, "LOW"
    minutes = max((t2 - t1).total_seconds() / 60.0, 1.0)
    slope = (last["deviation_pct"] - first["deviation_pct"]) / minutes
    predicted = last["deviation_pct"] + slope * 60
    risk = "LOW"
    if predicted > 20:
        risk = "HIGH"
    elif predicted > 12:
        risk = "MEDIUM"
    return round(predicted, 1), risk


def _risk_rank(label: str) -> int:
    return {"LOW": 0, "MEDIUM": 1, "HIGH": 2}.get(label, 0)


def _max_risk(left: str, right: str) -> str:
    return left if _risk_rank(left) >= _risk_rank(right) else right


def start_lstm_training() -> None:
    def worker() -> None:
        while True:
            try:
                history_map = store.history_map()
                if history_map:
                    lstm_predictor.train(history_map)
            except Exception:  # noqa: BLE001
                # Keep service alive even if ML retraining fails intermittently.
                pass
            time.sleep(20)

    thread = Thread(target=worker, daemon=True)
    thread.start()


def start_reporting() -> None:
    def worker() -> None:
        while True:
            admin = get_user(DEFAULT_ADMIN["username"])
            if not admin:
                time.sleep(60)
                continue
            snapshot = build_snapshot(admin)
            daily = copilot.generate_report(snapshot, "daily")
            weekly = copilot.generate_report(snapshot, "weekly")
            store.set_report("daily", daily)
            store.set_report("weekly", weekly)
            time.sleep(300)

    thread = Thread(target=worker, daemon=True)
    thread.start()


@app.get("/health")
def health() -> dict:
    model_status = lstm_predictor.status()
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "predictive_model": {
            "model_name": model_status.get("model_name"),
            "model_ready": bool(model_status.get("model_ready")),
            "training_samples": int(model_status.get("training_samples") or 0),
            "trained_with_lstm": bool(model_status.get("trained_with_lstm")),
        },
    }


@app.post("/auth/login")
def login(payload: LoginRequest) -> dict:
    user = get_user(payload.username)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(
        subject=user.username,
        secret_key=JWT_SECRET,
        expires_minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
        extra={"role": user.role, "org_id": user.org_id},
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "role": user.role,
            "org_id": user.org_id,
            "org_name": user.org_name,
        },
    }


@app.get("/auth/me")
def me(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "username": current_user.username,
        "role": current_user.role,
        "org_id": current_user.org_id,
        "org_name": current_user.org_name,
    }


def build_snapshot(user: User) -> dict:
    blocks_snapshot = store.snapshot()
    stats = dict(store.stats())
    environment = store.environment()
    pathway_state = store.pathway_state()
    actions = [serialize_action(action) for action in store.list_actions(limit=20)]
    adr_summary = store.adr_summary()
    model_status = lstm_predictor.status()

    blocks: list[dict] = []
    predicted_avoidable_total = 0.0
    predictive_high_risk_blocks = 0

    for block in blocks_snapshot:
        history_points = store.history(block.block_id)
        history_payload = [
            {
                "ts": point.ts.isoformat(),
                "deviation_pct": round(point.deviation_pct, 1),
                "energy_kwh": round(point.energy_kwh, 2),
                "baseline_kwh": round(point.baseline_kwh, 2),
            }
            for point in history_points
        ]

        linear_peak, linear_risk = compute_forecast(history_payload)
        prediction = lstm_predictor.predict(
            history_points,
            baseline_kwh=block.baseline_kwh,
            occupancy=block.occupancy,
            temperature=block.temperature,
        )
        forecast_risk = _max_risk(linear_risk, prediction.risk)
        forecast_peak = max(linear_peak, prediction.predicted_deviation_pct)
        predicted_avoidable_total += prediction.avoidable_kwh
        if prediction.risk == "HIGH":
            predictive_high_risk_blocks += 1

        blocks.append(
            {
                "block_id": block.block_id,
                "block_label": block.block_label,
                "energy_kwh": round(block.energy_kwh, 2),
                "baseline_kwh": round(block.baseline_kwh, 2),
                "occupancy": round(block.occupancy, 1),
                "temperature": round(block.temperature, 1),
                "status": block.status,
                "savings_kwh": round(block.savings_kwh, 2),
                "deviation_pct": round(block.deviation_pct, 1),
                "tariff_inr_per_kwh": round(block.tariff_inr_per_kwh, 2),
                "cost_inr": round(block.cost_inr, 2),
                "waste_cost_inr": round(block.waste_cost_inr, 2),
                "carbon_intensity_kg_per_kwh": round(block.carbon_intensity_kg_per_kwh, 3),
                "co2_kg": round(block.co2_kg, 2),
                "root_cause": block.root_cause,
                "updated_at": block.updated_at,
                "history": history_payload,
                "forecast_peak_deviation": round(float(forecast_peak), 1),
                "forecast_waste_risk": forecast_risk,
                "lstm_predicted_deviation_pct": prediction.predicted_deviation_pct,
                "lstm_anomaly_probability": prediction.anomaly_probability,
                "lstm_risk": prediction.risk,
                "lstm_avoidable_kwh": prediction.avoidable_kwh,
                "lstm_confidence": prediction.confidence,
                "lstm_model_name": prediction.model_name,
                "lstm_model_ready": prediction.model_ready,
                "lstm_reason": prediction.reason,
            }
        )

    stats["predicted_avoidable_kwh_next_hour"] = round(predicted_avoidable_total, 2)
    stats["predictive_high_risk_blocks"] = predictive_high_risk_blocks

    last_train_unix = model_status.get("last_train_unix")
    last_trained_at = None
    if isinstance(last_train_unix, (int, float)) and last_train_unix > 0:
        last_trained_at = datetime.utcfromtimestamp(last_train_unix).isoformat()

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "org": {"id": user.org_id, "name": user.org_name},
        "blocks": blocks,
        "totals": stats,
        "environment": environment,
        "pathway_state": pathway_state,
        "actions": actions,
        "adr_summary": adr_summary,
        "predictive_state": {
            "model_ready": bool(model_status.get("model_ready")),
            "model_name": str(model_status.get("model_name") or "LSTM-Hybrid-v1"),
            "training_samples": int(model_status.get("training_samples") or 0),
            "trained_with_lstm": bool(model_status.get("trained_with_lstm")),
            "last_trained_at": last_trained_at,
            "sequence_length": lstm_predictor.sequence_length,
            "horizon_steps": lstm_predictor.horizon_steps,
        },
    }


def serialize_action(action: DemandResponseAction) -> dict:
    return {
        "id": action.id,
        "block_id": action.block_id,
        "block_label": action.block_label,
        "mode": action.mode,
        "status": action.status,
        "recommendation": action.recommendation,
        "rationale": action.rationale,
        "source": action.source,
        "dr_event_code": action.dr_event_code,
        "proposed_reduction_kwh": action.proposed_reduction_kwh,
        "expected_inr_per_hour": action.expected_inr_per_hour,
        "expected_co2_kg_per_hour": action.expected_co2_kg_per_hour,
        "proposed_at": action.proposed_at,
        "executed_at": action.executed_at,
        "verified_at": action.verified_at,
        "resolved_at": action.resolved_at,
        "operator": action.operator,
        "pre_energy_kwh": action.pre_energy_kwh,
        "post_energy_kwh": action.post_energy_kwh,
        "verified_savings_kwh": action.verified_savings_kwh,
        "verified_savings_inr": action.verified_savings_inr,
        "verified_co2_kg": action.verified_co2_kg,
        "verification_note": action.verification_note,
    }


@app.get("/dashboard/current-status")
def current_status(current_user: User = Depends(get_current_user)) -> dict:
    return build_snapshot(current_user)


@app.get("/dashboard/stream")
async def stream_dashboard(token: str = Query(...)) -> StreamingResponse:
    user = validate_token(token)

    async def event_generator():
        while True:
            payload = build_snapshot(user)
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/ingest")
def ingest_events(
    events: List[IngestEvent],
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    for event in events:
        payload = event.model_dump()
        if payload["ts"] is None:
            payload["ts"] = datetime.utcnow()
        pipeline.ingest(payload)

    return {"status": "queued", "count": len(events)}


@app.get("/alerts")
def list_alerts(current_user: User = Depends(get_current_user)) -> dict:
    alerts = [
        {
            "id": alert.id,
            "block_id": alert.block_id,
            "block_label": alert.block_label,
            "severity": alert.severity,
            "message": alert.message,
            "created_at": alert.created_at,
            "last_seen": alert.last_seen,
            "acknowledged": alert.acknowledged,
            "resolved": alert.resolved,
            "count": alert.count,
            "ack_by": alert.ack_by,
            "resolved_by": alert.resolved_by,
        }
        for alert in store.list_alerts()
    ]
    return {"alerts": alerts}


@app.post("/alerts/{alert_id}/ack")
def acknowledge_alert(alert_id: str, current_user: User = Depends(get_current_user)) -> dict:
    alert = store.acknowledge_alert(alert_id, current_user.username)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "acknowledged", "alert_id": alert_id}


@app.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, current_user: User = Depends(get_current_user)) -> dict:
    alert = store.resolve_alert(alert_id, current_user.username)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "resolved", "alert_id": alert_id}


@app.get("/actions")
def list_actions(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "actions": [serialize_action(action) for action in store.list_actions(limit=50)],
        "summary": store.adr_summary(),
    }


@app.post("/actions/propose")
def propose_action(payload: ActionProposeRequest, current_user: User = Depends(get_current_user)) -> dict:
    blocks_snapshot = store.snapshot()
    if not blocks_snapshot:
        raise HTTPException(status_code=400, detail="No block telemetry available yet")

    chosen: Optional[BlockSnapshot] = None
    if payload.block_id:
        chosen = next((b for b in blocks_snapshot if b.block_id == payload.block_id), None)
        if not chosen:
            raise HTTPException(status_code=404, detail="Block not found")
    else:
        waste_blocks = [b for b in blocks_snapshot if b.status in {"WASTE", "POSSIBLE_WASTE"}]
        chosen = max(waste_blocks, key=lambda b: b.deviation_pct) if waste_blocks else max(
            blocks_snapshot, key=lambda b: b.deviation_pct
        )

    recommendation = payload.recommendation or (
        "Initiate 15-minute demand response: raise HVAC setpoint by 1C and shed non-critical discretionary load."
    )
    rationale = payload.rationale or (
        f"{chosen.block_label} is {chosen.status} with {chosen.deviation_pct:.1f}% deviation."
    )
    reduction_kwh = payload.reduction_kwh if payload.reduction_kwh is not None else max(chosen.savings_kwh * 0.8, 0.5)

    action = store.propose_action(
        block_id=chosen.block_id,
        block_label=chosen.block_label,
        mode="MANUAL",
        recommendation=recommendation,
        rationale=rationale,
        source="manual_adr_event",
        dr_event_code=f"MANUAL-{datetime.utcnow().strftime('%H%M%S')}",
        proposed_reduction_kwh=reduction_kwh,
        expected_inr_per_hour=reduction_kwh * chosen.tariff_inr_per_kwh,
        expected_co2_kg_per_hour=reduction_kwh * chosen.carbon_intensity_kg_per_kwh,
    )
    return {"action": serialize_action(action)}


@app.post("/actions/{action_id}/execute")
def execute_action(action_id: str, current_user: User = Depends(get_current_user)) -> dict:
    action = store.execute_action(action_id, current_user.username)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"action": serialize_action(action)}


@app.post("/actions/{action_id}/verify")
def verify_action(action_id: str, current_user: User = Depends(get_current_user)) -> dict:
    action = store.verify_action(action_id, current_user.username)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"action": serialize_action(action)}


@app.post("/actions/{action_id}/resolve")
def resolve_adr_action(action_id: str, current_user: User = Depends(get_current_user)) -> dict:
    action = store.resolve_action(action_id, current_user.username)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"action": serialize_action(action)}


@app.post("/assistant/ask")
def assistant_ask(payload: AssistantRequest, current_user: User = Depends(get_current_user)) -> dict:
    snapshot = build_snapshot(current_user)
    return copilot.ask(payload.question, snapshot)


@app.post("/assistant/explain")
def assistant_explain(payload: ExplainRequest, current_user: User = Depends(get_current_user)) -> dict:
    snapshot = build_snapshot(current_user)
    return copilot.explain(payload.block_id, snapshot)


@app.get("/reports")
def get_reports(current_user: User = Depends(get_current_user)) -> dict:
    return {"reports": [report.__dict__ for report in store.get_reports()]}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
