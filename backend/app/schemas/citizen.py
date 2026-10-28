from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CitizenResponseCreate(BaseModel):
    warning_id: int
    response_zone_id: Optional[int] = None
    target_area_id: Optional[int] = None
    response_type: str # understand, safe, dont_understand, need_help, not_in_area
    warning_version: int = 1
    language_used: str = "en"
    feedback_notes: Optional[str] = None
    delivery_channel: str = "Web"

class CitizenResponseOut(BaseModel):
    id: int
    warning_id: int
    response_zone_id: Optional[int] = None
    target_area_id: Optional[int] = None
    user_id: Optional[int] = None
    response_type: str
    warning_version: int
    language_used: str
    feedback_notes: Optional[str] = None
    delivery_channel: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class SimplifiedInstructionOut(BaseModel):
    warning_id: int
    version: int = 1
    title: str
    disaster_type: str
    severity: str
    urgency: str
    area_name: str
    simplified_text: str
    language: str
    bullet_points: list[str]
    read_aloud_text: str
    read_aloud_available: bool = True

