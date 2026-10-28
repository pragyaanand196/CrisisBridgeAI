from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.app.database import Base

class VerificationReport(Base):
    __tablename__ = "verification_reports"

    id = Column(Integer, primary_key=True, index=True)
    warning_id = Column(Integer, ForeignKey("warnings.id", ondelete="SET NULL"), nullable=True)
    submitted_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    source_platform = Column(String(100), default="Social Media", nullable=False) # Social Media, Word of Mouth, Unofficial SMS, Message Board, News
    claim_title = Column(String(255), nullable=False)
    claim_content = Column(Text, nullable=False)
    reported_location = Column(String(255), nullable=True)
    
    # Status: Unverified, Conflicting with Official Information, Under Review, Verified by Authority
    status = Column(String(100), default="Unverified", nullable=False)
    investigation_notes = Column(Text, nullable=True)
    official_clarification = Column(Text, nullable=True)
    
    reviewed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    warning = relationship("Warning", back_populates="verification_reports")
    submitter = relationship("User", foreign_keys=[submitted_by_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by_id])
