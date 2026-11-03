from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class IncidentReport(Base):
    __tablename__ = "incident_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_identifier = Column(String(50), unique=True, index=True, nullable=False) # e.g. IR-2026-7842
    citizen_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Reporter Information
    reporter_name = Column(String(255), nullable=False)
    reporter_email = Column(String(255), nullable=True)
    reporter_contact = Column(String(50), nullable=True)

    # Incident Details
    title = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=False)
    severity = Column(String(50), default="Moderate", nullable=False, index=True) # Citizen-reported
    incident_date = Column(String(50), nullable=False)
    incident_time = Column(String(50), nullable=True)
    is_still_occurring = Column(String(50), default="Not Sure")
    are_people_at_risk = Column(String(50), default="Not Sure")
    people_affected_count = Column(Integer, nullable=True)
    additional_observations = Column(Text, nullable=True)

    # Incident Location
    location_name = Column(String(255), nullable=True)
    location_description = Column(Text, nullable=True)
    address = Column(Text, nullable=True)
    district = Column(String(100), nullable=True, index=True)
    city = Column(String(100), nullable=True, index=True)
    state = Column(String(100), nullable=True)
    postal_code = Column(String(20), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_is_confirmed = Column(Boolean, default=False)
    response_zone_id = Column(Integer, ForeignKey("response_zones.id", ondelete="SET NULL"), nullable=True, index=True)
    response_zone_name = Column(String(255), nullable=True)

    # Supporting Evidence (JSON array of photo metadata or image paths)
    photos_json = Column(Text, nullable=True)

    # Additional Citizen Assessment
    immediate_danger = Column(String(50), default="Not Sure")
    emergency_assistance_needed = Column(String(50), default="No")
    accuracy_confirmed = Column(Boolean, default=True)

    # Operational Lifecycle Status:
    # Submitted, Under Review, Clarification Requested, Verified, Assigned, Action in Progress, Resolved, Rejected, Duplicate
    status = Column(String(50), default="Submitted", nullable=False, index=True)

    # Department and Response Team Assignment
    assigned_department = Column(String(255), nullable=True)
    assigned_team_notes = Column(Text, nullable=True)
    assigned_at = Column(DateTime(timezone=True), nullable=True)
    assigned_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Verification Metadata
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verification_remarks = Column(Text, nullable=True)

    # Resolution Metadata
    resolution_summary = Column(Text, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Rejection or Duplicate Handling
    rejection_reason = Column(Text, nullable=True)
    duplicate_reason = Column(Text, nullable=True)
    duplicate_of_id = Column(String(50), nullable=True) # ID of original report

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    citizen = relationship("User", foreign_keys=[citizen_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])
    verified_by = relationship("User", foreign_keys=[verified_by_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_id])
    events = relationship("IncidentReportEvent", back_populates="incident_report", cascade="all, delete-orphan", order_by="IncidentReportEvent.timestamp.asc()")


class IncidentReportEvent(Base):
    __tablename__ = "incident_report_events"

    id = Column(Integer, primary_key=True, index=True)
    incident_report_id = Column(Integer, ForeignKey("incident_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Event types: STATUS_CHANGE, ASSIGNMENT, VERIFICATION, PUBLIC_UPDATE, INTERNAL_NOTE, CLARIFICATION_REQUEST, CLARIFICATION_RESPONSE, RESOLUTION
    event_type = Column(String(100), nullable=False)
    
    status = Column(String(50), nullable=True) # Status at the time of event
    actor_name = Column(String(255), nullable=False)
    actor_role = Column(String(50), nullable=False) # citizen, authority, administrator
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    is_public = Column(Boolean, default=True, nullable=False) # True = visible to reporting citizen, False = internal authority note
    note = Column(Text, nullable=False)
    details_json = Column(Text, nullable=True) # Optional JSON payload (photos, metadata, etc.)

    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    incident_report = relationship("IncidentReport", back_populates="events")
    actor = relationship("User", foreign_keys=[actor_id])
