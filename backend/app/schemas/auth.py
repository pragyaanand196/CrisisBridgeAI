from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "citizen"
    department: Optional[str] = None
    jurisdiction: Optional[str] = None
    phone_number: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    district: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    location_geojson: Optional[str] = None
    location_accuracy_radius_m: Optional[float] = 500.0
    preferred_language: Optional[str] = "en"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserLocationUpdate(BaseModel):
    location_name: str
    latitude: float
    longitude: float
    district: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    location_geojson: Optional[str] = None
    location_accuracy_radius_m: Optional[float] = 500.0

class UserLanguageUpdate(BaseModel):
    preferred_language: str # e.g. "en", "hi"

class UserOut(UserBase):
    id: int
    is_active: bool
    location_updated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None

class UserRoleUpdate(BaseModel):
    role: str
    department: Optional[str] = None
    jurisdiction: Optional[str] = None

