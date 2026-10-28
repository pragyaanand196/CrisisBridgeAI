from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AssistanceRequestCreate(BaseModel):
    warning_id: int
    response_zone_id: Optional[int] = None
    category: str # evacuation, medical, shelter, food_water, special_needs, other
    urgency_level: str = "High" # Critical, High, Medium
    headcount: int = 1
    location_description: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_phone: Optional[str] = None
    special_notes: Optional[str] = None

class AssistanceRequestUpdate(BaseModel):
    status: Optional[str] = None # Pending, Acknowledged, Dispatched, Resolved
    dispatched_unit_notes: Optional[str] = None

class AssistanceDispatch(BaseModel):
    dispatched_unit_notes: Optional[str] = "Disaster Quick Response Unit"

class AssistanceVerifyArrival(BaseModel):
    assistance_arrived: bool # True = Arrived, False = Not yet arrived / Still waiting
    citizen_feedback_notes: Optional[str] = None

class AssistanceResolve(BaseModel):
    resolution_notes: Optional[str] = None

class AssistanceRequestOut(BaseModel):
    id: int
    warning_id: int
    response_zone_id: Optional[int] = None
    user_id: Optional[int] = None
    category: str
    urgency_level: str
    headcount: int
    location_description: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_phone: Optional[str] = None
    special_notes: Optional[str] = None
    status: str
    
    # Acknowledgement
    acknowledged_by_id: Optional[int] = None
    acknowledged_at: Optional[datetime] = None
    
    # Dispatch
    dispatched_by_id: Optional[int] = None
    dispatched_at: Optional[datetime] = None
    dispatched_unit_notes: Optional[str] = None
    
    # Citizen Verification
    citizen_verification_status: Optional[str] = None
    citizen_verified_at: Optional[datetime] = None
    citizen_verification_notes: Optional[str] = None
    
    # Resolution
    resolved_by_id: Optional[int] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    
    # Additional Context
    user_full_name: Optional[str] = None
    warning_title: Optional[str] = None
    zone_name: Optional[str] = None
    
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
