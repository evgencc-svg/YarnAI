from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


ROOT = Path(__file__).parents[1]


def test_migrations_create_empty_test_database_and_are_repeatable(
    tmp_path, monkeypatch
) -> None:
    database_path = tmp_path / "migration-test.sqlite3"
    database_url = f"sqlite+pysqlite:///{database_path}"
    monkeypatch.setenv("YARNAI_ALLOW_TEST_DATABASE_ADAPTER", "true")
    configuration = Config(str(ROOT / "alembic.ini"))
    configuration.set_main_option("sqlalchemy.url", database_url)

    command.upgrade(configuration, "head")
    command.upgrade(configuration, "head")

    engine = create_engine(database_url)
    inspector = inspect(engine)
    assert {
        "alembic_version",
        "users",
        "refresh_sessions",
        "projects",
        "sync_operations",
        "idempotency_records",
    } <= set(inspector.get_table_names())
    assert {"ix_projects_owner_status_updated"} <= {
        entry["name"] for entry in inspector.get_indexes("projects")
    }
    assert {"uq_users_email_normalized"} <= {
        entry["name"] for entry in inspector.get_unique_constraints("users")
    }
    assert {"uq_idempotency_owner_endpoint_key"} <= {
        entry["name"]
        for entry in inspector.get_unique_constraints("idempotency_records")
    }
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == (
            "20260730_0001"
        )
    engine.dispose()


def test_postgresql_migration_declares_database_invariant_triggers() -> None:
    migration = (
        ROOT / "migrations" / "versions" / "20260730_0001_cloud_accounts.py"
    ).read_text(encoding="utf-8")
    for required in (
        "trg_project_invariants",
        "project created_at is immutable",
        "project revision cannot decrease",
        "project owner is immutable",
        "deleted project content is immutable",
        "trg_session_invariants",
        "revoked session cannot be restored",
        "ondelete=\"RESTRICT\"",
    ):
        assert required in migration
