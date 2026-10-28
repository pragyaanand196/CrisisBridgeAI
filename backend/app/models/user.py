from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text
from sqlalchemy.sql import func
from backend.app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default="citizen", nullable=False)  # citizen, authority, administrator
    department = Column(String(255), nullable=True)  # e.g., "National Disaster Response Force", "City Emergency Ops"
    jurisdiction = Column(String(255), nullable=True)  # e.g., "Riverside District", "Sector 4"
    phone_number = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Geographic Location (Mandatory for Citizens receiving targeted alerts)
    location_name = Column(String(255), nullable=True)  # e.g. "Riverside Sector 4, Mumbai"
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    district = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    postal_code = Column(String(20), nullable=True)
    location_geojson = Column(Text, nullable=True)  # Optional Point or Polygon representation
    location_accuracy_radius_m = Column(Float, default=500.0)  # Area precision radius in meters
    location_updated_at = Column(DateTime(timezone=True), nullable=True)
    preferred_language = Column(String(10), default="en", nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

