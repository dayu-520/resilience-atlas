from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.models import AdminRegion, Dataset, DatasetStatus
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/admin-regions", tags=["admin-regions"])


def serialize_region_result(region_id: str, region_name: str, datasets: list[dict]) -> dict:
    return {"region": {"id": region_id, "name": region_name}, "datasets": datasets}


def build_region_dataset_statement(region_id: str):
    return (
        select(Dataset)
        .where(Dataset.status == DatasetStatus.READY)
        .where(text("ST_Intersects(datasets.footprint, (SELECT geom FROM admin_regions WHERE id = :region_id))"))
        .params(region_id=region_id)
        .order_by(Dataset.uploaded_at.desc())
    )


@router.get("/{region_id}/datasets")
def datasets_for_region(
    region_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    region = db.get(AdminRegion, region_id)
    if not region:
        raise HTTPException(status_code=404, detail="Admin region not found")
    statement = build_region_dataset_statement(region_id)
    datasets = [
        {"id": ds.id, "name": ds.name, "type": ds.type.value, "project": ds.project, "tags": ds.tags}
        for ds in db.scalars(statement).all()
    ]
    return serialize_region_result(region.id, region.name, datasets)
