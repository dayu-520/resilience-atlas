"""Rebuild lightweight browser previews for every stored GeoTIFF."""

import asyncio
import tempfile
from pathlib import Path

from geoalchemy2 import WKTElement
from pyproj import CRS
from sqlalchemy import select

from app.database import SessionLocal
from app.ingestion import build_raster_preview
from app.models import Dataset, DatasetStatus, DatasetType
from app.storage import ObjectStorage


def _source_epsg(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return CRS.from_user_input(value).to_epsg()
    except Exception:
        return None


async def rebuild() -> None:
    storage = ObjectStorage()
    async with SessionLocal() as db:
        datasets = list(
            await db.scalars(
                select(Dataset).where(
                    Dataset.type == DatasetType.raster,
                    Dataset.source_key.is_not(None),
                )
            )
        )
        print(f"Found {len(datasets)} raster dataset(s)")
        for dataset in datasets:
            if not dataset.source_key:
                continue
            with tempfile.TemporaryDirectory(prefix="rebuild-raster-") as temp_dir:
                suffix = Path(dataset.source_filename).suffix.lower() or ".tif"
                source_path = Path(temp_dir) / f"source{suffix}"
                storage.download_file(dataset.source_key, source_path)
                preview, bounds, source_crs, statistics = build_raster_preview(
                    source_path,
                    _source_epsg(dataset.source_crs),
                )
                preview_key = dataset.preview_key or (
                    f"{dataset.workspace_id}/{dataset.id}/preview.tif"
                )
                storage.put_bytes(preview_key, preview, "image/tiff")
                dataset.preview_key = preview_key
                dataset.source_crs = source_crs
                dataset.bounds = bounds
                dataset.footprint = WKTElement(
                    "POLYGON (({west} {south}, {east} {south}, {east} {north}, "
                    "{west} {north}, {west} {south}))".format(**bounds),
                    srid=4326,
                )
                dataset.statistics = statistics
                dataset.status = DatasetStatus.ready
                dataset.error_message = None
                await db.commit()
                print(
                    f"Rebuilt {dataset.name}: {statistics['preview_width']}x"
                    f"{statistics['preview_height']}, {len(preview) / 1024 / 1024:.1f} MiB"
                )


if __name__ == "__main__":
    asyncio.run(rebuild())