from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class NotificationDeliveryRecord(Base):
    __tablename__ = "notification_delivery_records"

    id = Column(Integer, primary_key=True, index=True)
    warning_id = Column(Integer, ForeignKey("warnings.id", ondelete="CASCADE"), nullable=False)
    warning_version = Column(Integer, default=1, nullable=False)
    target_area_id = Column(Integer, ForeignKey("warning_target_areas.id", ondelete="SET NULL"), nullable=True)
    response_zone_id = Column(Integer, ForeignKey("response_zones.id", ondelete="SET NULL"), nullable=True)
    citizen_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Complete Delivery Lifecycle Chain:
    # targeted -> notification_attempted -> delivered / delivery_failed -> acknowledged / understood / needs_help / not_in_this_area / no_response
    status = Column(String(50), default="targeted", nullable=False)
    delivery_channel = Column(String(50), default="In-App", nullable=False) # In-App, Web, SMS, Push, Email
    
    attempted_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    failed_reason = Column(String(255), nullable=True)
    
    responded_at = Column(DateTime(timezone=True), nullable=True)
    response_id = Column(Integer, ForeignKey("citizen_responses.id", ondelete="SET NULL"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    warning = relationship("Warning", back_populates="delivery_records")
    target_area = relationship("WarningTargetArea", back_populates="delivery_records")
    response_zone = relationship("ResponseZone", back_populates="delivery_records")
    citizen = relationship("User", foreign_keys=[citizen_id])
    response = relationship("CitizenResponse")
