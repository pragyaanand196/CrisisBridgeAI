from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from backend.app.database import Base

class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(String(255), nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
