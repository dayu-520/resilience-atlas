import re
from collections.abc import Callable

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import String as SqlString
from sqlalchemy import desc, or_, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.models import Dataset, DatasetStatus, DatasetType
from app.db.models import User
from app.db.schemas import DatasetDownload, DatasetPreview, DatasetRead
from app.db.session import get_db
from app.services.audit import record_audit_log
from app.services.jobs import enqueue_dataset_inspection
from app.services.storage import ObjectStorage, build_original_storage_key

router = APIRouter(prefix="/datasets", tags=["datasets"])


def normalize_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = [p.strip() for p in re.split(r"[,，\s]+", raw) if p.strip()]
    result: list[str] = []
    for part in parts:
        if part not in result:
            result.append(part)
    return result


def get_storage() -> ObjectStorage:
    return ObjectStorage()


def get_dataset_inspection_enqueue() -> Callable[[str], None]:
    return enqueue_dataset_inspection


def build_dataset_list_statement(
    q: str | None = None,
    type: DatasetType | None = None,
    status: DatasetStatus | None = None,
    uploader_id: str | None = None,
):
    statement = select(Dataset)
    if q:
        pattern = f"%{q}%"
        statement = statement.where(
            or_(
                Dataset.name.ilike(pattern),
                Dataset.project.ilike(pattern),
                Dataset.original_filename.ilike(pattern),
                Dataset.tags.cast(SqlString).ilike(pattern),
            )
        )
    if type:
        statement = statement.where(Dataset.type == type)
    if status:
        statement = statement.where(Dataset.status == status)
    if uploader_id:
        statement = statement.where(Dataset.uploader_id == uploader_id)
    return statement.order_by(desc(Dataset.uploaded_at))


def build_dataset_preview(dataset: Dataset) -> dict:
    if dataset.status != DatasetStatus.READY:
        return {
            "id": dataset.id,
            "name": dataset.name,
            "type": dataset.type,
            "status": dataset.status,
            "preview_kind": "unavailable",
            "geojson": None,
            "preview_url": None,
            "message": dataset.processing_message or "数据仍在后台识别，暂不可预览",
        }

    if dataset.type in {DatasetType.VECTOR, DatasetType.TABLE, DatasetType.UNKNOWN}:
        preview_geojson = getattr(dataset, "preview_geojson", None)
        return {
            "id": dataset.id,
            "name": dataset.name,
            "type": dataset.type,
            "status": dataset.status,
            "preview_kind": "geojson",
            "geojson": preview_geojson
            or {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {
                            "dataset_id": dataset.id,
                            "name": dataset.name,
                            "preview_note": "预览派生文件尚未生成，当前显示占位要素",
                        },
                        "geometry": {"type": "Point", "coordinates": [116.4, 39.9]},
                    }
                ],
            },
            "preview_url": None,
            "message": None if preview_geojson else "预览派生文件尚未生成，当前显示占位要素",
        }

    return {
        "id": dataset.id,
        "name": dataset.name,
        "type": dataset.type,
        "status": dataset.status,
        "preview_kind": "unavailable",
        "geojson": None,
        "preview_url": None,
        "message": "栅格预览服务尚未生成派生文件",
    }


@router.post("", response_model=DatasetRead)
def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    project: str | None = Form(None),
    tags: str | None = Form(None),
    description: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: ObjectStorage = Depends(get_storage),
    enqueue_inspection: Callable[[str], None] = Depends(get_dataset_inspection_enqueue),
) -> Dataset:
    dataset = Dataset(
        name=name,
        description=description,
        project=project,
        tags=normalize_tags(tags),
        original_filename=file.filename or "upload.bin",
        storage_key="pending",
        type=DatasetType.UNKNOWN,
        status=DatasetStatus.PENDING,
        srid=None,
        fields=[],
        processing_message=None,
        uploader_id=current_user.id,
    )
    db.add(dataset)
    db.flush()
    dataset.storage_key = build_original_storage_key(dataset.id, dataset.original_filename)
    storage.upload_fileobj(dataset.storage_key, file.file, file.content_type or "application/octet-stream")
    db.commit()
    db.refresh(dataset)
    record_audit_log(
        db,
        actor_id=current_user.id,
        action="dataset.uploaded",
        target_type="dataset",
        target_id=dataset.id,
        detail={"filename": dataset.original_filename, "name": dataset.name},
    )
    enqueue_inspection(dataset.id)
    return dataset


@router.get("", response_model=list[DatasetRead])
def list_datasets(
    q: str | None = None,
    type: DatasetType | None = None,
    status: DatasetStatus | None = None,
    uploader_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Dataset]:
    statement = build_dataset_list_statement(q=q, type=type, status=status, uploader_id=uploader_id)
    return list(db.scalars(statement).all())


@router.get("/{dataset_id}", response_model=DatasetRead)
def get_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dataset:
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("/{dataset_id}/download", response_model=DatasetDownload)
def download_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: ObjectStorage = Depends(get_storage),
) -> DatasetDownload:
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    record_audit_log(
        db,
        actor_id=current_user.id,
        action="dataset.downloaded",
        target_type="dataset",
        target_id=dataset.id,
        detail={"filename": dataset.original_filename},
    )
    return DatasetDownload(
        download_url=storage.presigned_download_url(dataset.storage_key, dataset.original_filename),
        expires_in=900,
    )


@router.get("/{dataset_id}/preview", response_model=DatasetPreview)
def preview_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return build_dataset_preview(dataset)
