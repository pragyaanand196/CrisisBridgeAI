from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.authority_notification import AuthorityNotification
from backend.app.schemas.notification import AuthorityNotificationOut, NotificationCountOut
from backend.app.services.auth_service import require_authority

router = APIRouter(prefix="/notifications", tags=["Authority Notifications"])

def _enrich_notification_out(notif: AuthorityNotification) -> AuthorityNotificationOut:
    out = AuthorityNotificationOut.model_validate(notif)
    if notif.assistance_request:
        out.assistance_request_status = notif.assistance_request.status
    return out

@router.get("", response_model=List[AuthorityNotificationOut])
def get_authority_notifications(
    unread_only: bool = Query(False, description="Filter for unread notifications only"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of notifications to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Retrieves persistent notifications for the authenticated authority or administrator.
    Never exposes notifications across distinct authority recipients.
    """
    query = db.query(AuthorityNotification).filter(
        AuthorityNotification.recipient_id == current_user.id
    )
    if unread_only:
        query = query.filter(AuthorityNotification.is_read == False)

    notifications = query.order_by(AuthorityNotification.created_at.desc()).limit(limit).all()
    return [_enrich_notification_out(n) for n in notifications]

@router.get("/unread-count", response_model=NotificationCountOut)
def get_unread_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Returns the real-time unread notification count for the authenticated authority.
    """
    count = db.query(AuthorityNotification).filter(
        AuthorityNotification.recipient_id == current_user.id,
        AuthorityNotification.is_read == False
    ).count()
    return NotificationCountOut(unread_count=count)

@router.post("/{notification_id}/read", response_model=AuthorityNotificationOut)
def mark_notification_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Marks a single notification as read.
    Validates recipient ownership to prevent unauthorized state tampering.
    """
    notif = db.query(AuthorityNotification).filter(
        AuthorityNotification.id == notification_id
    ).first()

    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found."
        )

    # Ownership enforcement
    if notif.recipient_id != current_user.id and current_user.role != "administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot alter notifications belonging to another authority."
        )

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.utcnow()
        db.commit()
        db.refresh(notif)

    return _enrich_notification_out(notif)

@router.post("/mark-all-read")
def mark_all_notifications_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Marks all notifications for the authenticated authority as read.
    Only affects the calling authority's notifications.
    """
    now = datetime.utcnow()
    unread_notifications = db.query(AuthorityNotification).filter(
        AuthorityNotification.recipient_id == current_user.id,
        AuthorityNotification.is_read == False
    ).all()

    updated_count = len(unread_notifications)
    for n in unread_notifications:
        n.is_read = True
        n.read_at = now

    if updated_count > 0:
        db.commit()

    return {
        "message": "All notifications marked as read.",
        "updated_count": updated_count
    }
