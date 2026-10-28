from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from backend.app.schemas.zone import ResponseZoneOut

class TargetAreaInput(BaseModel):
    name: str
    target_type: str = "polygon" # polygon, radius, locality, district_section
    geometry_geojson: str
    center_lat: float
    center_lng: float
    radius_km: Optional[float] = None
    priority_level: str = "High" # Critical, Immediate, High, Standard, Low
    notes: Optional[str] = None

class TargetAreaOut(BaseModel):
    id: int
    warning_id: int
    warning_version: int
    name: str
    target_type: str
    geometry_geojson: str
    center_lat: float
    center_lng: float
    radius_km: Optional[float] = None
    priority_level: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TargetingPreviewRequest(BaseModel):
    target_areas: List[TargetAreaInput]

class TargetingPreviewResponse(BaseModel):
    total_citizens_targeted: int
    is_empty: bool
    summary_message: str
    breakdown_by_area: List[Dict[str, Any]] = []

class ResponseZoneInput(BaseModel):
    name: str
    code: str
    polygon_geojson: str
    center_lat: float
    center_lng: float
    estimated_population: int = 1000
    risk_level: str = "High"

class WarningBase(BaseModel):
    disaster_type: str
    title: str
    description: str
    severity: str # Extreme, Severe, Moderate, Minor
    urgency: str  # Immediate, Expected, Future
    certainty: str # Observed, Likely, Possible
    area_name: str
    area_polygon_geojson: Optional[str] = None
    expected_start_time: Optional[datetime] = None
    expiry_time: Optional[datetime] = None
    recommended_instructions: str
    issuing_authority_name: str

class WarningCreate(WarningBase):
    target_areas: Optional[List[TargetAreaInput]] = None
    zones: Optional[List[ResponseZoneInput]] = None

class WarningUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    urgency: Optional[str] = None
    certainty: Optional[str] = None
    area_name: Optional[str] = None
    area_polygon_geojson: Optional[str] = None
    target_areas: Optional[List[TargetAreaInput]] = None
    expected_start_time: Optional[datetime] = None
    expiry_time: Optional[datetime] = None
    recommended_instructions: Optional[str] = None

class WarningCancellationRequest(BaseModel):
    cancellation_reason: str

class AIApprovalAction(BaseModel):
    action: str  # approve, reject, edit, regenerate
    ai_simplified_en: Optional[str] = None
    ai_simplified_hi: Optional[str] = None
    feedback_notes: Optional[str] = None

class WarningOut(WarningBase):
    id: int
    identifier: str
    version: int
    parent_warning_id: Optional[int] = None
    issuing_authority_id: int
    status: str
    cancellation_reason: Optional[str] = None
    ai_simplified_en: Optional[str] = None
    ai_simplified_hi: Optional[str] = None
    ai_approval_status: str
    approved_at: Optional[datetime] = None
    distributed_at: Optional[datetime] = None
    distribution_channels: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    target_areas: Optional[List[TargetAreaOut]] = []
    
    # RAG Metadata
    rag_sources_json: Optional[str] = None
    rag_grounding_score: Optional[str] = None
    rag_query_used: Optional[str] = None
    rag_status: Optional[str] = "Grounded"

    class Config:
        from_attributes = True

class SituationConditionOut(BaseModel):
    condition: str
    title: str
    severity: str # Critical, High, Attention, Stable, Info
    description: str
    recommendation: str
    evidence_metric: Optional[str] = None

class TimelineEventOut(BaseModel):
    id: str
    timestamp: datetime
    event_type: str
    title: str
    description: str
    badge_type: str = "primary" # primary, stable, attention, extreme, standard
    actor: Optional[str] = None

class CitizenResponseListItem(BaseModel):
    id: int
    display_identifier: str
    response_type: str # understand, dont_understand, need_help, not_in_area
    warning_version: int
    zone_id: Optional[int] = None
    zone_name: Optional[str] = None
    target_area_id: Optional[int] = None
    target_area_name: Optional[str] = None
    language_used: str = "en"
    feedback_notes: Optional[str] = None
    delivery_channel: str = "In-App"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    assistance_request_id: Optional[int] = None
    assistance_category: Optional[str] = None
    assistance_headcount: Optional[int] = None
    assistance_status: Optional[str] = None

class DeliveryAnalyticsSummary(BaseModel):
    total_targeted: int = 0
    notification_attempted: int = 0
    delivered_count: int = 0
    failed_count: int = 0
    acknowledged_count: int = 0
    understood_count: int = 0
    dont_understand_count: int = 0
    help_requested_count: int = 0
    not_in_area_count: int = 0
    no_response_count: int = 0
    location_mismatch_detected: bool = False
    understanding_gap_detected: bool = False
    communication_gap_detected: bool = False
    assistance_surge_detected: bool = False
    overall_situation: str = "Insufficient Data"
    situation_conditions: List[SituationConditionOut] = []
    zones_breakdown: List[Dict[str, Any]] = []

class WarningDetailOut(WarningOut):
    creator_authority_name: Optional[str] = None
    creator_authority_department: Optional[str] = None
    creator_authority_jurisdiction: Optional[str] = None
    response_zones: List[ResponseZoneOut] = []
    target_areas: List[TargetAreaOut] = []
    responses_count: int = 0
    assistance_requests_count: int = 0
    verification_reports_count: int = 0
    delivery_analytics: Optional[DeliveryAnalyticsSummary] = None
    citizen_responses: List[CitizenResponseListItem] = []
    timeline_events: List[TimelineEventOut] = []

