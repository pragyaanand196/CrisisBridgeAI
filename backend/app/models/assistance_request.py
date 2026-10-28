from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class AssistanceRequest(Base):
    __tablename__ = "assistance_requests"

    id = Column(Integer, primary_key=True, index=True)
    warning_id = Column(Integer, ForeignKey("warnings.id", ondelete="CASCADE"), nullable=False)
    response_zone_id = Column(Integer, ForeignKey("response_zones.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Category: evacuation, medical, shelter, food_water, special_needs, other
    category = Column(String(100), nullable=False)
    urgency_level = Column(String(50), default="High", nullable=False) # Critical, High, Medium
    headcount = Column(Integer, default=1, nullable=False)
    
    # Non-sensitive location and notes
    location_description = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    contact_phone = Column(String(50), nullable=True)
    special_notes = Column(Text, nullable=True)
    
    # Operational Triage Status: Pending, Acknowledged, Dispatched, Resolved
    status = Column(String(50), default="Pending", nullable=False)
    
    # Authority Acknowledgement Metadata
    acknowledged_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)

    # Dispatch Metadata
    dispatched_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    dispatched_at = Column(DateTime(timezone=True), nullable=True)
    dispatched_unit_notes = Column(Text, nullable=True)

    # Citizen Response-Area Verification
    citizen_verification_status = Column(String(50), nullable=True) # None, Pending Verification, Assistance Arrived, Assistance Not Arrived
    citizen_verified_at = Column(DateTime(timezone=True), nullable=True)
    citizen_verification_notes = Column(Text, nullable=True)

    # Authority Resolution
    resolved_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    warning = relationship("Warning", back_populates="assistance_requests")
    response_zone = relationship("ResponseZone", back_populates="assistance_requests")
    user = relationship("User", foreign_keys=[user_id])
    acknowledged_by = relationship("User", foreign_keys=[acknowledged_by_id])
    dispatched_by = relationship("User", foreign_keys=[dispatched_by_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_id])
