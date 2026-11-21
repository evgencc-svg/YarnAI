"""Opt-in local runtime for one owner-authorized photo chosen in the normal UI.

The default app never imports or starts this runtime. A separate CLI operation
must issue a single-use session after owner approval. No credential is read by
issuance, import, or inspection. The first validated UI request binds the session
to its exact source; restart and concurrent requests cannot replenish it.
"""
from __future__ import annotations

import argparse
import json
import secrets
import sqlite3
import uuid
from urllib.parse import urlsplit
from datetime import UTC, datetime
from pathlib import Path

from starlette.responses import JSONResponse

from yarnai.garment_reference import (
    COST_CAP_USD, GarmentReferenceError, SqlitePilotAuthorizationStore,
    UrllibJsonTransport, ValidatedPilotRequest, _authorization_binding,
    assert_pilot_configuration_cost_safe,
)
from yarnai.openai_pilot_runtime import create_secure_pilot_app


class UserTestSessionStore(SqlitePilotAuthorizationStore):
    """One durable UI-selected request, with the existing transport audit."""

    def __init__(self, database_path: Path):
        super().__init__(database_path)
        with self._connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS garment_user_test_session (
                singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                request_id TEXT NOT NULL UNIQUE, origin TEXT NOT NULL,
                token TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('approved','consumed')),
                approved_at TEXT NOT NULL, consumed_at TEXT, binding_json TEXT,
                source_json TEXT, cap_usd TEXT NOT NULL)""")

    def issue(self, *, origin: str):
        # Intentionally not an HTTP endpoint and never invoked by serve().
        parsed = urlsplit(origin)
        if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not parsed.port or not 1024 <= parsed.port <= 65535 or origin != f"http://127.0.0.1:{parsed.port}":
            raise ValueError("A literal loopback origin with a non-privileged port is required")
        assert_pilot_configuration_cost_safe()
        request_id = f"pilot-request:{uuid.uuid4()}"
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT COUNT(*) FROM garment_pilot_authorizations").fetchone()[0]:
                db.execute("ROLLBACK")
                raise ValueError("Use a new dedicated user-test database; prior pilot authorizations are protected")
            try:
                db.execute("INSERT INTO garment_user_test_session VALUES (1,?,?,?,'approved',?,NULL,NULL,NULL,?)",
                           (request_id, origin, secrets.token_urlsafe(32), datetime.now(UTC).isoformat(), str(COST_CAP_USD)))
                db.execute("COMMIT")
            except Exception:
                db.execute("ROLLBACK")
                raise
        return {"request_id": request_id, "origin": origin, "maximum_calls": 1, "cost_cap_usd": str(COST_CAP_USD)}

    def session(self):
        with self._connect() as db:
            row = db.execute("SELECT * FROM garment_user_test_session WHERE singleton=1").fetchone()
        return dict(row) if row else None

    def pending_request_id(self):
        row = self.session()
        with self._connect() as db:
            attempted = db.execute("SELECT COUNT(*) FROM garment_pilot_analysis_posts").fetchone()[0]
        return row["request_id"] if row and row["status"] == "approved" and not attempted else None

    def pending_binding(self):
        row = self.session()
        return json.loads(row["binding_json"]) if row and row["binding_json"] else None

    def record_analysis_post(self):
        # Reject replays/concurrent HTTP submissions before their transport.
        request_id = self.pending_request_id()
        if not request_id:
            raise GarmentReferenceError("user_test_session_used", "Разрешённый запрос уже использован.", status_code=409)
        with self._lock, self._connect() as db:
            try:
                db.execute("INSERT INTO garment_pilot_analysis_posts VALUES (1,?,?)", (request_id, datetime.now(UTC).isoformat()))
            except sqlite3.IntegrityError as error:
                raise GarmentReferenceError("user_test_post_already_started", "Этот запрос уже отправлялся. Автоматического повтора нет.", status_code=409) from error

    def consume(self, request: ValidatedPilotRequest):
        binding = json.dumps(_authorization_binding(request), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        source = json.dumps(request.source_identity_dict(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        with self._lock, self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            updated = db.execute("""UPDATE garment_user_test_session SET status='consumed',
                consumed_at=?, binding_json=?, source_json=?
                WHERE singleton=1 AND status='approved' AND request_id=? AND cap_usd=?""",
                (datetime.now(UTC).isoformat(), binding, source, request.request_id, str(COST_CAP_USD))).rowcount
            db.execute("COMMIT")
        return updated == 1


class SessionSourceVerifier:
    """Request-source binding; browser repository checks current revision on apply.

    The server cannot independently read the browser's IndexedDB. Before consume
    there is deliberately no hardcoded project; after it, the exact source must
    remain unchanged. This is not a claim of server-side browser-state authority.
    """

    def __init__(self, store):
        self.store = store

    def assert_current(self, source_identity):
        row = self.store.session()
        if not row:
            raise GarmentReferenceError("user_test_session_missing", "Нет разрешения на пользовательский тест.", status_code=409)
        if row["source_json"] and json.loads(row["source_json"]) != dict(source_identity):
            raise GarmentReferenceError("user_test_source_changed", "Исходная фотография или версия проекта изменилась.", status_code=409)


class LocalSessionBoundary:
    """Protect the paid local endpoint from other sites and other loopback ports."""

    def __init__(self, app, *, store):
        self.app, self.store = app, store

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        row = self.store.session()
        headers = dict(scope.get("headers", []))
        expected = row["origin"] if row else ""
        host = headers.get(b"host", b"").decode("ascii", "ignore")
        origin = headers.get(b"origin", b"").decode("ascii", "ignore")
        site = headers.get(b"sec-fetch-site", b"").decode("ascii", "ignore")
        protected = scope["path"].startswith("/api/v1/garment-reference-analyses")
        allowed = expected == f"http://{host}"
        if protected:
            allowed = allowed and site in {"same-origin", "none", ""} and (not origin or origin == expected)
            if scope["method"] == "POST":
                token = headers.get(b"x-yarnai-user-test-token", b"").decode("ascii", "ignore")
                allowed = allowed and origin == expected and bool(row) and secrets.compare_digest(token, row["token"])
        if not allowed:
            return await JSONResponse({"error": {"code": "local_session_origin_rejected", "message": "Открой анализ в разрешённом локальном окне YarnAI."}}, status_code=403)(scope, receive, send)
        if protected and scope["method"] == "GET" and scope["path"].endswith("/configuration"):
            # Configuration is same-origin only; token is a local anti-CSRF nonce,
            # never an OpenAI credential or authorization to exceed the single call.
            async def add_token(message):
                if message["type"] == "http.response.body" and message.get("body"):
                    payload = json.loads(message["body"])
                    payload["user_test_token"] = row["token"]
                    message = {**message, "body": json.dumps(payload, ensure_ascii=False).encode()}
                elif message["type"] == "http.response.start":
                    message = {**message, "headers": [(k, v) for k, v in message["headers"] if k != b"content-length"]}
                await send(message)
            return await self.app(scope, receive, add_token)
        return await self.app(scope, receive, send)


def create_user_test_app(database_path: Path, *, credential_reader=None, transport=None):
    store = UserTestSessionStore(database_path)
    row = store.session()
    if not row or row["status"] != "approved":
        raise RuntimeError("A new explicit owner-approved user-test session is required before credential access")
    if not store.pending_request_id():
        raise RuntimeError("Session is not available")
    app = create_secure_pilot_app(
        credential_reader=credential_reader,
        transport=transport or UrllibJsonTransport(audit=store, request_id=row["request_id"]),
        state_verifier=SessionSourceVerifier(store), authorization_store=store,
    )
    return LocalSessionBoundary(app, store=store)


def main():
    parser = argparse.ArgumentParser(description="One explicitly approved local YarnAI user test")
    parser.add_argument("command", choices=["issue", "serve"])
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--port", type=int, default=8030)
    parser.add_argument("--owner-approved-one-call-max-usd-0-05", action="store_true")
    args = parser.parse_args()
    if args.command == "issue":
        if not args.owner_approved_one_call_max_usd_0_05:
            parser.error("Owner approval for one UI-selected photo and maximum $0.05 is required")
        args.database.parent.mkdir(parents=True, exist_ok=True)
        print(json.dumps(UserTestSessionStore(args.database).issue(origin=f"http://127.0.0.1:{args.port}"), ensure_ascii=False))
        return
    row = UserTestSessionStore(args.database).session()
    if not row or row["origin"] != f"http://127.0.0.1:{args.port}":
        parser.error("Port must match the approved local origin")
    import uvicorn
    uvicorn.run(create_user_test_app(args.database), host="127.0.0.1", port=args.port, workers=1, access_log=True, server_header=False)


if __name__ == "__main__":
    main()
