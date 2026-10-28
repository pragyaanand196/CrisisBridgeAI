from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ResourceCreate(BaseModel):
    response_zone_id: Optional[int] = None
    name: str
    resource_type: str # Shelter, Hospital, Relief Camp, Food/Water Distribution, First Aid Post
    address: str
    latitude: float
    longitude: float
    contact_phone: str
    capacity_total: int = 100
    capacity_occupied: int = 0
    status: str = "Open" # Open, Full, En Route, Closed

class ResourceUpdate(BaseModel):
    name: Optional[str] = None
    resource_type: Optional[str] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    capacity_total: Optional[int] = None
    capacity_occupied: Optional[int] = None
    status: Optional[str] = None
    response_zone_id: Optional[int] = None

class ResourceOut(BaseModel):
    id: int
    response_zone_id: Optional[int] = None
    response_zone_name: Optional[str] = None
    response_zone_code: Optional[str] = None
    name: str
    resource_type: str
    address: str
    latitude: float
    longitude: float
    contact_phone: str
    capacity_total: int
    capacity_occupied: int
    status: str
    verified_by_authority: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class EligibleZoneOut(BaseModel):
    id: int
    name: str
    code: str
    display_label: str
    locality: Optional[str] = None
    area_name: Optional[str] = None
    warning_id: int
    warning_title: Optional[str] = None
    warning_status: Optional[str] = None
    is_distributed: bool = False
    risk_level: str = "High"
    center_lat: float
    center_lng: float
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CitizenResourcesOut(BaseModel):
    status: str  # 'matched', 'no_active_zone', 'missing_location'
    message: str
    citizen_zones: List[EligibleZoneOut] = []
    resources: List[ResourceOut] = []
