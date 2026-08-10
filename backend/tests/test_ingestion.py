import json
import uuid

import numpy as np
import pytest
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from app.ingestion import ingest_file
from app.config import settings
from app.models import DatasetType


class MemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put_bytes(self, key: str, content: bytes, content_type: str) -> None:
        self.objects[key] = (content, content_type)


def test_geojson_ingestion_extracts_spatial_metadata() -> None:
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "北京站点", "score": 82},
                "geometry": {"type": "Point", "coordinates": [116.4074, 39.9042]},
            },
            {
                "type": "Feature",
                "properties": {"name": "天津站点", "score": 68},
                "geometry": {"type": "Point", "coordinates": [117.2009, 39.0842]},
            },
        ],
    }
    storage = MemoryStorage()
    result = ingest_file(
        "sample.geojson",
        json.dumps(payload, ensure_ascii=False).encode(),
        uuid.uuid4(),
        uuid.uuid4(),
        None,
        storage,  # type: ignore[arg-type]
    )

    assert result.type == DatasetType.vector
    assert result.geometry_type == "Point"
    assert result.feature_count == 2
    assert result.bounds["west"] == pytest.approx(116.4074)
    assert {field["name"]: field["type"] for field in result.fields} == {
        "name": "text",
        "score": "number",
    }
    assert result.source_key in storage.objects
    assert result.preview_key in storage.objects


def test_rejects_unknown_file_type() -> None:
    with pytest.raises(ValueError, match="仅支持"):
        ingest_file(
            "sample.csv",
            b"x,y",
            uuid.uuid4(),
            uuid.uuid4(),
            None,
            MemoryStorage(),  # type: ignore[arg-type]
        )


def test_raster_ingestion_builds_small_preview_and_keeps_source(tmp_path, monkeypatch) -> None:
    source_path = tmp_path / "large.tif"
    values = np.linspace(0, 100, 600 * 300, dtype="float32").reshape(300, 600)
    with rasterio.open(
        source_path,
        "w",
        driver="GTiff",
        width=600,
        height=300,
        count=1,
        dtype="float32",
        crs="EPSG:32650",
        transform=from_origin(500000, 4500000, 30, 30),
        nodata=-9999,
    ) as target:
        target.write(values, 1)
    source_bytes = source_path.read_bytes()
    monkeypatch.setattr(settings, "raster_preview_max_dimension", 256)
    storage = MemoryStorage()

    result = ingest_file(
        "large.tif",
        source_bytes,
        uuid.uuid4(),
        uuid.uuid4(),
        None,
        storage,  # type: ignore[arg-type]
    )

    assert storage.objects[result.source_key][0] == source_bytes
    preview_bytes = storage.objects[result.preview_key][0]
    with MemoryFile(preview_bytes) as memory:
        with memory.open() as preview:
            assert max(preview.width, preview.height) == 256
            assert preview.crs.to_epsg() == 4326
    assert result.statistics["preview_width"] <= 256
    assert result.statistics["preview_height"] <= 256
    assert len(preview_bytes) < len(source_bytes)