from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    response_zone_id = Column(Integer, ForeignKey("response_zones.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    resource_type = Column(String(100), nullable=False) # Shelter, Hospital, Relief Camp, Food/Water Distribution, First Aid Post
    address = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    contact_phone = Column(String(50), nullable=False)
    capacity_total = Column(Integer, default=100)
    capacity_occupied = Column(Integer, default=0)
    status = Column(String(50), default="Open", nullable=False) # Open, Full, En Route, Closed
    verified_by_authority = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    response_zone = relationship("ResponseZone", back_populates="resources")
