from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.response_zone import ResponseZone
from backend.app.models.resource import Resource
from backend.app.schemas.zone import ResponseZoneCreate, ResponseZoneUpdate, ResponseZoneOut, ResponseZoneDetailOut
from backend.app.services.auth_service import require_authority
from backend.app.services.analytics_service import compute_zone_metrics
from backend.app.services.audit_service import log_audit_event

router = APIRouter(prefix="/zones", tags=["Response Zones"])

@router.get("", response_model=List[ResponseZoneOut])
def list_response_zones(
    warning_id: Optional[int] = Query(None, description="Filter zones by warning ID"),
    db: Session = Depends(get_db)
):
    query = db.query(ResponseZone)
    if warning_id:
        query = query.filter(ResponseZone.warning_id == warning_id)
    zones = query.all()
    
    # Recalculate metrics for accurate snapshot
    for z in zones:
        compute_zone_metrics(z, db)
    db.commit()
    
    return zones

@router.post("", response_model=ResponseZoneOut)
def create_response_zone(
    zone_in: ResponseZoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    new_zone = ResponseZone(
        warning_id=zone_in.warning_id,
        name=zone_in.name,
        code=zone_in.code,
        polygon_geojson=zone_in.polygon_geojson,
        center_lat=zone_in.center_lat,
        center_lng=zone_in.center_lng,
        estimated_population=zone_in.estimated_population,
        risk_level=zone_in.risk_level,
        situation_status="Insufficient Data"
    )
    db.add(new_zone)
    db.commit()
    db.refresh(new_zone)

    log_audit_event(
        db=db,
        event_type="ZONE_CREATED",
        entity_type="ResponseZone",
        entity_id=new_zone.id,
        user=current_user,
        summary=f"Created Response Zone '{new_zone.name}' ({new_zone.code})"
    )

    return new_zone

@router.get("/{zone_id}", response_model=ResponseZoneDetailOut)
def get_zone_detail(zone_id: int, db: Session = Depends(get_db)):
    zone = db.query(ResponseZone).filter(ResponseZone.id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail="Response Zone not found.")
    
    compute_zone_metrics(zone, db)
    db.commit()
    
    resources = db.query(Resource).filter(Resource.response_zone_id == zone_id).all()
    
    return {
        **zone.__dict__,
        "resources": resources
    }
