import json
import random
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc, asc

from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.incident_report import IncidentReport, IncidentReportEvent
from backend.app.models.response_zone import ResponseZone
from backend.app.schemas.incident import (
    IncidentReportCreate,
    IncidentReportOut,
    IncidentStatusUpdate,
    IncidentAssignRequest,
    IncidentProgressUpdate,
    IncidentClarificationResponse,
    IncidentResolveRequest,
    IncidentSummaryMetricsOut,
    IncidentEventOut
)
from backend.app.services.auth_service import (
    get_current_user,
    require_authenticated_user,
    require_authority,
    require_citizen
)
from backend.app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/incidents", tags=["Citizen & Authority Incident Reports"])

def _clean_param(val: Optional[str]) -> Optional[str]:
    """Helper to clean query parameters, ignoring null/undefined/all placeholders."""
    if val is None:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("undefined", "null", "none", "all"):
        return None
    return val_str


def _format_report_out(report: IncidentReport, is_authority_or_admin: bool = False) -> IncidentReportOut:
    """
    Transforms database IncidentReport into Pydantic IncidentReportOut.
    Guarantees internal confidential notes (is_public == False) are NEVER exposed to citizens.
    """
    # Parse photos
    photos = []
    if report.photos_json:
        try:
            photos = json.loads(report.photos_json)
        except Exception:
            photos = []

    # Filter events: citizens ONLY see is_public == True
    raw_events = report.events or []
    if not is_authority_or_admin:
        filtered_events = [e for e in raw_events if e.is_public]
    else:
        filtered_events = raw_events

    event_outs = [
        IncidentEventOut(
            id=e.id,
            event_type=e.event_type,
            status=e.status,
            actor_name=e.actor_name,
            actor_role=e.actor_role,
            is_public=e.is_public,
            note=e.note,
            timestamp=e.timestamp
        )
        for e in filtered_events
    ]

    return IncidentReportOut(
        id=report.id,
        report_identifier=report.report_identifier,
        citizen_id=report.citizen_id,
        reporter_name=report.reporter_name,
        reporter_email=report.reporter_email if is_authority_or_admin else None,
        reporter_contact=report.reporter_contact if is_authority_or_admin else None,
        title=report.title,
        category=report.category,
        description=report.description,
        severity=report.severity,
        incident_date=report.incident_date,
        incident_time=report.incident_time,
        is_still_occurring=report.is_still_occurring,
        are_people_at_risk=report.are_people_at_risk,
        people_affected_count=report.people_affected_count,
        additional_observations=report.additional_observations,
        location_name=report.location_name,
        location_description=report.location_description,
        address=report.address,
        district=report.district,
        city=report.city,
        state=report.state,
        postal_code=report.postal_code,
        latitude=report.latitude,
        longitude=report.longitude,
        location_is_confirmed=report.location_is_confirmed or False,
        response_zone_id=report.response_zone_id,
        response_zone_name=report.response_zone_name,
        photos=photos,
        immediate_danger=report.immediate_danger,
        emergency_assistance_needed=report.emergency_assistance_needed,
        accuracy_confirmed=report.accuracy_confirmed or True,
        status=report.status,
        assigned_department=report.assigned_department,
        assigned_team_notes=report.assigned_team_notes if is_authority_or_admin else None,
        assigned_at=report.assigned_at,
        verified_at=report.verified_at,
        verification_remarks=report.verification_remarks,
        resolution_summary=report.resolution_summary,
        resolved_at=report.resolved_at,
        rejection_reason=report.rejection_reason,
        duplicate_reason=report.duplicate_reason,
        duplicate_of_id=report.duplicate_of_id,
        created_at=report.created_at,
        updated_at=report.updated_at,
        events=event_outs
    )


def _find_report(db: Session, report_id_or_identifier: str) -> IncidentReport:
    """Finds report by integer id or string report_identifier (e.g. IR-2026-1234)."""
    if str(report_id_or_identifier).isdigit():
        rep = db.query(IncidentReport).filter(IncidentReport.id == int(report_id_or_identifier)).first()
        if rep:
            return rep
    return db.query(IncidentReport).filter(IncidentReport.report_identifier == str(report_id_or_identifier)).first()


# =========================================================================
# 1. Citizen Submission Endpoint
# =========================================================================
@router.post("", response_model=IncidentReportOut)
async def submit_incident_report(
    report_data: IncidentReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Submits a new citizen incident report. Persists in central database, records
    chronological creation event, and notifies matching authorities.
    """
    now = datetime.utcnow()
    year = now.year
    random_digits = random.randint(1000, 9999)
    identifier = f"IR-{year}-{random_digits}"

    # Ensure unique identifier
    while db.query(IncidentReport).filter(IncidentReport.report_identifier == identifier).first():
        random_digits = random.randint(1000, 9999)
        identifier = f"IR-{year}-{random_digits}"

    photos_serialized = None
    if report_data.photos:
        try:
            photos_serialized = json.dumps(report_data.photos)
        except Exception:
            photos_serialized = None

    # Auto-detect matching ResponseZone
    matched_zone = None
    if report_data.response_zone_id:
        matched_zone = db.query(ResponseZone).filter(ResponseZone.id == report_data.response_zone_id).first()

    if not matched_zone:
        loc_text = f"{report_data.location_name or ''} {report_data.location_description or ''} {report_data.address or ''} {report_data.district or ''} {report_data.city or ''}".lower()
        all_zones = db.query(ResponseZone).all()
        for z in all_zones:
            z_name_lower = z.name.lower()
            words = [w for w in z_name_lower.replace(',', ' ').split() if len(w) > 3 and w not in ['zone', 'response']]
            if any(w in loc_text for w in words):
                matched_zone = z
                break

    new_report = IncidentReport(
        report_identifier=identifier,
        citizen_id=current_user.id,
        reporter_name=current_user.full_name or "Citizen Reporter",
        reporter_email=current_user.email,
        reporter_contact=report_data.additional_contact or current_user.phone_number or "",
        title=report_data.title.strip(),
        category=report_data.category,
        description=report_data.description.strip(),
        severity=report_data.severity or "Moderate",
        incident_date=report_data.incident_date,
        incident_time=report_data.incident_time,
        is_still_occurring=report_data.is_still_occurring,
        are_people_at_risk=report_data.are_people_at_risk,
        people_affected_count=report_data.people_affected_count,
        additional_observations=report_data.additional_observations,
        location_name=report_data.location_name,
        location_description=report_data.location_description,
        address=report_data.address,
        district=report_data.district or current_user.district,
        city=report_data.city or current_user.city,
        state=report_data.state or current_user.state,
        postal_code=report_data.postal_code or current_user.postal_code,
        latitude=report_data.latitude or current_user.latitude,
        longitude=report_data.longitude or current_user.longitude,
        location_is_confirmed=report_data.location_is_confirmed or False,
        response_zone_id=matched_zone.id if matched_zone else None,
        response_zone_name=matched_zone.name if matched_zone else (report_data.response_zone_name or None),
        photos_json=photos_serialized,
        immediate_danger=report_data.immediate_danger,
        emergency_assistance_needed=report_data.emergency_assistance_needed,
        accuracy_confirmed=report_data.accuracy_confirmed,
        status="Submitted",
        created_at=now,
        updated_at=now
    )

    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    # Initial submission history event
    initial_event = IncidentReportEvent(
        incident_report_id=new_report.id,
        event_type="STATUS_CHANGE",
        status="Submitted",
        actor_name=current_user.full_name or "Citizen Reporter",
        actor_role="citizen",
        actor_id=current_user.id,
        is_public=True,
        note="Incident report submitted by citizen and queued for disaster authority triage.",
        timestamp=now
    )
    db.add(initial_event)
    db.commit()
    db.refresh(new_report)

    # WebSocket Broadcast to Authorities
    try:
        await ws_manager.broadcast(
            "INCIDENT_REPORT_SUBMITTED",
            {
                "report_id": new_report.id,
                "report_identifier": new_report.report_identifier,
                "title": new_report.title,
                "category": new_report.category,
                "severity": new_report.severity,
                "district": new_report.district,
                "city": new_report.city,
                "created_at": now.isoformat()
            },
            target_role="authority"
        )
        await ws_manager.broadcast(
            "INCIDENT_REPORT_SUBMITTED",
            {
                "report_id": new_report.id,
                "report_identifier": new_report.report_identifier,
                "title": new_report.title,
                "category": new_report.category,
                "severity": new_report.severity,
                "district": new_report.district,
                "city": new_report.city,
                "created_at": now.isoformat()
            },
            target_role="administrator"
        )
    except Exception as ws_err:
        pass

    return _format_report_out(new_report, is_authority_or_admin=False)


# =========================================================================
# 2. Citizen Own Reports Endpoint
# =========================================================================
@router.get("/my", response_model=List[IncidentReportOut])
def get_my_incident_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Returns all reports submitted by the authenticated citizen.
    Strictly excludes confidential internal notes.
    """
    reports = db.query(IncidentReport).filter(
        IncidentReport.citizen_id == current_user.id
    ).order_by(desc(IncidentReport.created_at)).all()

    return [_format_report_out(r, is_authority_or_admin=False) for r in reports]


# =========================================================================
# 3. Authority Incoming Incident Reports List & Metrics
# =========================================================================
@router.get("/metrics", response_model=IncidentSummaryMetricsOut)
def get_incident_summary_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Calculates summary counts for Total Reports, Awaiting Review, Under Investigation,
    and Resolved based on actual persistent database records.
    """
    base_query = db.query(IncidentReport)

    # Jurisdiction filtering for authorities (administrators have global scope)
    if current_user.role != "administrator" and current_user.jurisdiction:
        jur = current_user.jurisdiction.strip().lower()
        if jur and jur != "all":
            jur_filter = or_(
                IncidentReport.district.ilike(f"%{jur}%"),
                IncidentReport.city.ilike(f"%{jur}%"),
                IncidentReport.location_name.ilike(f"%{jur}%"),
                IncidentReport.location_description.ilike(f"%{jur}%"),
                IncidentReport.address.ilike(f"%{jur}%"),
                IncidentReport.response_zone_name.ilike(f"%{jur}%")
            )
            base_query = base_query.filter(jur_filter)

    total = base_query.count()
    awaiting_review = base_query.filter(IncidentReport.status == "Submitted").count()
    under_investigation = base_query.filter(
        IncidentReport.status.in_([
            "Under Review",
            "Verified",
            "Action Initiated",
            "Assigned",
            "Action in Progress",
            "Clarification Requested"
        ])
    ).count()
    resolved = base_query.filter(IncidentReport.status == "Resolved").count()

    return IncidentSummaryMetricsOut(
        total_reports=total,
        awaiting_review=awaiting_review,
        under_investigation=under_investigation,
        resolved_reports=resolved
    )


@router.get("/authority", response_model=List[IncidentReportOut])
def get_authority_incident_reports(
    search: Optional[str] = Query(None, description="Search term for ID, title, category, location"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    severity: Optional[str] = Query(None, description="Filter by citizen-reported severity"),
    jurisdiction_filter: Optional[str] = Query(None, alias="jurisdiction", description="Filter by jurisdiction/district"),
    time_range: Optional[str] = Query(None, description="Filter by date range: today, 7days, 30days, all"),
    sort: Optional[str] = Query("priority", description="priority, newest, oldest, severity_desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Retrieves incoming citizen incident reports for authorized officials.
    Applies jurisdiction boundaries, search, filtering, and priority sorting.
    """
    query = db.query(IncidentReport)

    # Sanitize query parameters (strip string 'undefined', 'null', 'all', etc.)
    search = _clean_param(search)
    status_filter = _clean_param(status_filter)
    category = _clean_param(category)
    severity = _clean_param(severity)
    jurisdiction_filter = _clean_param(jurisdiction_filter)
    time_range = _clean_param(time_range)
    sort = _clean_param(sort) or "priority"

    # Jurisdiction scope for authority
    if current_user.role != "administrator" and current_user.jurisdiction:
        jur = current_user.jurisdiction.strip().lower()
        if jur and jur != "all":
            jur_condition = or_(
                IncidentReport.district.ilike(f"%{jur}%"),
                IncidentReport.city.ilike(f"%{jur}%"),
                IncidentReport.location_name.ilike(f"%{jur}%"),
                IncidentReport.location_description.ilike(f"%{jur}%"),
                IncidentReport.address.ilike(f"%{jur}%"),
                IncidentReport.response_zone_name.ilike(f"%{jur}%")
            )
            query = query.filter(jur_condition)

    # Search filter
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                IncidentReport.report_identifier.ilike(term),
                IncidentReport.title.ilike(term),
                IncidentReport.category.ilike(term),
                IncidentReport.location_name.ilike(term),
                IncidentReport.location_description.ilike(term),
                IncidentReport.address.ilike(term),
                IncidentReport.district.ilike(term),
                IncidentReport.city.ilike(term)
            )
        )

    # Status filter
    if status_filter:
        s_lower = status_filter.lower()
        if s_lower in ("submitted", "submitted (new)", "new"):
            query = query.filter(IncidentReport.status == "Submitted")
        elif s_lower in ("under review", "under_review", "review"):
            query = query.filter(IncidentReport.status == "Under Review")
        elif s_lower in ("clarification requested", "clarification_requested", "clarification"):
            query = query.filter(IncidentReport.status == "Clarification Requested")
        elif s_lower in ("action initiated", "action_initiated"):
            query = query.filter(IncidentReport.status == "Action Initiated")
        elif s_lower in ("action in progress", "action_in_progress"):
            query = query.filter(IncidentReport.status == "Action in Progress")
        else:
            query = query.filter(IncidentReport.status.ilike(status_filter))

    # Category filter
    if category:
        query = query.filter(IncidentReport.category == category)

    # Severity filter
    if severity:
        query = query.filter(IncidentReport.severity == severity)

    # Specific jurisdiction filter from UI
    if jurisdiction_filter:
        j_term = f"%{jurisdiction_filter}%"
        query = query.filter(
            or_(
                IncidentReport.district.ilike(j_term),
                IncidentReport.city.ilike(j_term),
                IncidentReport.location_name.ilike(j_term),
                IncidentReport.address.ilike(j_term)
            )
        )

    # Time range filter
    if time_range:
        now = datetime.utcnow()
        if time_range == "today":
            start_of_day = datetime(now.year, now.month, now.day)
            query = query.filter(IncidentReport.created_at >= start_of_day)
        elif time_range == "7days":
            query = query.filter(IncidentReport.created_at >= (now - timedelta(days=7)))
        elif time_range == "30days":
            query = query.filter(IncidentReport.created_at >= (now - timedelta(days=30)))

    # Sorting
    if sort == "newest":
        query = query.order_by(desc(IncidentReport.created_at))
    elif sort == "oldest":
        query = query.order_by(asc(IncidentReport.created_at))
    elif sort == "severity_desc":
        # Severity priority: Critical, High, Moderate, Low
        pass
    else:
        # Default priority: prioritize Submitted/Awaiting Review, Critical/High severity, and older unresolved reports
        pass

    results = query.all()

    # Python-level multi-factor priority sort if sort is 'priority' or 'severity_desc'
    severity_weights = {"Critical": 4, "High": 3, "Moderate": 2, "Low": 1}
    status_weights = {
        "Submitted": 10,
        "Under Review": 8,
        "Clarification Requested": 7,
        "Verified": 6,
        "Assigned": 5,
        "Action in Progress": 4,
        "Resolved": 1,
        "Rejected": 0,
        "Duplicate": 0
    }

    if sort == "priority":
        results.sort(
            key=lambda r: (
                status_weights.get(r.status, 2),
                severity_weights.get(r.severity, 2),
                -(r.created_at.timestamp() if r.created_at else 0)
            ),
            reverse=True
        )
    elif sort == "severity_desc":
        results.sort(
            key=lambda r: (
                severity_weights.get(r.severity, 2),
                -(r.created_at.timestamp() if r.created_at else 0)
            ),
            reverse=True
        )

    return [_format_report_out(r, is_authority_or_admin=True) for r in results]


# =========================================================================
# 4. Report Details & Duplicates
# =========================================================================
@router.get("/{identifier}", response_model=IncidentReportOut)
def get_incident_report_details(
    identifier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Fetches full details of an incident report.
    Citizens can only view their own reports. Authorities can view reports within jurisdiction.
    Internal notes are filtered out for citizens.
    """
    report = _find_report(db, identifier)
    if not report:
        raise HTTPException(status_code=404, detail="Incident report not found.")

    is_authority_or_admin = current_user.role in ["authority", "administrator"]

    # Security check: if citizen, verify ownership
    if not is_authority_or_admin and report.citizen_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted: You can only view your own submitted incident reports."
        )

    # Security check: if authority with specific jurisdiction, verify report falls in jurisdiction
    if current_user.role == "authority" and current_user.jurisdiction:
        jur = current_user.jurisdiction.strip().lower()
        if jur and jur != "all":
            report_loc = f"{report.district or ''} {report.city or ''} {report.location_name or ''} {report.location_description or ''} {report.address or ''} {report.response_zone_name or ''}".lower()
            if jur not in report_loc:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access restricted: This incident report is outside your assigned administrative jurisdiction."
                )

    return _format_report_out(report, is_authority_or_admin=is_authority_or_admin)


@router.get("/{identifier}/duplicates", response_model=List[IncidentReportOut])
def get_possible_duplicate_reports(
    identifier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Detects potential duplicate incident reports based on matching category,
    close geographic vicinity (city/district), and submission time window (72 hours).
    Does NOT auto-merge or delete any records.
    """
    target = _find_report(db, identifier)
    if not target:
        raise HTTPException(status_code=404, detail="Incident report not found.")

    query = db.query(IncidentReport).filter(
        IncidentReport.id != target.id,
        IncidentReport.category == target.category
    )

    if target.district or target.city:
        query = query.filter(
            or_(
                IncidentReport.district == target.district,
                IncidentReport.city == target.city
            )
        )

    time_window = timedelta(days=3)
    if target.created_at:
        query = query.filter(
            IncidentReport.created_at >= (target.created_at - time_window),
            IncidentReport.created_at <= (target.created_at + time_window)
        )

    duplicates = query.limit(5).all()
    return [_format_report_out(d, is_authority_or_admin=True) for d in duplicates]


# =========================================================================
# 5. Authority Review Actions: Status Transitions
# =========================================================================
@router.post("/{identifier}/status", response_model=IncidentReportOut)
async def update_incident_status(
    identifier: str,
    payload: IncidentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Updates the lifecycle status of an incident report.
    Validates required explanations (rejection reason, duplicate explanation, clarification inquiry).
    Records chronological status event and notifies citizen.
    """
    report = _find_report(db, identifier)
    if not report:
        raise HTTPException(status_code=404, detail="Incident report not found.")

    valid_statuses = [
        "Submitted",
        "Under Review",
        "Clarification Requested",
        "Verified",
        "Action Initiated",
        "Assigned",
        "Action in Progress",
        "Resolved",
        "Not Verified",
        "Rejected",
        "Duplicate"
    ]

    target_status = payload.status
    if target_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status: {target_status}. Allowed values: {', '.join(valid_statuses)}"
        )

    # Enforce mandatory reasons
    if target_status in ["Rejected", "Not Verified"] and not (payload.rejection_reason or payload.remarks):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A mandatory explanation reason is required to mark an incident report as {target_status}."
        )

    if target_status == "Duplicate" and not (payload.duplicate_reason or payload.remarks):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A mandatory explanation is required when marking a report as a duplicate."
        )

    if target_status == "Clarification Requested" and not (payload.clarification_question or payload.remarks):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A clarification inquiry message is required when requesting clarification from the citizen."
        )

    now = datetime.utcnow()
    prev_status = report.status
    report.status = target_status
    report.updated_at = now

    event_note = ""
    if target_status == "Under Review":
        event_note = f"Authority {current_user.full_name} moved report to Under Review for verification."
        if payload.remarks:
            event_note += f" Remarks: {payload.remarks}"
    elif target_status == "Verified":
        report.verified_at = now
        report.verified_by_id = current_user.id
        report.verification_remarks = payload.verification_remarks or payload.remarks or "Verified by disaster response authority."
        event_note = f"Report officially verified by {current_user.full_name} ({current_user.department or 'Disaster Management'}). Remarks: {report.verification_remarks}"
    elif target_status == "Clarification Requested":
        question = payload.clarification_question or payload.remarks
        event_note = f"Clarification requested from citizen by {current_user.full_name}: \"{question}\""
    elif target_status in ["Rejected", "Not Verified"]:
        report.rejection_reason = payload.rejection_reason or payload.remarks
        event_note = f"Report marked as {target_status} by {current_user.full_name}. Reason: {report.rejection_reason}"
    elif target_status == "Action Initiated":
        event_note = f"Action initiated by {current_user.full_name} ({current_user.department or 'Disaster Operations'})."
        if payload.remarks:
            event_note += f" Details: {payload.remarks}"
    elif target_status == "Duplicate":
        report.duplicate_reason = payload.duplicate_reason or payload.remarks
        report.duplicate_of_id = payload.duplicate_of_id
        event_note = f"Report marked as duplicate by {current_user.full_name}. Explanation: {report.duplicate_reason}"
        if payload.duplicate_of_id:
            event_note += f" (Referencing incident #{payload.duplicate_of_id})"
    else:
        event_note = f"Status changed from {prev_status} to {target_status} by {current_user.full_name}."
        if payload.remarks:
            event_note += f" Remarks: {payload.remarks}"

    # Log public status event
    event = IncidentReportEvent(
        incident_report_id=report.id,
        event_type="STATUS_CHANGE",
        status=target_status,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        actor_id=current_user.id,
        is_public=True,
        note=event_note,
        timestamp=now
    )
    db.add(event)
    db.commit()
    db.refresh(report)

    # Broadcast status update event
    try:
        await ws_manager.broadcast(
            "INCIDENT_STATUS_UPDATED",
            {
                "report_id": report.id,
                "report_identifier": report.report_identifier,
                "citizen_id": report.citizen_id,
                "status": target_status,
                "note": event_note,
                "updated_at": now.isoformat()
            }
        )
    except Exception:
        pass

    return _format_report_out(report, is_authority_or_admin=True)


# =========================================================================
# 6. Department & Response Team Assignment
# =========================================================================
@router.post("/{identifier}/assign", response_model=IncidentReportOut)
async def assign_incident_department(
    identifier: str,
    payload: IncidentAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Assigns an incident report to a configured department or response team.
    Updates report status to 'Assigned' and logs assignment history.
    """
    report = _find_report(db, identifier)
    if not report:
        raise HTTPException(status_code=404, detail="Incident report not found.")

    now = datetime.utcnow()
    report.assigned_department = payload.department.strip()
    report.assigned_team_notes = payload.team_notes.strip() if payload.team_notes else None
    report.assigned_at = now
    report.assigned_by_id = current_user.id
    report.updated_at = now

    # Advance status to Action Initiated if in initial stages
    if report.status in ["Submitted", "Under Review", "Verified", "Assigned"]:
        report.status = "Action Initiated"

    note_text = f"Assigned to {payload.department} by {current_user.full_name}."
    if payload.team_notes:
        note_text += f" Team Notes: {payload.team_notes}"

    event = IncidentReportEvent(
        incident_report_id=report.id,
        event_type="ASSIGNMENT",
        status=report.status,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        actor_id=current_user.id,
        is_public=True,
        note=note_text,
        timestamp=now
    )
    db.add(event)
    db.commit()
    db.refresh(report)

    # Broadcast update
    try:
        await ws_manager.broadcast(
            "INCIDENT_ASSIGNED",
            {
                "report_id": report.id,
                "report_identifier": report.report_identifier,
                "citizen_id": report.citizen_id,
                "department": report.assigned_department,
                "status": report.status,
                "updated_at": now.isoformat()
            }
        )
    except Exception:
        pass

    return _format_report_out(report, is_authority_or_admin=True)


# =========================================================================
# 7. Investigation Updates: Public Progress vs Confidential Internal Notes
# =========================================================================
@router.post("/{identifier}/updates", response_model=IncidentReportOut)
async def add_incident_update(
    identifier: str,
    payload: IncidentProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Records an investigation update or confidential internal note.
    Internal notes (is_public == False) are strictly shielded from citizens.
    """
    report = _find_report(db, identifier)
    if not report:
        raise HTTPException(status_code=404, detail="Incident report not found.")

    now = datetime.utcnow()
    report.updated_at = now

    # If action in progress update, ensure status reflects active response
    if payload.is_public and report.status in ["Assigned", "Verified"]:
        report.status = "Action in Progress"

    event = IncidentReportEvent(
        incident_report_id=report.id,
        event_type="PUBLIC_UPDATE" if payload.is_public else "INTERNAL_NOTE",
        status=report.status,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        actor_id=current_user.id,
        is_public=payload.is_public,
        note=payload.note.strip(),
        timestamp=now
    )
    db.add(event)
    db.commit()
    db.refresh(report)

    # Broadcast only if public update
    if payload.is_public:
        try:
            await ws_manager.broadcast(
                "INCIDENT_PUBLIC_UPDATE",
                {
                    "report_id": report.id,
                    "report_identifier": report.report_identifier,
                    "citizen_id": report.citizen_id,
                    "update_text": payload.note,
                    "updated_at": now.isoformat()
                }
            )
        except Exception:
            pass

    return _format_report_out(report, is_authority_or_admin=True)


# =========================================================================
# 8. Citizen Clarification Response
# =========================================================================
@router.post("/{identifier}/clarification", response_model=IncidentReportOut)
async def submit_citizen_clarification(
    identifier: str,
    payload: IncidentClarificationResponse,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Allows reporting citizen to respond to an authority clarification inquiry.
    Appends clarification to report history and moves status to 'Under Review'.
    """
    report = _find_report(db, identifier)
    if not report:
        raise HTTPException(status_code=404, detail="Incident report not found.")

    # Ownership check
    if report.citizen_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only submit clarification for your own incident reports."
        )

    now = datetime.utcnow()
    report.status = "Under Review"
    report.updated_at = now

    # Merge photos if additional photos uploaded
    if payload.photos:
        existing_photos = []
        if report.photos_json:
            try:
                existing_photos = json.loads(report.photos_json)
            except Exception:
                existing_photos = []
        merged_photos = existing_photos + payload.photos
        report.photos_json = json.dumps(merged_photos)

    clarification_note = f"Citizen provided additional clarification: \"{payload.clarification_text.strip()}\""

    event = IncidentReportEvent(
        incident_report_id=report.id,
        event_type="CLARIFICATION_RESPONSE",
        status="Under Review",
        actor_name=current_user.full_name or "Citizen Reporter",
        actor_role="citizen",
        actor_id=current_user.id,
        is_public=True,
        note=clarification_note,
        timestamp=now
    )
    db.add(event)
    db.commit()
    db.refresh(report)

    # Notify authorities that citizen responded
    try:
        await ws_manager.broadcast(
            "INCIDENT_CLARIFICATION_SUBMITTED",
            {
                "report_id": report.id,
                "report_identifier": report.report_identifier,
                "clarification_text": payload.clarification_text,
                "updated_at": now.isoformat()
            },
            target_role="authority"
        )
    except Exception:
        pass

    return _format_report_out(report, is_authority_or_admin=False)


# =========================================================================
# 9. Resolution Workflow
# =========================================================================
@router.post("/{identifier}/resolve", response_model=IncidentReportOut)
async def resolve_incident_report(
    identifier: str,
    payload: IncidentResolveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Resolves an incident report. Requires resolution summary.
    Logs resolution event and updates status to 'Resolved'.
    """
    report = _find_report(db, identifier)
    if not report:
        raise HTTPException(status_code=404, detail="Incident report not found.")

    if not payload.resolution_summary or len(payload.resolution_summary.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A comprehensive resolution summary explaining actions taken is required."
        )

    now = datetime.utcnow()
    report.status = "Resolved"
    report.resolution_summary = payload.resolution_summary.strip()
    report.resolved_at = now
    report.resolved_by_id = current_user.id
    report.updated_at = now

    resolution_note = (
        f"Incident resolved by {current_user.full_name} ({current_user.department or 'Disaster Operations'}). "
        f"Resolution Summary: {report.resolution_summary}"
    )

    event = IncidentReportEvent(
        incident_report_id=report.id,
        event_type="RESOLUTION",
        status="Resolved",
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        actor_id=current_user.id,
        is_public=True,
        note=resolution_note,
        timestamp=now
    )
    db.add(event)
    db.commit()
    db.refresh(report)

    # Broadcast resolution to citizen and authority
    try:
        await ws_manager.broadcast(
            "INCIDENT_RESOLVED",
            {
                "report_id": report.id,
                "report_identifier": report.report_identifier,
                "citizen_id": report.citizen_id,
                "status": "Resolved",
                "resolution_summary": report.resolution_summary,
                "resolved_at": now.isoformat()
            }
        )
    except Exception:
        pass

    return _format_report_out(report, is_authority_or_admin=True)


# =========================================================================
# 10. Delete Incident Report (For test cleanup or citizen recall while Submitted)
# =========================================================================
@router.delete("/{identifier}")
def delete_incident_report(
    identifier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Deletes an incident report. Allowed for:
    - Administrator
    - The submitting citizen IF the status is 'Submitted' (unprocessed) or 'Rejected'
    Safely deletes child events and preserves all other reports and disaster warnings.
    """
    report = _find_report(db, identifier)
    if not report:
        raise HTTPException(status_code=404, detail="Incident report not found.")

    is_admin = current_user.role in ["administrator", "authority"]
    is_owner = report.citizen_id == current_user.id
    if not is_admin:
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access restricted: You cannot delete another citizen's report."
            )
        if report.status not in ["Submitted", "Rejected"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Citizens can only retract incident reports that are in 'Submitted' or 'Rejected' status."
            )

    report_id = report.id
    report_identifier = report.report_identifier
    # Delete child events
    db.query(IncidentReportEvent).filter(IncidentReportEvent.incident_report_id == report_id).delete()
    db.delete(report)
    db.commit()

    return {
        "message": "Incident report deleted successfully",
        "id": report_id,
        "report_identifier": report_identifier
    }
