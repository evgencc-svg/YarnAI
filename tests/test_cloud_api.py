from __future__ import annotations

from dataclasses import replace
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from yarnai.config import RuntimeSettings
from yarnai.database import Base, Project, RefreshSession, User, create_database_engine
from yarnai.http import create_app
from yarnai.security import utc_now, uuid7


PASSWORD = "Strong password 42!"


@pytest.fixture
def cloud_environment(tmp_path):
    database_url = f"sqlite+pysqlite:///{tmp_path / 'cloud-test.sqlite3'}"
    settings = RuntimeSettings(
        host="127.0.0.1",
        port=8000,
        log_level="warning",
        database_url=database_url,
        jwt_access_secret="a" * 32,
        refresh_token_secret="b" * 32,
        access_token_ttl_seconds=600,
        refresh_token_ttl_seconds=3600,
        cookie_secure=False,
        cookie_samesite="lax",
        argon2_time_cost=1,
        argon2_memory_cost_kib=8192,
        argon2_parallelism=1,
        max_project_payload_bytes=4096,
    )
    engine = create_database_engine(database_url)
    Base.metadata.create_all(engine)
    with TestClient(create_app(settings)) as client:
        yield client, engine, settings
    engine.dispose()


def register(client: TestClient, email: str = "user@example.com"):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 201, response.text
    return response


def login(client: TestClient, email: str = "user@example.com"):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return response


def authorization(response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def project_body(project_id: str | None = None, title: str = "Шарф"):
    return {
        "project_id": project_id or uuid7(),
        "schema_version": 1,
        "status": "ACTIVE",
        "title": title,
        "payload": {
            "project": {
                "project_id": project_id or uuid7(),
                "revision": 1,
                "created_at": "2026-07-30T12:00:00.000Z",
            }
        },
        "source_device_id": uuid7(),
    }


def create_project(client, auth_response, body=None, key=None):
    body = body or project_body()
    response = client.post(
        "/api/v1/projects",
        json=body,
        headers={
            **authorization(auth_response),
            "Idempotency-Key": key or f"create:{body['project_id']}",
        },
    )
    assert response.status_code == 201, response.text
    return response


def test_registration_normalizes_email_and_never_stores_password(cloud_environment):
    client, engine, _settings = cloud_environment
    response = register(client, "  Person@Example.COM ")
    assert response.json()["user"]["email"] == "Person@Example.COM"
    assert "password" not in response.text.lower()
    with Session(engine) as database:
        row = database.scalar(select(User))
        assert row.email_normalized == "person@example.com"
        assert row.password_hash != PASSWORD
        assert row.password_hash.startswith("$argon2id$")


def test_registration_validation_and_duplicate_are_structured(cloud_environment):
    client, _engine, _settings = cloud_environment
    register(client)
    duplicate = client.post(
        "/api/v1/auth/register",
        json={"email": "USER@example.com", "password": PASSWORD},
    )
    invalid_email = client.post(
        "/api/v1/auth/register",
        json={"email": "not-email", "password": PASSWORD},
    )
    weak = client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "password"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ACCOUNT_UNAVAILABLE"
    assert invalid_email.status_code == 422
    assert weak.status_code == 422
    assert all("request_id" in item.json()["error"] for item in (duplicate, invalid_email, weak))


def test_login_unknown_wrong_and_blocked_are_equivalent(cloud_environment):
    client, engine, _settings = cloud_environment
    register(client)
    wrong = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "Wrong password 42!"},
    )
    unknown = client.post(
        "/api/v1/auth/login",
        json={"email": "unknown@example.com", "password": "Wrong password 42!"},
    )
    with engine.begin() as connection:
        connection.execute(
            User.__table__.update()
            .where(User.email_normalized == "user@example.com")
            .values(status="BLOCKED")
        )
    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": PASSWORD},
    )
    assert wrong.status_code == unknown.status_code == blocked.status_code == 401
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]
    assert blocked.json()["error"]["message"] == wrong.json()["error"]["message"]


def test_me_refresh_rotation_logout_and_cookie_attributes(cloud_environment):
    client, _engine, _settings = cloud_environment
    registered = register(client)
    me = client.get("/api/v1/auth/me", headers=authorization(registered))
    assert me.status_code == 200
    set_cookies = registered.headers.get_list("set-cookie")
    refresh_cookie = next(value for value in set_cookies if value.startswith("yarnai_refresh"))
    assert "HttpOnly" in refresh_cookie
    assert "SameSite=lax" in refresh_cookie
    assert "Path=/api/v1/auth" in refresh_cookie
    assert "Secure" not in refresh_cookie

    old_access = registered.json()["access_token"]
    old_refresh = client.cookies["yarnai_refresh"]
    old_csrf = client.cookies["yarnai_csrf"]
    refreshed = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": old_csrf},
    )
    assert refreshed.status_code == 200
    assert client.cookies["yarnai_refresh"] != old_refresh
    assert refreshed.json()["access_token"] != old_access
    assert client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {old_access}"},
    ).status_code == 401

    csrf = client.cookies["yarnai_csrf"]
    logged_out = client.post(
        "/api/v1/auth/logout",
        headers={"X-CSRF-Token": csrf},
    )
    assert logged_out.status_code == 204
    assert client.get(
        "/api/v1/auth/me",
        headers=authorization(refreshed),
    ).status_code == 401


def test_production_cookie_configuration_sets_secure(cloud_environment):
    _client, _engine, settings = cloud_environment
    with TestClient(create_app(replace(settings, cookie_secure=True))) as client:
        response = client.post(
            "/api/v1/auth/register",
            json={"email": "secure@example.com", "password": PASSWORD},
        )
    assert response.status_code == 201
    assert response.headers["strict-transport-security"] == (
        "max-age=31536000; includeSubDomains"
    )
    cookies = response.headers.get_list("set-cookie")
    assert all("Secure" in value for value in cookies)
    refresh = next(value for value in cookies if value.startswith("yarnai_refresh"))
    csrf = next(value for value in cookies if value.startswith("yarnai_csrf"))
    assert "HttpOnly" in refresh
    assert "Path=/api/v1/auth" in refresh
    assert "HttpOnly" not in csrf
    assert "Path=/" in csrf


def test_reuse_of_rotated_token_revokes_family(cloud_environment):
    client, _engine, _settings = cloud_environment
    registered = register(client)
    old_refresh = client.cookies["yarnai_refresh"]
    old_csrf = client.cookies["yarnai_csrf"]
    replacement = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": old_csrf},
    )
    assert replacement.status_code == 200
    current_refresh = client.cookies["yarnai_refresh"]
    current_csrf = client.cookies["yarnai_csrf"]

    client.cookies.set("yarnai_refresh", old_refresh, path="/api/v1/auth")
    client.cookies.set("yarnai_csrf", old_csrf, path="/")
    reuse = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": old_csrf},
    )
    assert reuse.status_code == 401
    assert reuse.json()["error"]["code"] == "REFRESH_TOKEN_REUSED"

    client.cookies.set("yarnai_refresh", current_refresh, path="/api/v1/auth")
    client.cookies.set("yarnai_csrf", current_csrf, path="/")
    family_revoked = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": current_csrf},
    )
    assert family_revoked.status_code == 401
    assert client.get(
        "/api/v1/auth/me", headers=authorization(replacement)
    ).status_code == 401


def test_expired_and_revoked_refresh_tokens_are_rejected(cloud_environment):
    client, engine, _settings = cloud_environment
    register(client)
    csrf = client.cookies["yarnai_csrf"]
    with engine.begin() as connection:
        created_at = connection.scalar(
            select(RefreshSession.created_at).where(
                RefreshSession.revoked_at.is_(None)
            )
        )
        connection.execute(
            RefreshSession.__table__.update().values(
                expires_at=created_at + timedelta(microseconds=1)
            )
        )
    expired = client.post(
        "/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf}
    )
    assert expired.status_code == 401
    assert expired.json()["error"]["code"] == "SESSION_EXPIRED"

    logged_in = login(client)
    csrf = client.cookies["yarnai_csrf"]
    with engine.begin() as connection:
        token_hashes = connection.execute(
            select(RefreshSession.id).where(RefreshSession.revoked_at.is_(None))
        ).all()
        assert token_hashes
        connection.execute(
            RefreshSession.__table__.update()
            .where(RefreshSession.id == token_hashes[-1][0])
            .values(revoked_at=utc_now())
        )
    revoked = client.post(
        "/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf}
    )
    assert revoked.status_code == 401


def test_project_crud_revision_lifecycle_and_pagination(cloud_environment):
    client, _engine, _settings = cloud_environment
    auth = register(client)
    first_body = project_body()
    created = create_project(client, auth, first_body)
    project = created.json()["project"]
    assert project["revision"] == 1
    assert client.get(
        f"/api/v1/projects/{project['id']}", headers=authorization(auth)
    ).status_code == 200

    for index in range(2):
        create_project(client, auth, project_body(title=f"Project {index}"))
    page_one = client.get(
        "/api/v1/projects?status=active&limit=2", headers=authorization(auth)
    )
    assert len(page_one.json()["projects"]) == 2
    cursor = page_one.json()["pagination"]["next_cursor"]
    page_two = client.get(
        f"/api/v1/projects?status=active&limit=2&cursor={cursor}",
        headers=authorization(auth),
    )
    assert len(page_two.json()["projects"]) == 1

    updated = client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"expected_revision": 1, "title": "Новый шарф"},
        headers=authorization(auth),
    )
    assert updated.status_code == 200
    assert updated.json()["project"]["revision"] == 2
    conflict = client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"expected_revision": 1, "title": "Устаревшее имя"},
        headers=authorization(auth),
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["details"]["current_revision"] == 2

    archived = client.post(
        f"/api/v1/projects/{project['id']}/archive",
        json={"expected_revision": 2},
        headers=authorization(auth),
    )
    assert archived.json()["project"]["status"] == "ARCHIVED"
    restored = client.post(
        f"/api/v1/projects/{project['id']}/restore",
        json={"expected_revision": 3},
        headers=authorization(auth),
    )
    assert restored.json()["project"]["status"] == "ACTIVE"
    deleted = client.request(
        "DELETE",
        f"/api/v1/projects/{project['id']}",
        json={"expected_revision": 4},
        headers=authorization(auth),
    )
    assert deleted.json()["project"]["status"] == "DELETED"
    restored_deleted = client.post(
        f"/api/v1/projects/{project['id']}/restore-deleted",
        json={"expected_revision": 5},
        headers=authorization(auth),
    )
    assert restored_deleted.json()["project"]["status"] == "ACTIVE"
    assert restored_deleted.json()["project"]["revision"] == 6


def test_idempotent_create_payload_limits_and_schema_validation(cloud_environment):
    client, _engine, _settings = cloud_environment
    auth = register(client)
    body = project_body()
    first = create_project(client, auth, body, "stable-create-key")
    repeated = client.post(
        "/api/v1/projects",
        json=body,
        headers={
            **authorization(auth),
            "Idempotency-Key": "stable-create-key",
        },
    )
    assert repeated.status_code == 201
    assert repeated.headers["Idempotency-Replayed"] == "true"
    assert repeated.json() == first.json()

    changed = {**body, "title": "Different"}
    collision = client.post(
        "/api/v1/projects",
        json=changed,
        headers={
            **authorization(auth),
            "Idempotency-Key": "stable-create-key",
        },
    )
    assert collision.status_code == 409
    too_large = project_body()
    too_large["payload"] = {"data": "x" * 5000}
    oversized = client.post(
        "/api/v1/projects",
        json=too_large,
        headers={
            **authorization(auth),
            "Idempotency-Key": "oversized-project",
        },
    )
    assert oversized.status_code == 413
    invalid_schema = project_body()
    invalid_schema["schema_version"] = 2
    invalid = client.post(
        "/api/v1/projects",
        json=invalid_schema,
        headers={
            **authorization(auth),
            "Idempotency-Key": "invalid-schema",
        },
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "UNSUPPORTED_SCHEMA_VERSION"


def test_update_and_lifecycle_mutations_are_idempotent(cloud_environment):
    client, _engine, _settings = cloud_environment
    auth = register(client)
    project = create_project(client, auth).json()["project"]
    update_body = {
        "expected_revision": 1,
        "title": "Idempotent update",
        "operation_id": "update-operation-001",
    }
    first_update = client.patch(
        f"/api/v1/projects/{project['id']}",
        json=update_body,
        headers=authorization(auth),
    )
    repeated_update = client.patch(
        f"/api/v1/projects/{project['id']}",
        json=update_body,
        headers=authorization(auth),
    )
    assert first_update.status_code == repeated_update.status_code == 200
    assert repeated_update.headers["Idempotency-Replayed"] == "true"
    assert repeated_update.json() == first_update.json()
    assert repeated_update.json()["project"]["revision"] == 2

    archive_body = {
        "expected_revision": 2,
        "operation_id": "archive-operation-001",
    }
    first_archive = client.post(
        f"/api/v1/projects/{project['id']}/archive",
        json=archive_body,
        headers=authorization(auth),
    )
    repeated_archive = client.post(
        f"/api/v1/projects/{project['id']}/archive",
        json=archive_body,
        headers=authorization(auth),
    )
    assert first_archive.status_code == repeated_archive.status_code == 200
    assert repeated_archive.headers["Idempotency-Replayed"] == "true"
    assert repeated_archive.json() == first_archive.json()
    assert repeated_archive.json()["project"]["revision"] == 3


def test_non_finite_json_and_server_controlled_fields_are_rejected(
    cloud_environment,
):
    client, _engine, _settings = cloud_environment
    auth = register(client)
    invalid_json = client.post(
        "/api/v1/projects",
        content=(
            '{"project_id":"'
            + uuid7()
            + '","schema_version":1,"status":"ACTIVE","title":"Bad",'
            '"payload":{"value":NaN}}'
        ),
        headers={
            **authorization(auth),
            "Content-Type": "application/json",
            "Idempotency-Key": "non-finite-json",
        },
    )
    assert invalid_json.status_code == 400
    assert invalid_json.json()["error"]["code"] == "INVALID_JSON"

    body = project_body()
    body["owner_user_id"] = uuid7()
    forbidden_owner = client.post(
        "/api/v1/projects",
        json=body,
        headers={
            **authorization(auth),
            "Idempotency-Key": "forbidden-owner",
        },
    )
    assert forbidden_owner.status_code == 422
    assert forbidden_owner.json()["error"]["code"] == "FORBIDDEN_FIELDS"


def test_user_isolation_and_owner_scoped_idempotency(cloud_environment):
    client_a, engine, settings = cloud_environment
    auth_a = register(client_a, "a@example.com")
    body_a = project_body()
    project_a = create_project(client_a, auth_a, body_a, "shared-idem-key").json()[
        "project"
    ]

    with TestClient(create_app(settings)) as client_b:
        auth_b = register(client_b, "b@example.com")
        missing_id = uuid7()
        foreign_get = client_b.get(
            f"/api/v1/projects/{project_a['id']}", headers=authorization(auth_b)
        )
        missing_get = client_b.get(
            f"/api/v1/projects/{missing_id}", headers=authorization(auth_b)
        )
        foreign_update = client_b.patch(
            f"/api/v1/projects/{project_a['id']}",
            json={"expected_revision": 1, "title": "Stolen"},
            headers=authorization(auth_b),
        )
        foreign_delete = client_b.request(
            "DELETE",
            f"/api/v1/projects/{project_a['id']}",
            json={"expected_revision": 1},
            headers=authorization(auth_b),
        )
        assert foreign_get.status_code == missing_get.status_code == 404
        assert foreign_get.json()["error"]["code"] == missing_get.json()["error"]["code"]
        assert foreign_update.status_code == foreign_delete.status_code == 404

        body_b = project_body()
        own = create_project(client_b, auth_b, body_b, "shared-idem-key")
        assert own.status_code == 201
        assert own.json()["project"]["id"] != project_a["id"]

    with engine.connect() as connection:
        assert connection.execute(select(Project)).all()
