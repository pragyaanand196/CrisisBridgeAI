from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class CitizenResponse(Base):
    __tablename__ = "citizen_responses"

    id = Column(Integer, primary_key=True, index=True)
    warning_id = Column(Integer, ForeignKey("warnings.id", ondelete="CASCADE"), nullable=False)
    response_zone_id = Column(Integer, ForeignKey("response_zones.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Response Type: understand, dont_understand, need_help, not_in_area, no_response
    response_type = Column(String(50), nullable=False)
    warning_version = Column(Integer, default=1, nullable=False)
    target_area_id = Column(Integer, ForeignKey("warning_target_areas.id", ondelete="SET NULL"), nullable=True)
    language_used = Column(String(20), default="en", nullable=False)
    feedback_notes = Column(Text, nullable=True)
    delivery_channel = Column(String(50), default="Web", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    # Relationships
    warning = relationship("Warning", back_populates="responses")
    response_zone = relationship("ResponseZone", back_populates="citizen_responses")
    target_area = relationship("WarningTargetArea")
    user = relationship("User")

