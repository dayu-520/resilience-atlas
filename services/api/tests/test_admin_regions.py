from app.api.admin_regions import build_region_dataset_statement, serialize_region_result
from sqlalchemy.dialects import postgresql
from fastapi.testclient import TestClient

from app.api import admin_regions as admin_regions_api
from app.main import app


class FakeAdminRegionSession:
    def get(self, model, item_id: str):
        raise AssertionError("database should not be reached without authentication")


def test_serialize_region_result_contains_dataset_summary():
    result = serialize_region_result(
        region_id="110108",
        region_name="海淀区",
        datasets=[{"id": "ds-1", "name": "道路韧性", "type": "vector"}],
    )
    assert result["region"]["id"] == "110108"
    assert result["region"]["name"] == "海淀区"
    assert result["datasets"][0]["name"] == "道路韧性"


def test_region_dataset_lookup_requires_authenticated_user():
    app.dependency_overrides[admin_regions_api.get_db] = lambda: FakeAdminRegionSession()

    try:
        response = TestClient(app).get("/admin-regions/110108/datasets")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401


def test_region_dataset_statement_uses_ready_intersection_query():
    statement = build_region_dataset_statement("110108")

    sql = str(statement.compile(dialect=postgresql.dialect()))

    assert "datasets.status = " in sql
    assert "ST_Intersects" in sql
    assert "admin_regions WHERE id = " in sql
    assert "ORDER BY datasets.uploaded_at DESC" in sql
