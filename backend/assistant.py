from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

try:
    from openai import OpenAI  # type: ignore
except Exception:  # noqa: BLE001
    OpenAI = None


logger = logging.getLogger(__name__)


@dataclass
class Citation:
    source: str
    snippet: str


class DocumentIndex:
    def __init__(self, docs_path: Path):
        self.docs_path = docs_path
        self._docs: List[str] = []
        self._sources: List[str] = []
        self._vectorizer: Optional[TfidfVectorizer] = None
        self._matrix = None
        self._last_scan = 0.0

    def refresh(self) -> None:
        latest_mtime = max((p.stat().st_mtime for p in self.docs_path.glob("*.md")), default=0.0)
        if latest_mtime <= self._last_scan:
            return
        self._last_scan = latest_mtime

        docs: List[str] = []
        sources: List[str] = []
        for path in sorted(self.docs_path.glob("*.md")):
            docs.append(path.read_text())
            sources.append(path.name)
        if not docs:
            return

        self._docs = docs
        self._sources = sources
        self._vectorizer = TfidfVectorizer(stop_words="english")
        self._matrix = self._vectorizer.fit_transform(docs)

    def query(self, question: str, top_k: int = 3) -> List[Citation]:
        self.refresh()
        if not self._docs or not self._vectorizer or self._matrix is None:
            return []
        query_vec = self._vectorizer.transform([question])
        scores = (self._matrix @ query_vec.T).toarray().ravel()
        top_indices = np.argsort(scores)[::-1][:top_k]
        citations: List[Citation] = []
        for idx in top_indices:
            if scores[idx] <= 0:
                continue
            snippet = self._docs[idx][:240].replace("\n", " ")
            citations.append(Citation(source=self._sources[idx], snippet=snippet))
        return citations


class Copilot:
    def __init__(self, docs_path: Path):
        self.index = DocumentIndex(docs_path)
        self.client = None
        self.model = "gpt-4o-mini"
        self.gemini_model = "gemini-2.0-flash"
        self.gemini_api_key = (
            os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
        )
        self._gemini_models_cache: list[str] = []
        self._gemini_models_cache_at = 0.0
        if OpenAI:
            try:
                api_key = os.getenv("OPENAI_API_KEY")
                base_url = os.getenv("OPENAI_BASE_URL")
                if api_key:
                    self.client = OpenAI(api_key=api_key, base_url=base_url)
            except Exception:  # noqa: BLE001
                self.client = None

    def ask(self, question: str, snapshot: dict) -> dict:
        citations = self.index.query(question)
        context = self._build_context(snapshot)
        answer = self._generate_answer(question, citations, context)
        return {
            "answer": answer,
            "citations": [c.__dict__ for c in citations],
        }

    def explain(self, block_id: str, snapshot: dict) -> dict:
        block = next((b for b in snapshot.get("blocks", []) if b.get("block_id") == block_id), None)
        if not block:
            return {"answer": "Block not found.", "citations": []}
        prompt = (
            f"Explain why block {block['block_label']} is {block['status']} right now."
            f" Deviation {block['deviation_pct']}%, occupancy {block['occupancy']}%,"
            f" temperature {block['temperature']}°C, baseline {block['baseline_kwh']} kWh."
        )
        citations = self.index.query(prompt)
        context = self._build_context(snapshot, block)
        answer = self._generate_answer(prompt, citations, context)
        return {
            "answer": answer,
            "citations": [c.__dict__ for c in citations],
        }

    def generate_report(self, snapshot: dict, report_type: str) -> str:
        prompt = (
            f"Generate a {report_type} energy intelligence summary. Include top 3 waste blocks,"
            " estimated savings (kWh and INR), and CO2 reduction."
        )
        citations = self.index.query(prompt)
        context = self._build_context(snapshot)
        return self._generate_answer(prompt, citations, context)

    def _build_context(self, snapshot: dict, block: dict | None = None) -> str:
        env = snapshot.get("environment", {})
        totals = snapshot.get("totals", {})
        parts = [
            f"Org: {snapshot.get('org', {}).get('name', 'Unknown')}",
            f"Outside temp: {env.get('outside_temp', '--')}°C, humidity: {env.get('humidity', '--')}%",
            f"Tariff: ₹{env.get('tariff_inr_per_kwh', '--')}/kWh",
            f"Carbon intensity: {env.get('carbon_intensity_kg_per_kwh', '--')} kg/kWh",
            f"Total savings: {totals.get('total_savings_kwh', '--')} kWh",
            f"Total CO2 avoided: {totals.get('co2_kg', '--')} kg",
        ]
        if block:
            parts.append(
                f"Block {block.get('block_label')}: status {block.get('status')},"
                f" deviation {block.get('deviation_pct')}%, root cause {block.get('root_cause')}"
            )
        return "\n".join(parts)

    def _generate_answer(self, question: str, citations: List[Citation], context: str) -> str:
        gemini_answer = self._generate_answer_gemini(question, citations, context)
        if gemini_answer:
            return gemini_answer

        if self.client:
            messages = [
                {"role": "system", "content": "You are an energy intelligence copilot. Answer concisely."},
                {"role": "system", "content": f"Context:\n{context}"},
                {
                    "role": "system",
                    "content": "Use the citations provided for grounded reasoning."
                    + json.dumps([c.__dict__ for c in citations]),
                },
                {"role": "user", "content": question},
            ]
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=0.2,
                )
                return response.choices[0].message.content or ""
            except Exception:  # noqa: BLE001
                pass

        # Fallback summary
        citation_sources = ", ".join(c.source for c in citations) if citations else "No local docs found"
        return (
            f"{question}\n"
            f"Based on live telemetry, the system indicates actionable efficiency signals.\n"
            f"Sources: {citation_sources}"
        )

    def _generate_answer_gemini(self, question: str, citations: List[Citation], context: str) -> str | None:
        if not self.gemini_api_key:
            return None

        citations_payload = [{"source": c.source, "snippet": c.snippet} for c in citations]
        prompt = (
            "You are an energy intelligence copilot for a real-time campus energy system.\n"
            "Answer concisely, use bullet points only when useful, and ground your answer in the provided context.\n\n"
            f"Live Context:\n{context}\n\n"
            f"Citations:\n{json.dumps(citations_payload, ensure_ascii=False)}\n\n"
            f"User Request:\n{question}"
        )

        payload = {
            "system_instruction": {
                "parts": [
                    {
                        "text": (
                            "Be precise and operational. If data is insufficient, say what is missing. "
                            "Do not invent measurements or sources."
                        )
                    }
                ]
            },
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "topP": 0.9,
                "maxOutputTokens": 700,
            },
        }

        # Try a small model list to handle account/model availability differences.
        models = [
            os.getenv("GEMINI_MODEL") or self.gemini_model,
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-1.5-flash",
            "gemini-1.5-flash-8b",
            "gemini-1.5-pro",
        ]
        models.extend(self._discover_gemini_models())

        # de-duplicate while preserving order
        deduped_models: list[str] = []
        seen: set[str] = set()
        for model in models:
            if not model or model in seen:
                continue
            seen.add(model)
            deduped_models.append(model)

        for model in deduped_models:
            response = self._call_gemini_generate_content(model, payload)
            if response:
                return response
        return None

    def _discover_gemini_models(self) -> list[str]:
        if not self.gemini_api_key:
            return []
        now = time.time()
        if self._gemini_models_cache and (now - self._gemini_models_cache_at) < 300:
            return list(self._gemini_models_cache)

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models"
            f"?key={urllib_parse.quote(self.gemini_api_key)}"
        )
        req = urllib_request.Request(url, method="GET")
        try:
            with urllib_request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini listModels failed: %s", exc)
            return list(self._gemini_models_cache)

        discovered: list[str] = []
        for item in payload.get("models", []):
            if not isinstance(item, dict):
                continue
            methods = item.get("supportedGenerationMethods") or []
            if "generateContent" not in methods:
                continue
            name = str(item.get("name", ""))
            short_name = name.split("/", 1)[-1] if "/" in name else name
            if short_name:
                discovered.append(short_name)

        # Prefer flash family first for speed/cost.
        discovered.sort(key=lambda m: (0 if "flash" in m else 1, m))
        self._gemini_models_cache = discovered
        self._gemini_models_cache_at = now
        if discovered:
            logger.info("Gemini models discovered for generateContent: %s", ", ".join(discovered[:8]))
        return list(discovered)

    def _call_gemini_generate_content(self, model: str, payload: dict) -> str | None:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{urllib_parse.quote(model, safe='-._')}:generateContent"
            f"?key={urllib_parse.quote(self.gemini_api_key)}"
        )
        req = urllib_request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=20) as resp:
                raw = resp.read().decode("utf-8")
            data = json.loads(raw)
        except urllib_error.HTTPError as exc:
            try:
                body = exc.read().decode("utf-8")
            except Exception:  # noqa: BLE001
                body = ""
            logger.warning("Gemini generateContent failed for model=%s status=%s body=%s", model, exc.code, body[:400])
            return None
        except (urllib_error.URLError, TimeoutError, json.JSONDecodeError) as exc:  # noqa: PERF203
            logger.warning("Gemini generateContent network/parse failure for model=%s: %s", model, exc)
            return None
        except Exception:  # noqa: BLE001
            logger.exception("Unexpected Gemini call failure for model=%s", model)
            return None
        return self._extract_gemini_text(data)

    @staticmethod
    def _extract_gemini_text(payload: dict) -> str | None:
        candidates = payload.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            text = "".join(part.get("text", "") for part in parts if isinstance(part, dict))
            if text.strip():
                return text.strip()
        return None
