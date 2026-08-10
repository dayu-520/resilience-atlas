from app.services.storage import build_original_storage_key


def test_original_storage_key_is_namespaced_by_dataset():
    key = build_original_storage_key(dataset_id="ds-1", filename="roads.zip")
    assert key == "datasets/ds-1/original/roads.zip"


def test_original_storage_key_sanitizes_path_segments():
    key = build_original_storage_key(dataset_id="ds-1", filename="../roads?.zip")
    assert key == "datasets/ds-1/original/roads_.zip"
