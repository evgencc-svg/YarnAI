"""Owner-approved one-shot runtime for the legacy yarn supplement."""

from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any

import uvicorn

from yarnai.garment_reference import COST_CAP_USD, PilotAuthorization, RESPONSES_ENDPOINT_PATH, SqlitePilotAuthorizationStore, UrllibJsonTransport, assert_pilot_configuration_cost_safe
from yarnai.garment_yarn_recommendation import GarmentYarnRecommendationGateway, OpenAIYarnRecommendationProvider
from yarnai.http import create_app
from yarnai.openai_pilot_runtime import (
    EXACT_CREDENTIAL_TARGET, EXACT_ORIGINAL_SHA256, EXACT_PHOTO_ID, EXACT_PROJECT_ID, EXACT_PROJECT_REVISION,
    EXACT_SANITIZED_BYTE_SIZE, EXACT_SANITIZED_HEIGHT, EXACT_SANITIZED_SHA256, EXACT_SANITIZED_WIDTH,
    ExactOwnerApprovedStateVerifier, read_yarnai_pilot_credential,
)
from yarnai.vision_review import DEFAULT_MODEL, DEFAULT_PROVIDER, VisionGatewaySettings


SUPPLEMENT_DATABASE_PATH = Path(__file__).resolve().parents[2] / "tmp" / "openai-garment-yarn-supplement-v1.sqlite3"
EXACT_SEMANTIC_CONTEXT = {
    "analysis": {"id": "garment-analysis:c37bc08a", "revision": 5, "fingerprint": "fnv1a32:c37bc08a"},
    "upstreamFacts": {
        "knit_scale": {"status": "observed"},
        "vertical_texture": {"status": "observed"},
        "stitch_clarity": {"status": "inferred"},
        "surface": {"status": "observed"},
        "fabric_behavior": {"status": "inferred"},
        "color_effect": {"status": "observed"},
    },
    "unknownClaimCodes": ["shoulder_and_sleeve_construction", "seam_mode", "internal_construction"],
    "technologyDecision": {
        "id": "garment-technology-decision:40c92e79",
        "revision": 7,
        "fingerprint": "fnv1a32:27b54bd9",
        "constructionIdentity": "seamed_set_in_sleeve",
        "provenance": "selected",
    },
}


class ExactYarnRecommendationStateVerifier(ExactOwnerApprovedStateVerifier):
    """Exact photo identity plus immutable analysis/owner-decision semantics."""

    def semantic_context(self, source_identity: Mapping[str, Any]) -> dict[str, Any]:
        self.assert_current(source_identity)
        return deepcopy(EXACT_SEMANTIC_CONTEXT)


def issue_exact_owner_authorization(database_path: Path = SUPPLEMENT_DATABASE_PATH) -> dict[str, Any]:
    assert_pilot_configuration_cost_safe(); database_path.parent.mkdir(parents=True, exist_ok=True); store = SqlitePilotAuthorizationStore(database_path)
    audit = store.audit_summary()
    if store.authorization_rows() or audit["analysis_post_count"] or audit["provider_call_count"]: raise RuntimeError("The exact yarn supplement authorization database is not empty")
    request_id = f"yarn-supplement:{uuid.uuid4()}"; authorization_id = f"yarn-supplement-authorization:{uuid.uuid4()}"
    store.issue(PilotAuthorization(authorization_id=authorization_id, request_id=request_id, source_identity={"project_id": EXACT_PROJECT_ID, "project_revision": EXACT_PROJECT_REVISION, "reference_photos": [{"photo_id": EXACT_PHOTO_ID, "sha256": EXACT_ORIGINAL_SHA256}]}, source_photo_id=EXACT_PHOTO_ID, source_photo_sha256=EXACT_ORIGINAL_SHA256, sanitized_photo_sha256=EXACT_SANITIZED_SHA256, sanitized_width=EXACT_SANITIZED_WIDTH, sanitized_height=EXACT_SANITIZED_HEIGHT, sanitized_byte_size=EXACT_SANITIZED_BYTE_SIZE, provider=DEFAULT_PROVIDER, model=DEFAULT_MODEL, endpoint=RESPONSES_ENDPOINT_PATH, retries=0, store=False, background=False, stream=False, web_search=False, tools=(), cost_cap_usd=COST_CAP_USD))
    return {"authorization_id": authorization_id, "request_id": request_id, "authorization_count": 1, "provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL, "retries": 0, "cost_cap_usd": str(COST_CAP_USD)}


def create_owner_approved_app(*, credential_reader=None, database_path: Path = SUPPLEMENT_DATABASE_PATH):
    assert_pilot_configuration_cost_safe()
    if "OPENAI_API_KEY" in os.environ: raise RuntimeError("Credential environment variables are forbidden")
    store = SqlitePilotAuthorizationStore(database_path); active = [row for row in store.authorization_rows() if row["status"] == "approved"]
    if len(active) != 1: raise RuntimeError("Exactly one active supplement authorization is required")
    credential = (credential_reader or read_yarnai_pilot_credential)(EXACT_CREDENTIAL_TARGET)
    transport = UrllibJsonTransport(audit=store, request_id=active[0]["request_id"])
    provider = OpenAIYarnRecommendationProvider(credential, transport=transport, audit=store, request_id=active[0]["request_id"])
    gateway = GarmentYarnRecommendationGateway(VisionGatewaySettings(provider=DEFAULT_PROVIDER, model=DEFAULT_MODEL, explicitly_enabled=True, credential_configured=True), provider=provider, state_verifier=ExactYarnRecommendationStateVerifier(), authorization_store=store)
    app = create_app(); app.router.routes[-1:-1] = gateway.routes(); return app


def safe_audit(database_path: Path = SUPPLEMENT_DATABASE_PATH) -> dict[str, Any]: return SqlitePilotAuthorizationStore(database_path).audit_summary()


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if command == "issue-authorization": print(json.dumps(issue_exact_owner_authorization(), ensure_ascii=False, sort_keys=True)); return
    if command == "audit": print(json.dumps(safe_audit(), ensure_ascii=False, sort_keys=True)); return
    if command != "serve": raise SystemExit("Expected serve, issue-authorization, or audit")
    uvicorn.run(create_owner_approved_app(), host="127.0.0.1", port=8023, log_level="info", access_log=True, server_header=False, workers=1)


if __name__ == "__main__": main()
