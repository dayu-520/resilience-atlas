from app.api.datasets import normalize_tags
from app.api.datasets import build_dataset_list_statement
from app.api.datasets import build_dataset_preview
from app.db.models import DatasetStatus, DatasetType
from sqlalchemy.dialects import postgresql


def test_normalize_tags_splits_commas_and_spaces():
    assert normalize_tags("韧性, 交通 道路") == ["韧性", "交通", "道路"]


def test_normalize_tags_deduplicates_in_order():
    assert normalize_tags("韧性,交通,韧性") == ["韧性", "交通"]


def test_dataset_list_statement_filters_search_type_status_and_uploader():
    statement = build_dataset_list_statement(
        q="交通",
        type=DatasetType.VECTOR,
        status=DatasetStatus.READY,
        uploader_id="user-1",
    )

    sql = str(statement.compile(dialect=postgresql.dialect()))

    assert "datasets.name ILIKE" in sql
    assert "CAST(datasets.tags AS VARCHAR) ILIKE" in sql
    assert "datasets.type = " in sql
    assert "datasets.status = " in sql
    assert "datasets.uploader_id = " in sql


def test_build_dataset_preview_returns_geojson_contract_for_ready_vector_dataset():
    dataset = type(
        "DatasetStub",
        (),
        {
            "id": "dataset-1",
            "name": "道路韧性",
            "type": DatasetType.VECTOR,
            "status": DatasetStatus.READY,
            "fields": [{"name": "resilience_index", "type": "number"}],
            "preview_geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"dataset_id": "dataset-1", "name": "真实预览"},
                        "geometry": {"type": "Point", "coordinates": [116.3, 39.9]},
                    }
                ],
            },
            "processing_message": None,
        },
    )()

    preview = build_dataset_preview(dataset)

    assert preview["id"] == "dataset-1"
    assert preview["preview_kind"] == "geojson"
    assert preview["geojson"]["type"] == "FeatureCollection"
    assert preview["geojson"]["features"][0]["properties"]["dataset_id"] == "dataset-1"
    assert preview["geojson"]["features"][0]["properties"]["name"] == "真实预览"


def test_build_dataset_preview_reports_processing_when_dataset_is_not_ready():
    dataset = type(
        "DatasetStub",
        (),
        {
            "id": "dataset-2",
            "name": "人口栅格",
            "type": DatasetType.RASTER,
            "status": DatasetStatus.PROCESSING,
            "fields": [],
            "preview_geojson": None,
            "processing_message": "后台识别中",
        },
    )()

    preview = build_dataset_preview(dataset)

    assert preview["preview_kind"] == "unavailable"
    assert preview["geojson"] is None
    assert preview["message"] == "后台识别中"
