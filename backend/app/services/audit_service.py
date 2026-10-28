import json
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from backend.app.models.audit_log import AuditLog
from backend.app.models.user import User

def log_audit_event(
    db: Session,
    event_type: str,
    entity_type: str,
    summary: str,
    entity_id: Optional[int] = None,
    user: Optional[User] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """
    Creates an immutable audit log entry recording key lifecycle events.
    """
    audit = AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else "system",
        user_role=user.role if user else "system",
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        details_json=json.dumps(details) if details else None,
        ip_address=ip_address,
        timestamp=datetime.utcnow()
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit
