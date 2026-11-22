"""Opt-in loopback vision gateway for locally stored polo executions."""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import urllib.error
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

from yarnai.garment_reference import (
    RESPONSES_ENDPOINT_URL, UrllibJsonTransport, calculate_actual_cost_usd,
    extract_structured_output, normalize_provider_usage,
)
from yarnai.vision_review import (
    DEFAULT_MODEL, VisionGatewaySettings, VisionReviewError, VisionReviewGateway,
    VERDICT_UI_MESSAGES, validate_review_request,
)


WIRE_REVISION = 2


def packed(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


class ReviewJournal:
    """An atomic reservation survives restarts, timeouts and rejected responses."""
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.transaction() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, scope TEXT NOT NULL,
                revision INTEGER NOT NULL, binding TEXT NOT NULL, result TEXT, usage TEXT,
                cost_usd TEXT, provider_status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
            db.execute("""CREATE TABLE IF NOT EXISTS equivalent_reviews (
                evidence TEXT PRIMARY KEY, original_id TEXT NOT NULL REFERENCES reviews(id))""")
            db.execute("""CREATE TABLE IF NOT EXISTS rejected_inputs (
                id TEXT, wire_revision INTEGER, reason TEXT, PRIMARY KEY(id,wire_revision))""")
            db.execute("""CREATE TABLE IF NOT EXISTS reviewed_images (
                binding TEXT, sha TEXT, PRIMARY KEY(binding,sha))""")

    @contextmanager
    def transaction(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                yield db
        finally:
            db.close()

    @staticmethod
    def scope(identity):
        return packed([identity["project_id"], identity["plan_id"]])

    def assert_current(self, identity):
        with self.transaction() as db:
            self.check_revision(db, identity)

    def check_revision(self, db, identity):
        current = db.execute("SELECT revision FROM reviews WHERE scope=? ORDER BY revision DESC LIMIT 1",
                             (self.scope(identity),)).fetchone()
        if current and current[0] > identity["session_revision"]:
            raise VisionReviewError("review_stale", "Шаг уже изменился.", status_code=409)

    def reserve(self, request):
        ident = request["identity"]
        binding = packed(ident)
        digest = hashlib.sha256(packed(request).encode()).hexdigest()
        # Local file IDs and operation IDs are not visual evidence. Reuse only
        # the same immutable binding, guidance, checks and ordered photo bytes.
        evidence = dict(request)
        evidence.pop("review_session_id")
        evidence["photos"] = [(p["sha256"],p["mime_type"]) for p in request["photos"]]
        evidence_key = hashlib.sha256(packed(evidence).encode()).hexdigest()
        with self.transaction() as db:
            self.check_revision(db, ident)
            row = db.execute("SELECT payload_hash,result FROM reviews WHERE id=?",
                             (request["review_session_id"],)).fetchone()
            if row:
                if row[0] == digest and row[1]:
                    db.execute("INSERT OR IGNORE INTO equivalent_reviews VALUES (?,?)",
                               (evidence_key,request["review_session_id"]))
                    return json.loads(row[1])
                # A prior explicit HTTP 400 preceded inference. Only a revised wire
                # format may make one corrected attempt; uncertainty is never retried.
                prior = db.execute("SELECT provider_status FROM reviews WHERE id=?",
                                   (request["review_session_id"],)).fetchone()
                revised = db.execute("SELECT 1 FROM rejected_inputs WHERE id=? AND wire_revision=?",
                                     (request["review_session_id"], WIRE_REVISION)).fetchone()
                if row[0] == digest and prior == ("400",) and not revised:
                    db.execute("UPDATE reviews SET provider_status=NULL WHERE id=?", (request["review_session_id"],))
                    return None
                raise VisionReviewError("review_already_reserved", "Повторная отправка закрыта.", status_code=409)
            cached = db.execute("""SELECT result FROM equivalent_reviews JOIN reviews ON original_id=id
                                  WHERE evidence=?""", (evidence_key,)).fetchone()
            if cached and cached[0]:
                result = json.loads(cached[0])
                result["review_session_id"] = request["review_session_id"]
                # Remember the alias so reuse of this operation with different bytes is rejected.
                db.execute("INSERT INTO reviews(id,payload_hash,scope,revision,binding,result,provider_status) VALUES (?,?,?,?,?,?,?)",
                           (request["review_session_id"],digest,self.scope(ident),ident["session_revision"],binding,packed(result),"replay"))
                return result
            try:
                db.executemany("INSERT INTO reviewed_images VALUES (?,?)",
                               [(binding, p["sha256"]) for p in request["photos"]])
            except sqlite3.IntegrityError as exc:
                raise VisionReviewError("photo_already_reviewed", "Снимок уже отправлялся.", status_code=409) from exc
            db.execute("INSERT INTO reviews(id,payload_hash,scope,revision,binding) VALUES (?,?,?,?,?)",
                       (request["review_session_id"], digest, self.scope(ident), ident["session_revision"], binding))
            db.execute("INSERT INTO equivalent_reviews VALUES (?,?)", (evidence_key,request["review_session_id"]))
        return None


class MeteredProvider:
    def __init__(self, credential, journal, transport):
        self.credential = credential
        self.journal = journal
        self.transport = transport
        self.operation = ContextVar("vision_operation")

    def review(self, request):
        try:
            response = self.transport.post_json(RESPONSES_ENDPOINT_URL,
                {**request, "store": False, "tools": [], "max_output_tokens": 3000,
                 "reasoning":{"effort":"low"}}, headers={"Authorization":"Bearer " + self.credential,
                "Content-Type":"application/json"}, timeout_seconds=75)
        except Exception as exc:
            status = str(exc.code) if isinstance(exc, urllib.error.HTTPError) else "delivery_unknown"
            with self.journal.transaction() as db:
                db.execute("UPDATE reviews SET provider_status=? WHERE id=?", (status, self.operation.get()))
                if isinstance(exc, urllib.error.HTTPError):
                    try:
                        info = json.loads(exc.read(1500)).get("error", {})
                    except (ValueError, AttributeError):
                        info = {}
                    # Only provider diagnostic identifiers; never store an echoed input.
                    reason = {key: val for key in ("code","param","type") if
                              isinstance((val := info.get(key)), str) and re.fullmatch(r"[a-zA-Z0-9_.\[\]-]{1,120}",val)}
                    msg = info.get("message", "")
                    if isinstance(msg, str) and len(msg)<450 and not any(s in msg.lower() for s in ("sk-", "data:", "bearer", "api key")):
                        if msg.startswith(("Invalid schema for response_format","Unsupported parameter","Unsupported value","The requested model")):
                            reason["schema_or_parameter"] = msg
                    db.execute("INSERT OR REPLACE INTO rejected_inputs VALUES (?,?,?)",
                               (self.operation.get(), WIRE_REVISION, packed(reason)))
            raise VisionReviewError("provider_unavailable", "Сервис не вернул результат.", status_code=502) from exc
        usage = normalize_provider_usage(response.get("usage"))
        cost = str(calculate_actual_cost_usd(usage)) if usage else None
        with self.journal.transaction() as db:
            db.execute("UPDATE reviews SET provider_status=?, usage=?,cost_usd=? WHERE id=?",
                       (str(response.get("status")), packed(usage), cost, self.operation.get()))
        try:
            return extract_structured_output(response)
        except ValueError as exc:
            raise VisionReviewError("review_output_invalid", "Сервис не вернул проверяемый ответ.", status_code=502) from exc


def actionable_result(result):
    # Earlier receipts for rejected claims recorded this exact server-generated
    # reason. A concrete required view is actionable, including on local replay.
    if (result["verdict"] == "cannot_determine" and not result["observations"] and result["missing_evidence"]
        and result["confidence"]["uncertainty_reasons"] == ["Наблюдения не подтверждают результат шага."]):
        result = {**result, "verdict":"more_evidence_required","ui_message":VERDICT_UI_MESSAGES["more_evidence_required"],
                  "safe_next_action":"capture_more_evidence"}
    return result


class PoloVisionGateway(VisionReviewGateway):
    local_only = True

    def __init__(self, settings, credential, path, transport=None):
        self.journal = ReviewJournal(path)
        self.provider = MeteredProvider(credential, self.journal, transport or UrllibJsonTransport())
        super().__init__(settings, provider=self.provider, state_verifier=self.journal)

    def review(self, payload):
        request = validate_review_request(payload)
        identity = request["identity"]
        checkpoint = identity["checkpoint_identity"]
        if (not self.enabled or not checkpoint or identity["action_id"] != identity["step_id"]
            or not checkpoint["checkpoint_id"].startswith(identity["step_id"] + ".")):
            raise VisionReviewError("polo_checkpoint_required", "Нужна контрольная точка поло.", status_code=409)
        replay = self.journal.reserve(request)
        if replay:
            return actionable_result(replay)
        operation = request["review_session_id"]
        token = self.provider.operation.set(operation)
        try:
            try:
                result = self.evaluate(request)
            except VisionReviewError as exc:
                if exc.code != "provider_response_unsupported_claim":
                    raise
                # A real provider replied but its visible evidence was insufficient.
                # Discard all unsupported findings, including any claimed count.
                result = {"schema_version":1,"review_session_id":operation,"identity":request["identity"],
                          "provider":self.settings.provider,"model":self.settings.model,
                          "verdict":"cannot_determine","ui_message":VERDICT_UI_MESSAGES["cannot_determine"],
                          "confidence":{"level":"low","uncertainty_reasons":["Наблюдения не подтверждают результат шага."]},
                          "observations":[],"missing_evidence":request["photo_requirements"],
                          "expected_state_references":request["expected_visible_state"]["references"],
                          "usage_unit":"photo_review_session","safe_next_action":"capture_more_evidence"}
            if result["verdict"] == "cannot_determine":
                result["safe_next_action"] = "capture_more_evidence"
            result = actionable_result(result)
            with self.journal.transaction() as db:
                self.journal.check_revision(db, request["identity"])
                db.execute("UPDATE reviews SET result=? WHERE id=?", (packed(result), operation))
            return result
        finally:
            self.provider.operation.reset(token)


def configured_gateway():
    if os.getenv("YARNAI_VISION_ENABLED", "").lower() != "true":
        return VisionReviewGateway(VisionGatewaySettings())
    settings = VisionGatewaySettings.from_environment()
    if not settings.credential_configured or settings.model != DEFAULT_MODEL:
        return VisionReviewGateway(VisionGatewaySettings())
    path = os.getenv("YARNAI_VISION_JOURNAL") or Path.home() / ".yarnai" / "polo-vision.sqlite3"
    return PoloVisionGateway(settings, os.environ["OPENAI_API_KEY"], path)
