from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime

class PhotoItem(BaseModel):
    name: Optional[str] = None
    size: Optional[int] = None
    type: Optional[str] = None
    dataUrl: Optional[str] = None

class IncidentReportCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    category: str = Field(..., min_length=2, max_length=100)
    description: str = Field(..., min_length=10)
    severity: str = Field("Moderate", max_length=50)
    incident_date: str = Field(..., max_length=50)
    incident_time: Optional[str] = Field("", max_length=50)
    is_still_occurring: Optional[str] = Field("Not Sure", max_length=50)
    are_people_at_risk: Optional[str] = Field("Not Sure", max_length=50)
    people_affected_count: Optional[int] = None
    additional_observations: Optional[str] = None

    # Location
    location_name: Optional[str] = Field("", max_length=255)
    location_description: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = Field("", max_length=100)
    city: Optional[str] = Field("", max_length=100)
    state: Optional[str] = Field("", max_length=100)
    postal_code: Optional[str] = Field("", max_length=20)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_is_confirmed: Optional[bool] = False
    response_zone_id: Optional[int] = None
    response_zone_name: Optional[str] = None

    # Evidence & Assessment
    photos: Optional[List[Dict[str, Any]]] = []
    immediate_danger: Optional[str] = Field("Not Sure", max_length=50)
    emergency_assistance_needed: Optional[str] = Field("No", max_length=50)
    accuracy_confirmed: Optional[bool] = True
    additional_contact: Optional[str] = Field("", max_length=100)

    @field_validator("people_affected_count", mode="before")
    @classmethod
    def parse_people_affected(cls, v):
        if v == "" or v is None:
            return None
        try:
            val = int(v)
            return max(0, val)
        except (ValueError, TypeError):
            return None

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def parse_lat_lng(cls, v):
        if v == "" or v is None:
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None

    @field_validator("photos", mode="before")
    @classmethod
    def parse_photos(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return v
        return []

class IncidentStatusUpdate(BaseModel):
    status: str = Field(..., max_length=50)
    remarks: Optional[str] = None
    rejection_reason: Optional[str] = None
    duplicate_reason: Optional[str] = None
    duplicate_of_id: Optional[str] = None
    clarification_question: Optional[str] = None
    verification_remarks: Optional[str] = None

class IncidentAssignRequest(BaseModel):
    department: str = Field(..., min_length=2, max_length=255)
    team_notes: Optional[str] = None

class IncidentProgressUpdate(BaseModel):
    is_public: bool = True
    note: str = Field(..., min_length=3)

class IncidentClarificationResponse(BaseModel):
    clarification_text: str = Field(..., min_length=3)
    photos: Optional[List[Dict[str, Any]]] = []

class IncidentResolveRequest(BaseModel):
    resolution_summary: str = Field(..., min_length=5)

class IncidentEventOut(BaseModel):
    id: int
    event_type: str
    status: Optional[str] = None
    actor_name: str
    actor_role: str
    is_public: bool
    note: str
    timestamp: datetime

    class Config:
        from_attributes = True

class IncidentReportOut(BaseModel):
    id: int
    report_identifier: str
    citizen_id: Optional[int] = None
    reporter_name: str
    reporter_email: Optional[str] = None
    reporter_contact: Optional[str] = None

    title: str
    category: str
    description: str
    severity: str
    incident_date: str
    incident_time: Optional[str] = None
    is_still_occurring: Optional[str] = None
    are_people_at_risk: Optional[str] = None
    people_affected_count: Optional[int] = None
    additional_observations: Optional[str] = None

    location_name: Optional[str] = None
    location_description: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_is_confirmed: bool = False
    response_zone_id: Optional[int] = None
    response_zone_name: Optional[str] = None

    photos: Optional[List[Dict[str, Any]]] = []
    immediate_danger: Optional[str] = None
    emergency_assistance_needed: Optional[str] = None
    accuracy_confirmed: bool = True

    status: str
    assigned_department: Optional[str] = None
    assigned_team_notes: Optional[str] = None
    assigned_at: Optional[datetime] = None

    verified_at: Optional[datetime] = None
    verification_remarks: Optional[str] = None

    resolution_summary: Optional[str] = None
    resolved_at: Optional[datetime] = None

    rejection_reason: Optional[str] = None
    duplicate_reason: Optional[str] = None
    duplicate_of_id: Optional[str] = None

    created_at: datetime
    updated_at: Optional[datetime] = None

    events: List[IncidentEventOut] = []

    class Config:
        from_attributes = True

class IncidentSummaryMetricsOut(BaseModel):
    total_reports: int
    awaiting_review: int
    under_investigation: int
    resolved_reports: int
