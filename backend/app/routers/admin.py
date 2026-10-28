from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.system_config import SystemConfig
from backend.app.models.audit_log import AuditLog
from backend.app.schemas.auth import UserOut, UserRoleUpdate
from backend.app.schemas.audit import AuditLogOut
from pydantic import BaseModel
from backend.app.services.auth_service import require_admin
from backend.app.services.audit_service import log_audit_event
from backend.app.services.maintenance_service import get_cleanup_scope_inspection, clear_all_operational_warnings

router = APIRouter(prefix="/admin", tags=["Administrator Portal"])

@router.get("/users", response_model=List[UserOut])
def list_users(
    role_filter: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = db.query(User)
    if role_filter:
        query = query.filter(User.role == role_filter)
    return query.order_by(User.created_at.desc()).all()

@router.put("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    role_update: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    old_role = user.role
    user.role = role_update.role
    if role_update.department:
        user.department = role_update.department
    if role_update.jurisdiction:
        user.jurisdiction = role_update.jurisdiction

    db.commit()
    db.refresh(user)

    log_audit_event(
        db=db,
        event_type="USER_ROLE_UPDATED",
        entity_type="User",
        entity_id=user.id,
        user=current_user,
        summary=f"Admin {current_user.email} changed user {user.email} role from '{old_role}' to '{user.role}'"
    )

    return user

@router.get("/configs", response_model=Dict[str, Any])
def get_system_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    configs = db.query(SystemConfig).all()
    cfg_dict = {c.key: c.value for c in configs}
    return {
        "COMMUNICATION_GAP_THRESHOLD": cfg_dict.get("COMMUNICATION_GAP_THRESHOLD", "40.0"),
        "UNDERSTANDING_GAP_THRESHOLD": cfg_dict.get("UNDERSTANDING_GAP_THRESHOLD", "25.0"),
        "ASSISTANCE_SURGE_THRESHOLD": cfg_dict.get("ASSISTANCE_SURGE_THRESHOLD", "5"),
        "INSUFFICIENT_DATA_THRESHOLD": cfg_dict.get("INSUFFICIENT_DATA_THRESHOLD", "3")
    }

@router.put("/configs", response_model=Dict[str, str])
def update_system_config(
    key: str = Query(..., description="Config key, e.g. COMMUNICATION_GAP_THRESHOLD"),
    value: str = Query(..., description="New numeric threshold value"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if not cfg:
        cfg = SystemConfig(key=key, value=value, description=f"Admin threshold for {key}")
        db.add(cfg)
    else:
        cfg.value = value
    
    db.commit()

    log_audit_event(
        db=db,
        event_type="CONFIG_CHANGED",
        entity_type="SystemConfig",
        user=current_user,
        summary=f"Admin updated threshold {key} = {value}"
    )

    return {"status": "success", "key": key, "value": value}

@router.get("/audit-logs", response_model=List[AuditLogOut])
def list_audit_logs(
    event_type: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    query = db.query(AuditLog)
    if event_type:
        query = query.filter(AuditLog.event_type == event_type)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    return query.order_by(AuditLog.timestamp.desc()).limit(limit).all()


class ClearWarningsRequest(BaseModel):
    confirm: bool = False


@router.get("/maintenance/inspection", response_model=Dict[str, Any])
def inspect_maintenance_scope(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Admin inspects current operational data scope before any deletion."""
    return get_cleanup_scope_inspection(db)


@router.post("/maintenance/clear-warnings", response_model=Dict[str, Any])
async def admin_clear_warnings(
    req: ClearWarningsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Controlled administrative maintenance: deletes operational warnings
    while guaranteeing 100% preservation of all user accounts and audit logs.
    """
    if not req.confirm:
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Set 'confirm: true' in request body to execute warning cleanup."
        )
    return await clear_all_operational_warnings(db=db, admin_user=current_user)
