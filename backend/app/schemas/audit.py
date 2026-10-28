from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    user_role: Optional[str] = None
    event_type: str
    entity_type: str
    entity_id: Optional[int] = None
    summary: str
    details_json: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

class PostDisasterReportOut(BaseModel):
    warning_id: int
    identifier: str
    disaster_type: str
    title: str
    severity: str
    issuing_authority: str
    effective_start: Optional[datetime] = None
    expiry_or_closed: Optional[datetime] = None
    final_status: str
    total_versions: int
    total_zones_affected: int
    total_population_at_risk: int
    total_citizens_acknowledged: int
    overall_wta_score: float
    communication_health_summary: Dict[str, Any]
    detected_bottlenecks: List[str]
    assistance_triaged_summary: Dict[str, Any]
    verification_actions_taken: List[str]
    timeline_events: List[AuditLogOut]
