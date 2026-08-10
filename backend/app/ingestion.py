import mimetypes
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from pandas.api.types import is_datetime64_any_dtype, is_numeric_dtype
from pyproj import CRS
from rasterio.enums import Resampling
from rasterio.warp import calculate_default_transform, reproject
from rio_cogeo.cogeo import cog_translate
from rio_cogeo.profiles import cog_profiles
from shapely.geometry import box

from .config import settings
from .models import DatasetType
from .storage import ObjectStorage


@dataclass
class IngestResult:
    type: DatasetType
    geometry_type: str | None
    source_crs: str | None
    bounds: dict
    footprint_wkt: str
    fields: list[dict]
    statistics: dict
    preview_key: str
    source_key: str
    feature_count: int | None
    media_type: str


def _crs_label(value: object) -> str:
    """Prefer a stable authority code, while preserving custom CRS definitions in full."""
    parsed = CRS.from_user_input(value)
    authority = parsed.to_authority(min_confidence=25)
    if authority:
        return f"{authority[0]}:{authority[1]}"
    if hasattr(value, "to_string"):
        return str(value.to_string())
    return parsed.to_wkt()


def _bounds_dict(values: tuple[float, float, float, float]) -> dict:
    west, south, east, north = [float(value) for value in values]
    return {"west": west, "south": south, "east": east, "north": north}


def _normalize_crs(frame: gpd.GeoDataFrame, epsg: int | None) -> gpd.GeoDataFrame:
    if frame.crs is None:
        if not epsg:
            raise ValueError("数据缺少坐标系，请填写 EPSG 代码")
        frame = frame.set_crs(epsg=epsg, allow_override=True)
    elif epsg:
        frame = frame.set_crs(epsg=epsg, allow_override=True)
    return frame.to_crs(4326)


def _vector_fields(frame: gpd.GeoDataFrame) -> list[dict]:
    fields: list[dict] = []
    for name, dtype in frame.drop(columns=[frame.geometry.name], errors="ignore").dtypes.items():
        kind = "number" if is_numeric_dtype(dtype) else "text"
        if is_datetime64_any_dtype(dtype):
            kind = "date"
        fields.append({"name": str(name), "type": kind})
    return fields


def _vector_stats(frame: gpd.GeoDataFrame, fields: list[dict]) -> dict:
    result: dict[str, dict] = {}
    for field in fields:
        if field["type"] != "number":
            continue
        values = frame[field["name"]].dropna()
        if values.empty:
            continue
        result[field["name"]] = {
            "min": float(values.min()),
            "max": float(values.max()),
            "mean": float(values.mean()),
        }
    return {"fields": result}


def ingest_vector(
    path: Path,
    dataset_id: uuid.UUID,
    workspace_id: uuid.UUID,
    source_name: str,
    source_bytes: bytes,
    epsg: int | None,
    storage: ObjectStorage,
) -> IngestResult:
    frame = gpd.read_file(path)
    if frame.empty:
        raise ValueError("文件中没有可用要素")
    source_crs = f"EPSG:{epsg}" if epsg else (_crs_label(frame.crs) if frame.crs else None)
    frame = _normalize_crs(frame, epsg)
    frame = frame[frame.geometry.notna() & ~frame.geometry.is_empty].copy()
    frame.geometry = frame.geometry.make_valid()
    if frame.empty:
        raise ValueError("文件中没有有效几何要素")

    total = tuple(frame.total_bounds)
    fields = _vector_fields(frame)
    stats = _vector_stats(frame, fields)
    geometry_types = sorted({str(value) for value in frame.geom_type.unique()})
    preview = frame.to_json(drop_id=True, to_wgs84=True).encode("utf-8")

    suffix = Path(source_name).suffix.lower() or ".geojson"
    base = f"{workspace_id}/{dataset_id}"
    source_key = f"{base}/source{suffix}"
    preview_key = f"{base}/preview.geojson"
    source_type = mimetypes.guess_type(source_name)[0] or "application/octet-stream"
    storage.put_bytes(source_key, source_bytes, source_type)
    storage.put_bytes(preview_key, preview, "application/geo+json")

    return IngestResult(
        type=DatasetType.vector,
        geometry_type=geometry_types[0] if len(geometry_types) == 1 else "Mixed",
        source_crs=source_crs,
        bounds=_bounds_dict(total),
        footprint_wkt=box(*total).wkt,
        fields=fields,
        statistics=stats,
        preview_key=preview_key,
        source_key=source_key,
        feature_count=len(frame),
        media_type=source_type,
    )


def _raster_statistics(dataset: rasterio.DatasetReader) -> dict:
    band = dataset.read(1, masked=True, out_shape=(min(dataset.height, 1024), min(dataset.width, 1024)))
    values = band.compressed().astype("float64")
    if not len(values):
        return {"bands": dataset.count, "min": 0, "max": 0, "quantiles": []}
    quantiles = np.quantile(values, np.linspace(0, 1, 13)).tolist()
    return {
        "bands": dataset.count,
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "mean": float(np.mean(values)),
        "quantiles": [float(value) for value in quantiles],
        "nodata": dataset.nodata,
    }


def _scaled_raster_size(width: int, height: int, max_dimension: int) -> tuple[int, int]:
    """Fit a raster inside the preview size without ever upscaling it."""
    largest = max(width, height)
    if largest <= max_dimension:
        return width, height
    ratio = max_dimension / largest
    return max(1, round(width * ratio)), max(1, round(height * ratio))


def build_raster_preview(
    source_path: Path,
    source_epsg: int | None,
    max_dimension: int | None = None,
) -> tuple[bytes, dict, str, dict]:
    """Create a browser-friendly WGS84 COG while leaving the source file untouched."""
    preview_limit = max_dimension or settings.raster_preview_max_dimension
    if preview_limit < 256:
        raise ValueError("栅格预览尺寸不能小于 256 像素")

    with tempfile.TemporaryDirectory(prefix="resilience-raster-preview-") as temp_dir:
        warped = Path(temp_dir) / "warped.tif"
        cog = Path(temp_dir) / "preview.tif"
        with rasterio.open(source_path) as source:
            source_crs = CRS.from_epsg(source_epsg) if source_epsg else source.crs
            if source_crs is None:
                raise ValueError("栅格缺少坐标系，请填写 EPSG 代码")

            transform, projected_width, projected_height = calculate_default_transform(
                source_crs,
                "EPSG:4326",
                source.width,
                source.height,
                *source.bounds,
            )
            width, height = _scaled_raster_size(
                projected_width,
                projected_height,
                preview_limit,
            )
            if (width, height) != (projected_width, projected_height):
                transform = transform * transform.scale(
                    projected_width / width,
                    projected_height / height,
                )

            profile = source.profile.copy()
            for key in ("blockxsize", "blockysize", "tiled", "compress", "predictor"):
                profile.pop(key, None)
            profile.update(
                driver="GTiff",
                crs="EPSG:4326",
                transform=transform,
                width=width,
                height=height,
                compress="deflate",
                tiled=True,
                blockxsize=256,
                blockysize=256,
                bigtiff="IF_SAFER",
            )
            with rasterio.open(warped, "w", **profile) as target:
                for band in range(1, source.count + 1):
                    reproject(
                        source=rasterio.band(source, band),
                        destination=rasterio.band(target, band),
                        src_transform=source.transform,
                        src_crs=source_crs,
                        src_nodata=source.nodata,
                        dst_transform=transform,
                        dst_crs="EPSG:4326",
                        dst_nodata=source.nodata,
                        resampling=Resampling.bilinear,
                    )

        cog_translate(
            str(warped),
            str(cog),
            cog_profiles.get("deflate"),
            in_memory=False,
            quiet=True,
            overview_resampling="average",
        )
        with rasterio.open(cog) as dataset:
            bounds = _bounds_dict(tuple(dataset.bounds))
            stats = _raster_statistics(dataset)
            stats.update(
                {
                    "preview_width": dataset.width,
                    "preview_height": dataset.height,
                    "preview_max_dimension": preview_limit,
                }
            )
        return cog.read_bytes(), bounds, _crs_label(source_crs), stats


def ingest_raster(
    path: Path,
    dataset_id: uuid.UUID,
    workspace_id: uuid.UUID,
    source_name: str,
    source_bytes: bytes,
    epsg: int | None,
    storage: ObjectStorage,
) -> IngestResult:
    preview_bytes, bounds, source_crs, stats = build_raster_preview(path, epsg)

    base = f"{workspace_id}/{dataset_id}"
    suffix = Path(source_name).suffix.lower() or ".tif"
    source_key = f"{base}/source{suffix}"
    preview_key = f"{base}/preview.tif"
    storage.put_bytes(source_key, source_bytes, "image/tiff")
    storage.put_bytes(preview_key, preview_bytes, "image/tiff")
    return IngestResult(
        type=DatasetType.raster,
        geometry_type=None,
        source_crs=source_crs,
        bounds=bounds,
        footprint_wkt=box(
            bounds["west"], bounds["south"], bounds["east"], bounds["north"]
        ).wkt,
        fields=[],
        statistics=stats,
        preview_key=preview_key,
        source_key=source_key,
        feature_count=None,
        media_type="image/tiff",
    )


def ingest_file(
    source_name: str,
    source_bytes: bytes,
    dataset_id: uuid.UUID,
    workspace_id: uuid.UUID,
    epsg: int | None,
    storage: ObjectStorage,
) -> IngestResult:
    suffix = Path(source_name).suffix.lower()
    if suffix not in {".zip", ".json", ".geojson", ".tif", ".tiff"}:
        raise ValueError("仅支持 Shapefile ZIP、GeoJSON 和 GeoTIFF")
    with tempfile.TemporaryDirectory(prefix="resilience-upload-") as temp_dir:
        path = Path(temp_dir) / f"source{suffix}"
        path.write_bytes(source_bytes)
        if suffix in {".tif", ".tiff"}:
            return ingest_raster(path, dataset_id, workspace_id, source_name, source_bytes, epsg, storage)
        return ingest_vector(path, dataset_id, workspace_id, source_name, source_bytes, epsg, storage)

