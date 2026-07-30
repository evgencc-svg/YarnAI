from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from yarnai.config import RuntimeSettings
from yarnai.database import Base, Project, SyncOperation, create_database_engine
from yarnai.http import create_app
from yarnai.security import uuid7


PASSWORD = "Strong password 42!"


@pytest.fixture
def sync_environment(tmp_path):
    database_url = f"sqlite+pysqlite:///{tmp_path / 'sync-test.sqlite3'}"
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
        max_project_payload_bytes=100_000,
    )
    engine = create_database_engine(database_url)
    Base.metadata.create_all(engine)
    with TestClient(create_app(settings)) as client:
        yield client, engine
    engine.dispose()


def register(client: TestClient, email: str = "sync@example.com") -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def operation(
    project_id: str,
    revision: int,
    *,
    operation_id: str | None = None,
    title: str = "Sync project",
) -> dict:
    timestamp = f"2026-07-30T12:00:0{revision}.000Z"
    snapshot = {
        "schema_version": 1,
        "project_id": project_id,
        "title": title,
        "workspace_status": "DRAFT",
        "status_before_archive": None,
        "status_before_delete": None,
        "revision": revision,
        "created_at": "2026-07-30T12:00:01.000Z",
        "updated_at": timestamp,
        "archived_at": None,
        "deleted_at": None,
        "purge_after": None,
    }
    return {
        "schema_version": 1,
        "operation_id": operation_id or uuid7(),
        "project_id": project_id,
        "revision": revision,
        "operation_type": "PROJECT_CREATED" if revision == 1 else "PROJECT_UPDATED",
        "created_at": timestamp,
        "payload": {"project": snapshot},
        "source_device_id": uuid7(),
    }


def upload(client: TestClient, headers: dict[str, str], operations: list[dict]):
    return client.post(
        "/api/v1/sync/upload",
        headers=headers,
        json={"schema_version": 1, "operations": operations},
    )


def test_sync_upload_accepts_one_operation(sync_environment):
    client, engine = sync_environment
    headers = register(client)
    project_id = uuid7()
    item = operation(project_id, 1)

    response = upload(client, headers, [item])

    assert response.status_code == 200
    assert response.json()["errors"] == []
    assert response.json()["confirmed_operations"][0]["operation_id"] == item["operation_id"]
    assert response.json()["server_revisions"] == {project_id: 1}
    with Session(engine) as database:
        assert database.get(Project, project_id).revision == 1


def test_sync_upload_applies_multiple_operations_in_order(sync_environment):
    client, engine = sync_environment
    headers = register(client)
    project_id = uuid7()
    operations = [
        operation(project_id, 1),
        operation(project_id, 2, title="Updated sync project"),
    ]

    response = upload(client, headers, operations)

    assert response.status_code == 200
    assert response.json()["errors"] == []
    assert len(response.json()["confirmed_operations"]) == 2
    assert response.json()["server_revisions"][project_id] == 2
    with Session(engine) as database:
        project = database.get(Project, project_id)
        assert project.revision == 2
        assert project.title == "Updated sync project"


def test_sync_upload_reports_revision_conflict_per_operation(sync_environment):
    client, _engine = sync_environment
    headers = register(client)
    project_id = uuid7()
    assert upload(client, headers, [operation(project_id, 1)]).status_code == 200

    response = upload(client, headers, [operation(project_id, 3)])

    assert response.status_code == 200
    assert response.json()["confirmed_operations"] == []
    error = response.json()["errors"][0]
    assert error["status"] == 409
    assert error["code"] == "REVISION_CONFLICT"
    assert error["current_revision"] == 1


def test_sync_upload_requires_authorization(sync_environment):
    client, _engine = sync_environment

    response = upload(client, {}, [operation(uuid7(), 1)])

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_REQUIRED"


def test_sync_upload_replays_confirmed_operation_without_duplication(sync_environment):
    client, engine = sync_environment
    headers = register(client)
    item = operation(uuid7(), 1)

    first = upload(client, headers, [item])
    repeated = upload(client, headers, [item])

    assert first.status_code == repeated.status_code == 200
    assert repeated.json()["errors"] == []
    assert repeated.json()["confirmed_operations"][0]["replayed"] is True
    with Session(engine) as database:
        count = database.scalar(select(func.count()).select_from(SyncOperation))
        assert count == 1