"""Account and cloud-project HTTP endpoints."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hmac
import json
import re
from typing import Any

import jwt
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from yarnai.config import RuntimeSettings
from yarnai.database import (
    IdempotencyRecord,
    Project,
    RefreshSession,
    SyncOperation,
    User,
)
from yarnai.security import (
    IDEMPOTENCY_PATTERN,
    UUID_V7_PATTERN,
    InProcessRateLimiter,
    SecurityService,
    canonical_json_bytes,
    normalize_email,
    sha256_json,
    utc_now,
    uuid7,
    validate_json_depth,
    validate_password,
)


AUTHENTICATION_MESSAGE = "Email or password is incorrect."
UNAVAILABLE_MESSAGE = "Account services are temporarily unavailable."
PROJECT_STATUSES = frozenset(
    {"DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED", "DELETED"}
)
ACTIVE_PROJECT_STATUSES = ("DRAFT", "ACTIVE", "PAUSED", "COMPLETED")
TIMESTAMP_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$"
)


class ApiProblem(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


class CloudApi:
    def __init__(
        self,
        settings: RuntimeSettings,
        session_factory: sessionmaker,
        *,
        limiter: InProcessRateLimiter | None = None,
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.security = SecurityService(settings)
        self.limiter = limiter or InProcessRateLimiter()

    def routes(self) -> list[Route]:
        return [
            Route("/api/v1/auth/register", self.register, methods=["POST"]),
            Route("/api/v1/auth/login", self.login, methods=["POST"]),
            Route("/api/v1/auth/refresh", self.refresh, methods=["POST"]),
            Route("/api/v1/auth/logout", self.logout, methods=["POST"]),
            Route("/api/v1/auth/me", self.me, methods=["GET"]),
            Route("/api/v1/projects", self.create_project, methods=["POST"]),
            Route("/api/v1/projects", self.list_projects, methods=["GET"]),
            Route(
                "/api/v1/projects/{project_id:str}",
                self.get_project,
                methods=["GET"],
            ),
            Route(
                "/api/v1/projects/{project_id:str}",
                self.update_project,
                methods=["PATCH", "PUT"],
            ),
            Route(
                "/api/v1/projects/{project_id:str}/archive",
                self.archive_project,
                methods=["POST"],
            ),
            Route(
                "/api/v1/projects/{project_id:str}/restore",
                self.restore_project,
                methods=["POST"],
            ),
            Route(
                "/api/v1/projects/{project_id:str}",
                self.delete_project,
                methods=["DELETE"],
            ),
            Route(
                "/api/v1/projects/{project_id:str}/restore-deleted",
                self.restore_deleted_project,
                methods=["POST"],
            ),
        ]

    async def register(self, request: Request) -> Response:
        try:
            self._rate_limit(request, "register", 5, 900)
            body = await self._body(request, allowed={"email", "password"})
            email, email_normalized = normalize_email(body.get("email"))
            password = validate_password(body.get("password"))
            now = utc_now()
            with self.session_factory.begin() as database:
                if database.scalar(
                    select(User.id).where(User.email_normalized == email_normalized)
                ):
                    raise ApiProblem(
                        409,
                        "ACCOUNT_UNAVAILABLE",
                        "Unable to create an account with these details.",
                    )
                user = User(
                    id=uuid7(),
                    email=email,
                    email_normalized=email_normalized,
                    password_hash=self.security.hash_password(password),
                    status="ACTIVE",
                    created_at=now,
                    updated_at=now,
                    last_login_at=now,
                )
                database.add(user)
                database.flush()
                session, refresh_token, csrf_token = self._create_session(
                    database, request, user, family_id=uuid7(), now=now
                )
            response = self._auth_response(user, session, status_code=201)
            self._set_auth_cookies(response, refresh_token, csrf_token)
            return response
        except IntegrityError:
            return self._problem_response(
                request,
                ApiProblem(
                    409,
                    "ACCOUNT_UNAVAILABLE",
                    "Unable to create an account with these details.",
                ),
            )
        except (ValueError, ApiProblem) as error:
            return self._handled_problem(request, error)

    async def login(self, request: Request) -> Response:
        try:
            self._rate_limit(request, "login", 10, 900)
            body = await self._body(request, allowed={"email", "password", "device_label"})
            try:
                _email, normalized = normalize_email(body.get("email"))
            except ValueError:
                normalized = "__invalid__@invalid.invalid"
            password = body.get("password")
            if not isinstance(password, str) or len(password) > 1024:
                password = ""
            now = utc_now()
            with self.session_factory.begin() as database:
                user = database.scalar(
                    select(User).where(User.email_normalized == normalized)
                )
                verified = self.security.verify_password(
                    user.password_hash if user else None,
                    password,
                )
                if (
                    not user
                    or not verified
                    or user.status != "ACTIVE"
                    or user.deleted_at is not None
                ):
                    raise ApiProblem(
                        401, "INVALID_CREDENTIALS", AUTHENTICATION_MESSAGE
                    )
                user.last_login_at = now
                user.updated_at = now
                self._enforce_session_limit(database, user.id, now)
                session, refresh_token, csrf_token = self._create_session(
                    database,
                    request,
                    user,
                    family_id=uuid7(),
                    now=now,
                    device_label=body.get("device_label"),
                )
            response = self._auth_response(user, session)
            self._set_auth_cookies(response, refresh_token, csrf_token)
            return response
        except (ValueError, ApiProblem) as error:
            return self._handled_problem(request, error)

    async def refresh(self, request: Request) -> Response:
        try:
            self._rate_limit(request, "refresh", 30, 300)
            self._verify_csrf(request)
            refresh_token = request.cookies.get("yarnai_refresh")
            if not refresh_token:
                raise ApiProblem(401, "SESSION_INVALID", "Session is not valid.")
            token_hash = self.security.token_hash(refresh_token)
            now = utc_now()
            with self.session_factory() as database:
                current = database.scalar(
                    select(RefreshSession).where(
                        RefreshSession.token_hash == token_hash
                    )
                )
                if not current:
                    raise ApiProblem(401, "SESSION_INVALID", "Session is not valid.")
                if current.revoked_at is not None:
                    self._revoke_family(database, current.family_id, now, "TOKEN_REUSE")
                    database.commit()
                    raise ApiProblem(
                        401, "REFRESH_TOKEN_REUSED", "Session is not valid."
                    )
                if self._expired(current.expires_at, now):
                    current.revoked_at = now
                    current.revoke_reason = "EXPIRED"
                    database.commit()
                    raise ApiProblem(401, "SESSION_EXPIRED", "Session has expired.")
                csrf_header = request.headers.get("x-csrf-token", "")
                if not hmac.compare_digest(
                    current.csrf_token_hash,
                    self.security.token_hash(csrf_header),
                ):
                    raise ApiProblem(403, "CSRF_FAILED", "CSRF validation failed.")
                user = database.get(User, current.user_id)
                if (
                    not user
                    or user.status != "ACTIVE"
                    or user.deleted_at is not None
                ):
                    current.revoked_at = now
                    current.revoke_reason = "USER_DISABLED"
                    database.commit()
                    raise ApiProblem(401, "SESSION_INVALID", "Session is not valid.")
                current.revoked_at = now
                current.last_used_at = now
                current.revoke_reason = "ROTATED"
                replacement, new_refresh, new_csrf = self._create_session(
                    database,
                    request,
                    user,
                    family_id=current.family_id,
                    parent_session_id=current.id,
                    now=now,
                    device_label=current.device_label,
                )
                database.commit()
            response = self._auth_response(user, replacement)
            self._set_auth_cookies(response, new_refresh, new_csrf)
            return response
        except (ValueError, ApiProblem) as error:
            response = self._handled_problem(request, error)
            if isinstance(error, ApiProblem) and error.status_code == 401:
                self._clear_auth_cookies(response)
            return response

    async def logout(self, request: Request) -> Response:
        try:
            self._verify_csrf(request)
            refresh_token = request.cookies.get("yarnai_refresh")
            if refresh_token:
                now = utc_now()
                with self.session_factory.begin() as database:
                    session = database.scalar(
                        select(RefreshSession).where(
                            RefreshSession.token_hash
                            == self.security.token_hash(refresh_token)
                        )
                    )
                    if session and session.revoked_at is None:
                        session.revoked_at = now
                        session.last_used_at = now
                        session.revoke_reason = "LOGOUT"
            response = Response(status_code=204)
            self._clear_auth_cookies(response)
            return response
        except ApiProblem as error:
            return self._problem_response(request, error)

    async def me(self, request: Request) -> Response:
        try:
            user, _session = self._authenticate(request)
            return JSONResponse({"user": self._serialize_user(user)})
        except ApiProblem as error:
            return self._problem_response(request, error)

    async def create_project(self, request: Request) -> Response:
        try:
            user, _session = self._authenticate(request)
            body = await self._body(
                request,
                allowed={
                    "project_id",
                    "schema_version",
                    "status",
                    "title",
                    "payload",
                    "source_device_id",
                    "sync_metadata",
                    "operation_id",
                },
            )
            idempotency_key = self._idempotency_key(request)
            project_id = self._project_id(body.get("project_id"))
            schema_version = self._schema_version(body.get("schema_version"))
            status = self._create_status(body.get("status", "DRAFT"))
            title = self._title(body.get("title"))
            payload = self._payload(body.get("payload"))
            source_device_id = self._source_device_id(body.get("source_device_id"))
            sync_metadata = body.get("sync_metadata", {})
            if not isinstance(sync_metadata, dict):
                raise ApiProblem(
                    422, "INVALID_SYNC_METADATA", "sync_metadata must be an object."
                )
            operation_id = body.get("operation_id") or idempotency_key
            if not isinstance(operation_id, str) or len(operation_id) > 128:
                raise ApiProblem(422, "INVALID_OPERATION_ID", "Invalid operation ID.")
            request_hash = sha256_json(body)
            now = utc_now()
            response_body: dict[str, Any]
            with self.session_factory.begin() as database:
                replay = database.scalar(
                    select(IdempotencyRecord).where(
                        IdempotencyRecord.owner_user_id == user.id,
                        IdempotencyRecord.endpoint == "POST:/api/v1/projects",
                        IdempotencyRecord.idempotency_key == idempotency_key,
                    )
                )
                if replay:
                    if replay.request_hash != request_hash:
                        raise ApiProblem(
                            409,
                            "IDEMPOTENCY_CONFLICT",
                            "Idempotency key was already used for another request.",
                        )
                    return JSONResponse(
                        replay.response_body,
                        status_code=replay.response_status,
                        headers={"Idempotency-Replayed": "true"},
                    )
                if database.get(Project, project_id):
                    raise ApiProblem(
                        409,
                        "PROJECT_ID_CONFLICT",
                        "A project with this ID already exists.",
                    )
                project = Project(
                    id=project_id,
                    owner_user_id=user.id,
                    schema_version=schema_version,
                    status=status,
                    title=title,
                    payload=payload,
                    payload_checksum=sha256_json(payload),
                    revision=1,
                    created_at=now,
                    updated_at=now,
                    source_device_id=source_device_id,
                    sync_metadata={
                        "server_version": 1,
                        "last_synced_at": now.isoformat().replace("+00:00", "Z"),
                        "client": sync_metadata,
                    },
                )
                database.add(project)
                database.add(
                    SyncOperation(
                        id=uuid7(),
                        operation_id=operation_id,
                        user_id=user.id,
                        project_id=project.id,
                        base_revision=0,
                        applied_revision=1,
                        kind="PROJECT_CREATED",
                        payload={"payload_checksum": project.payload_checksum},
                        status="APPLIED",
                        created_at=now,
                        source_device_id=source_device_id,
                    )
                )
                response_body = {"project": self._serialize_project(project)}
                database.add(
                    IdempotencyRecord(
                        id=uuid7(),
                        owner_user_id=user.id,
                        endpoint="POST:/api/v1/projects",
                        idempotency_key=idempotency_key,
                        request_hash=request_hash,
                        response_status=201,
                        response_body=response_body,
                        created_at=now,
                        expires_at=now + timedelta(days=1),
                    )
                )
            return JSONResponse(response_body, status_code=201)
        except (ValueError, ApiProblem, IntegrityError) as error:
            if isinstance(error, IntegrityError):
                error = ApiProblem(
                    409, "PROJECT_ID_CONFLICT", "A project with this ID already exists."
                )
            return self._handled_problem(request, error)

    async def list_projects(self, request: Request) -> Response:
        try:
            user, _session = self._authenticate(request)
            section = request.query_params.get("status", "active").lower()
            if section not in {"active", "archived", "deleted", "all"}:
                raise ApiProblem(
                    422,
                    "INVALID_STATUS_FILTER",
                    "status must be active, archived, deleted, or all.",
                )
            try:
                limit = int(request.query_params.get("limit", "20"))
            except ValueError as error:
                raise ApiProblem(422, "INVALID_PAGINATION", "Invalid limit.") from error
            if not 1 <= limit <= 100:
                raise ApiProblem(422, "INVALID_PAGINATION", "limit must be 1 to 100.")
            offset = self._decode_cursor(request.query_params.get("cursor"))
            with self.session_factory() as database:
                query = select(Project).where(Project.owner_user_id == user.id)
                if section == "active":
                    query = query.where(Project.status.in_(ACTIVE_PROJECT_STATUSES))
                elif section == "archived":
                    query = query.where(Project.status == "ARCHIVED")
                elif section == "deleted":
                    query = query.where(Project.status == "DELETED")
                query = query.order_by(Project.updated_at.desc(), Project.id.desc())
                projects = list(database.scalars(query.offset(offset).limit(limit + 1)))
            has_more = len(projects) > limit
            page = projects[:limit]
            return JSONResponse(
                {
                    "projects": [self._serialize_project(entry) for entry in page],
                    "pagination": {
                        "limit": limit,
                        "next_cursor": self._encode_cursor(offset + limit)
                        if has_more
                        else None,
                    },
                }
            )
        except ApiProblem as error:
            return self._problem_response(request, error)

    async def get_project(self, request: Request) -> Response:
        try:
            user, _session = self._authenticate(request)
            project_id = self._project_id(request.path_params["project_id"])
            with self.session_factory() as database:
                project = self._owned_project(database, user.id, project_id)
                if not project:
                    raise self._not_found()
                return JSONResponse({"project": self._serialize_project(project)})
        except ApiProblem as error:
            return self._problem_response(request, error)

    async def update_project(self, request: Request) -> Response:
        try:
            user, _session = self._authenticate(request)
            project_id = self._project_id(request.path_params["project_id"])
            body = await self._body(
                request,
                allowed={"expected_revision", "title", "payload", "source_device_id", "operation_id"},
            )
            expected_revision = self._expected_revision(body.get("expected_revision"))
            values: dict[str, Any] = {}
            if "title" in body:
                values["title"] = self._title(body["title"])
            if "payload" in body:
                values["payload"] = self._payload(body["payload"])
                values["payload_checksum"] = sha256_json(values["payload"])
            if "source_device_id" in body:
                values["source_device_id"] = self._source_device_id(
                    body["source_device_id"]
                )
            if not values:
                raise ApiProblem(422, "EMPTY_UPDATE", "No project changes supplied.")
            idempotency_key = self._optional_idempotency_key(request, body)
            request_hash = sha256_json(
                {"project_id": project_id, "action": "update", "body": body}
            )
            response_body, replayed = self._mutate_project(
                user.id,
                project_id,
                expected_revision,
                values,
                kind="PROJECT_UPDATED",
                operation_id=body.get("operation_id"),
                idempotency_key=idempotency_key,
                request_hash=request_hash,
            )
            headers = {"Idempotency-Replayed": "true"} if replayed else None
            return JSONResponse(response_body, headers=headers)
        except (ValueError, ApiProblem, IntegrityError) as error:
            if isinstance(error, IntegrityError):
                error = ApiProblem(
                    409,
                    "OPERATION_ID_CONFLICT",
                    "Operation ID was already used.",
                )
            return self._handled_problem(request, error)

    async def archive_project(self, request: Request) -> Response:
        return await self._lifecycle(request, "archive")

    async def restore_project(self, request: Request) -> Response:
        return await self._lifecycle(request, "restore")

    async def delete_project(self, request: Request) -> Response:
        return await self._lifecycle(request, "delete")

    async def restore_deleted_project(self, request: Request) -> Response:
        return await self._lifecycle(request, "restore_deleted")

    async def _lifecycle(self, request: Request, action: str) -> Response:
        try:
            user, _session = self._authenticate(request)
            project_id = self._project_id(request.path_params["project_id"])
            body = await self._body(
                request,
                allowed={"expected_revision", "operation_id"},
                empty_allowed=True,
            )
            expected_revision = self._expected_revision(body.get("expected_revision"))
            idempotency_key = self._optional_idempotency_key(request, body)
            request_hash = sha256_json(
                {"project_id": project_id, "action": action, "body": body}
            )
            now = utc_now()
            with self.session_factory.begin() as database:
                replay = self._idempotency_replay(
                    database,
                    user.id,
                    f"PROJECT:{action}:{project_id}",
                    idempotency_key,
                    request_hash,
                )
                if replay is not None:
                    return JSONResponse(
                        replay,
                        headers={"Idempotency-Replayed": "true"},
                    )
                project = self._owned_project(database, user.id, project_id)
                if not project:
                    raise self._not_found()
                if project.revision != expected_revision:
                    raise self._conflict(project)
                values, kind = self._lifecycle_values(project, action, now)
                result = database.execute(
                    update(Project)
                    .where(
                        Project.id == project_id,
                        Project.owner_user_id == user.id,
                        Project.revision == expected_revision,
                    )
                    .values(
                        **values,
                        revision=Project.revision + 1,
                        updated_at=now,
                    )
                )
                if result.rowcount != 1:
                    current = self._owned_project(database, user.id, project_id)
                    if not current:
                        raise self._not_found()
                    raise self._conflict(current)
                database.flush()
                project = self._owned_project(database, user.id, project_id)
                self._add_operation(
                    database,
                    user.id,
                    project,
                    expected_revision,
                    kind,
                    body.get("operation_id"),
                    {},
                )
                response_body = {"project": self._serialize_project(project)}
                self._store_idempotency(
                    database,
                    user.id,
                    f"PROJECT:{action}:{project_id}",
                    idempotency_key,
                    request_hash,
                    response_body,
                    now,
                )
            return JSONResponse(response_body)
        except (ValueError, ApiProblem, IntegrityError) as error:
            if isinstance(error, IntegrityError):
                error = ApiProblem(
                    409,
                    "OPERATION_ID_CONFLICT",
                    "Operation ID was already used.",
                )
            return self._handled_problem(request, error)

    def _mutate_project(
        self,
        user_id: str,
        project_id: str,
        expected_revision: int,
        values: dict[str, Any],
        *,
        kind: str,
        operation_id: Any,
        idempotency_key: str | None,
        request_hash: str,
    ) -> tuple[dict[str, Any], bool]:
        now = utc_now()
        with self.session_factory.begin() as database:
            replay = self._idempotency_replay(
                database,
                user_id,
                f"PROJECT:update:{project_id}",
                idempotency_key,
                request_hash,
            )
            if replay is not None:
                return replay, True
            current = self._owned_project(database, user_id, project_id)
            if not current:
                raise self._not_found()
            if current.status == "DELETED":
                raise self._not_found()
            result = database.execute(
                update(Project)
                .where(
                    Project.id == project_id,
                    Project.owner_user_id == user_id,
                    Project.revision == expected_revision,
                    Project.status != "DELETED",
                )
                .values(
                    **values,
                    revision=Project.revision + 1,
                    updated_at=now,
                )
            )
            if result.rowcount != 1:
                database.expire_all()
                latest = self._owned_project(database, user_id, project_id)
                if not latest:
                    raise self._not_found()
                raise self._conflict(latest)
            database.flush()
            database.expire_all()
            project = self._owned_project(database, user_id, project_id)
            self._add_operation(
                database,
                user_id,
                project,
                expected_revision,
                kind,
                operation_id,
                {"fields": sorted(values)},
            )
            response_body = {"project": self._serialize_project(project)}
            self._store_idempotency(
                database,
                user_id,
                f"PROJECT:update:{project_id}",
                idempotency_key,
                request_hash,
                response_body,
                now,
            )
            return response_body, False

    def _lifecycle_values(
        self, project: Project, action: str, now: datetime
    ) -> tuple[dict[str, Any], str]:
        if action == "archive":
            if project.status not in ACTIVE_PROJECT_STATUSES:
                raise ApiProblem(409, "INVALID_LIFECYCLE", "Project cannot be archived.")
            return (
                {
                    "status": "ARCHIVED",
                    "status_before_archive": project.status,
                    "archived_at": now,
                },
                "PROJECT_ARCHIVED",
            )
        if action == "restore":
            if project.status != "ARCHIVED":
                raise ApiProblem(
                    409, "INVALID_LIFECYCLE", "Project is not archived."
                )
            status = (
                project.status_before_archive
                if project.status_before_archive in ACTIVE_PROJECT_STATUSES
                else "ACTIVE"
            )
            return (
                {
                    "status": status,
                    "status_before_archive": None,
                    "archived_at": None,
                },
                "PROJECT_RESTORED",
            )
        if action == "delete":
            if project.status == "DELETED":
                raise self._not_found()
            return (
                {
                    "status_before_delete": project.status,
                    "status": "DELETED",
                    "deleted_at": now,
                    "purge_after": now + timedelta(days=30),
                },
                "PROJECT_DELETED",
            )
        if action == "restore_deleted":
            if project.status != "DELETED":
                raise self._not_found()
            status = project.status_before_delete or "ACTIVE"
            values: dict[str, Any] = {
                "status": status,
                "status_before_delete": None,
                "deleted_at": None,
                "purge_after": None,
            }
            if status != "ARCHIVED":
                values["archived_at"] = None
            return values, "PROJECT_DELETE_RESTORED"
        raise RuntimeError("unknown lifecycle action")

    def _authenticate(self, request: Request) -> tuple[User, RefreshSession]:
        authorization = request.headers.get("authorization", "")
        if not authorization.startswith("Bearer "):
            raise ApiProblem(401, "AUTH_REQUIRED", "Authentication is required.")
        token = authorization[7:].strip()
        try:
            claims = self.security.decode_access_token(token)
        except jwt.PyJWTError as error:
            raise ApiProblem(
                401, "ACCESS_TOKEN_INVALID", "Authentication is required."
            ) from error
        now = utc_now()
        with self.session_factory() as database:
            session = database.get(RefreshSession, claims["sid"])
            user = database.get(User, claims["sub"])
            if (
                not session
                or not user
                or session.user_id != user.id
                or session.revoked_at is not None
                or self._expired(session.expires_at, now)
                or user.status != "ACTIVE"
                or user.deleted_at is not None
            ):
                raise ApiProblem(
                    401, "ACCESS_TOKEN_INVALID", "Authentication is required."
                )
            database.expunge(user)
            database.expunge(session)
            return user, session

    async def _body(
        self,
        request: Request,
        *,
        allowed: set[str],
        empty_allowed: bool = False,
    ) -> dict[str, Any]:
        content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
        if content_type != "application/json":
            raise ApiProblem(
                415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."
            )
        raw = await request.body()
        if (
            getattr(request.state, "body_too_large", False)
            or len(raw) > self.settings.max_request_body_bytes
        ):
            raise ApiProblem(413, "REQUEST_TOO_LARGE", "Request body is too large.")
        try:
            body = json.loads(
                raw.decode("utf-8"),
                parse_constant=self._reject_json_constant,
            )
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            raise ApiProblem(400, "INVALID_JSON", "Request body must be valid UTF-8 JSON.") from error
        if not isinstance(body, dict) or (not body and not empty_allowed):
            raise ApiProblem(422, "INVALID_BODY", "Request body must be an object.")
        validate_json_depth(body, self.settings.max_json_depth)
        forbidden = sorted(set(body) - allowed)
        if forbidden:
            raise ApiProblem(
                422,
                "FORBIDDEN_FIELDS",
                "Request contains server-controlled or unsupported fields.",
                {"fields": forbidden},
            )
        return body

    def _create_session(
        self,
        database: Session,
        request: Request,
        user: User,
        *,
        family_id: str,
        now: datetime,
        parent_session_id: str | None = None,
        device_label: Any = None,
    ) -> tuple[RefreshSession, str, str]:
        if device_label is not None and (
            not isinstance(device_label, str)
            or not device_label.strip()
            or len(device_label.strip()) > 120
        ):
            raise ApiProblem(422, "INVALID_DEVICE_LABEL", "Invalid device label.")
        refresh_token = self.security.new_refresh_token()
        csrf_token = self.security.new_csrf_token()
        session = RefreshSession(
            id=uuid7(),
            user_id=user.id,
            family_id=family_id,
            parent_session_id=parent_session_id,
            token_hash=self.security.token_hash(refresh_token),
            csrf_token_hash=self.security.token_hash(csrf_token),
            created_at=now,
            expires_at=now + timedelta(seconds=self.settings.refresh_token_ttl_seconds),
            last_used_at=now,
            device_label=device_label.strip() if isinstance(device_label, str) else None,
            user_agent_hash=self.security.user_agent_hash(
                request.headers.get("user-agent")
            ),
        )
        database.add(session)
        database.flush()
        return session, refresh_token, csrf_token

    def _auth_response(
        self,
        user: User,
        session: RefreshSession,
        *,
        status_code: int = 200,
    ) -> JSONResponse:
        access_token, expires_at = self.security.access_token(user.id, session.id)
        return JSONResponse(
            {
                "user": self._serialize_user(user),
                "access_token": access_token,
                "token_type": "Bearer",
                "access_token_expires_at": self._timestamp(expires_at),
            },
            status_code=status_code,
        )

    def _set_auth_cookies(
        self, response: Response, refresh_token: str, csrf_token: str
    ) -> None:
        maximum_age = self.settings.refresh_token_ttl_seconds
        common = {
            "secure": self.settings.cookie_secure,
            "samesite": self.settings.cookie_samesite,
            "max_age": maximum_age,
        }
        response.set_cookie(
            "yarnai_refresh",
            refresh_token,
            httponly=True,
            path="/api/v1/auth",
            **common,
        )
        response.set_cookie(
            "yarnai_csrf", csrf_token, httponly=False, path="/", **common
        )

    def _clear_auth_cookies(self, response: Response) -> None:
        response.delete_cookie(
            "yarnai_refresh",
            path="/api/v1/auth",
            secure=self.settings.cookie_secure,
            httponly=True,
            samesite=self.settings.cookie_samesite,
        )
        response.delete_cookie(
            "yarnai_csrf",
            path="/",
            secure=self.settings.cookie_secure,
            httponly=False,
            samesite=self.settings.cookie_samesite,
        )

    def _verify_csrf(self, request: Request) -> None:
        cookie = request.cookies.get("yarnai_csrf", "")
        header = request.headers.get("x-csrf-token", "")
        if not cookie or not header or not hmac.compare_digest(cookie, header):
            raise ApiProblem(403, "CSRF_FAILED", "CSRF validation failed.")

    def _rate_limit(
        self,
        request: Request,
        bucket: str,
        limit: int,
        window_seconds: int,
    ) -> None:
        client = request.client.host if request.client else "unknown"
        allowed, retry_after = self.limiter.allow(
            f"{bucket}:{client}", limit, window_seconds
        )
        if not allowed:
            raise ApiProblem(
                429,
                "RATE_LIMITED",
                "Too many requests. Try again later.",
                {"retry_after_seconds": retry_after},
            )

    def _enforce_session_limit(
        self, database: Session, user_id: str, now: datetime
    ) -> None:
        active = list(
            database.scalars(
                select(RefreshSession)
                .where(
                    RefreshSession.user_id == user_id,
                    RefreshSession.revoked_at.is_(None),
                    RefreshSession.expires_at > now,
                )
                .order_by(RefreshSession.created_at.asc())
            )
        )
        excess = len(active) - self.settings.max_active_sessions + 1
        for entry in active[: max(0, excess)]:
            entry.revoked_at = now
            entry.revoke_reason = "SESSION_LIMIT"

    @staticmethod
    def _revoke_family(
        database: Session, family_id: str, now: datetime, reason: str
    ) -> None:
        database.execute(
            update(RefreshSession)
            .where(
                RefreshSession.family_id == family_id,
                RefreshSession.revoked_at.is_(None),
            )
            .values(revoked_at=now, revoke_reason=reason)
        )

    @staticmethod
    def _expired(value: datetime, now: datetime) -> bool:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value <= now

    def _idempotency_key(self, request: Request) -> str:
        value = request.headers.get("idempotency-key", "")
        if not IDEMPOTENCY_PATTERN.fullmatch(value):
            raise ApiProblem(
                422,
                "IDEMPOTENCY_KEY_REQUIRED",
                "A valid Idempotency-Key header is required.",
            )
        return value

    def _optional_idempotency_key(
        self,
        request: Request,
        body: dict[str, Any],
    ) -> str | None:
        value = request.headers.get("idempotency-key")
        if value is None:
            value = body.get("operation_id")
        if value is None:
            return None
        if not isinstance(value, str) or not IDEMPOTENCY_PATTERN.fullmatch(value):
            raise ApiProblem(
                422,
                "INVALID_IDEMPOTENCY_KEY",
                "Idempotency-Key or operation_id is invalid.",
            )
        return value

    def _idempotency_replay(
        self,
        database: Session,
        user_id: str,
        endpoint: str,
        idempotency_key: str | None,
        request_hash: str,
    ) -> dict[str, Any] | None:
        if idempotency_key is None:
            return None
        replay = database.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.owner_user_id == user_id,
                IdempotencyRecord.endpoint == endpoint,
                IdempotencyRecord.idempotency_key == idempotency_key,
            )
        )
        if replay is None:
            return None
        if replay.request_hash != request_hash:
            raise ApiProblem(
                409,
                "IDEMPOTENCY_CONFLICT",
                "Idempotency key was already used for another request.",
            )
        return replay.response_body

    @staticmethod
    def _store_idempotency(
        database: Session,
        user_id: str,
        endpoint: str,
        idempotency_key: str | None,
        request_hash: str,
        response_body: dict[str, Any],
        now: datetime,
    ) -> None:
        if idempotency_key is None:
            return
        database.add(
            IdempotencyRecord(
                id=uuid7(),
                owner_user_id=user_id,
                endpoint=endpoint,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response_status=200,
                response_body=response_body,
                created_at=now,
                expires_at=now + timedelta(days=1),
            )
        )

    @staticmethod
    def _reject_json_constant(value: str) -> None:
        raise ValueError(f"Invalid JSON constant: {value}")

    @staticmethod
    def _project_id(value: Any) -> str:
        if not isinstance(value, str) or not UUID_V7_PATTERN.fullmatch(value):
            raise ApiProblem(422, "INVALID_PROJECT_ID", "project_id must be UUIDv7.")
        return value

    @staticmethod
    def _schema_version(value: Any) -> int:
        if value != 1:
            raise ApiProblem(
                422, "UNSUPPORTED_SCHEMA_VERSION", "Only schema_version 1 is supported."
            )
        return 1

    @staticmethod
    def _create_status(value: Any) -> str:
        if value not in ACTIVE_PROJECT_STATUSES:
            raise ApiProblem(
                422, "INVALID_PROJECT_STATUS", "Invalid project lifecycle status."
            )
        return value

    @staticmethod
    def _title(value: Any) -> str:
        if not isinstance(value, str):
            raise ApiProblem(422, "INVALID_TITLE", "Project title is required.")
        title = value.strip()
        if not title or len(title) > 120:
            raise ApiProblem(
                422, "INVALID_TITLE", "Project title must contain 1 to 120 characters."
            )
        return title

    def _payload(self, value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            raise ApiProblem(422, "INVALID_PAYLOAD", "Project payload must be an object.")
        try:
            encoded = canonical_json_bytes(value)
        except (TypeError, ValueError) as error:
            raise ApiProblem(
                422, "INVALID_PAYLOAD", "Project payload is not valid JSON."
            ) from error
        if len(encoded) > self.settings.max_project_payload_bytes:
            raise ApiProblem(413, "PAYLOAD_TOO_LARGE", "Project payload is too large.")
        validate_json_depth(value, self.settings.max_json_depth)
        self._validate_payload_metadata(value)
        return value

    def _validate_payload_metadata(self, value: Any) -> None:
        stack = [value]
        while stack:
            current = stack.pop()
            if isinstance(current, dict):
                for key, entry in current.items():
                    if (
                        isinstance(key, str)
                        and key.endswith("_at")
                        and entry is not None
                        and (
                            not isinstance(entry, str)
                            or not TIMESTAMP_PATTERN.fullmatch(entry)
                            or not self._valid_timestamp(entry)
                        )
                    ):
                        raise ApiProblem(
                            422,
                            "INVALID_TIMESTAMP",
                            f"Invalid UTC timestamp in payload field {key}.",
                        )
                    if key == "revision" and (
                        not isinstance(entry, int)
                        or isinstance(entry, bool)
                        or entry < 1
                    ):
                        raise ApiProblem(
                            422,
                            "INVALID_REVISION",
                            "Payload revisions must be positive integers.",
                        )
                    stack.append(entry)
            elif isinstance(current, list):
                stack.extend(current)

    @staticmethod
    def _valid_timestamp(value: str) -> bool:
        try:
            datetime.fromisoformat(value[:-1] + "+00:00")
            return True
        except ValueError:
            return False

    @staticmethod
    def _source_device_id(value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str) or not 1 <= len(value) <= 128:
            raise ApiProblem(422, "INVALID_DEVICE_ID", "Invalid source_device_id.")
        return value

    @staticmethod
    def _expected_revision(value: Any) -> int:
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            raise ApiProblem(
                422,
                "EXPECTED_REVISION_REQUIRED",
                "expected_revision must be a positive integer.",
            )
        return value

    @staticmethod
    def _owned_project(
        database: Session, user_id: str, project_id: str
    ) -> Project | None:
        return database.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.owner_user_id == user_id,
            )
        )

    def _add_operation(
        self,
        database: Session,
        user_id: str,
        project: Project,
        base_revision: int,
        kind: str,
        operation_id: Any,
        payload: dict[str, Any],
    ) -> None:
        if operation_id is None:
            operation_id = uuid7()
        if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 128:
            raise ApiProblem(422, "INVALID_OPERATION_ID", "Invalid operation ID.")
        database.add(
            SyncOperation(
                id=uuid7(),
                operation_id=operation_id,
                user_id=user_id,
                project_id=project.id,
                base_revision=base_revision,
                applied_revision=project.revision,
                kind=kind,
                payload=payload,
                status="APPLIED",
                created_at=utc_now(),
                source_device_id=project.source_device_id,
            )
        )

    @staticmethod
    def _not_found() -> ApiProblem:
        return ApiProblem(404, "PROJECT_NOT_FOUND", "Project was not found.")

    def _conflict(self, project: Project) -> ApiProblem:
        return ApiProblem(
            409,
            "REVISION_CONFLICT",
            "Project changed since it was read.",
            {
                "current_revision": project.revision,
                "current_project": self._serialize_project(project),
            },
        )

    @staticmethod
    def _serialize_user(user: User) -> dict[str, Any]:
        return {
            "id": user.id,
            "email": user.email,
            "status": user.status,
            "created_at": CloudApi._timestamp(user.created_at),
            "email_verified_at": CloudApi._timestamp(user.email_verified_at),
        }

    @staticmethod
    def _serialize_project(project: Project) -> dict[str, Any]:
        return {
            "id": project.id,
            "schema_version": project.schema_version,
            "status": project.status,
            "title": project.title,
            "payload": project.payload,
            "payload_checksum": project.payload_checksum,
            "revision": project.revision,
            "created_at": CloudApi._timestamp(project.created_at),
            "updated_at": CloudApi._timestamp(project.updated_at),
            "archived_at": CloudApi._timestamp(project.archived_at),
            "deleted_at": CloudApi._timestamp(project.deleted_at),
            "purge_after": CloudApi._timestamp(project.purge_after),
            "source_device_id": project.source_device_id,
            "sync_metadata": project.sync_metadata,
        }

    @staticmethod
    def _timestamp(value: datetime | None) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    @staticmethod
    def _encode_cursor(offset: int) -> str:
        return base64.urlsafe_b64encode(f"v1:{offset}".encode()).decode().rstrip("=")

    @staticmethod
    def _decode_cursor(cursor: str | None) -> int:
        if not cursor:
            return 0
        try:
            padding = "=" * (-len(cursor) % 4)
            decoded = base64.urlsafe_b64decode(cursor + padding).decode()
            prefix, value = decoded.split(":", 1)
            offset = int(value)
            if prefix != "v1" or offset < 0:
                raise ValueError
            return offset
        except (ValueError, UnicodeDecodeError) as error:
            raise ApiProblem(422, "INVALID_CURSOR", "Invalid pagination cursor.") from error

    def _handled_problem(self, request: Request, error: Exception) -> JSONResponse:
        if isinstance(error, ApiProblem):
            return self._problem_response(request, error)
        if isinstance(error, ValueError):
            return self._problem_response(
                request, ApiProblem(422, "VALIDATION_ERROR", str(error))
            )
        raise error

    @staticmethod
    def _problem_response(request: Request, problem: ApiProblem) -> JSONResponse:
        request_id = getattr(request.state, "request_id", "unknown")
        error: dict[str, Any] = {
            "code": problem.code,
            "message": problem.message,
            "request_id": request_id,
        }
        if problem.details:
            error["details"] = problem.details
        headers = {}
        if problem.status_code == 429 and problem.details:
            headers["Retry-After"] = str(problem.details["retry_after_seconds"])
        return JSONResponse(
            {"error": error}, status_code=problem.status_code, headers=headers
        )
