"""Create cloud account, session, project, operation, and idempotency tables."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260730_0001"
down_revision = None
branch_labels = None
depends_on = None

JSON_DOCUMENT = sa.JSON().with_variant(
    postgresql.JSONB(none_as_null=True), "postgresql"
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("email_normalized", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("email_verified_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'BLOCKED', 'DELETED')",
            name="ck_users_status",
        ),
        sa.CheckConstraint(
            "(status = 'DELETED' AND deleted_at IS NOT NULL) OR "
            "(status <> 'DELETED' AND deleted_at IS NULL)",
            name="ck_users_deleted_state",
        ),
        sa.UniqueConstraint(
            "email_normalized", name="uq_users_email_normalized"
        ),
    )
    op.create_index("ix_users_status", "users", ["status"])

    op.create_table(
        "refresh_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("family_id", sa.String(36), nullable=False),
        sa.Column(
            "parent_session_id",
            sa.String(36),
            sa.ForeignKey("refresh_sessions.id", ondelete="SET NULL"),
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("csrf_token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_label", sa.String(120)),
        sa.Column("user_agent_hash", sa.String(64)),
        sa.Column("revoke_reason", sa.String(32)),
        sa.CheckConstraint(
            "expires_at > created_at",
            name="ck_refresh_sessions_expiry",
        ),
        sa.UniqueConstraint("token_hash", name="uq_refresh_sessions_token_hash"),
    )
    op.create_index(
        "ix_refresh_sessions_user_active",
        "refresh_sessions",
        ["user_id", "revoked_at", "expires_at"],
    )
    op.create_index(
        "ix_refresh_sessions_family", "refresh_sessions", ["family_id"]
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "owner_user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("status_before_archive", sa.String(16)),
        sa.Column("status_before_delete", sa.String(16)),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("payload", JSON_DOCUMENT, nullable=False),
        sa.Column("payload_checksum", sa.String(64), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("purge_after", sa.DateTime(timezone=True)),
        sa.Column("source_device_id", sa.String(128)),
        sa.Column("sync_metadata", JSON_DOCUMENT, nullable=False),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED', 'DELETED')",
            name="ck_projects_status",
        ),
        sa.CheckConstraint(
            "revision >= 1", name="ck_projects_revision_positive"
        ),
        sa.CheckConstraint(
            "schema_version = 1", name="ck_projects_schema_version"
        ),
        sa.CheckConstraint(
            "(status = 'DELETED' AND deleted_at IS NOT NULL) OR "
            "(status <> 'DELETED' AND deleted_at IS NULL)",
            name="ck_projects_deleted_state",
        ),
        sa.CheckConstraint(
            "(status <> 'ARCHIVED' OR archived_at IS NOT NULL) AND "
            "(status IN ('ARCHIVED', 'DELETED') OR archived_at IS NULL)",
            name="ck_projects_archived_state",
        ),
    )
    op.create_index(
        "ix_projects_owner_status_updated",
        "projects",
        ["owner_user_id", "status", "updated_at"],
    )

    op.create_table(
        "sync_operations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("operation_id", sa.String(128), nullable=False),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("base_revision", sa.Integer(), nullable=False),
        sa.Column("applied_revision", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("payload", JSON_DOCUMENT, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_device_id", sa.String(128)),
        sa.CheckConstraint(
            "base_revision >= 0 AND applied_revision = base_revision + 1",
            name="ck_sync_operations_revisions",
        ),
        sa.UniqueConstraint(
            "user_id",
            "operation_id",
            name="uq_sync_operations_owner_operation",
        ),
    )
    op.create_index(
        "ix_sync_operations_project_created",
        "sync_operations",
        ["project_id", "created_at"],
    )

    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "owner_user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.String(80), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response_status", sa.Integer(), nullable=False),
        sa.Column("response_body", JSON_DOCUMENT, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "expires_at > created_at",
            name="ck_idempotency_expiry",
        ),
        sa.UniqueConstraint(
            "owner_user_id",
            "endpoint",
            "idempotency_key",
            name="uq_idempotency_owner_endpoint_key",
        ),
    )
    op.create_index(
        "ix_idempotency_expires", "idempotency_records", ["expires_at"]
    )

    if op.get_bind().dialect.name == "postgresql":
        _create_postgresql_invariant_triggers()


def _create_postgresql_invariant_triggers() -> None:
    op.execute(
        """
        CREATE FUNCTION yarnai_project_invariants() RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'projects require retention-aware purge';
          END IF;
          IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'project created_at is immutable';
          END IF;
          IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
            RAISE EXCEPTION 'project owner is immutable';
          END IF;
          IF NEW.revision < OLD.revision THEN
            RAISE EXCEPTION 'project revision cannot decrease';
          END IF;
          IF OLD.status = 'DELETED' AND NEW.status = 'DELETED'
             AND (NEW.payload IS DISTINCT FROM OLD.payload
                  OR NEW.title IS DISTINCT FROM OLD.title) THEN
            RAISE EXCEPTION 'deleted project content is immutable';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_project_invariants
        BEFORE UPDATE OR DELETE ON projects
        FOR EACH ROW EXECUTE FUNCTION yarnai_project_invariants()
        """
    )
    op.execute(
        """
        CREATE FUNCTION yarnai_user_invariants() RETURNS trigger AS $$
        BEGIN
          IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'user created_at is immutable';
          END IF;
          IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            RAISE EXCEPTION 'deleted user cannot be restored by ordinary update';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_user_invariants
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION yarnai_user_invariants()
        """
    )
    op.execute(
        """
        CREATE FUNCTION yarnai_session_invariants() RETURNS trigger AS $$
        BEGIN
          IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'session created_at is immutable';
          END IF;
          IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
            RAISE EXCEPTION 'revoked session cannot be restored';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_session_invariants
        BEFORE UPDATE ON refresh_sessions
        FOR EACH ROW EXECUTE FUNCTION yarnai_session_invariants()
        """
    )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_session_invariants ON refresh_sessions")
        op.execute("DROP FUNCTION IF EXISTS yarnai_session_invariants")
        op.execute("DROP TRIGGER IF EXISTS trg_user_invariants ON users")
        op.execute("DROP FUNCTION IF EXISTS yarnai_user_invariants")
        op.execute("DROP TRIGGER IF EXISTS trg_project_invariants ON projects")
        op.execute("DROP FUNCTION IF EXISTS yarnai_project_invariants")
    op.drop_index("ix_idempotency_expires", table_name="idempotency_records")
    op.drop_table("idempotency_records")
    op.drop_index(
        "ix_sync_operations_project_created", table_name="sync_operations"
    )
    op.drop_table("sync_operations")
    op.drop_index("ix_projects_owner_status_updated", table_name="projects")
    op.drop_table("projects")
    op.drop_index("ix_refresh_sessions_family", table_name="refresh_sessions")
    op.drop_index(
        "ix_refresh_sessions_user_active", table_name="refresh_sessions"
    )
    op.drop_table("refresh_sessions")
    op.drop_index("ix_users_status", table_name="users")
    op.drop_table("users")
