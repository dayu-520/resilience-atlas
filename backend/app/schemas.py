import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .models import (
    DatasetStatus,
    DatasetType,
    WorkspaceApplicationStatus,
    WorkspaceRole,
)


USERNAME_PATTERN = r"^[^\s/\\]+$"


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=40, pattern=USERNAME_PATTERN)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)
    workspace_name: str = Field(default="我的工作室", min_length=1, max_length=120)


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    username: str
    display_name: str
    is_admin: bool = False


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RegistrationResponse(BaseModel):
    status: Literal["active", "pending"]
    message: str
    user: UserOut
    access_token: str | None = None
    token_type: str = "bearer"


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    slug: str
    role: WorkspaceRole | None = None


class MemberInvite(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    role: WorkspaceRole = WorkspaceRole.viewer


class MemberOut(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    role: WorkspaceRole


class WorkspaceApplicationOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    display_name: str
    status: WorkspaceApplicationStatus
    requested_role: WorkspaceRole
    created_at: datetime


class WorkspaceApplicationPatch(BaseModel):
    status: Literal["approved", "rejected"]
    role: WorkspaceRole = WorkspaceRole.viewer


class AdminUserOut(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    created_at: datetime
    workspace_count: int
    is_blocked: bool
    is_admin: bool


class AdminUserPatch(BaseModel):
    blocked: bool


class AdminOverviewOut(BaseModel):
    user_count: int
    active_user_count: int
    blocked_user_count: int
    workspace_count: int
    dataset_count: int
    storage_bytes: int


class AdminWorkspaceOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    owner_id: uuid.UUID
    owner_name: str
    owner_username: str
    member_count: int
    dataset_count: int
    storage_bytes: int
    created_at: datetime


class AdminDatasetOut(BaseModel):
    id: uuid.UUID
    name: str
    workspace_id: uuid.UUID
    workspace_name: str
    owner_id: uuid.UUID
    owner_name: str
    type: DatasetType
    status: DatasetStatus
    source_filename: str
    size_bytes: int
    created_at: datetime


class AdminTransferOwner(BaseModel):
    user_id: uuid.UUID


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    workspace_id: uuid.UUID
    owner_id: uuid.UUID
    owner_name: str | None = None
    name: str
    description: str | None
    type: DatasetType
    status: DatasetStatus
    error_message: str | None
    geometry_type: str | None
    source_crs: str | None
    bounds: dict | None
    fields: list
    statistics: dict
    style: dict
    source_filename: str
    size_bytes: int
    feature_count: int | None
    created_at: datetime
    updated_at: datetime


class DatasetPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    style: dict | None = None


class IdentifyRequest(BaseModel):
    lng: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class IdentifyResponse(BaseModel):
    region: dict | None
    datasets: list[DatasetOut]
    point: dict[str, float]