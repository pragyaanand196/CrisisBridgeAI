from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class AuthorityNotification(Base):
    __tablename__ = "authority_notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assistance_request_id = Column(Integer, ForeignKey("assistance_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    
    event_type = Column(String(50), default="NEW_ASSISTANCE_REQUEST", nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    urgency = Column(String(50), default="High", nullable=False)
    category = Column(String(100), nullable=False)
    location_description = Column(String(255), nullable=False)
    citizen_name = Column(String(255), nullable=True)
    headcount = Column(Integer, default=1, nullable=False)
    
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    recipient = relationship("User", foreign_keys=[recipient_id])
    assistance_request = relationship("AssistanceRequest", foreign_keys=[assistance_request_id])

    __table_args__ = (
        UniqueConstraint("recipient_id", "assistance_request_id", "event_type", name="uq_auth_notif_recipient_req_event"),
    )
