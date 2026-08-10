import uuid

from app.security import create_access_token, hash_password, verify_password


def test_password_round_trip() -> None:
    encoded = hash_password("correct-horse-battery-staple")
    assert verify_password("correct-horse-battery-staple", encoded)
    assert not verify_password("wrong", encoded)


def test_access_token_is_created() -> None:
    token = create_access_token(uuid.uuid4())
    assert token.count(".") == 2

