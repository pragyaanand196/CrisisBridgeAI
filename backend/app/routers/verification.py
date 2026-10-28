from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.verification_report import VerificationReport
from backend.app.schemas.verification import (
    VerificationReportCreate,
    VerificationReportReview,
    VerificationReportOut,
    ClarificationPublish
)
from backend.app.services.auth_service import get_current_user, require_authority
from backend.app.services.audit_service import log_audit_event
from backend.app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/verification", tags=["Information Verification"])

@router.get("/reports", response_model=List[VerificationReportOut])
def list_verification_reports(
    warning_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Publicly accessible list of verified clarifications and reported rumors under review.
    """
    query = db.query(VerificationReport)
    if warning_id:
        query = query.filter(VerificationReport.warning_id == warning_id)
    if status_filter:
        query = query.filter(VerificationReport.status == status_filter)
    return query.order_by(VerificationReport.created_at.desc()).all()

@router.post("/reports", response_model=VerificationReportOut)
async def submit_conflicting_report(
    report_in: VerificationReportCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Allows citizens or observers to submit reports of unverified or conflicting information.
    """
    new_report = VerificationReport(
        warning_id=report_in.warning_id,
        submitted_by_id=current_user.id if current_user else None,
        source_platform=report_in.source_platform,
        claim_title=report_in.claim_title,
        claim_content=report_in.claim_content,
        reported_location=report_in.reported_location,
        status="Unverified"
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    # Real-time WebSocket event
    await ws_manager.broadcast("VERIFICATION_REPORT_SUBMITTED", {
        "id": new_report.id,
        "claim_title": new_report.claim_title,
        "source_platform": new_report.source_platform,
        "status": new_report.status
    })

    log_audit_event(
        db=db,
        event_type="VERIFICATION_SUBMITTED",
        entity_type="VerificationReport",
        entity_id=new_report.id,
        user=current_user,
        summary=f"Submitted unverified information report: '{new_report.claim_title}'"
    )

    return new_report

@router.post("/reports/{report_id}/review", response_model=VerificationReportOut)
async def review_verification_report(
    report_id: int,
    review_in: VerificationReportReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Mandatory human authority review:
    Classify as 'Unverified', 'Conflicting with Official Information', 'Under Review', or 'Verified by Authority'.
    """
    report = db.query(VerificationReport).filter(VerificationReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Verification report not found.")

    report.status = review_in.status
    if review_in.investigation_notes:
        report.investigation_notes = review_in.investigation_notes
    if review_in.official_clarification:
        report.official_clarification = review_in.official_clarification
    
    report.reviewed_by_id = current_user.id
    report.reviewed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(report)

    await ws_manager.broadcast("VERIFICATION_REPORT_UPDATED", {
        "id": report.id,
        "status": report.status,
        "official_clarification": report.official_clarification
    })

    log_audit_event(
        db=db,
        event_type="VERIFICATION_REVIEWED",
        entity_type="VerificationReport",
        entity_id=report.id,
        user=current_user,
        summary=f"Authority {current_user.full_name} reviewed report #{report.id} -> {report.status}"
    )

    return report

@router.post("/publish-clarification", response_model=VerificationReportOut)
async def publish_official_clarification(
    clarification: ClarificationPublish,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Publishes an official public debunk/clarification attached to a report.
    """
    report = db.query(VerificationReport).filter(VerificationReport.id == clarification.report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Verification report not found.")

    report.status = "Verified by Authority"
    report.official_clarification = f"OFFICIAL CLARIFICATION: {clarification.clarification_headline}\n\n{clarification.official_clarification_text}"
    report.reviewed_by_id = current_user.id
    report.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(report)

    await ws_manager.broadcast("OFFICIAL_CLARIFICATION_PUBLISHED", {
        "report_id": report.id,
        "headline": clarification.clarification_headline,
        "clarification_text": clarification.official_clarification_text
    })

    log_audit_event(
        db=db,
        event_type="CLARIFICATION_PUBLISHED",
        entity_type="VerificationReport",
        entity_id=report.id,
        user=current_user,
        summary=f"Published official clarification: '{clarification.clarification_headline}'"
    )

    return report

@router.get("/reports/{report_id}/rag-analysis")
def get_report_rag_analysis(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Second-Stage RAG Application:
    Retrieves active authoritative CAP warnings & trusted disaster knowledge
    to evaluate citizen claims / rumors for potential conflict vs field observations.
    """
    from backend.app.services.rag_service import rag_service

    report = db.query(VerificationReport).filter(VerificationReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Verification report not found.")

    active_warnings = db.query(Warning).filter(
        Warning.status.in_(["Active", "Approved", "Updated"])
    ).all()

    analysis = rag_service.analyze_conflicting_report(
        claim_title=report.claim_title,
        claim_content=report.claim_content,
        reported_location=report.reported_location,
        active_warnings=active_warnings
    )

    return {
        "report_id": report.id,
        "claim_title": report.claim_title,
        "claim_content": report.claim_content,
        "reported_location": report.reported_location,
        "current_status": report.status,
        "rag_analysis": analysis
    }
