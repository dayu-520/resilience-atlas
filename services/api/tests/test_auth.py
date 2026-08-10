from app.core.security import create_access_token, hash_password, verify_password


def test_password_hash_round_trip():
    password_hash = hash_password("correct-password")
    assert verify_password("correct-password", password_hash)
    assert not verify_password("wrong-password", password_hash)


def test_access_token_contains_subject():
    token = create_access_token(subject="user-123")
    assert isinstance(token, str)
    assert token.count(".") == 2
