from app.db.models import Dataset, DatasetStatus, DatasetType, User


def test_dataset_defaults_are_enterprise_safe():
    dataset = Dataset(
        name="道路韧性评价",
        original_filename="roads.zip",
        storage_key="originals/roads.zip",
        type=DatasetType.VECTOR,
        status=DatasetStatus.PENDING,
        uploader_id="user-1",
    )
    assert dataset.name == "道路韧性评价"
    assert dataset.status is DatasetStatus.PENDING
    assert dataset.type is DatasetType.VECTOR


def test_user_full_access_member_flag():
    user = User(email="member@example.com", password_hash="hash", display_name="Member")
    assert user.is_active is True
    assert user.role == "member"
