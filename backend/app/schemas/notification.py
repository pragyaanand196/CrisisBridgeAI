from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AuthorityNotificationOut(BaseModel):
    id: int
    recipient_id: int
    assistance_request_id: int
    event_type: str
    title: str
    message: str
    urgency: str
    category: str
    location_description: str
    citizen_name: Optional[str] = None
    headcount: int = 1
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    assistance_request_status: Optional[str] = None

    class Config:
        from_attributes = True

class NotificationCountOut(BaseModel):
    unread_count: int
