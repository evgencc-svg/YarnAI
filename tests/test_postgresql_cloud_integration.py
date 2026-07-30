from __future__ import annotations

from datetime import timedelta
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import DBAPIError
from starlette.testclient import TestClient

from yarnai.config import RuntimeSettings
from yarnai.database import normalize_database_url
from yarnai.http import create_app
from yarnai.security import uuid7


ROOT = Path(__file__).parents[1]
POSTGRESQL_TEST_URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(
    not POSTGRESQL_TEST_URL.startswith(("postgresql", "postgres://")),
    reason="TEST_DATABASE_URL does not point to PostgreSQL",
)


def _register(client: TestClient, email: str):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Strong password 42!"},
    )
    assert response.status_code == 201, response.text
    return response


def _auth(response):
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_postgresql_auth_project_isolation_conflict_and_logout() -> None:
    normalized_url = normalize_database_url(POSTGRESQL_TEST_URL)
    configuration = Config(str(ROOT / "alembic.ini"))
    configuration.set_main_option("sqlalchemy.url", normalized_url)
    command.upgrade(configuration, "head")
    command.upgrade(configuration, "head")

    engine = create_engine(normalized_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE idempotency_records, sync_operations, projects, "
                "refresh_sessions, users RESTART IDENTITY CASCADE"
            )
        )
    engine.dispose()
    settings = RuntimeSettings(
        host="127.0.0.1",
        port=8000,
        log_level="warning",
        database_url=POSTGRESQL_TEST_URL,
        jwt_access_secret="p" * 32,
        refresh_token_secret="q" * 32,
        argon2_time_cost=1,
        argon2_memory_cost_kib=8192,
        argon2_parallelism=1,
    )

    with TestClient(create_app(settings)) as first_client:
        first_auth = _register(first_client, "postgres-a@example.com")
        project_id = uuid7()
        created = first_client.post(
            "/api/v1/projects",
            json={
                "project_id": project_id,
                "schema_version": 1,
                "status": "ACTIVE",
                "title": "PostgreSQL project",
                "payload": {
                    "project": {
                        "revision": 1,
                        "created_at": "2026-07-30T12:00:00.000Z",
                    }
                },
            },
            headers={**_auth(first_auth), "Idempotency-Key": f"create:{project_id}"},
        )
        assert created.status_code == 201
        updated = first_client.patch(
            f"/api/v1/projects/{project_id}",
            json={"expected_revision": 1, "title": "PostgreSQL revision 2"},
            headers=_auth(first_auth),
        )
        assert updated.status_code == 200
        assert updated.json()["project"]["revision"] == 2
        conflict = first_client.patch(
            f"/api/v1/projects/{project_id}",
            json={"expected_revision": 1, "title": "stale"},
            headers=_auth(first_auth),
        )
        assert conflict.status_code == 409

        with TestClient(create_app(settings)) as second_client:
            second_auth = _register(second_client, "postgres-b@example.com")
            foreign = second_client.get(
                f"/api/v1/projects/{project_id}", headers=_auth(second_auth)
            )
            absent = second_client.get(
                f"/api/v1/projects/{uuid7()}", headers=_auth(second_auth)
            )
            assert foreign.status_code == absent.status_code == 404
            assert foreign.json()["error"]["code"] == absent.json()["error"]["code"]

        csrf = first_client.cookies["yarnai_csrf"]
        logout = first_client.post(
            "/api/v1/auth/logout", headers={"X-CSRF-Token": csrf}
        )
        assert logout.status_code == 204
        assert first_client.get(
            "/api/v1/auth/me", headers=_auth(first_auth)
        ).status_code == 401

    engine = create_engine(normalized_url)
    inspector = inspect(engine)
    assert {
        "ck_projects_archived_state",
        "ck_projects_deleted_state",
        "ck_projects_revision_positive",
        "ck_projects_schema_version",
        "ck_refresh_sessions_expiry",
        "ck_sync_operations_revisions",
        "ck_users_deleted_state",
        "uq_users_email_normalized",
    } <= {
        constraint["name"]
        for table in (
            "users",
            "refresh_sessions",
            "projects",
            "sync_operations",
        )
        for constraint in (
            inspector.get_check_constraints(table)
            + inspector.get_unique_constraints(table)
        )
    }
    assert {"ix_projects_owner_status_updated"} <= {
        index["name"] for index in inspector.get_indexes("projects")
    }
    with engine.connect() as connection:
        trigger_names = set(
            connection.scalars(
                text(
                    "SELECT tgname FROM pg_trigger "
                    "WHERE NOT tgisinternal ORDER BY tgname"
                )
            )
        )
        project_created_at = connection.scalar(
            text("SELECT created_at FROM projects WHERE id = :project_id"),
            {"project_id": project_id},
        )
        logged_out_session = connection.scalar(
            text(
                "SELECT id FROM refresh_sessions "
                "WHERE revoke_reason = 'LOGOUT' LIMIT 1"
            )
        )
    assert {
        "trg_project_invariants",
        "trg_session_invariants",
        "trg_user_invariants",
    } <= trigger_names

    with pytest.raises(DBAPIError):
        with engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE projects SET created_at = :created_at "
                    "WHERE id = :project_id"
                ),
                {
                    "created_at": project_created_at + timedelta(seconds=1),
                    "project_id": project_id,
                },
            )
    with pytest.raises(DBAPIError):
        with engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE refresh_sessions SET revoked_at = NULL "
                    "WHERE id = :session_id"
                ),
                {"session_id": logged_out_session},
            )
    with pytest.raises(DBAPIError):
        with engine.begin() as connection:
            connection.execute(
                text("DELETE FROM projects WHERE id = :project_id"),
                {"project_id": project_id},
            )
    engine.dispose()
