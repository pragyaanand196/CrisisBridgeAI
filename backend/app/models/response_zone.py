from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class ResponseZone(Base):
    __tablename__ = "response_zones"

    id = Column(Integer, primary_key=True, index=True)
    warning_id = Column(Integer, ForeignKey("warnings.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False)
    polygon_geojson = Column(Text, nullable=False)  # GeoJSON Polygon string
    center_lat = Column(Float, nullable=False)
    center_lng = Column(Float, nullable=False)
    estimated_population = Column(Integer, default=1000)
    risk_level = Column(String(50), default="High") # High, Medium, Low
    
    # Deterministic Operational Situation Classification
    # Options: Stable, Attention Required, Critical, Understanding Gap, Communication Gap,
    # Assistance Surge, Insufficient Data, Location Mismatch, Conflicting Information,
    # Warning Updated, Warning Cancelled, Notification Delivery Failure
    situation_status = Column(String(100), default="Insufficient Data", nullable=False)
    wta_score = Column(Float, default=0.0) # Warning-to-Action Score (0.0 to 100.0)
    
    # Aggregated Deterministic Metrics
    targeted_count = Column(Integer, default=0)
    delivery_count = Column(Integer, default=0)
    acknowledgement_count = Column(Integer, default=0)
    understanding_count = Column(Integer, default=0)
    dont_understand_count = Column(Integer, default=0)
    help_request_count = Column(Integer, default=0)
    not_in_area_count = Column(Integer, default=0)
    no_response_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    warning = relationship("Warning", back_populates="response_zones")
    delivery_records = relationship("NotificationDeliveryRecord", back_populates="response_zone")
    citizen_responses = relationship("CitizenResponse", back_populates="response_zone", cascade="all, delete-orphan")
    assistance_requests = relationship("AssistanceRequest", back_populates="response_zone", cascade="all, delete-orphan")
    resources = relationship("Resource", back_populates="response_zone")

