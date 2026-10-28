from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class WarningTargetArea(Base):
    __tablename__ = "warning_target_areas"

    id = Column(Integer, primary_key=True, index=True)
    warning_id = Column(Integer, ForeignKey("warnings.id", ondelete="CASCADE"), nullable=False)
    warning_version = Column(Integer, default=1, nullable=False)
    
    name = Column(String(255), nullable=False) # e.g. "Lowland Inundation Sector A"
    target_type = Column(String(50), default="polygon", nullable=False) # polygon, radius, locality, district_section
    geometry_geojson = Column(Text, nullable=False) # GeoJSON Polygon or MultiPolygon string
    center_lat = Column(Float, nullable=False)
    center_lng = Column(Float, nullable=False)
    radius_km = Column(Float, nullable=True) # Used if target_type is 'radius'
    
    # Priority Area Concept: "Critical", "Immediate", "High", "Standard", "Low"
    priority_level = Column(String(50), default="High", nullable=False)
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    warning = relationship("Warning", back_populates="target_areas")
    delivery_records = relationship("NotificationDeliveryRecord", back_populates="target_area")
