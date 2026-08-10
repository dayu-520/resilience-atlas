from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.api import datasets as datasets_api
from app.db.models import AuditLog, Dataset, User
from app.main import app


class FakeScalarResult:
    def __init__(self, items):
        self.items = items

    def all(self):
        return self.items


class FakeDatasetSession:
    def __init__(self):
        self.datasets: list[Dataset] = []
        self.audit_logs: list[AuditLog] = []
        self.committed = False

    def add(self, item) -> None:
        if isinstance(item, Dataset):
            self.datasets.append(item)
        if isinstance(item, AuditLog):
            self.audit_logs.append(item)

    def flush(self) -> None:
        dataset = self.datasets[-1]
        dataset.id = "dataset-1"
        dataset.uploaded_at = datetime(2026, 5, 10, tzinfo=timezone.utc)

    def commit(self) -> None:
        self.committed = True

    def refresh(self, dataset: Dataset) -> None:
        dataset.uploaded_at = datetime(2026, 5, 10, tzinfo=timezone.utc)

    def get(self, model, item_id: str):
        if model is Dataset:
            return next((dataset for dataset in self.datasets if dataset.id == item_id), None)
        return None

    def scalars(self, statement):
        return FakeScalarResult(self.datasets)


class FakeStorage:
    def __init__(self):
        self.uploads = []

    def upload_fileobj(self, key, fileobj, content_type):
        self.uploads.append(
            {
                "key": key,
                "filename": getattr(fileobj, "name", None),
                "content_type": content_type,
                "content": fileobj.read(),
            }
        )

    def presigned_download_url(self, key, filename, expires_in=900):
        return f"https://storage.local/{key}?filename={filename}&expires={expires_in}"


def test_upload_dataset_uses_current_user_and_replaceable_dependencies():
    fake_db = FakeDatasetSession()
    fake_storage = FakeStorage()
    enqueued: list[str] = []
    current_user = User(id="user-1", email="member@example.com", password_hash="hash", display_name="Member")

    app.dependency_overrides[datasets_api.get_db] = lambda: fake_db
    app.dependency_overrides[datasets_api.get_current_user] = lambda: current_user
    app.dependency_overrides[datasets_api.get_storage] = lambda: fake_storage
    app.dependency_overrides[datasets_api.get_dataset_inspection_enqueue] = lambda: enqueued.append

    try:
        response = TestClient(app).post(
            "/datasets",
            data={
                "name": "道路韧性",
                "project": "京津冀",
                "tags": "交通, 韧性",
                "description": "ArcGIS 导出数据",
            },
            files={"file": ("roads.zip", b"zip-bytes", "application/zip")},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["uploader_id"] == "user-1"
    assert body["tags"] == ["交通", "韧性"]
    assert fake_storage.uploads[0]["key"] == "datasets/dataset-1/original/roads.zip"
    assert fake_storage.uploads[0]["content"] == b"zip-bytes"
    assert enqueued == ["dataset-1"]
    assert fake_db.committed is True
    assert fake_db.audit_logs[0].action == "dataset.uploaded"
    assert fake_db.audit_logs[0].actor_id == "user-1"
    assert fake_db.audit_logs[0].target_id == "dataset-1"


def test_download_dataset_returns_presigned_original_file_url():
    fake_db = FakeDatasetSession()
    dataset = Dataset(
        id="dataset-1",
        name="道路韧性",
        description=None,
        project="京津冀",
        tags=["交通"],
        original_filename="roads.zip",
        storage_key="datasets/dataset-1/original/roads.zip",
        uploader_id="user-1",
    )
    dataset.uploaded_at = datetime(2026, 5, 10, tzinfo=timezone.utc)
    dataset.srid = None
    dataset.fields = []
    dataset.processing_message = None
    fake_db.datasets.append(dataset)
    fake_storage = FakeStorage()
    current_user = User(id="user-2", email="viewer@example.com", password_hash="hash", display_name="Viewer")

    app.dependency_overrides[datasets_api.get_db] = lambda: fake_db
    app.dependency_overrides[datasets_api.get_current_user] = lambda: current_user
    app.dependency_overrides[datasets_api.get_storage] = lambda: fake_storage

    try:
        response = TestClient(app).get("/datasets/dataset-1/download")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "download_url": "https://storage.local/datasets/dataset-1/original/roads.zip?filename=roads.zip&expires=900",
        "expires_in": 900,
    }
    assert fake_db.audit_logs[0].action == "dataset.downloaded"
    assert fake_db.audit_logs[0].actor_id == "user-2"
    assert fake_db.audit_logs[0].target_id == "dataset-1"


def test_get_dataset_detail_returns_dataset_read_for_authenticated_user():
    fake_db = FakeDatasetSession()
    dataset = Dataset(
        id="dataset-1",
        name="道路韧性",
        description="ArcGIS 导出数据",
        project="京津冀",
        tags=["交通"],
        original_filename="roads.zip",
        storage_key="datasets/dataset-1/original/roads.zip",
        type="vector",
        status="ready",
        srid=4326,
        fields=[{"name": "road_id", "type": "str"}],
        processing_message=None,
        uploader_id="user-1",
    )
    dataset.uploaded_at = datetime(2026, 5, 10, tzinfo=timezone.utc)
    fake_db.datasets.append(dataset)
    current_user = User(id="user-2", email="viewer@example.com", password_hash="hash", display_name="Viewer")

    app.dependency_overrides[datasets_api.get_db] = lambda: fake_db
    app.dependency_overrides[datasets_api.get_current_user] = lambda: current_user

    try:
        response = TestClient(app).get("/datasets/dataset-1")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "dataset-1"
    assert body["name"] == "道路韧性"
    assert body["type"] == "vector"
    assert body["status"] == "ready"
    assert body["fields"] == [{"name": "road_id", "type": "str"}]


def test_get_dataset_detail_returns_404_when_missing():
    fake_db = FakeDatasetSession()
    current_user = User(id="user-2", email="viewer@example.com", password_hash="hash", display_name="Viewer")

    app.dependency_overrides[datasets_api.get_db] = lambda: fake_db
    app.dependency_overrides[datasets_api.get_current_user] = lambda: current_user

    try:
        response = TestClient(app).get("/datasets/missing")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["detail"] == "Dataset not found"


def test_get_dataset_preview_returns_geojson_contract():
    fake_db = FakeDatasetSession()
    dataset = Dataset(
        id="dataset-1",
        name="道路韧性",
        description="ArcGIS 导出数据",
        project="京津冀",
        tags=["交通"],
        original_filename="roads.zip",
        storage_key="datasets/dataset-1/original/roads.zip",
        type="vector",
        status="ready",
        srid=4326,
        fields=[{"name": "resilience_index", "type": "number"}],
        processing_message=None,
        uploader_id="user-1",
    )
    dataset.preview_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"dataset_id": "dataset-1", "name": "真实预览"},
                "geometry": {"type": "Point", "coordinates": [116.3, 39.9]},
            }
        ],
    }
    dataset.uploaded_at = datetime(2026, 5, 10, tzinfo=timezone.utc)
    fake_db.datasets.append(dataset)
    current_user = User(id="user-2", email="viewer@example.com", password_hash="hash", display_name="Viewer")

    app.dependency_overrides[datasets_api.get_db] = lambda: fake_db
    app.dependency_overrides[datasets_api.get_current_user] = lambda: current_user

    try:
        response = TestClient(app).get("/datasets/dataset-1/preview")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["preview_kind"] == "geojson"
    assert body["geojson"]["type"] == "FeatureCollection"
    assert body["geojson"]["features"][0]["properties"]["dataset_id"] == "dataset-1"
    assert body["geojson"]["features"][0]["properties"]["name"] == "真实预览"
