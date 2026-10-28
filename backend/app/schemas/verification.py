from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class VerificationReportCreate(BaseModel):
    warning_id: Optional[int] = None
    source_platform: str = "Social Media"
    claim_title: str
    claim_content: str
    reported_location: Optional[str] = None

class VerificationReportReview(BaseModel):
    status: str # Unverified, Conflicting with Official Information, Under Review, Verified by Authority
    investigation_notes: Optional[str] = None
    official_clarification: Optional[str] = None

class ClarificationPublish(BaseModel):
    report_id: int
    clarification_headline: str
    official_clarification_text: str
    notify_affected_zones: bool = True

class VerificationReportOut(BaseModel):
    id: int
    warning_id: Optional[int] = None
    submitted_by_id: Optional[int] = None
    source_platform: str
    claim_title: str
    claim_content: str
    reported_location: Optional[str] = None
    status: str
    investigation_notes: Optional[str] = None
    official_clarification: Optional[str] = None
    reviewed_by_id: Optional[int] = None
    reviewed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
