from datetime import datetime

from pydantic import BaseModel, Field

from app.db.models import DatasetStatus, DatasetType


class DatasetRead(BaseModel):
    id: str
    name: str
    description: str | None
    project: str | None
    tags: list[str]
    original_filename: str
    type: DatasetType
    status: DatasetStatus
    srid: int | None
    fields: list[dict]
    preview_geojson: dict | None = None
    processing_message: str | None
    uploader_id: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class DatasetCreateForm(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    project: str | None = None
    tags: list[str] = Field(default_factory=list)


class DatasetDownload(BaseModel):
    download_url: str
    expires_in: int = 900


class DatasetPreview(BaseModel):
    id: str
    name: str
    type: DatasetType
    status: DatasetStatus
    preview_kind: str
    geojson: dict | None = None
    preview_url: str | None = None
    message: str | None = None
