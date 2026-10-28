from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

class ResponseZoneCreate(BaseModel):
    warning_id: int
    name: str
    code: str
    polygon_geojson: str
    center_lat: float
    center_lng: float
    estimated_population: int = 1000
    risk_level: str = "High"

class ResponseZoneUpdate(BaseModel):
    name: Optional[str] = None
    estimated_population: Optional[int] = None
    risk_level: Optional[str] = None
    polygon_geojson: Optional[str] = None

class ResponseZoneOut(BaseModel):
    id: int
    warning_id: int
    name: str
    code: str
    polygon_geojson: str
    center_lat: float
    center_lng: float
    estimated_population: int
    risk_level: str
    situation_status: str
    wta_score: float
    delivery_count: int
    acknowledgement_count: int
    understanding_count: int
    dont_understand_count: int
    help_request_count: int
    not_in_area_count: int
    no_response_count: int
    failure_count: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ResponseZoneDetailOut(ResponseZoneOut):
    resources: List[Any] = []
