"""create initial research asset schema"""

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260509_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


dataset_type = postgresql.ENUM("VECTOR", "RASTER", "TABLE", "UNKNOWN", name="datasettype")
dataset_status = postgresql.ENUM(
    "PENDING",
    "PROCESSING",
    "READY",
    "NEEDS_SPATIAL_REFERENCE",
    "FAILED",
    name="datasetstatus",
)


def upgrade() -> None:
    dataset_type.create(op.get_bind(), checkfirst=True)
    dataset_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "datasets",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("project", sa.String(length=120), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("type", dataset_type, nullable=False),
        sa.Column("status", dataset_status, nullable=False),
        sa.Column("srid", sa.Integer(), nullable=True),
        sa.Column("fields", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("processing_message", sa.Text(), nullable=True),
        sa.Column("uploader_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("footprint", geoalchemy2.Geometry(geometry_type="GEOMETRY", srid=4326), nullable=True),
        sa.ForeignKeyConstraint(["uploader_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index(op.f("ix_datasets_name"), "datasets", ["name"], unique=False)
    op.create_index(op.f("ix_datasets_project"), "datasets", ["project"], unique=False)
    op.create_index(op.f("ix_datasets_status"), "datasets", ["status"], unique=False)
    op.create_index(op.f("ix_datasets_uploaded_at"), "datasets", ["uploaded_at"], unique=False)
    op.create_index("ix_datasets_tags_gin", "datasets", ["tags"], unique=False, postgresql_using="gin")

    op.create_table(
        "admin_regions",
        sa.Column("id", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("level", sa.String(length=30), nullable=False),
        sa.Column("parent_id", sa.String(length=30), nullable=True),
        sa.Column("geom", geoalchemy2.Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_admin_regions_level"), "admin_regions", ["level"], unique=False)
    op.create_index(op.f("ix_admin_regions_name"), "admin_regions", ["name"], unique=False)
    op.create_index(op.f("ix_admin_regions_parent_id"), "admin_regions", ["parent_id"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("target_type", sa.String(length=80), nullable=False),
        sa.Column("target_id", sa.String(length=80), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"], unique=False)
    op.create_index(op.f("ix_audit_logs_target_id"), "audit_logs", ["target_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_target_type"), "audit_logs", ["target_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_logs_target_type"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_target_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_created_at"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_action"), table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index(op.f("ix_admin_regions_parent_id"), table_name="admin_regions")
    op.drop_index(op.f("ix_admin_regions_name"), table_name="admin_regions")
    op.drop_index(op.f("ix_admin_regions_level"), table_name="admin_regions")
    op.drop_table("admin_regions")

    op.drop_index("ix_datasets_tags_gin", table_name="datasets")
    op.drop_index(op.f("ix_datasets_uploaded_at"), table_name="datasets")
    op.drop_index(op.f("ix_datasets_status"), table_name="datasets")
    op.drop_index(op.f("ix_datasets_project"), table_name="datasets")
    op.drop_index(op.f("ix_datasets_name"), table_name="datasets")
    op.drop_table("datasets")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    dataset_status.drop(op.get_bind(), checkfirst=True)
    dataset_type.drop(op.get_bind(), checkfirst=True)
