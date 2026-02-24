from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from threading import Lock
from typing import Dict, List

import numpy as np

from .store import HistoryPoint

logger = logging.getLogger(__name__)

try:
    import tensorflow as tf  # type: ignore
except Exception:  # noqa: BLE001
    tf = None


def _sigmoid(value: float) -> float:
    return float(1.0 / (1.0 + np.exp(-value)))


@dataclass
class LSTMPrediction:
    predicted_deviation_pct: float
    anomaly_probability: float
    risk: str
    avoidable_kwh: float
    confidence: float
    model_name: str
    model_ready: bool
    reason: str


class LSTMAnomalyPredictor:
    def __init__(
        self,
        sequence_length: int = 18,
        horizon_steps: int = 4,
        min_samples: int = 80,
        retrain_cooldown_seconds: int = 45,
    ):
        self.sequence_length = sequence_length
        self.horizon_steps = horizon_steps
        self.min_samples = min_samples
        self.retrain_cooldown_seconds = retrain_cooldown_seconds

        self._lock = Lock()
        self._model = None
        self._linear_weights: np.ndarray | None = None
        self._feature_mean: np.ndarray | None = None
        self._feature_std: np.ndarray | None = None
        self._target_mean = 0.0
        self._target_std = 1.0
        self._trained_with_lstm = False
        self._model_ready = False
        self._model_name = "LSTM-Hybrid-v1"
        self._last_train_time = 0.0
        self._training_samples = 0

        if tf is not None:
            try:
                tf.random.set_seed(42)
            except Exception:  # noqa: BLE001
                pass

    def status(self) -> dict:
        with self._lock:
            return {
                "model_ready": self._model_ready,
                "model_name": self._model_name,
                "training_samples": self._training_samples,
                "trained_with_lstm": self._trained_with_lstm,
                "last_train_unix": self._last_train_time,
            }

    def train(self, history_map: Dict[str, List[HistoryPoint]]) -> None:
        now = time.time()
        with self._lock:
            if now - self._last_train_time < self.retrain_cooldown_seconds:
                return
            self._last_train_time = now

        data = self._prepare_training_data(history_map)
        if data is None:
            return
        x_train, y_train = data

        with self._lock:
            self._training_samples = int(len(x_train))

        if len(x_train) < self.min_samples:
            self._train_fallback_regressor(x_train, y_train)
            return

        if tf is None:
            self._train_fallback_regressor(x_train, y_train)
            return

        try:
            self._train_lstm(x_train, y_train)
        except Exception as exc:  # noqa: BLE001
            logger.warning("LSTM training failed, falling back to lightweight regressor: %s", exc)
            self._train_fallback_regressor(x_train, y_train)

    def predict(
        self,
        history: List[HistoryPoint],
        baseline_kwh: float,
        occupancy: float,
        temperature: float,
    ) -> LSTMPrediction:
        if len(history) < 2:
            return LSTMPrediction(
                predicted_deviation_pct=0.0,
                anomaly_probability=0.0,
                risk="LOW",
                avoidable_kwh=0.0,
                confidence=0.05,
                model_name=self._model_name,
                model_ready=self._model_ready,
                reason="Insufficient sequence history for LSTM inference.",
            )

        sequence = self._build_sequence_features(history)[-self.sequence_length :]
        predicted_dev = self._predict_next_deviation(sequence)

        # Context adjustment for avoidable anomalies.
        predicted_dev += max(0.0, temperature - 30.0) * 0.45
        predicted_dev += max(0.0, 25.0 - occupancy) * 0.08

        anomaly_probability = _sigmoid((predicted_dev - 10.0) / 4.5)
        if anomaly_probability >= 0.75:
            risk = "HIGH"
        elif anomaly_probability >= 0.45:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        avoidable_kwh = max(predicted_dev - 8.0, 0.0) / 100.0 * max(baseline_kwh, 1.0) * 1.4

        seq_quality = min(len(sequence) / max(self.sequence_length, 1), 1.0)
        confidence = 0.35 + 0.4 * seq_quality
        confidence += 0.2 if self._trained_with_lstm else 0.07
        confidence = float(max(0.05, min(confidence, 0.99)))

        reason = "Sequence trend indicates avoidable anomaly risk."
        if not self._model_ready:
            reason = "Model warming up; using temporal fallback estimate."
        elif self._trained_with_lstm:
            reason = "LSTM sequence model predicts elevated avoidable anomaly probability."

        return LSTMPrediction(
            predicted_deviation_pct=round(float(predicted_dev), 2),
            anomaly_probability=round(float(anomaly_probability), 3),
            risk=risk,
            avoidable_kwh=round(float(avoidable_kwh), 3),
            confidence=round(confidence, 3),
            model_name=self._model_name,
            model_ready=self._model_ready,
            reason=reason,
        )

    def _prepare_training_data(self, history_map: Dict[str, List[HistoryPoint]]) -> tuple[np.ndarray, np.ndarray] | None:
        x_samples: list[np.ndarray] = []
        y_samples: list[float] = []

        for history in history_map.values():
            if len(history) < self.sequence_length + self.horizon_steps:
                continue
            series = self._build_sequence_features(history)
            for end_idx in range(self.sequence_length, len(series) - self.horizon_steps + 1):
                seq = series[end_idx - self.sequence_length : end_idx]
                target = series[end_idx + self.horizon_steps - 1, 0]  # future deviation%
                x_samples.append(seq)
                y_samples.append(float(target))

        if not x_samples:
            return None

        x_arr = np.asarray(x_samples, dtype=np.float32)
        y_arr = np.asarray(y_samples, dtype=np.float32)
        return x_arr, y_arr

    def _build_sequence_features(self, history: List[HistoryPoint]) -> np.ndarray:
        ordered = sorted(history, key=lambda point: point.ts)
        rows = []
        for point in ordered:
            delta = point.energy_kwh - point.baseline_kwh
            rows.append(
                [
                    point.deviation_pct,
                    point.energy_kwh,
                    point.baseline_kwh,
                    point.occupancy,
                    point.temperature,
                    delta,
                ]
            )
        return np.asarray(rows, dtype=np.float32)

    def _train_lstm(self, x_train: np.ndarray, y_train: np.ndarray) -> None:
        feature_mean = x_train.mean(axis=(0, 1))
        feature_std = x_train.std(axis=(0, 1)) + 1e-6
        x_norm = (x_train - feature_mean) / feature_std

        target_mean = float(y_train.mean())
        target_std = float(y_train.std() + 1e-6)
        y_norm = (y_train - target_mean) / target_std

        if self._model is None:
            self._model = tf.keras.Sequential(
                [
                    tf.keras.layers.Input(shape=(self.sequence_length, x_train.shape[2])),
                    tf.keras.layers.LSTM(64, return_sequences=True),
                    tf.keras.layers.Dropout(0.2),
                    tf.keras.layers.LSTM(32),
                    tf.keras.layers.Dense(24, activation="relu"),
                    tf.keras.layers.Dense(1),
                ]
            )
            self._model.compile(
                optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
                loss="mse",
                metrics=["mae"],
            )

        callbacks = [tf.keras.callbacks.EarlyStopping(monitor="loss", patience=2, restore_best_weights=True)]
        batch_size = max(8, min(32, len(x_norm) // 4 or 8))

        self._model.fit(
            x_norm,
            y_norm,
            epochs=8,
            batch_size=batch_size,
            verbose=0,
            callbacks=callbacks,
        )

        with self._lock:
            self._feature_mean = feature_mean
            self._feature_std = feature_std
            self._target_mean = target_mean
            self._target_std = target_std
            self._trained_with_lstm = True
            self._model_ready = True
            self._model_name = "LSTM-SeqForecaster-v1"

    def _train_fallback_regressor(self, x_train: np.ndarray, y_train: np.ndarray) -> None:
        summary = self._summary_features(x_train)
        design = np.hstack([summary, np.ones((summary.shape[0], 1), dtype=np.float32)])
        weights, *_ = np.linalg.lstsq(design, y_train, rcond=None)
        with self._lock:
            self._linear_weights = weights
            self._trained_with_lstm = False
            self._model_ready = True
            self._model_name = "LSTM-HybridFallback-v1"

    def _predict_next_deviation(self, sequence: np.ndarray) -> float:
        if len(sequence) < 2:
            return 0.0

        with self._lock:
            model = self._model
            feature_mean = self._feature_mean
            feature_std = self._feature_std
            target_mean = self._target_mean
            target_std = self._target_std
            trained_with_lstm = self._trained_with_lstm
            linear_weights = self._linear_weights

        if model is not None and trained_with_lstm and feature_mean is not None and feature_std is not None and tf is not None:
            seq = sequence[-self.sequence_length :]
            if len(seq) < self.sequence_length:
                pad = np.repeat(seq[:1], self.sequence_length - len(seq), axis=0)
                seq = np.vstack([pad, seq])
            x_norm = (seq - feature_mean) / feature_std
            pred_norm = float(model.predict(x_norm[np.newaxis, :, :], verbose=0)[0][0])
            return pred_norm * target_std + target_mean

        if linear_weights is not None:
            seq_input = sequence[-self.sequence_length :]
            if len(seq_input) < self.sequence_length:
                pad = np.repeat(seq_input[:1], self.sequence_length - len(seq_input), axis=0)
                seq_input = np.vstack([pad, seq_input])
            summary = self._summary_features(seq_input[np.newaxis, :, :])[0]
            design = np.append(summary, 1.0)
            return float(np.dot(design, linear_weights))

        # Final guard fallback when no model has been trained yet.
        recent = sequence[:, 0]
        if len(recent) < 3:
            return float(recent[-1])
        trend = recent[-1] - np.mean(recent[-3:])
        return float(recent[-1] + trend * 2.5)

    def _summary_features(self, x_data: np.ndarray) -> np.ndarray:
        last_dev = x_data[:, -1, 0]
        avg_dev = x_data[:, :, 0].mean(axis=1)
        slope = x_data[:, -1, 0] - x_data[:, 0, 0]
        last_occ = x_data[:, -1, 3]
        last_temp = x_data[:, -1, 4]
        last_delta = x_data[:, -1, 5]
        return np.stack([last_dev, avg_dev, slope, last_occ, last_temp, last_delta], axis=1).astype(np.float32)
