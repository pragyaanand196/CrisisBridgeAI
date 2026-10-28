from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.warning import Warning
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.models.verification_report import VerificationReport
from backend.app.models.audit_log import AuditLog
from backend.app.schemas.audit import PostDisasterReportOut, AuditLogOut
from backend.app.schemas.warning import WarningOut
from backend.app.services.analytics_service import compute_zone_metrics

router = APIRouter(prefix="/reports", tags=["Post-Disaster Reports"])

@router.get("", response_model=List[WarningOut])
def list_reportable_warnings(db: Session = Depends(get_db)):
    """
    Lists all warnings (Active, Cancelled, Updated, Expired) available for retrospective post-disaster analysis.
    """
    return db.query(Warning).order_by(Warning.created_at.desc()).all()

@router.get("/{warning_id}", response_model=PostDisasterReportOut)
def generate_post_disaster_report(warning_id: int, db: Session = Depends(get_db)):
    """
    Synthesizes a 100% genuine, data-backed Post-Disaster Report from stored records.
    Never invents statistics.
    """
    warning = db.query(Warning).filter(Warning.id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Disaster warning record not found.")

    zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warning_id).all()
    responses = db.query(CitizenResponse).filter(CitizenResponse.warning_id == warning_id).all()
    assistance_reqs = db.query(AssistanceRequest).filter(AssistanceRequest.warning_id == warning_id).all()
    verifications = db.query(VerificationReport).filter(VerificationReport.warning_id == warning_id).all()
    
    # Audit log timeline
    audit_events = db.query(AuditLog).filter(
        (AuditLog.entity_id == warning_id) | (AuditLog.summary.contains(str(warning.identifier)))
    ).order_by(AuditLog.timestamp.asc()).all()

    total_pop = sum(z.estimated_population for z in zones)
    total_ack = len(responses)
    
    # Compute zone metric aggregates
    zone_health_list = []
    bottlenecks = []
    wta_sum = 0.0

    for z in zones:
        m = compute_zone_metrics(z, db)
        zone_health_list.append(m)
        wta_sum += m["wta_score"]
        
        if m["no_response_rate"] >= 35.0:
            bottlenecks.append(f"Zone {z.name} suffered high no-response rate ({m['no_response_rate']}%), suggesting infrastructure vulnerability.")
        if m["understanding_rate"] < 60.0 and (m["understanding_rate"] > 0 or m["dont_understand_count"] > 0):
            bottlenecks.append(f"Zone {z.name} exhibited significant understanding gap ({m['dont_understand_count']} comprehension failure reports).")
        if m["failure_rate"] > 15.0:
            bottlenecks.append(f"Zone {z.name} had notification delivery failures ({m['failure_rate']}%).")

    if not bottlenecks:
        bottlenecks.append("No critical communication bottlenecks detected across monitored zones.")

    avg_wta = round(wta_sum / max(1, len(zones)), 1) if zones else 0.0

    # Assistance breakdown
    cat_counts = {}
    for req in assistance_reqs:
        cat_counts[req.category] = cat_counts.get(req.category, 0) + req.headcount

    # Verification actions
    verif_actions = []
    for v in verifications:
        if v.status == "Verified by Authority" and v.official_clarification:
            verif_actions.append(f"Clarified claim: '{v.claim_title}' -> Authority clarification published.")
        elif v.status == "Conflicting with Official Information":
            verif_actions.append(f"Flagged rumor: '{v.claim_title}' as conflicting with official alerts.")

    if not verif_actions:
        verif_actions.append("No conflicting rumors required formal clarification during this event.")

    # All versions of this warning
    related_versions = db.query(Warning).filter(
        (Warning.id == warning_id) | (Warning.parent_warning_id == warning_id) | (Warning.id == warning.parent_warning_id)
    ).count()

    return PostDisasterReportOut(
        warning_id=warning.id,
        identifier=warning.identifier,
        disaster_type=warning.disaster_type,
        title=warning.title,
        severity=warning.severity,
        issuing_authority=warning.issuing_authority_name,
        effective_start=warning.expected_start_time or warning.created_at,
        expiry_or_closed=warning.expiry_time,
        final_status=warning.status,
        total_versions=max(1, related_versions),
        total_zones_affected=len(zones),
        total_population_at_risk=total_pop,
        total_citizens_acknowledged=total_ack,
        overall_wta_score=avg_wta,
        communication_health_summary={
            "average_wta_score": avg_wta,
            "zones_breakdown": zone_health_list,
            "total_citizen_responses": len(responses)
        },
        detected_bottlenecks=bottlenecks,
        assistance_triaged_summary={
            "total_requests": len(assistance_reqs),
            "headcount_by_category": cat_counts,
            "resolved_count": sum(1 for r in assistance_reqs if r.status == "Resolved"),
            "dispatched_count": sum(1 for r in assistance_reqs if r.status == "Dispatched"),
            "pending_count": sum(1 for r in assistance_reqs if r.status == "Pending")
        },
        verification_actions_taken=verif_actions,
        timeline_events=[AuditLogOut.from_orm(a) for a in audit_events]
    )
