import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class WorkspaceRole(str, enum.Enum):
    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class WorkspaceApplicationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class DatasetType(str, enum.Enum):
    vector = "vector"
    raster = "raster"


class DatasetStatus(str, enum.Enum):
    processing = "processing"
    ready = "ready"
    failed = "failed"


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BlockedUser(Base):
    __tablename__ = "blocked_users"
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    blocked_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    blocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Workspace(Base):
    __tablename__ = "workspaces"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    name_key: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    memberships: Mapped[list["Membership"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[WorkspaceRole] = mapped_column(Enum(WorkspaceRole), default=WorkspaceRole.viewer)
    workspace: Mapped[Workspace] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship()


class WorkspaceApplication(Base):
    __tablename__ = "workspace_applications"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[WorkspaceApplicationStatus] = mapped_column(
        Enum(WorkspaceApplicationStatus), default=WorkspaceApplicationStatus.pending, index=True
    )
    requested_role: Mapped[WorkspaceRole] = mapped_column(
        Enum(WorkspaceRole), default=WorkspaceRole.viewer
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    workspace: Mapped[Workspace] = relationship()
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = (
        Index("ix_datasets_footprint", "footprint", postgresql_using="gist"),
        Index("ix_datasets_workspace_status", "workspace_id", "status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    name: Mapped[str] = mapped_column(String(180))
    description: Mapped[str | None] = mapped_column(Text())
    type: Mapped[DatasetType] = mapped_column(Enum(DatasetType))
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus), default=DatasetStatus.processing)
    error_message: Mapped[str | None] = mapped_column(Text())
    geometry_type: Mapped[str | None] = mapped_column(String(40))
    source_crs: Mapped[str | None] = mapped_column(Text())
    bounds: Mapped[dict | None] = mapped_column(JSONB)
    footprint = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    fields: Mapped[list] = mapped_column(JSONB, default=list)
    statistics: Mapped[dict] = mapped_column(JSONB, default=dict)
    style: Mapped[dict] = mapped_column(JSONB, default=dict)
    source_key: Mapped[str | None] = mapped_column(String(500))
    preview_key: Mapped[str | None] = mapped_column(String(500))
    source_filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    feature_count: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    owner: Mapped[User] = relationship()


class AdminRegion(Base):
    __tablename__ = "admin_regions"
    __table_args__ = (Index("ix_admin_regions_geom", "geom", postgresql_using="gist"),)
    adcode: Mapped[str] = mapped_column(String(12), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    level: Mapped[str] = mapped_column(String(24), index=True)
    parent_adcode: Mapped[str | None] = mapped_column(String(12), index=True)
    center: Mapped[dict | None] = mapped_column(JSONB)
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=False)

