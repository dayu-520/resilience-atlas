from app.db.models import AuditLog
from app.services.audit import record_audit_log


class FakeAuditSession:
    def __init__(self):
        self.added = []
        self.committed = False

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.committed = True


def test_record_audit_log_adds_structured_event_and_commits():
    db = FakeAuditSession()

    log = record_audit_log(
        db,
        actor_id="user-1",
        action="dataset.downloaded",
        target_type="dataset",
        target_id="dataset-1",
        detail={"filename": "roads.zip"},
    )

    assert isinstance(log, AuditLog)
    assert log.actor_id == "user-1"
    assert log.action == "dataset.downloaded"
    assert log.target_type == "dataset"
    assert log.target_id == "dataset-1"
    assert log.detail == {"filename": "roads.zip"}
    assert db.added == [log]
    assert db.committed is True
