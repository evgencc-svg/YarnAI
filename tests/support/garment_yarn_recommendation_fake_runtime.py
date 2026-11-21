"""Isolated localhost-only fake runtime for garment yarn recommendation UI evidence."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path

import uvicorn

from yarnai.garment_reference import PilotAuthorization, RESPONSES_ENDPOINT_PATH, RESPONSES_ENDPOINT_URL, SqlitePilotAuthorizationStore
from yarnai.garment_yarn_recommendation import GarmentYarnRecommendationGateway, OpenAIYarnRecommendationProvider
from yarnai.http import create_app
from yarnai.vision_review import DEFAULT_MODEL, DEFAULT_PROVIDER, VisionGatewaySettings


ROOT = Path(__file__).resolve().parents[2]
DATABASE_PATH = ROOT / "tmp" / "garment-yarn-recommendation-ui-fake.sqlite3"
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "garment_yarn_recommendation_valid.json"
REQUEST_ID = "yarn-supplement:isolated-ui-v1"


class IsolatedAuthorizationStore(SqlitePilotAuthorizationStore):
    def __init__(self, database_path: Path) -> None:
        super().__init__(database_path)
        self._post_requested = False
        self._consumed = False
        if self.authorization_rows() or self.audit_summary()["provider_call_count"]:
            raise RuntimeError("Isolated fake audit database must start empty")

    def pending_request_id(self) -> str | None:
        return None if self._consumed else REQUEST_ID

    def record_analysis_post(self) -> None:
        if self._post_requested:
            raise RuntimeError("Second isolated fake POST is forbidden")
        self._post_requested = True

    def consume(self, request) -> bool:
        if self._consumed or not self._post_requested or request.request_id != REQUEST_ID:
            return False
        image = request.sanitized_image
        self.issue(PilotAuthorization(
            authorization_id="yarn-supplement-authorization:isolated-ui-v1",
            request_id=REQUEST_ID,
            source_identity=request.source_identity_dict(),
            source_photo_id=request.source_photo_id,
            source_photo_sha256=request.source_photo_sha256,
            sanitized_photo_sha256=image.sha256,
            sanitized_width=image.width,
            sanitized_height=image.height,
            sanitized_byte_size=len(image.image_bytes),
        ))
        SqlitePilotAuthorizationStore.record_analysis_post(self)
        consumed = SqlitePilotAuthorizationStore.consume(self, request)
        self._consumed = consumed
        return consumed


class CurrentIsolatedStateVerifier:
    def assert_current(self, source_identity) -> None:
        if not source_identity.get("project_id") or not source_identity.get("reference_photos"):
            raise RuntimeError("Isolated source identity is incomplete")

    def semantic_context(self, source_identity):
        self.assert_current(source_identity)
        return {
            "analysis": {"id": "analysis:isolated", "revision": 1, "fingerprint": "fnv1a32:11111111"},
            "upstreamFacts": {
                "knit_scale": {"status": "observed"}, "vertical_texture": {"status": "observed"},
                "stitch_clarity": {"status": "inferred"}, "surface": {"status": "observed"},
                "fabric_behavior": {"status": "inferred"}, "color_effect": {"status": "observed"},
            },
            "unknownClaimCodes": ["shoulder_and_sleeve_construction", "seam_mode", "internal_construction"],
            "technologyDecision": {"id": "decision:test", "revision": 7, "fingerprint": "fnv1a32:27b54bd9", "constructionIdentity": "seamed_set_in_sleeve", "provenance": "selected"},
        }


class NetworkBlockedFakeTransport:
    def __init__(self, audit: SqlitePilotAuthorizationStore) -> None:
        self.audit = audit
        self.calls = 0
        self.payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    def post_json(self, endpoint, payload, *, headers, timeout_seconds):
        del headers, timeout_seconds
        if endpoint != RESPONSES_ENDPOINT_URL or self.calls != 0:
            raise RuntimeError("Fake transport permits exactly one local call")
        self.calls += 1
        context = json.loads(payload["input"][1]["content"][0]["text"])["trusted_semantic_context"]
        decision = context["technologyDecision"]
        self.payload["manufacturingChoice"].update({
            "constructionIdentity": decision["constructionIdentity"],
            "decisionId": decision["id"],
            "decisionRevision": decision["revision"],
            "decisionFingerprint": decision["fingerprint"],
        })
        response = {
            "id": "resp_fake_isolated_ui_v1",
            "status": "completed",
            "model": DEFAULT_MODEL,
            "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(self.payload, ensure_ascii=False, separators=(",", ":"))}]}],
        }
        self.audit.record_transport_started(REQUEST_ID, RESPONSES_ENDPOINT_PATH)
        self.audit.record_transport_result(REQUEST_ID, http_status=200, response=response)
        return deepcopy(response)


def create_fake_app():
    store = IsolatedAuthorizationStore(DATABASE_PATH)
    transport = NetworkBlockedFakeTransport(store)
    provider = OpenAIYarnRecommendationProvider("isolated-fake-only", transport=transport, audit=store, request_id=REQUEST_ID)
    gateway = GarmentYarnRecommendationGateway(
        VisionGatewaySettings(provider=DEFAULT_PROVIDER, model=DEFAULT_MODEL, explicitly_enabled=True, credential_configured=True),
        provider=provider,
        state_verifier=CurrentIsolatedStateVerifier(),
        authorization_store=store,
    )
    app = create_app()
    app.router.routes[-1:-1] = gateway.routes()
    return app


if __name__ == "__main__":
    uvicorn.run(create_fake_app(), host="127.0.0.1", port=8024, log_level="warning", access_log=True, server_header=False, workers=1)
