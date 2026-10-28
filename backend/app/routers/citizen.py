from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.warning_target_area import WarningTargetArea
from backend.app.models.notification_delivery_record import NotificationDeliveryRecord
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.resource import Resource
from backend.app.schemas.citizen import CitizenResponseCreate, CitizenResponseOut, SimplifiedInstructionOut
from backend.app.schemas.warning import WarningOut
from backend.app.schemas.resource import CitizenResourcesOut, ResourceOut, EligibleZoneOut
from backend.app.services.auth_service import get_current_user, require_authenticated_user, require_citizen
from backend.app.services.geo_service import (
    match_citizen_to_warning_targets,
    match_citizen_to_response_zone,
    point_in_polygon_or_multipolygon,
    is_citizen_eligible_for_warning,
    get_citizen_eligible_response_zones,
    get_citizen_coordinates
)
from backend.app.services.analytics_service import compute_zone_metrics
from backend.app.services.audit_service import log_audit_event
from backend.app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/citizen", tags=["Citizen Portal"])

@router.get("/resources", response_model=CitizenResourcesOut)
def get_citizen_emergency_resources(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Returns verified emergency facilities and shelters strictly for the authenticated citizen's
    valid response zone membership.
    - Missing coordinates: Returns status='missing_location' with clear instruction to update location.
    - Coordinates outside active disaster zones: Returns status='no_active_zone' with 0 resources.
    - Valid zone membership: Returns only resources assigned to that exact response zone.
    - Unassigned resources are NEVER leaked to citizens.
    """
    if not current_user:
        return CitizenResourcesOut(
            status="missing_location",
            message="Please log in with a citizen account to view emergency resources for your response zone.",
            citizen_zones=[],
            resources=[]
        )

    loc_status, matched_zones = get_citizen_eligible_response_zones(current_user, db)

    if loc_status == "missing_location":
        return CitizenResourcesOut(
            status="missing_location",
            message="Please select or update your registered location to view verified emergency facilities and shelters in your response zone.",
            citizen_zones=[],
            resources=[]
        )

    if loc_status == "no_active_zone" or not matched_zones:
        return CitizenResourcesOut(
            status="no_active_zone",
            message="No verified emergency facilities are currently listed for your response zone.",
            citizen_zones=[],
            resources=[]
        )

    matched_zone_ids = [z.id for z in matched_zones]
    resources = db.query(Resource).filter(
        Resource.response_zone_id.in_(matched_zone_ids),
        Resource.status != "Closed"
    ).order_by(Resource.created_at.desc()).all()

    # Enrich resources with zone labels
    zone_lookup = {z.id: z for z in matched_zones}
    enriched = []
    for r in resources:
        rz = zone_lookup.get(r.response_zone_id)
        if rz:
            setattr(r, "response_zone_name", rz.name)
            setattr(r, "response_zone_code", rz.code)
        enriched.append(r)

    citizen_zone_summaries = []
    for z in matched_zones:
        warn = db.query(Warning).filter(Warning.id == z.warning_id).first()
        citizen_zone_summaries.append(EligibleZoneOut(
            id=z.id,
            name=z.name,
            code=z.code,
            display_label=f"{z.name} ({z.code})",
            locality=getattr(warn, "area_name", "") if warn else z.name,
            area_name=getattr(warn, "area_name", "") if warn else "",
            warning_id=z.warning_id,
            warning_title=getattr(warn, "title", "") if warn else "",
            warning_status=getattr(warn, "status", "") if warn else "",
            is_distributed=bool(warn and warn.distributed_at is not None),
            risk_level=z.risk_level or "High",
            center_lat=z.center_lat or 0.0,
            center_lng=z.center_lng or 0.0,
            created_at=z.created_at
        ))

    message = (
        f"Found {len(resources)} emergency facility/shelter in your response zone."
        if len(resources) == 1 else
        f"Found {len(resources)} emergency facilities/shelters in your response zone."
        if len(resources) > 1 else
        "No verified emergency facilities are currently listed for your response zone."
    )

    return CitizenResourcesOut(
        status="matched",
        message=message,
        citizen_zones=citizen_zone_summaries,
        resources=enriched
    )


@router.get("/active-warnings", response_model=List[WarningOut])
def get_citizen_active_warnings(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Returns ONLY active disaster warnings that are geographically relevant to the citizen's registered location.
    - If user has no verified coordinates or is unauthenticated, returns an empty list.
    - Excludes Expired and Cancelled warnings.
    - Uses unified backend PostGIS / Shapely spatial boundary matching.
    """
    if not current_user or current_user.latitude is None or current_user.longitude is None:
        return []

    now = datetime.utcnow()
    active_warnings = db.query(Warning).filter(
        Warning.status.in_(["Active", "Approved", "Updated"]),
        (Warning.expiry_time == None) | (Warning.expiry_time > now)
    ).order_by(Warning.created_at.desc()).all()

    eligible_warnings = []
    c_lat = current_user.latitude
    c_lng = current_user.longitude

    for warn in active_warnings:
        is_eligible, matched_area = is_citizen_eligible_for_warning(c_lat, c_lng, warn, db)
        
        if is_eligible:
            # Ensure NotificationDeliveryRecord exists for this citizen
            deliv = db.query(NotificationDeliveryRecord).filter(
                NotificationDeliveryRecord.warning_id == warn.id,
                NotificationDeliveryRecord.warning_version == warn.version,
                NotificationDeliveryRecord.citizen_id == current_user.id
            ).first()
            
            if not deliv:
                zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warn.id).all()
                matched_zone = match_citizen_to_response_zone(c_lat, c_lng, zones) if zones else None
                
                new_deliv = NotificationDeliveryRecord(
                    warning_id=warn.id,
                    warning_version=warn.version,
                    target_area_id=getattr(matched_area, "id", None),
                    response_zone_id=getattr(matched_zone, "id", None),
                    citizen_id=current_user.id,
                    status="delivered",
                    delivery_channel="In-App",
                    delivered_at=now
                )
                if matched_zone:
                    matched_zone.targeted_count = (matched_zone.targeted_count or 0) + 1
                    matched_zone.delivery_count = (matched_zone.delivery_count or 0) + 1
                    matched_zone.no_response_count = (matched_zone.no_response_count or 0) + 1

                db.add(new_deliv)
                db.commit()

            target_areas = db.query(WarningTargetArea).filter(
                WarningTargetArea.warning_id == warn.id,
                WarningTargetArea.warning_version == warn.version
            ).all()
            
            warn.target_areas = target_areas
            eligible_warnings.append(warn)

    return eligible_warnings

@router.get("/instructions/{warning_id}", response_model=SimplifiedInstructionOut)
def get_simplified_instruction(
    warning_id: int,
    language: str = Query("en", description="'en' or 'hi'"),
    db: Session = Depends(get_db)
):
    warning = db.query(Warning).filter(Warning.id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Disaster warning not found.")
    
    lang = language.lower().strip()
    if lang not in ["en", "hi"]:
        lang = "en"

    # Select full translated text: prefer backend-stored translation
    if lang == "hi" and warning.ai_simplified_hi:
        text = warning.ai_simplified_hi
    elif warning.ai_simplified_en:
        text = warning.ai_simplified_en
    else:
        text = warning.recommended_instructions or ""

    # Extract ALL bullet points (no cap)
    bullets = [
        line.strip("- \u2022* \t")
        for line in text.split("\n")
        if line.strip().startswith("\u2022") or line.strip().startswith("-")
    ]
    if not bullets:
        bullets = [
            line.strip("- \u2022* \t")
            for line in text.split("\n")
            if line.strip()
            and not line.strip().startswith("\U0001f6a8")
            and not line.strip().startswith("Target Area:")
            and not line.strip().startswith("\u092a\u094d\u0930\u092d\u093e\u0935\u093f\u0924 \u0915\u094d\u0937\u0947\u0924\u094d\u0930:")
        ]

    # Build clean read-aloud text for TTS (remove emoji, clean separators)
    import re as _re
    read_aloud_text = text
    read_aloud_text = read_aloud_text.replace("\U0001f6a8", "")  # Remove 🚨
    read_aloud_text = _re.sub(r"\s*\|\s*", ". ", read_aloud_text)  # | → spoken pause
    read_aloud_text = _re.sub(r"\n{3,}", "\n\n", read_aloud_text)
    read_aloud_text = read_aloud_text.strip()

    # Localised disaster type for all supported types
    disaster_hi_map = {
        "Flood": "\u092c\u093e\u0922\u093c",
        "Cyclone": "\u091a\u0915\u094d\u0930\u0935\u093e\u0924",
        "Earthquake": "\u092d\u0942\u0915\u0902\u092a",
        "Wildfire": "\u091c\u0902\u0917\u0932 \u0915\u0940 \u0906\u0917",
        "Chemical Spill": "\u0930\u093e\u0938\u093e\u092f\u0928\u093f\u0915 \u0930\u093f\u0938\u093e\u0935",
        "Tsunami": "\u0938\u0941\u0928\u093e\u092e\u0940",
        "Severe Storm": "\u092d\u0940\u0937\u0923 \u0924\u0942\u095e\u093e\u0928",
        "Landslide": "\u092d\u0942\u0938\u094d\u0916\u0932\u0928",
        "Heatwave": "\u0924\u093e\u092a \u0932\u0939\u0930"
    }
    translated_disaster = (
        disaster_hi_map.get(warning.disaster_type, warning.disaster_type)
        if lang == "hi" else warning.disaster_type
    )

    return {
        "warning_id": warning.id,
        "version": warning.version,
        "title": warning.title,
        "disaster_type": translated_disaster,
        "severity": warning.severity,
        "urgency": warning.urgency,
        "area_name": warning.area_name,
        "simplified_text": text,
        "language": lang,
        "bullet_points": bullets,
        "read_aloud_text": read_aloud_text,
        "read_aloud_available": True
    }

@router.post("/respond", response_model=CitizenResponseOut)
async def submit_citizen_response(
    resp_in: CitizenResponseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_citizen)
):
    """
    Records citizen acknowledgement, understanding, help request, or Location Mismatch feedback:
    Options: 'understand', 'dont_understand', 'need_help', 'not_in_area'.
    - Validates authenticated citizen session (rejects unauthorized submissions).
    - Auto-associates with the citizen's applicable Response Zone and Target Area based on registered coordinates.
    - Updates existing response if citizen updates their situation, preventing duplicate count while preserving history in audit logs.
    - Updates the delivery lifecycle record from 'delivered' to 'understood' / 'needs_help' / 'not_in_this_area' / 'acknowledged'.
    """
    warning = db.query(Warning).filter(Warning.id == resp_in.warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Target disaster warning not found.")

    warn_ver = resp_in.warning_version or warning.version
    target_area_id = resp_in.target_area_id
    zone_id = resp_in.response_zone_id

    # Auto-resolve Target Area and Response Zone from citizen coordinates
    if current_user.latitude is not None and current_user.longitude is not None:
        target_areas = db.query(WarningTargetArea).filter(
            WarningTargetArea.warning_id == warning.id,
            WarningTargetArea.warning_version == warn_ver
        ).all()
        matched_target = match_citizen_to_warning_targets(current_user.latitude, current_user.longitude, target_areas)
        if matched_target:
            target_area_id = getattr(matched_target, "id", None)
            
        zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warning.id).all()
        matched_zone = match_citizen_to_response_zone(current_user.latitude, current_user.longitude, zones)
        if matched_zone:
            zone_id = getattr(matched_zone, "id", None)
    
    # Fallback to first zone if still unassigned
    if not zone_id:
        first_zone = db.query(ResponseZone).filter(ResponseZone.warning_id == warning.id).first()
        if first_zone:
            zone_id = first_zone.id

    now = datetime.utcnow()

    # Check for existing response from this citizen for this warning & version (Prevent duplicates / Support updates)
    existing_resp = db.query(CitizenResponse).filter(
        CitizenResponse.warning_id == warning.id,
        CitizenResponse.warning_version == warn_ver,
        CitizenResponse.user_id == current_user.id
    ).first()

    if existing_resp:
        old_type = existing_resp.response_type
        existing_resp.response_type = resp_in.response_type
        existing_resp.response_zone_id = zone_id
        existing_resp.target_area_id = target_area_id
        existing_resp.language_used = resp_in.language_used
        existing_resp.feedback_notes = resp_in.feedback_notes
        existing_resp.delivery_channel = resp_in.delivery_channel
        existing_resp.updated_at = now
        active_resp = existing_resp
        db.commit()
        db.refresh(active_resp)

        log_audit_event(
            db=db,
            event_type="CITIZEN_RESPONSE_UPDATED",
            entity_type="CitizenResponse",
            entity_id=active_resp.id,
            user=current_user,
            summary=f"Citizen {current_user.full_name} updated response from '{old_type}' to '{resp_in.response_type}' for warning #{warning.id}"
        )
    else:
        new_resp = CitizenResponse(
            warning_id=warning.id,
            response_zone_id=zone_id,
            target_area_id=target_area_id,
            user_id=current_user.id,
            response_type=resp_in.response_type,
            warning_version=warn_ver,
            language_used=resp_in.language_used,
            feedback_notes=resp_in.feedback_notes,
            delivery_channel=resp_in.delivery_channel,
            created_at=now
        )
        db.add(new_resp)
        db.commit()
        db.refresh(new_resp)
        active_resp = new_resp

        log_audit_event(
            db=db,
            event_type="CITIZEN_RESPONSE_LOGGED",
            entity_type="CitizenResponse",
            entity_id=new_resp.id,
            user=current_user,
            summary=f"Logged citizen response '{resp_in.response_type}' from {current_user.full_name} for warning #{warning.id} (Zone #{zone_id})"
        )

    # Update delivery record lifecycle status
    delivery_rec = db.query(NotificationDeliveryRecord).filter(
        NotificationDeliveryRecord.warning_id == warning.id,
        NotificationDeliveryRecord.warning_version == warn_ver,
        NotificationDeliveryRecord.citizen_id == current_user.id
    ).first()
    
    status_map = {
        "understand": "understood",
        "safe": "understood",  # 'safe' and 'understand' both confirm the citizen is safe → same delivery lifecycle status
        "dont_understand": "acknowledged",
        "need_help": "needs_help",
        "not_in_area": "not_in_this_area"
    }
    
    if delivery_rec:
        delivery_rec.status = status_map.get(resp_in.response_type, "acknowledged")
        delivery_rec.responded_at = now
        delivery_rec.response_id = active_resp.id
        if zone_id:
            delivery_rec.response_zone_id = zone_id
        if target_area_id:
            delivery_rec.target_area_id = target_area_id
        db.commit()

    # Trigger instant deterministic metric re-evaluation for the zone
    updated_metrics = {}
    if zone_id:
        zone = db.query(ResponseZone).filter(ResponseZone.id == zone_id).first()
        if zone:
            updated_metrics = compute_zone_metrics(zone, db)
            db.commit()

    # Real-time WebSocket broadcast to authority command centers
    await ws_manager.broadcast("CITIZEN_RESPONSE_RECEIVED", {
        "warning_id": warning.id,
        "warning_version": warn_ver,
        "zone_id": zone_id,
        "target_area_id": target_area_id,
        "response_type": resp_in.response_type,
        "language_used": resp_in.language_used,
        "citizen_id": current_user.id,
        "metrics": updated_metrics
    })

    return active_resp
