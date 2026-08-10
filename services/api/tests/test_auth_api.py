from fastapi.testclient import TestClient

from app.api import auth as auth_api
from app.core.security import hash_password
from app.db.models import AuditLog, User
from app.main import app


class FakeAuthSession:
    def __init__(self, user):
        self.user = user
        self.audit_logs = []
        self.committed = False

    def scalar(self, statement):
        return self.user

    def add(self, item):
        if isinstance(item, AuditLog):
            self.audit_logs.append(item)

    def commit(self):
        self.committed = True


def test_login_writes_audit_log_for_successful_authentication():
    user = User(
        id="user-1",
        email="member@example.com",
        password_hash=hash_password("dev-password"),
        display_name="Member",
    )
    fake_db = FakeAuthSession(user)

    app.dependency_overrides[auth_api.get_db] = lambda: fake_db

    try:
        response = TestClient(app).post(
            "/auth/login",
            json={"email": "member@example.com", "password": "dev-password"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert fake_db.audit_logs[0].action == "auth.login"
    assert fake_db.audit_logs[0].actor_id == "user-1"
    assert fake_db.audit_logs[0].target_type == "user"
    assert fake_db.audit_logs[0].target_id == "user-1"
    assert fake_db.committed is True
