from sqlalchemy.orm import Session

from app.db.models import AuditLog


def record_audit_log(
    db: Session,
    *,
    actor_id: str | None,
    action: str,
    target_type: str,
    target_id: str | None = None,
    detail: dict | None = None,
) -> AuditLog:
    log = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail or {},
    )
    db.add(log)
    db.commit()
    return log
