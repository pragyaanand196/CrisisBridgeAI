from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.schemas.auth import UserCreate, UserLogin, UserOut, Token, UserRoleUpdate, UserLocationUpdate, UserLanguageUpdate
from backend.app.services.auth_service import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    require_authenticated_user,
    require_admin
)
from backend.app.services.audit_service import log_audit_event
from backend.app.services.websocket_manager import ws_manager
from backend.app.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    
    # Allowed roles during registration: citizen, authority (or admin for first user setup)
    role = user_in.role if user_in.role in ["citizen", "authority", "administrator"] else "citizen"
    
    # Validation: Citizen accounts MUST provide residential/local area location
    if role == "citizen":
        if not user_in.location_name or user_in.latitude is None or user_in.longitude is None:
            raise HTTPException(
                status_code=400,
                detail="Location is mandatory for citizen registration. Please select your local residential area on the map to receive geographically targeted disaster alerts."
            )
        if not (-90.0 <= user_in.latitude <= 90.0) or not (-180.0 <= user_in.longitude <= 180.0):
            raise HTTPException(
                status_code=400,
                detail="Selected coordinates are outside valid geographic limits."
            )
    
    now = datetime.utcnow()
    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=role,
        department=user_in.department,
        jurisdiction=user_in.jurisdiction,
        phone_number=user_in.phone_number,
        location_name=user_in.location_name,
        latitude=user_in.latitude,
        longitude=user_in.longitude,
        district=user_in.district,
        city=user_in.city,
        state=user_in.state,
        postal_code=user_in.postal_code,
        location_geojson=user_in.location_geojson,
        location_accuracy_radius_m=user_in.location_accuracy_radius_m or 500.0,
        location_updated_at=now if user_in.latitude is not None else None,
        preferred_language=user_in.preferred_language or "en"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_audit_event(
        db=db,
        event_type="USER_REGISTERED",
        entity_type="User",
        entity_id=new_user.id,
        user=new_user,
        summary=f"New user registered with role '{new_user.role}' in area '{new_user.location_name or 'N/A'}' (Lang: {new_user.preferred_language})"
    )

    access_token = create_access_token(data={"sub": str(new_user.id), "role": new_user.role})

    # Broadcast citizen registration event to connected command centers
    if new_user.role == "citizen":
        try:
            await ws_manager.broadcast("CITIZEN_REGISTERED", {
                "user_id": new_user.id,
                "role": new_user.role,
                "location_name": new_user.location_name,
                "latitude": new_user.latitude,
                "longitude": new_user.longitude
            })
        except Exception:
            pass

    return {"access_token": access_token, "token_type": "bearer", "user": new_user}

@router.post("/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password credentials."
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is deactivated.")

    log_audit_event(
        db=db,
        event_type="USER_LOGIN",
        entity_type="User",
        entity_id=user.id,
        user=user,
        summary=f"User {user.email} logged in successfully"
    )

    access_token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@router.get("/me", response_model=UserOut)
def get_current_user_profile(current_user: User = Depends(require_authenticated_user)):
    return current_user

@router.put("/profile/language", response_model=UserOut)
def update_user_language(
    lang_in: UserLanguageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Persists the authenticated user's preferred language (e.g. 'en', 'hi').
    Ensures warnings, communications, and read-aloud features default to this selection.
    """
    valid_langs = ["en", "hi"]
    chosen_lang = lang_in.preferred_language.lower().strip()
    if chosen_lang not in valid_langs:
        # Fallback cleanly or validate
        chosen_lang = "en"

    old_lang = getattr(current_user, "preferred_language", "en")
    current_user.preferred_language = chosen_lang
    db.commit()
    db.refresh(current_user)

    log_audit_event(
        db=db,
        event_type="USER_LANGUAGE_UPDATED",
        entity_type="User",
        entity_id=current_user.id,
        user=current_user,
        summary=f"User {current_user.email} updated language preference from '{old_lang}' to '{chosen_lang}'"
    )

    return current_user

@router.put("/profile/location", response_model=UserOut)
async def update_citizen_location(
    location_in: UserLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated_user)
):
    """
    Updates the authenticated citizen's registered geographic location.
    All future warnings will evaluate eligibility using this new location.
    Historical records of previously targeted warnings remain preserved.
    """
    if not (-90.0 <= location_in.latitude <= 90.0) or not (-180.0 <= location_in.longitude <= 180.0):
        raise HTTPException(
            status_code=400,
            detail="Coordinates outside valid geographic limits."
        )

    old_loc = current_user.location_name
    current_user.location_name = location_in.location_name
    current_user.latitude = location_in.latitude
    current_user.longitude = location_in.longitude
    current_user.district = location_in.district
    current_user.city = location_in.city
    current_user.state = location_in.state
    current_user.postal_code = location_in.postal_code
    current_user.location_geojson = location_in.location_geojson
    current_user.location_accuracy_radius_m = location_in.location_accuracy_radius_m or 500.0
    current_user.location_updated_at = datetime.utcnow()

    db.commit()
    db.refresh(current_user)

    log_audit_event(
        db=db,
        event_type="CITIZEN_LOCATION_UPDATED",
        entity_type="User",
        entity_id=current_user.id,
        user=current_user,
        summary=f"Citizen updated registered location from '{old_loc}' to '{current_user.location_name}'"
    )

    # Broadcast location update to connected authority command centers
    try:
        await ws_manager.broadcast("CITIZEN_LOCATION_UPDATED", {
            "user_id": current_user.id,
            "location_name": current_user.location_name,
            "latitude": current_user.latitude,
            "longitude": current_user.longitude
        })
    except Exception:
        pass

    return current_user

