"""add dataset preview geojson

Revision ID: 20260510_0002
Revises: 20260509_0001
Create Date: 2026-05-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20260510_0002"
down_revision: str | None = "20260509_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("datasets", sa.Column("preview_geojson", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("datasets", "preview_geojson")
