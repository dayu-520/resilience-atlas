import csv
import json
import os
import zipfile
from dataclasses import dataclass, field
from io import BytesIO, StringIO
from pathlib import Path
from typing import Protocol

import boto3
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from worker.gis_inspector import classify_upload, classify_zip_members, member_name, validate_shapefile_zip_members


@dataclass
class DatasetRecord:
    id: str
    original_filename: str
    storage_key: str


@dataclass
class InspectionResult:
    type: str
    status: str
    fields: list[dict] = field(default_factory=list)
    srid: int | None = None
    preview_geojson: dict | None = None
    processing_message: str | None = None


class DatasetRepositoryProtocol(Protocol):
    def get_dataset(self, dataset_id: str) -> DatasetRecord: ...

    def mark_processing(self, dataset_id: str) -> None: ...

    def update_inspection(self, dataset_id: str, result: InspectionResult) -> None: ...


class ObjectStorageProtocol(Protocol):
    def download_bytes(self, key: str) -> bytes: ...


def _database_url() -> str:
    url = os.getenv(
        "PLATFORM_DATABASE_URL",
        "postgresql://platform:platform_dev@localhost:5432/research_assets",
    )
    return url.replace("postgresql+psycopg://", "postgresql://")


class DatasetRepository:
    def __init__(self, database_url: str | None = None):
        self.database_url = database_url or _database_url()

    def get_dataset(self, dataset_id: str) -> DatasetRecord:
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            row = connection.execute(
                "SELECT id, original_filename, storage_key FROM datasets WHERE id = %s",
                (dataset_id,),
            ).fetchone()
        if row is None:
            raise ValueError(f"Dataset not found: {dataset_id}")
        return DatasetRecord(
            id=str(row["id"]),
            original_filename=row["original_filename"],
            storage_key=row["storage_key"],
        )

    def mark_processing(self, dataset_id: str) -> None:
        with psycopg.connect(self.database_url) as connection:
            connection.execute(
                "UPDATE datasets SET status = %s, processing_message = %s WHERE id = %s",
                ("PROCESSING", "Worker is inspecting the original upload.", dataset_id),
            )

    def update_inspection(self, dataset_id: str, result: InspectionResult) -> None:
        with psycopg.connect(self.database_url) as connection:
            connection.execute(
                """
                UPDATE datasets
                SET type = %s,
                    status = %s,
                    fields = %s,
                    srid = %s,
                    preview_geojson = %s,
                    processing_message = %s
                WHERE id = %s
                """,
                (
                    result.type.upper(),
                    result.status.upper(),
                    Jsonb(result.fields),
                    result.srid,
                    Jsonb(result.preview_geojson) if result.preview_geojson is not None else None,
                    result.processing_message,
                    dataset_id,
                ),
            )


class ObjectStorage:
    def __init__(self):
        self.bucket = os.getenv("PLATFORM_S3_BUCKET", "research-assets")
        self.client = boto3.client(
            "s3",
            endpoint_url=os.getenv("PLATFORM_S3_ENDPOINT_URL", "http://localhost:9000"),
            aws_access_key_id=os.getenv("PLATFORM_S3_ACCESS_KEY_ID", "minioadmin"),
            aws_secret_access_key=os.getenv("PLATFORM_S3_SECRET_ACCESS_KEY", "minioadmin"),
        )

    def download_bytes(self, key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()


def _field_type(value) -> str:
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    return "str"


def _inspect_geojson(content: bytes) -> InspectionResult:
    data = json.loads(content.decode("utf-8-sig"))
    features = data.get("features") or []
    properties = {}
    if features:
        properties = features[0].get("properties") or {}
    fields = [{"name": name, "type": _field_type(value)} for name, value in properties.items()]
    preview = {
        "type": "FeatureCollection",
        "features": [feature for feature in features[:500] if feature.get("geometry")],
    }
    return InspectionResult(
        type="vector",
        status="ready",
        fields=fields,
        preview_geojson=preview,
        processing_message="GeoJSON metadata detected.",
    )


def _float_or_none(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _csv_point_preview(rows: list[dict[str, str]], limit: int = 500) -> dict | None:
    if not rows:
        return None
    fieldnames = {name.lower(): name for name in rows[0].keys()}
    lon_key = fieldnames.get("lon") or fieldnames.get("lng") or fieldnames.get("longitude") or fieldnames.get("x")
    lat_key = fieldnames.get("lat") or fieldnames.get("latitude") or fieldnames.get("y")
    if not lon_key or not lat_key:
        return None

    features = []
    for row in rows[:limit]:
        lon = _float_or_none(row.get(lon_key))
        lat = _float_or_none(row.get(lat_key))
        if lon is None or lat is None:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": dict(row),
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
            }
        )
    return {"type": "FeatureCollection", "features": features} if features else None


def _inspect_csv(content: bytes) -> InspectionResult:
    sample = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(StringIO(sample))
    fields = [{"name": name, "type": "str"} for name in (reader.fieldnames or [])]
    rows = list(reader)
    return InspectionResult(
        type="table",
        status="ready",
        fields=fields,
        preview_geojson=_csv_point_preview(rows),
        processing_message="CSV header metadata detected.",
    )


def _inspect_zip(filename: str, content: bytes) -> InspectionResult:
    with zipfile.ZipFile(BytesIO(content)) as archive:
        members = archive.namelist()

    archive_type = classify_zip_members(members)
    names = {member_name(member) for member in members}
    suffixes = {Path(name).suffix for name in names}

    if archive_type == "raster":
        if any(name.endswith(".prj") or name.endswith(".tif.aux.xml") for name in names):
            return InspectionResult(type="raster", status="ready", processing_message="TIFF sidecar package detected.")
        return InspectionResult(
            type="raster",
            status="needs_spatial_reference",
            processing_message="TIFF package is missing spatial reference sidecar metadata.",
        )

    if suffixes & {".shp", ".shx", ".dbf"}:
        missing = validate_shapefile_zip_members(members)
        if missing:
            return InspectionResult(
                type="vector",
                status="failed",
                processing_message=f"Shapefile zip is missing required members: {', '.join(missing)}.",
            )
        return InspectionResult(type="vector", status="ready", processing_message="Shapefile core members detected.")

    if archive_type == "vector":
        return InspectionResult(type="vector", status="ready", processing_message=f"{filename} vector archive detected.")
    if archive_type == "table":
        return InspectionResult(type="table", status="ready", processing_message=f"{filename} table archive detected.")

    return InspectionResult(type="unknown", status="failed", processing_message="Unsupported or unrecognized zip package.")


def inspect_uploaded_file(filename: str, content: bytes) -> InspectionResult:
    upload_type = classify_upload(filename)
    suffix = Path(filename.lower()).suffix

    if upload_type == "archive":
        return _inspect_zip(filename, content)
    if upload_type == "raster":
        return InspectionResult(
            type="raster",
            status="needs_spatial_reference",
            processing_message="TIFF upload needs spatial reference confirmation before map preview.",
        )
    if suffix in {".geojson", ".json"}:
        return _inspect_geojson(content)
    if suffix == ".csv":
        return _inspect_csv(content)
    if suffix in {".gpkg", ".kml", ".kmz"}:
        return InspectionResult(type="vector", status="ready", processing_message=f"{suffix} metadata detected.")

    return InspectionResult(type=upload_type, status="failed", processing_message="Unsupported GIS upload format.")


def process_dataset(
    dataset_id: str,
    *,
    repository: DatasetRepositoryProtocol,
    storage: ObjectStorageProtocol,
) -> None:
    record = repository.get_dataset(dataset_id)
    repository.mark_processing(dataset_id)
    try:
        content = storage.download_bytes(record.storage_key)
        result = inspect_uploaded_file(record.original_filename, content)
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        if isinstance(exc, zipfile.BadZipFile):
            message = f"Upload is not a valid zip file: {message}"
        result = InspectionResult(type="unknown", status="failed", processing_message=message)
    repository.update_inspection(dataset_id, result)


def inspect_dataset(dataset_id: str) -> None:
    process_dataset(dataset_id, repository=DatasetRepository(), storage=ObjectStorage())
