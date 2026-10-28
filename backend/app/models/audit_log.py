from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_email = Column(String(255), nullable=True)
    user_role = Column(String(50), nullable=True)
    
    # Event Types:
    # WARNING_CREATED, WARNING_VALIDATED, CAP_GENERATED, AI_MESSAGE_GENERATED,
    # AI_MESSAGE_APPROVED, AI_MESSAGE_REJECTED, AI_MESSAGE_EDITED, WARNING_DISTRIBUTED,
    # CITIZEN_RESPONSE_LOGGED, ASSISTANCE_REQUESTED, ASSISTANCE_STATUS_UPDATED,
    # ZONE_SITUATION_CHANGED, GAP_DETECTED, SURGE_DETECTED, VERIFICATION_SUBMITTED,
    # VERIFICATION_REVIEWED, CLARIFICATION_PUBLISHED, WARNING_UPDATED,
    # WARNING_CANCELLED, RESOURCE_ADDED, RESOURCE_UPDATED, CONFIG_CHANGED
    event_type = Column(String(100), index=True, nullable=False)
    
    entity_type = Column(String(50), nullable=False) # Warning, ResponseZone, AssistanceRequest, VerificationReport, Resource, User, SystemConfig
    entity_id = Column(Integer, nullable=True)
    summary = Column(String(255), nullable=False)
    details_json = Column(Text, nullable=True) # Full JSON context of change / prior state vs new state
    ip_address = Column(String(50), nullable=True)
    
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User")
