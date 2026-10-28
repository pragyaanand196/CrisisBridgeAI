from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class Warning(Base):
    __tablename__ = "warnings"

    id = Column(Integer, primary_key=True, index=True)
    identifier = Column(String(100), unique=True, index=True, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    parent_warning_id = Column(Integer, ForeignKey("warnings.id"), nullable=True)
    
    # Official Disaster Metadata
    disaster_type = Column(String(100), nullable=False)  # Flood, Cyclone, Earthquake, Wildfire, Chemical Spill, Tsunami, Severe Storm
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(50), nullable=False)  # Extreme, Severe, Moderate, Minor
    urgency = Column(String(50), nullable=False)   # Immediate, Expected, Future
    certainty = Column(String(50), nullable=False) # Observed, Likely, Possible
    
    # Geographic definition
    area_name = Column(String(255), nullable=False)
    area_polygon_geojson = Column(Text, nullable=True)  # GeoJSON polygon representation
    
    # Timing
    expected_start_time = Column(DateTime(timezone=True), nullable=True)
    expiry_time = Column(DateTime(timezone=True), nullable=True)
    
    # Official Instructions
    recommended_instructions = Column(Text, nullable=False)
    issuing_authority_name = Column(String(255), nullable=False)
    issuing_authority_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Status Lifecycle
    status = Column(String(50), default="Draft", nullable=False) # Draft, Under Review, Approved, Active, Updated, Expired, Cancelled
    cancellation_reason = Column(Text, nullable=True)
    
    # CAP Structured Payload (Common Alerting Protocol v1.2)
    cap_payload_json = Column(Text, nullable=True)
    
    # Controlled AI Communication & Human Approval Layer
    ai_simplified_en = Column(Text, nullable=True)
    ai_simplified_hi = Column(Text, nullable=True)
    ai_approval_status = Column(String(50), default="Pending", nullable=False) # Pending, Approved, Rejected, Edited
    ai_feedback_notes = Column(Text, nullable=True)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    
    # RAG (Retrieval-Augmented Generation) Grounding Metadata
    rag_sources_json = Column(Text, nullable=True)      # JSON list of retrieved trusted guidance sources
    rag_grounding_score = Column(String(50), nullable=True) # e.g. "95% (High Grounding)"
    rag_query_used = Column(Text, nullable=True)        # Context-aware query constructed from CAP
    rag_status = Column(String(50), default="Grounded", nullable=True) # Grounded, Fallback, No Match
    
    # Distribution Tracking
    distributed_at = Column(DateTime(timezone=True), nullable=True)
    distribution_channels = Column(String(255), default="Web, Simulated-SMS, Simulated-Push, Simulated-Email")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    author = relationship("User", foreign_keys=[issuing_authority_id])
    approver = relationship("User", foreign_keys=[approved_by_id])
    target_areas = relationship("WarningTargetArea", back_populates="warning", cascade="all, delete-orphan")
    response_zones = relationship("ResponseZone", back_populates="warning", cascade="all, delete-orphan")
    delivery_records = relationship("NotificationDeliveryRecord", back_populates="warning", cascade="all, delete-orphan")
    responses = relationship("CitizenResponse", back_populates="warning", cascade="all, delete-orphan")
    assistance_requests = relationship("AssistanceRequest", back_populates="warning", cascade="all, delete-orphan")
    verification_reports = relationship("VerificationReport", back_populates="warning")

