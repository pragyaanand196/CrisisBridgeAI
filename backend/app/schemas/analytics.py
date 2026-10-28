from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class WTAScoreBreakdown(BaseModel):
    zone_id: int
    zone_name: str
    zone_code: str
    wta_score: float # 0.0 to 100.0
    delivery_rate: float
    acknowledgement_rate: float
    understanding_rate: float
    assistance_demand_rate: float
    no_response_rate: float
    failure_rate: float
    situation_status: str
    operational_recommendation: str
    eligible_citizens_count: Optional[int] = 0
    understanding_confirmed_count: Optional[int] = 0
    delivery_count: Optional[int] = 0
    targeted_count: Optional[int] = 0
    acknowledgement_count: Optional[int] = 0
    understanding_count: Optional[int] = 0
    help_request_count: Optional[int] = 0
    estimated_population: Optional[int] = 0
    polygon_geojson: Optional[str] = None
    center_lat: Optional[float] = None
    center_lng: Optional[float] = None
    has_warning: Optional[bool] = True

class GapAlert(BaseModel):
    alert_type: str # COMMUNICATION_GAP, UNDERSTANDING_GAP, ASSISTANCE_SURGE, DELIVERY_FAILURE
    zone_id: int
    zone_name: str
    severity: str # Critical, High, Medium
    metric_value: float
    threshold: float
    explanation: str
    recommended_action: str

class ZoneHealthMatrix(BaseModel):
    total_zones: int
    stable_count: int
    attention_required_count: int
    critical_count: int
    gaps_count: int
    surges_count: int
    zones: List[WTAScoreBreakdown]
    active_gap_alerts: List[GapAlert]

class SystemOverviewMetrics(BaseModel):
    active_warnings_count: int
    total_response_zones: int
    total_citizens_reached: int
    overall_understanding_rate: float
    pending_assistance_requests: int
    verified_resources_count: int
    active_gaps_count: int
