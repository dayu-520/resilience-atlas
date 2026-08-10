import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class DatasetType(str, enum.Enum):
    VECTOR = "vector"
    RASTER = "raster"
    TABLE = "table"
    UNKNOWN = "unknown"


class DatasetStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    NEEDS_SPATIAL_REFERENCE = "needs_spatial_reference"
    FAILED = "failed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(30), default="member")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __init__(self, **kwargs):
        kwargs.setdefault("role", "member")
        kwargs.setdefault("is_active", True)
        super().__init__(**kwargs)


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    project: Mapped[str | None] = mapped_column(String(120), index=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(500), unique=True)
    type: Mapped[DatasetType] = mapped_column(Enum(DatasetType), default=DatasetType.UNKNOWN)
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), default=DatasetStatus.PENDING, index=True)
    srid: Mapped[int | None] = mapped_column()
    fields: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    preview_geojson: Mapped[dict | None] = mapped_column(JSONB)
    processing_message: Mapped[str | None] = mapped_column(Text)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    footprint = mapped_column(Geometry("GEOMETRY", srid=4326, spatial_index=True))

    uploader: Mapped[User] = relationship()


class AdminRegion(Base):
    __tablename__ = "admin_regions"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    level: Mapped[str] = mapped_column(String(30), index=True)
    parent_id: Mapped[str | None] = mapped_column(String(30), index=True)
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326, spatial_index=True))


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str] = mapped_column(String(80), index=True)
    target_id: Mapped[str | None] = mapped_column(String(80), index=True)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


Index("ix_datasets_tags_gin", Dataset.tags, postgresql_using="gin")
