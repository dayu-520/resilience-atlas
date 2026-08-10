from app.cli.seed_user import upsert_seed_user
from app.core.security import verify_password
from app.db.models import User


class FakeSeedUserSession:
    def __init__(self, existing_user=None):
        self.existing_user = existing_user
        self.added = []
        self.committed = False

    def scalar(self, statement):
        return self.existing_user

    def add(self, user):
        self.added.append(user)
        self.existing_user = user

    def commit(self):
        self.committed = True

    def refresh(self, user):
        user.id = user.id or "user-1"


def test_upsert_seed_user_creates_active_member_with_hashed_password():
    db = FakeSeedUserSession()

    user = upsert_seed_user(
        db,
        email="member@example.com",
        password="dev-password",
        display_name="Local Member",
    )

    assert user.email == "member@example.com"
    assert user.display_name == "Local Member"
    assert user.role == "member"
    assert user.is_active is True
    assert verify_password("dev-password", user.password_hash)
    assert db.added == [user]
    assert db.committed is True


def test_upsert_seed_user_updates_existing_account_in_place():
    existing_user = User(
        id="user-1",
        email="member@example.com",
        password_hash="old-hash",
        display_name="Old Name",
        role="member",
        is_active=False,
    )
    db = FakeSeedUserSession(existing_user=existing_user)

    user = upsert_seed_user(
        db,
        email="member@example.com",
        password="new-password",
        display_name="New Name",
        role="admin",
    )

    assert user is existing_user
    assert user.display_name == "New Name"
    assert user.role == "admin"
    assert user.is_active is True
    assert verify_password("new-password", user.password_hash)
    assert db.added == []
    assert db.committed is True
