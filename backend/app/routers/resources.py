from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.resource import Resource
from backend.app.models.response_zone import ResponseZone
from backend.app.models.warning import Warning
from backend.app.schemas.resource import ResourceCreate, ResourceUpdate, ResourceOut, EligibleZoneOut
from backend.app.services.auth_service import require_authority, get_current_user
from backend.app.services.geo_service import get_citizen_eligible_response_zones
from backend.app.services.audit_service import log_audit_event
from backend.app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/resources", tags=["Emergency Resources"])


def enrich_resource_out(res: Resource, db: Session) -> Resource:
    """Enriches Resource entity with response zone display information."""
    if res.response_zone_id:
        zone = db.query(ResponseZone).filter(ResponseZone.id == res.response_zone_id).first()
        if zone:
            setattr(res, "response_zone_name", zone.name)
            setattr(res, "response_zone_code", zone.code)
        else:
            setattr(res, "response_zone_name", None)
            setattr(res, "response_zone_code", None)
    else:
        setattr(res, "response_zone_name", None)
        setattr(res, "response_zone_code", None)
    return res


@router.get("/eligible-zones", response_model=List[EligibleZoneOut])
def list_eligible_response_zones(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Returns all valid response zones and target locations created through warning
    creation and distribution workflows for dynamic dropdown population in the Add Resource form.
    Includes stored zone identifier, display label, locality, and warning metadata.
    """
    zones = db.query(ResponseZone).order_by(ResponseZone.created_at.desc(), ResponseZone.id.asc()).all()
    results = []
    for z in zones:
        warn = db.query(Warning).filter(Warning.id == z.warning_id).first()
        area_name = getattr(warn, "area_name", "") if warn else ""
        warning_title = getattr(warn, "title", "Disaster Warning") if warn else ""
        warning_status = getattr(warn, "status", "Draft") if warn else ""
        is_distributed = bool(warn and warn.distributed_at is not None)

        display_label = f"{z.name} ({z.code})"

        results.append(EligibleZoneOut(
            id=z.id,
            name=z.name,
            code=z.code,
            display_label=display_label,
            locality=area_name or z.name,
            area_name=area_name,
            warning_id=z.warning_id,
            warning_title=warning_title,
            warning_status=warning_status,
            is_distributed=is_distributed,
            risk_level=z.risk_level or "High",
            center_lat=z.center_lat or 0.0,
            center_lng=z.center_lng or 0.0,
            created_at=z.created_at
        ))
    return results


@router.get("", response_model=List[ResourceOut])
def list_resources(
    zone_id: Optional[int] = Query(None, description="Optional zone ID filter"),
    resource_type: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Returns resources with strict authorization and citizen zone filtering:
    - Authority and Administrator: Can view all resources or filter by zone.
    - Citizen: Strictly filtered to resources in the citizen's matched Response Zone(s).
      Citizens never receive unassigned resources or resources from other zones.
    - Unauthenticated: Returns empty list to prevent unauthorized leaks.
    """
    if not current_user:
        return []

    query = db.query(Resource)

    if current_user.role == "citizen":
        loc_status, matched_zones = get_citizen_eligible_response_zones(current_user, db)
        if loc_status != "matched" or not matched_zones:
            return []

        matched_zone_ids = [z.id for z in matched_zones]
        # Citizens only see resources assigned to their valid zone membership and in active/visible status
        query = query.filter(
            Resource.response_zone_id.in_(matched_zone_ids),
            Resource.status != "Closed"
        )

        if zone_id:
            if zone_id in matched_zone_ids:
                query = query.filter(Resource.response_zone_id == zone_id)
            else:
                return []
    else:
        # Authority / Administrator view
        if zone_id is not None:
            query = query.filter(Resource.response_zone_id == zone_id)

    if resource_type:
        query = query.filter(Resource.resource_type == resource_type)
    if status_filter:
        query = query.filter(Resource.status == status_filter)

    resources = query.order_by(Resource.created_at.desc()).all()
    return [enrich_resource_out(r, db) for r in resources]


@router.post("", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
async def create_resource(
    res_in: ResourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Creates an emergency facility/resource assigned to a valid Response Zone.
    Validates that the selected response zone exists in the database.
    """
    assigned_zone_id = None
    if res_in.response_zone_id is not None and res_in.response_zone_id > 0:
        zone = db.query(ResponseZone).filter(ResponseZone.id == res_in.response_zone_id).first()
        if not zone:
            raise HTTPException(
                status_code=400,
                detail=f"Response Zone with ID {res_in.response_zone_id} does not exist."
            )
        assigned_zone_id = zone.id

    new_res = Resource(
        response_zone_id=assigned_zone_id,
        name=res_in.name.strip(),
        resource_type=res_in.resource_type,
        address=res_in.address.strip(),
        latitude=res_in.latitude,
        longitude=res_in.longitude,
        contact_phone=res_in.contact_phone.strip(),
        capacity_total=res_in.capacity_total,
        capacity_occupied=res_in.capacity_occupied,
        status=res_in.status,
        verified_by_authority=True
    )
    db.add(new_res)
    db.commit()
    db.refresh(new_res)

    log_audit_event(
        db=db,
        event_type="RESOURCE_ADDED",
        entity_type="Resource",
        entity_id=new_res.id,
        user=current_user,
        summary=f"Added verified {new_res.resource_type}: '{new_res.name}' (Zone #{new_res.response_zone_id or 'Unassigned'})"
    )

    # Real-time WebSocket broadcast to all connected clients
    try:
        await ws_manager.broadcast("RESOURCE_CREATED", {
            "resource_id": new_res.id,
            "name": new_res.name,
            "response_zone_id": new_res.response_zone_id,
            "status": new_res.status
        })
    except Exception as e:
        pass

    return enrich_resource_out(new_res, db)


@router.put("/{resource_id}", response_model=ResourceOut)
async def update_resource(
    resource_id: int,
    res_update: ResourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Updates an existing emergency resource.
    Validates response_zone_id if provided.
    """
    res = db.query(Resource).filter(Resource.id == resource_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found.")

    update_dict = res_update.dict(exclude_unset=True)

    if "response_zone_id" in update_dict:
        rz_id = update_dict["response_zone_id"]
        if rz_id is not None and rz_id > 0:
            zone = db.query(ResponseZone).filter(ResponseZone.id == rz_id).first()
            if not zone:
                raise HTTPException(
                    status_code=400,
                    detail=f"Response Zone with ID {rz_id} does not exist."
                )
            update_dict["response_zone_id"] = zone.id
        else:
            update_dict["response_zone_id"] = None

    for field, val in update_dict.items():
        setattr(res, field, val)

    db.commit()
    db.refresh(res)

    log_audit_event(
        db=db,
        event_type="RESOURCE_UPDATED",
        entity_type="Resource",
        entity_id=res.id,
        user=current_user,
        summary=f"Updated resource #{res.id} ('{res.name}')"
    )

    try:
        await ws_manager.broadcast("RESOURCE_UPDATED", {
            "resource_id": res.id,
            "name": res.name,
            "response_zone_id": res.response_zone_id,
            "status": res.status
        })
    except Exception as e:
        pass

    return enrich_resource_out(res, db)


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Deletes an emergency facility resource.
    """
    res = db.query(Resource).filter(Resource.id == resource_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found.")

    zone_id = res.response_zone_id
    res_name = res.name

    log_audit_event(
        db=db,
        event_type="RESOURCE_DELETED",
        entity_type="Resource",
        entity_id=res.id,
        user=current_user,
        summary=f"Deleted resource '{res_name}'"
    )

    db.delete(res)
    db.commit()

    try:
        await ws_manager.broadcast("RESOURCE_DELETED", {
            "resource_id": resource_id,
            "name": res_name,
            "response_zone_id": zone_id
        })
    except Exception as e:
        pass

    return None
