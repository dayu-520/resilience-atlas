import json
import zipfile
from io import BytesIO

from worker.main import DatasetRecord, inspect_uploaded_file, process_dataset


def build_zip(members: dict[str, bytes]) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in members.items():
            archive.writestr(name, content)
    return buffer.getvalue()


class FakeRepository:
    def __init__(self, record):
        self.record = record
        self.processing_ids = []
        self.updates = []

    def get_dataset(self, dataset_id):
        assert dataset_id == self.record.id
        return self.record

    def mark_processing(self, dataset_id):
        self.processing_ids.append(dataset_id)

    def update_inspection(self, dataset_id, result):
        self.updates.append((dataset_id, result))


class FakeStorage:
    def __init__(self, content):
        self.content = content
        self.downloaded_keys = []

    def download_bytes(self, key):
        self.downloaded_keys.append(key)
        return self.content


def test_inspect_shapefile_zip_missing_core_member_fails():
    content = build_zip({"roads.shp": b"shape bytes"})

    result = inspect_uploaded_file("roads.zip", content)

    assert result.type == "vector"
    assert result.status == "failed"
    assert "roads.shx" in result.processing_message
    assert "roads.dbf" in result.processing_message


def test_inspect_tiff_without_spatial_reference_needs_follow_up():
    result = inspect_uploaded_file("population.tif", b"tiff bytes")

    assert result.type == "raster"
    assert result.status == "needs_spatial_reference"
    assert result.srid is None
    assert "spatial reference" in result.processing_message


def test_inspect_geojson_extracts_basic_fields():
    content = json.dumps(
        {
            "type": "FeatureCollection",
            "features": [
                    {
                        "type": "Feature",
                        "properties": {"name": "Road", "rank": 1},
                        "geometry": {"type": "Point", "coordinates": [116.3, 39.9]},
                    }
            ],
        }
    ).encode()

    result = inspect_uploaded_file("roads.geojson", content)

    assert result.type == "vector"
    assert result.status == "ready"
    assert result.fields == [{"name": "name", "type": "str"}, {"name": "rank", "type": "int"}]
    assert result.preview_geojson["type"] == "FeatureCollection"
    assert result.preview_geojson["features"][0]["properties"]["name"] == "Road"


def test_process_dataset_reads_original_file_and_persists_result():
    record = DatasetRecord(
        id="dataset-1",
        original_filename="points.csv",
        storage_key="datasets/dataset-1/original/points.csv",
    )
    repository = FakeRepository(record)
    storage = FakeStorage(b"name,lat,lon\nA,39.9,116.3\n")

    process_dataset("dataset-1", repository=repository, storage=storage)

    assert repository.processing_ids == ["dataset-1"]
    assert storage.downloaded_keys == ["datasets/dataset-1/original/points.csv"]
    assert repository.updates[0][0] == "dataset-1"
    assert repository.updates[0][1].type == "table"
    assert repository.updates[0][1].status == "ready"
    assert repository.updates[0][1].fields == [
        {"name": "name", "type": "str"},
        {"name": "lat", "type": "str"},
        {"name": "lon", "type": "str"},
    ]
    assert repository.updates[0][1].preview_geojson["features"][0]["geometry"]["type"] == "Point"


def test_inspect_csv_builds_point_preview_from_lon_lat_columns():
    result = inspect_uploaded_file("points.csv", b"name,lat,lon\nA,39.9,116.3\n")

    assert result.type == "table"
    assert result.status == "ready"
    assert result.preview_geojson["features"][0]["geometry"] == {
        "type": "Point",
        "coordinates": [116.3, 39.9],
    }


def test_process_dataset_marks_failed_when_inspection_raises():
    record = DatasetRecord(
        id="dataset-1",
        original_filename="roads.zip",
        storage_key="datasets/dataset-1/original/roads.zip",
    )
    repository = FakeRepository(record)
    storage = FakeStorage(b"not a valid zip")

    process_dataset("dataset-1", repository=repository, storage=storage)

    assert repository.processing_ids == ["dataset-1"]
    assert repository.updates[0][1].type == "unknown"
    assert repository.updates[0][1].status == "failed"
    assert "not a valid zip" in repository.updates[0][1].processing_message
