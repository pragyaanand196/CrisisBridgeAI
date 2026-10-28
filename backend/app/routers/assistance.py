from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.response_zone import ResponseZone
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.schemas.assistance import (
    AssistanceRequestCreate,
    AssistanceRequestUpdate,
    AssistanceRequestOut,
    AssistanceDispatch,
    AssistanceVerifyArrival,
    AssistanceResolve
)
from backend.app.services.auth_service import get_current_user, require_authenticated_user, require_authority
from backend.app.services.analytics_service import compute_zone_metrics
from backend.app.services.audit_service import log_audit_event
from backend.app.services.websocket_manager import ws_manager
from backend.app.services.notification_service import notification_service

router = APIRouter(prefix="/assistance", tags=["Assistance Requests"])

def _enrich_assistance_out(req: AssistanceRequest, db: Session) -> AssistanceRequestOut:
    """Helper to enrich AssistanceRequestOut with linked user, warning, and zone names."""
    out = AssistanceRequestOut.model_validate(req)
    
    # Enrich user full name
    if req.user:
        out.user_full_name = req.user.full_name
    elif req.user_id:
        u = db.query(User).filter(User.id == req.user_id).first()
        if u:
            out.user_full_name = u.full_name
            
    # Enrich warning title
    if req.warning:
        out.warning_title = req.warning.title
    elif req.warning_id:
        w = db.query(Warning).filter(Warning.id == req.warning_id).first()
        if w:
            out.warning_title = w.title

    # Enrich zone name
    if req.response_zone:
        out.zone_name = req.response_zone.name
    elif req.response_zone_id:
        z = db.query(ResponseZone).filter(ResponseZone.id == req.response_zone_id).first()
        if z:
            out.zone_name = z.name

    return out

@router.post("", response_model=AssistanceRequestOut, status_code=status.HTTP_201_CREATED)
async def request_assistance(
    req_in: AssistanceRequestCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Submits a prioritized citizen assistance request.
    Categories: evacuation, medical, shelter, food_water, special_needs, other
    """
    warning = db.query(Warning).filter(Warning.id == req_in.warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Disaster warning not found.")

    zone_id = req_in.response_zone_id
    if not zone_id:
        first_zone = db.query(ResponseZone).filter(ResponseZone.warning_id == warning.id).first()
        if first_zone:
            zone_id = first_zone.id

    now = datetime.utcnow()
    new_req = AssistanceRequest(
        warning_id=req_in.warning_id,
        response_zone_id=zone_id,
        user_id=current_user.id if current_user else None,
        category=req_in.category,
        urgency_level=req_in.urgency_level,
        headcount=req_in.headcount,
        location_description=req_in.location_description,
        latitude=req_in.latitude,
        longitude=req_in.longitude,
        contact_phone=req_in.contact_phone,
        special_notes=req_in.special_notes,
        status="Pending",
        created_at=now
    )
    db.add(new_req)
    db.commit()
    db.refresh(new_req)

    # Recalculate zone situation and metrics
    if zone_id:
        zone = db.query(ResponseZone).filter(ResponseZone.id == zone_id).first()
        if zone:
            compute_zone_metrics(zone, db)
            db.commit()

    # Generate persistent notifications for relevant authorities
    try:
        await notification_service.create_authority_notifications_for_assistance_request(
            db=db,
            request=new_req,
            citizen=current_user
        )
    except Exception as notif_err:
        pass

    # Real-time WebSocket broadcast for emergency triage
    await ws_manager.broadcast("ASSISTANCE_REQUEST_CREATED", {
        "id": new_req.id,
        "warning_id": new_req.warning_id,
        "zone_id": new_req.response_zone_id,
        "category": new_req.category,
        "urgency_level": new_req.urgency_level,
        "headcount": new_req.headcount,
        "location_description": new_req.location_description,
        "citizen_name": current_user.full_name if current_user else "Citizen",
        "created_at": new_req.created_at.isoformat() if new_req.created_at else None
    })

    log_audit_event(
        db=db,
        event_type="ASSISTANCE_REQUESTED",
        entity_type="AssistanceRequest",
        entity_id=new_req.id,
        user=current_user,
        summary=f"New {new_req.urgency_level} urgency assistance request for {new_req.category} (headcount {new_req.headcount}) at {new_req.location_description}"
    )

    return _enrich_assistance_out(new_req, db)

@router.get("/my-requests", response_model=List[AssistanceRequestOut])
def get_my_assistance_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Returns all assistance requests submitted by the authenticated citizen.
    Allows citizen to track acknowledgement, dispatch unit, and verification status.
    """
    requests = db.query(AssistanceRequest).filter(
        AssistanceRequest.user_id == current_user.id
    ).order_by(AssistanceRequest.created_at.desc()).all()
    
    return [_enrich_assistance_out(r, db) for r in requests]

@router.get("", response_model=List[AssistanceRequestOut])
def list_assistance_requests(
    warning_id: Optional[int] = Query(None),
    zone_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None),
    category_filter: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Lists assistance requests for authority triage dashboard.
    Supports filtering by warning ID, zone, status, and category.
    """
    query = db.query(AssistanceRequest)
    if warning_id:
        query = query.filter(AssistanceRequest.warning_id == warning_id)
    if zone_id:
        query = query.filter(AssistanceRequest.response_zone_id == zone_id)
    if status_filter and status_filter != "ALL":
        query = query.filter(AssistanceRequest.status == status_filter)
    if category_filter and category_filter != "ALL":
        query = query.filter(AssistanceRequest.category == category_filter)
        
    requests = query.order_by(AssistanceRequest.created_at.desc()).all()
    return [_enrich_assistance_out(r, db) for r in requests]

@router.get("/{request_id}", response_model=AssistanceRequestOut)
def get_assistance_request_detail(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Retrieves details for a single emergency assistance request by database ID.
    Enforces RBAC:
    - Authority or administrator accounts can view authorized requests.
    - Citizen accounts can only view their own submitted assistance request.
    """
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emergency assistance request not found."
        )

    # Authorization verification
    if current_user.role == "citizen" and req.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not authorized to view another citizen's assistance request."
        )

    return _enrich_assistance_out(req, db)

@router.post("/{request_id}/acknowledge", response_model=AssistanceRequestOut)
async def acknowledge_assistance_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Authority acknowledges citizen assistance request:
    - Persists authority identity and acknowledgement timestamp.
    - Updates status to 'Acknowledged'.
    - Broadcasts acknowledgement notification to the citizen.
    """
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Assistance request not found.")

    now = datetime.utcnow()
    req.status = "Acknowledged"
    req.acknowledged_by_id = current_user.id
    req.acknowledged_at = now
    req.updated_at = now

    db.commit()
    db.refresh(req)

    # Broadcast notification event to citizen and operations centers
    await ws_manager.broadcast("ASSISTANCE_ACKNOWLEDGED", {
        "id": req.id,
        "warning_id": req.warning_id,
        "citizen_id": req.user_id,
        "status": "Acknowledged",
        "acknowledged_by": current_user.full_name,
        "acknowledged_at": now.isoformat(),
        "category": req.category,
        "location_description": req.location_description,
        "message": f"Your emergency assistance request (#{req.id}) for {req.category} at {req.location_description} has been acknowledged by disaster authorities. Response operations are being initiated."
    })

    log_audit_event(
        db=db,
        event_type="ASSISTANCE_ACKNOWLEDGED",
        entity_type="AssistanceRequest",
        entity_id=req.id,
        user=current_user,
        summary=f"Authority {current_user.full_name} acknowledged assistance request #{req.id} ({req.category} at {req.location_description})"
    )

    return _enrich_assistance_out(req, db)

@router.post("/{request_id}/dispatch", response_model=AssistanceRequestOut)
async def dispatch_assistance_request(
    request_id: int,
    dispatch_in: AssistanceDispatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Authority dispatches rescue/aid unit for an assistance request:
    - Persists dispatched unit, authority identity, and dispatch timestamp.
    - Sets status to 'Dispatched' and verification to 'Pending Verification'.
    - Sends follow-up verification question to citizen: 'Has emergency assistance reached your location?'
    """
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Assistance request not found.")

    now = datetime.utcnow()
    unit_notes = dispatch_in.dispatched_unit_notes or "Disaster Quick Response Unit"

    req.status = "Dispatched"
    req.dispatched_by_id = current_user.id
    req.dispatched_at = now
    req.dispatched_unit_notes = unit_notes
    req.citizen_verification_status = "Pending Verification"
    req.updated_at = now

    db.commit()
    db.refresh(req)

    # Broadcast dispatch event and verification prompt for the targeted citizen
    await ws_manager.broadcast("ASSISTANCE_DISPATCHED", {
        "id": req.id,
        "warning_id": req.warning_id,
        "citizen_id": req.user_id,
        "status": "Dispatched",
        "dispatched_unit_notes": unit_notes,
        "dispatched_by": current_user.full_name,
        "dispatched_at": now.isoformat(),
        "verification_prompt": "Has emergency assistance reached your location?",
        "category": req.category,
        "location_description": req.location_description
    })

    log_audit_event(
        db=db,
        event_type="ASSISTANCE_DISPATCHED",
        entity_type="AssistanceRequest",
        entity_id=req.id,
        user=current_user,
        summary=f"Authority {current_user.full_name} dispatched unit '{unit_notes}' for assistance request #{req.id}"
    )

    return _enrich_assistance_out(req, db)

@router.post("/{request_id}/verify-arrival", response_model=AssistanceRequestOut)
async def verify_assistance_arrival(
    request_id: int,
    verify_in: AssistanceVerifyArrival,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Citizen responds to 'Has emergency assistance reached your location?':
    - Validates ownership: only the citizen who requested assistance can submit verification.
    - If assistance_arrived == True: records 'Assistance Arrived' with timestamp and notes.
    - If assistance_arrived == False: records 'Assistance Not Arrived' with feedback notes.
    - Persists response-area verification evidence.
    """
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Assistance request not found.")

    # Ownership check: citizen must be the requester or admin
    if req.user_id and req.user_id != current_user.id and current_user.role not in ["administrator", "authority"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to verify an assistance request belonging to another citizen."
        )

    now = datetime.utcnow()
    if verify_in.assistance_arrived:
        req.citizen_verification_status = "Assistance Arrived"
    else:
        req.citizen_verification_status = "Assistance Not Arrived"

    req.citizen_verified_at = now
    req.citizen_verification_notes = verify_in.citizen_feedback_notes
    req.updated_at = now

    db.commit()
    db.refresh(req)

    # Re-evaluate zone metrics with new response-area evidence
    if req.response_zone_id:
        zone = db.query(ResponseZone).filter(ResponseZone.id == req.response_zone_id).first()
        if zone:
            compute_zone_metrics(zone, db)
            db.commit()

    # Broadcast verification result to authority command centers in real time
    await ws_manager.broadcast("ASSISTANCE_VERIFIED", {
        "id": req.id,
        "warning_id": req.warning_id,
        "zone_id": req.response_zone_id,
        "citizen_id": current_user.id,
        "citizen_name": current_user.full_name,
        "assistance_arrived": verify_in.assistance_arrived,
        "citizen_verification_status": req.citizen_verification_status,
        "citizen_verified_at": now.isoformat(),
        "notes": req.citizen_verification_notes,
        "location_description": req.location_description
    })

    log_audit_event(
        db=db,
        event_type="ASSISTANCE_VERIFIED_BY_CITIZEN",
        entity_type="AssistanceRequest",
        entity_id=req.id,
        user=current_user,
        summary=f"Citizen {current_user.full_name} submitted verification: '{req.citizen_verification_status}' for request #{req.id} (Notes: {verify_in.citizen_feedback_notes or 'None'})"
    )

    return _enrich_assistance_out(req, db)

@router.post("/{request_id}/resolve", response_model=AssistanceRequestOut)
async def resolve_assistance_request(
    request_id: int,
    resolve_in: AssistanceResolve,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Authority marks assistance request as 'Resolved':
    - Requires review of response-area verification evidence.
    - Persists authority identity, resolution timestamp, and resolution notes.
    - Updates zone metrics and audit log.
    """
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Assistance request not found.")

    now = datetime.utcnow()
    req.status = "Resolved"
    req.resolved_by_id = current_user.id
    req.resolved_at = now
    req.resolution_notes = resolve_in.resolution_notes
    req.updated_at = now

    db.commit()
    db.refresh(req)

    # Re-evaluate zone metrics
    if req.response_zone_id:
        zone = db.query(ResponseZone).filter(ResponseZone.id == req.response_zone_id).first()
        if zone:
            compute_zone_metrics(zone, db)
            db.commit()

    await ws_manager.broadcast("ASSISTANCE_STATUS_UPDATED", {
        "id": req.id,
        "status": "Resolved",
        "resolved_by": current_user.full_name,
        "resolved_at": now.isoformat(),
        "resolution_notes": req.resolution_notes
    })

    log_audit_event(
        db=db,
        event_type="ASSISTANCE_RESOLVED",
        entity_type="AssistanceRequest",
        entity_id=req.id,
        user=current_user,
        summary=f"Authority {current_user.full_name} resolved assistance request #{req.id} (Notes: {resolve_in.resolution_notes or 'Resolved successfully'})"
    )

    return _enrich_assistance_out(req, db)

@router.patch("/{request_id}/status", response_model=AssistanceRequestOut)
async def update_assistance_status(
    request_id: int,
    update_in: AssistanceRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Backwards-compatible endpoint for status updates.
    """
    req = db.query(AssistanceRequest).filter(AssistanceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Assistance request not found.")

    now = datetime.utcnow()
    if update_in.status:
        req.status = update_in.status
        if update_in.status == "Acknowledged":
            req.acknowledged_by_id = current_user.id
            req.acknowledged_at = now
        elif update_in.status == "Dispatched":
            req.dispatched_by_id = current_user.id
            req.dispatched_at = now
            if not req.citizen_verification_status:
                req.citizen_verification_status = "Pending Verification"
        elif update_in.status == "Resolved":
            req.resolved_by_id = current_user.id
            req.resolved_at = now
    
    if update_in.dispatched_unit_notes:
        req.dispatched_unit_notes = update_in.dispatched_unit_notes

    req.updated_at = now
    db.commit()
    db.refresh(req)

    # Re-evaluate zone metrics
    if req.response_zone_id:
        zone = db.query(ResponseZone).filter(ResponseZone.id == req.response_zone_id).first()
        if zone:
            compute_zone_metrics(zone, db)
            db.commit()

    await ws_manager.broadcast("ASSISTANCE_STATUS_UPDATED", {
        "id": req.id,
        "status": req.status,
        "dispatched_unit_notes": req.dispatched_unit_notes
    })

    log_audit_event(
        db=db,
        event_type="ASSISTANCE_STATUS_UPDATED",
        entity_type="AssistanceRequest",
        entity_id=req.id,
        user=current_user,
        summary=f"Updated assistance request #{req.id} status to '{req.status}'"
    )

    return _enrich_assistance_out(req, db)
