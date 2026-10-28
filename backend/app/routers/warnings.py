import json
import uuid
import re
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.warning_target_area import WarningTargetArea
from backend.app.models.notification_delivery_record import NotificationDeliveryRecord
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.schemas.warning import (
    WarningCreate,
    WarningUpdate,
    WarningOut,
    WarningDetailOut,
    AIApprovalAction,
    WarningCancellationRequest,
    TargetingPreviewRequest,
    TargetingPreviewResponse
)
from backend.app.services.auth_service import require_authority, get_current_user
from backend.app.services.cap_service import generate_cap_payload
from backend.app.services.ai_service import generate_simplified_citizen_communication, validate_translation_completeness
from backend.app.services.geo_service import (
    validate_geometry,
    calculate_centroid,
    calculate_targeting_preview,
    generate_default_response_zones,
    generate_zones_from_target_areas,
    distribute_warning_to_eligible_citizens
)
from backend.app.services.analytics_service import (
    compute_warning_targeting_analytics,
    build_warning_situation_timeline,
    get_warning_citizen_responses
)
from backend.app.services.notification_service import notification_service
from backend.app.services.audit_service import log_audit_event
from backend.app.services.websocket_manager import ws_manager
from backend.app.services.rag_service import rag_service

router = APIRouter(prefix="/warnings", tags=["Warnings"])

@router.get("", response_model=List[WarningOut])
def list_warnings(
    status_filter: Optional[str] = Query(None, description="Filter by status, e.g. Active, Draft, Approved, Under Review"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Returns warnings visible to the caller:
    - Administrators see ALL warnings across all authorities.
    - Authorities see ONLY warnings they personally issued.
    - Unauthenticated / citizen callers see only Active/Updated warnings (public view).
    """
    query = db.query(Warning)
    if current_user and current_user.role == "administrator":
        # Admins see everything
        pass
    elif current_user and current_user.role == "authority":
        # Authorities only see their own warnings
        query = query.filter(Warning.issuing_authority_id == current_user.id)
    else:
        # Public / citizens: only show active and updated warnings
        query = query.filter(Warning.status.in_(["Active", "Updated"]))
    if status_filter:
        query = query.filter(Warning.status == status_filter)
    return query.order_by(Warning.created_at.desc()).all()

@router.post("/preview-targeting", response_model=TargetingPreviewResponse)
def preview_targeting_population(
    preview_req: TargetingPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Evaluates proposed geographic target areas against registered citizens in the database.
    Calculates exact matching counts without fabricating data.
    Validates all geometry boundaries before approval.
    """
    if not preview_req.target_areas:
        raise HTTPException(status_code=400, detail="At least one target geographic area must be defined.")
    
    # Validate each geometry
    for area in preview_req.target_areas:
        is_valid, err_msg = validate_geometry(area.geometry_geojson)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid geometry in target area '{area.name}': {err_msg}")
            
    target_data = [a.dict() for a in preview_req.target_areas]
    result = calculate_targeting_preview(db, target_data)
    return result

@router.post("", response_model=WarningOut, status_code=status.HTTP_201_CREATED)
async def create_warning(
    warning_in: WarningCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Creates an official disaster warning with geographic priority target areas.
    Validates geometry, generates CAP v1.2 payload, initializes Response Zones,
    and drafts AI simplified plain-language / Hindi messages.
    """
    # 0. Independent backend field validations
    if not warning_in.title or not warning_in.title.strip():
        raise HTTPException(status_code=400, detail="Warning title cannot be empty.")
    if not warning_in.description or not warning_in.description.strip():
        raise HTTPException(status_code=400, detail="Warning description cannot be empty.")
    if not warning_in.area_name or not warning_in.area_name.strip():
        raise HTTPException(status_code=400, detail="Affected area name cannot be empty.")
    if not warning_in.recommended_instructions or not warning_in.recommended_instructions.strip():
        raise HTTPException(status_code=400, detail="Recommended instructions cannot be empty.")
    
    valid_severities = ["Extreme", "Severe", "Moderate", "Minor"]
    if warning_in.severity not in valid_severities:
        raise HTTPException(status_code=400, detail=f"Unsupported severity '{warning_in.severity}'. Allowed values: {valid_severities}")
        
    valid_urgencies = ["Immediate", "Expected", "Future"]
    if warning_in.urgency not in valid_urgencies:
        raise HTTPException(status_code=400, detail=f"Unsupported urgency '{warning_in.urgency}'. Allowed values: {valid_urgencies}")

    valid_certainties = ["Observed", "Likely", "Possible"]
    if warning_in.certainty not in valid_certainties:
        raise HTTPException(status_code=400, detail=f"Unsupported certainty '{warning_in.certainty}'. Allowed values: {valid_certainties}")

    now = datetime.utcnow()
    if warning_in.expiry_time:
        if warning_in.expiry_time < now:
            raise HTTPException(status_code=400, detail="Warning expiry time cannot be in the past.")
        if warning_in.expected_start_time and warning_in.expiry_time <= warning_in.expected_start_time:
            raise HTTPException(status_code=400, detail="Warning expiry time must be after the expected start time.")

    # 1. Unique CAP identifier
    identifier = f"CB-WARN-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    
    # 2. Validate Target Areas if provided
    target_areas_to_save = []
    combined_geojson = warning_in.area_polygon_geojson
    primary_center_lat = 19.0760
    primary_center_lng = 72.8777
    
    if warning_in.target_areas and len(warning_in.target_areas) > 0:
        for idx, ta in enumerate(warning_in.target_areas):
            is_valid, err_msg = validate_geometry(ta.geometry_geojson)
            if not is_valid:
                raise HTTPException(status_code=400, detail=f"Invalid geometry in target area '{ta.name}': {err_msg}")
            
            c_lat = ta.center_lat
            c_lng = ta.center_lng
            if c_lat == 0.0 and c_lng == 0.0:
                c_lat, c_lng = calculate_centroid(ta.geometry_geojson)
                
            if idx == 0:
                primary_center_lat = c_lat
                primary_center_lng = c_lng
                if not combined_geojson:
                    combined_geojson = ta.geometry_geojson
                    
            target_areas_to_save.append({
                "name": ta.name,
                "target_type": ta.target_type,
                "geometry_geojson": ta.geometry_geojson,
                "center_lat": c_lat,
                "center_lng": c_lng,
                "radius_km": ta.radius_km,
                "priority_level": ta.priority_level,
                "notes": ta.notes
            })
    
    # 3. Internal CAP v1.2 representation
    cap_payload = generate_cap_payload(
        identifier=identifier,
        sender=warning_in.issuing_authority_name,
        sent_time=datetime.utcnow(),
        status="Draft",
        msg_type="Alert",
        disaster_type=warning_in.disaster_type,
        urgency=warning_in.urgency,
        severity=warning_in.severity,
        certainty=warning_in.certainty,
        headline=warning_in.title,
        description=warning_in.description,
        instruction=warning_in.recommended_instructions,
        area_desc=warning_in.area_name,
        polygon_geojson=combined_geojson
    )

    new_warning = Warning(
        identifier=identifier,
        version=1,
        disaster_type=warning_in.disaster_type,
        title=warning_in.title,
        description=warning_in.description,
        severity=warning_in.severity,
        urgency=warning_in.urgency,
        certainty=warning_in.certainty,
        area_name=warning_in.area_name,
        area_polygon_geojson=combined_geojson,
        expected_start_time=warning_in.expected_start_time or datetime.utcnow(),
        expiry_time=warning_in.expiry_time or (datetime.utcnow() + timedelta(days=2)),
        recommended_instructions=warning_in.recommended_instructions,
        issuing_authority_name=warning_in.issuing_authority_name,
        issuing_authority_id=current_user.id,
        status="Draft",
        cap_payload_json=json.dumps(cap_payload)
    )
    db.add(new_warning)
    db.commit()
    db.refresh(new_warning)

    # 4. Save Target Areas
    created_target_areas = []
    if target_areas_to_save:
        for ta_data in target_areas_to_save:
            ta_obj = WarningTargetArea(
                warning_id=new_warning.id,
                warning_version=1,
                name=ta_data["name"],
                target_type=ta_data["target_type"],
                geometry_geojson=ta_data["geometry_geojson"],
                center_lat=ta_data["center_lat"],
                center_lng=ta_data["center_lng"],
                radius_km=ta_data["radius_km"],
                priority_level=ta_data["priority_level"],
                notes=ta_data["notes"]
            )
            db.add(ta_obj)
            created_target_areas.append(ta_obj)
        db.commit()
    elif combined_geojson:
        # Save a single default target area from area_polygon_geojson
        ta_obj = WarningTargetArea(
            warning_id=new_warning.id,
            warning_version=1,
            name=warning_in.area_name,
            target_type="polygon",
            geometry_geojson=combined_geojson,
            center_lat=primary_center_lat,
            center_lng=primary_center_lng,
            priority_level="High",
            notes="Primary warning boundary"
        )
        db.add(ta_obj)
        created_target_areas.append(ta_obj)
        db.commit()

    # 5. Divide into Response Zones: custom, from target areas, or default sectors
    if warning_in.zones and len(warning_in.zones) > 0:
        for z in warning_in.zones:
            zone_obj = ResponseZone(
                warning_id=new_warning.id,
                name=z.name,
                code=z.code,
                polygon_geojson=z.polygon_geojson,
                center_lat=z.center_lat,
                center_lng=z.center_lng,
                estimated_population=z.estimated_population,
                risk_level=z.risk_level,
                situation_status="Insufficient Data"
            )
            db.add(zone_obj)
    elif created_target_areas:
        zone_data = generate_zones_from_target_areas(new_warning.id, created_target_areas)
        for z in zone_data:
            zone_obj = ResponseZone(
                warning_id=new_warning.id,
                name=z["name"],
                code=z["code"],
                polygon_geojson=z["polygon_geojson"],
                center_lat=z["center_lat"],
                center_lng=z["center_lng"],
                estimated_population=z["estimated_population"],
                risk_level=z["risk_level"],
                situation_status="Insufficient Data"
            )
            db.add(zone_obj)
    else:
        # Default spatial sectors
        default_zones = generate_default_response_zones(new_warning.id, warning_in.area_name, primary_center_lat, primary_center_lng)
        for z in default_zones:
            zone_obj = ResponseZone(
                warning_id=new_warning.id,
                name=z["name"],
                code=z["code"],
                polygon_geojson=z["polygon_geojson"],
                center_lat=z["center_lat"],
                center_lng=z["center_lng"],
                estimated_population=z["estimated_population"],
                risk_level=z["risk_level"],
                situation_status="Insufficient Data"
            )
            db.add(zone_obj)
    
    db.commit()

    # 6. RAG: Dynamic retrieval from CAP structured event & trusted knowledge base
    retrieval_query = rag_service.build_retrieval_query(
        disaster_type=new_warning.disaster_type,
        severity=new_warning.severity,
        urgency=new_warning.urgency,
        area_name=new_warning.area_name,
        description=new_warning.description,
        recommended_instructions=new_warning.recommended_instructions,
        cap_payload=cap_payload
    )
    retrieved_sources, formatted_rag_context = rag_service.retrieve_grounding_knowledge(
        query=retrieval_query,
        disaster_type=new_warning.disaster_type,
        top_k=3
    )

    # 7. Automatically draft initial controlled grounded AI communication
    en_text, hi_text, source, g_score, g_note = await generate_simplified_citizen_communication(
        disaster_type=new_warning.disaster_type,
        title=new_warning.title,
        description=new_warning.description,
        severity=new_warning.severity,
        urgency=new_warning.urgency,
        area_name=new_warning.area_name,
        recommended_instructions=new_warning.recommended_instructions,
        retrieved_context_text=formatted_rag_context,
        retrieved_sources=retrieved_sources
    )
    new_warning.ai_simplified_en = en_text
    new_warning.ai_simplified_hi = hi_text
    new_warning.ai_approval_status = "Pending"
    new_warning.status = "Under Review"
    new_warning.rag_sources_json = json.dumps(retrieved_sources, ensure_ascii=False)
    new_warning.rag_grounding_score = g_score
    new_warning.rag_query_used = retrieval_query
    new_warning.rag_status = "Grounded" if retrieved_sources else "Fallback"

    db.commit()
    db.refresh(new_warning)

    log_audit_event(
        db=db,
        event_type="WARNING_CREATED",
        entity_type="Warning",
        entity_id=new_warning.id,
        user=current_user,
        summary=f"Created {new_warning.severity} {new_warning.disaster_type} warning '{new_warning.title}' — RAG: {len(retrieved_sources)} sources ({g_score})"
    )

    return new_warning

@router.get("/{warning_id}", response_model=WarningDetailOut)
def get_warning_detail(
    warning_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    warning = db.query(Warning).filter(Warning.id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Disaster warning not found.")
    
    # RBAC: Authorities can only inspect warnings they issued; Administrators can view all
    if current_user and current_user.role == "authority" and warning.issuing_authority_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view or manage warnings issued by another authority."
        )
    
    target_areas = db.query(WarningTargetArea).filter(
        WarningTargetArea.warning_id == warning_id,
        WarningTargetArea.warning_version == warning.version
    ).all()
    
    zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warning_id).all()
    resp_count = db.query(CitizenResponse).filter(
        CitizenResponse.warning_id == warning_id,
        CitizenResponse.warning_version == warning.version
    ).count()
    help_count = db.query(AssistanceRequest).filter(AssistanceRequest.warning_id == warning_id).count()
    
    # Targeting analytics with multi-condition detection
    analytics_data = compute_warning_targeting_analytics(warning, db)
    
    # Privacy-preserving citizen responses list
    citizen_responses = get_warning_citizen_responses(warning, db)
    
    # Chronological situation timeline
    timeline_events = build_warning_situation_timeline(warning, db)
    
    # Creator details
    creator = warning.author
    creator_name = creator.full_name if creator else warning.issuing_authority_name
    creator_dept = creator.department if creator else None
    creator_jurisdiction = creator.jurisdiction if creator else None
    
    return {
        **warning.__dict__,
        "creator_authority_name": creator_name,
        "creator_authority_department": creator_dept,
        "creator_authority_jurisdiction": creator_jurisdiction,
        "target_areas": target_areas,
        "response_zones": zones,
        "responses_count": resp_count,
        "assistance_requests_count": help_count,
        "verification_reports_count": len(warning.verification_reports),
        "delivery_analytics": analytics_data,
        "citizen_responses": citizen_responses,
        "timeline_events": timeline_events
    }

@router.get("/{warning_id}/targeting-analytics")
def get_warning_targeting_analytics(
    warning_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    """
    Returns deterministic delivery chain metrics, response zone situations, and operational gap alerts.
    """
    warning = db.query(Warning).filter(Warning.id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning not found.")
    
    # RBAC
    if current_user and current_user.role == "authority" and warning.issuing_authority_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view or manage warnings issued by another authority."
        )
    
    return compute_warning_targeting_analytics(warning, db)

@router.post("/{warning_id}/generate-ai")
async def generate_ai_message(
    warning_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Triggers controlled AI plain-language & Hindi message simplification.
    AI cannot modify geographic boundaries or recipient lists.
    """
    warning = db.query(Warning).filter(Warning.id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning not found.")
    
    # RBAC: Authorities can only regenerate warnings they issued; Administrators can manage all
    if current_user.role == "authority" and warning.issuing_authority_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to regenerate messages for warnings issued by another authority."
        )

    # State validation: active or cancelled warnings must not be silently rewritten
    if warning.status in ["Active", "Cancelled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot regenerate AI communication for warning in '{warning.status}' status. Use versioning to create a new updated draft."
        )
    
    # RAG: Context-aware query and retrieval
    cap_payload = None
    if warning.cap_payload_json:
        try:
            cap_payload = json.loads(warning.cap_payload_json)
        except Exception:
            pass

    retrieval_query = rag_service.build_retrieval_query(
        disaster_type=warning.disaster_type,
        severity=warning.severity,
        urgency=warning.urgency,
        area_name=warning.area_name,
        description=warning.description,
        recommended_instructions=warning.recommended_instructions,
        cap_payload=cap_payload
    )
    retrieved_sources, formatted_rag_context = rag_service.retrieve_grounding_knowledge(
        query=retrieval_query,
        disaster_type=warning.disaster_type,
        top_k=3
    )

    en_text, hi_text, source, g_score, g_note = await generate_simplified_citizen_communication(
        disaster_type=warning.disaster_type,
        title=warning.title,
        description=warning.description,
        severity=warning.severity,
        urgency=warning.urgency,
        area_name=warning.area_name,
        recommended_instructions=warning.recommended_instructions,
        retrieved_context_text=formatted_rag_context,
        retrieved_sources=retrieved_sources
    )

    # Validate translation completeness before saving
    is_valid, validation_reason = validate_translation_completeness(
        en_text, hi_text, warning.recommended_instructions, warning.area_name
    )

    warning.ai_simplified_en = en_text
    warning.ai_simplified_hi = hi_text
    warning.ai_approval_status = "Pending"
    warning.rag_sources_json = json.dumps(retrieved_sources, ensure_ascii=False)
    warning.rag_grounding_score = g_score
    warning.rag_query_used = retrieval_query
    warning.rag_status = "Grounded" if retrieved_sources else "Fallback"
    db.commit()

    log_audit_event(
        db=db,
        event_type="AI_MESSAGE_GENERATED",
        entity_type="Warning",
        entity_id=warning.id,
        user=current_user,
        summary=f"Controlled AI generated simplified communication via {source} — RAG: {len(retrieved_sources)} sources ({g_score}) — Validation: {'PASS' if is_valid else 'FAIL: ' + validation_reason}"
    )

    return {
        "status": "success",
        "source": source,
        "ai_simplified_en": en_text,
        "ai_simplified_hi": hi_text,
        "translation_valid": is_valid,
        "translation_validation_note": validation_reason,
        "rag_sources": retrieved_sources,
        "rag_grounding_score": g_score,
        "rag_status": warning.rag_status
    }

@router.post("/{warning_id}/approve-ai", response_model=WarningOut)
async def human_authority_approval_layer(
    warning_id: int,
    approval_action: AIApprovalAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Mandatory Human Authority Approval Layer:
    Authorities review, edit, approve, or reject AI-generated citizen messages.
    """
    warning = db.query(Warning).filter(Warning.id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning not found.")

    # RBAC: Authorities can only approve warnings they issued; Administrators can manage all
    if current_user.role == "authority" and warning.issuing_authority_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to approve warnings issued by another authority."
        )

    if warning.status == "Cancelled":
        raise HTTPException(
            status_code=400,
            detail="Cannot approve or activate a cancelled warning."
        )

    action = approval_action.action.lower()
    if action in ["approve", "edit"]:
        warning.ai_approval_status = "Approved" if action == "approve" else "Edited"
        warning.status = "Active"
        warning.approved_by_id = current_user.id
        warning.approved_at = datetime.utcnow()
        warning.distributed_at = datetime.utcnow()
        
        if approval_action.ai_simplified_en:
            warning.ai_simplified_en = approval_action.ai_simplified_en
            if approval_action.ai_simplified_hi:
                warning.ai_simplified_hi = approval_action.ai_simplified_hi
            else:
                # English was edited: regenerate full line-by-line Hindi translation
                edited_bullets = [
                    re.sub(r"^\s*[-•*\d.]+\s*", "", line).strip()
                    for line in approval_action.ai_simplified_en.split("\n")
                    if line.strip().startswith("•") or line.strip().startswith("-")
                ]
                if not edited_bullets:
                    edited_bullets = [
                        re.sub(r"^\s*[-•*\d.]+\s*", "", line).strip()
                        for line in warning.recommended_instructions.split("\n")
                        if line.strip()
                    ]
                from backend.app.services.ai_service import compose_structured_citizen_message_hi
                warning.ai_simplified_hi = compose_structured_citizen_message_hi(
                    title=warning.title,
                    disaster_type=warning.disaster_type,
                    description=warning.description,
                    severity=warning.severity,
                    urgency=warning.urgency,
                    area_name=warning.area_name,
                    deduplicated_bullets=edited_bullets
                )

        # Fetch current version target areas and zones
        target_areas = db.query(WarningTargetArea).filter(
            WarningTargetArea.warning_id == warning_id,
            WarningTargetArea.warning_version == warning.version
        ).all()
        zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warning_id).all()
        zone_names = [z.name for z in zones]

        # Geospatial distribution to eligible citizens
        targeted_citizens_count = distribute_warning_to_eligible_citizens(
            db=db,
            warning=warning,
            target_areas=target_areas,
            zones=zones
        )

        db.commit()
        db.refresh(warning)

        # Notification dispatch & WebSocket broadcast
        notification_service.dispatch_warning_notifications(
            warning_id=warning.id,
            warning_title=warning.title,
            severity=warning.severity,
            zone_names=zone_names
        )

        await ws_manager.broadcast("WARNING_DISTRIBUTED", {
            "warning_id": warning.id,
            "title": warning.title,
            "severity": warning.severity,
            "disaster_type": warning.disaster_type,
            "area_name": warning.area_name,
            "version": warning.version,
            "targeted_citizens_count": targeted_citizens_count,
            "zones_count": len(zones),
            "status": "Active"
        })

        summary = f"Authority {current_user.full_name} approved and activated warning #{warning.id} ({targeted_citizens_count} eligible citizens targeted)"
    elif action == "reject":
        warning.ai_approval_status = "Rejected"
        warning.status = "Under Review"
        warning.ai_feedback_notes = approval_action.feedback_notes
        summary = f"Authority {current_user.full_name} rejected AI communication: {approval_action.feedback_notes}"
        db.commit()
        db.refresh(warning)
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'approve', 'edit', or 'reject'.")

    log_audit_event(
        db=db,
        event_type=f"AI_MESSAGE_{warning.ai_approval_status.upper()}",
        entity_type="Warning",
        entity_id=warning.id,
        user=current_user,
        summary=summary
    )

    return warning

@router.post("/{warning_id}/distribute", response_model=WarningOut)
async def distribute_warning(
    warning_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Distributes an approved warning. Executes PostGIS / Shapely geospatial matching
    to identify registered citizens in target areas and creates individual NotificationDeliveryRecords.
    """
    warning = db.query(Warning).filter(Warning.id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning not found.")
    
    # RBAC: Authorities can only distribute warnings they issued; Administrators can manage all
    if current_user.role == "authority" and warning.issuing_authority_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to distribute warnings issued by another authority."
        )

    if warning.status == "Cancelled":
        raise HTTPException(
            status_code=400,
            detail="Cannot distribute a cancelled warning."
        )

    if warning.expiry_time and warning.expiry_time < datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="Cannot distribute an expired warning."
        )
    
    if warning.ai_approval_status not in ["Approved", "Edited"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot distribute warning before mandatory Human Authority Approval of communication messages."
        )

    warning.status = "Active"
    warning.distributed_at = datetime.utcnow()
    
    # 1. Fetch current version target areas and zones
    target_areas = db.query(WarningTargetArea).filter(
        WarningTargetArea.warning_id == warning_id,
        WarningTargetArea.warning_version == warning.version
    ).all()
    
    zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warning_id).all()
    zone_names = [z.name for z in zones]
    
    # 2. Geospatial distribution to eligible citizens
    targeted_citizens_count = distribute_warning_to_eligible_citizens(
        db=db,
        warning=warning,
        target_areas=target_areas,
        zones=zones
    )

    db.commit()
    db.refresh(warning)

    # 3. Notification dispatch
    notification_service.dispatch_warning_notifications(
        warning_id=warning.id,
        warning_title=warning.title,
        severity=warning.severity,
        zone_names=zone_names
    )

    # 4. WebSocket Broadcast
    await ws_manager.broadcast("WARNING_DISTRIBUTED", {
        "warning_id": warning.id,
        "title": warning.title,
        "severity": warning.severity,
        "disaster_type": warning.disaster_type,
        "area_name": warning.area_name,
        "version": warning.version,
        "targeted_citizens_count": targeted_citizens_count,
        "zones_count": len(zones),
        "status": "Active"
    })

    log_audit_event(
        db=db,
        event_type="WARNING_DISTRIBUTED",
        entity_type="Warning",
        entity_id=warning.id,
        user=current_user,
        summary=f"Warning #{warning.id} distributed to {targeted_citizens_count} eligible registered citizens across {len(zones)} Response Zones"
    )

    return warning

@router.post("/{warning_id}/version", response_model=WarningOut)
async def create_warning_version_update(
    warning_id: int,
    update_data: WarningUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Creates a new version (e.g. Version 2.0) of a warning when targeting or parameters change.
    Preserves historical delivery records of Version 1.0 permanently.
    Recalculates eligible recipient population on distribution of the new version.
    """
    old_warning = db.query(Warning).filter(Warning.id == warning_id).first()
    if not old_warning:
        raise HTTPException(status_code=404, detail="Parent warning not found.")

    # RBAC: Authorities can only update warnings they issued; Administrators can manage all
    if current_user.role == "authority" and old_warning.issuing_authority_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to create version updates for warnings issued by another authority."
        )

    if old_warning.status == "Cancelled":
        raise HTTPException(
            status_code=400,
            detail="Cannot create a version update for a cancelled warning."
        )

    old_warning.status = "Updated"
    db.commit()

    new_version_num = old_warning.version + 1
    new_identifier = f"{old_warning.identifier.split('-v')[0]}-v{new_version_num}"

    new_combined_geojson = update_data.area_polygon_geojson or old_warning.area_polygon_geojson
    if update_data.target_areas and len(update_data.target_areas) > 0:
        new_combined_geojson = update_data.target_areas[0].geometry_geojson

    new_warning = Warning(
        identifier=new_identifier,
        version=new_version_num,
        parent_warning_id=old_warning.id,
        disaster_type=old_warning.disaster_type,
        title=update_data.title or old_warning.title,
        description=update_data.description or old_warning.description,
        severity=update_data.severity or old_warning.severity,
        urgency=update_data.urgency or old_warning.urgency,
        certainty=update_data.certainty or old_warning.certainty,
        area_name=update_data.area_name or old_warning.area_name,
        area_polygon_geojson=new_combined_geojson,
        expected_start_time=update_data.expected_start_time or old_warning.expected_start_time,
        expiry_time=update_data.expiry_time or old_warning.expiry_time,
        recommended_instructions=update_data.recommended_instructions or old_warning.recommended_instructions,
        issuing_authority_name=old_warning.issuing_authority_name,
        issuing_authority_id=current_user.id,
        status="Under Review",
        ai_approval_status="Pending"
    )
    db.add(new_warning)
    db.commit()
    db.refresh(new_warning)

    # Copy / Create Target Areas for new version
    new_target_areas = []
    if update_data.target_areas and len(update_data.target_areas) > 0:
        for ta in update_data.target_areas:
            is_valid, err_msg = validate_geometry(ta.geometry_geojson)
            if not is_valid:
                raise HTTPException(status_code=400, detail=f"Invalid geometry in target area '{ta.name}': {err_msg}")
            
            c_lat = ta.center_lat
            c_lng = ta.center_lng
            if c_lat == 0.0 and c_lng == 0.0:
                c_lat, c_lng = calculate_centroid(ta.geometry_geojson)
                
            ta_obj = WarningTargetArea(
                warning_id=new_warning.id,
                warning_version=new_version_num,
                name=ta.name,
                target_type=ta.target_type,
                geometry_geojson=ta.geometry_geojson,
                center_lat=c_lat,
                center_lng=c_lng,
                radius_km=ta.radius_km,
                priority_level=ta.priority_level,
                notes=ta.notes
            )
            db.add(ta_obj)
            new_target_areas.append(ta_obj)
    else:
        # Copy previous target areas
        old_target_areas = db.query(WarningTargetArea).filter(
            WarningTargetArea.warning_id == old_warning.id,
            WarningTargetArea.warning_version == old_warning.version
        ).all()
        for ota in old_target_areas:
            ta_obj = WarningTargetArea(
                warning_id=new_warning.id,
                warning_version=new_version_num,
                name=ota.name,
                target_type=ota.target_type,
                geometry_geojson=ota.geometry_geojson,
                center_lat=ota.center_lat,
                center_lng=ota.center_lng,
                radius_km=ota.radius_km,
                priority_level=ota.priority_level,
                notes=ota.notes
            )
            db.add(ta_obj)
            new_target_areas.append(ta_obj)
            
    db.commit()

    # Copy / Create Zones
    if new_target_areas:
        zone_data = generate_zones_from_target_areas(new_warning.id, new_target_areas)
        for z in zone_data:
            zone_obj = ResponseZone(
                warning_id=new_warning.id,
                name=z["name"],
                code=z["code"],
                polygon_geojson=z["polygon_geojson"],
                center_lat=z["center_lat"],
                center_lng=z["center_lng"],
                estimated_population=z["estimated_population"],
                risk_level=z["risk_level"],
                situation_status="Warning Updated"
            )
            db.add(zone_obj)
    else:
        old_zones = db.query(ResponseZone).filter(ResponseZone.warning_id == old_warning.id).all()
        for oz in old_zones:
            new_zone = ResponseZone(
                warning_id=new_warning.id,
                name=oz.name,
                code=oz.code,
                polygon_geojson=oz.polygon_geojson,
                center_lat=oz.center_lat,
                center_lng=oz.center_lng,
                estimated_population=oz.estimated_population,
                risk_level=oz.risk_level,
                situation_status="Warning Updated"
            )
            db.add(new_zone)
    db.commit()

    # RAG: Context-aware retrieval for new version
    retrieval_query = rag_service.build_retrieval_query(
        disaster_type=new_warning.disaster_type,
        severity=new_warning.severity,
        urgency=new_warning.urgency,
        area_name=new_warning.area_name,
        description=new_warning.description,
        recommended_instructions=new_warning.recommended_instructions
    )
    retrieved_sources, formatted_rag_context = rag_service.retrieve_grounding_knowledge(
        query=retrieval_query,
        disaster_type=new_warning.disaster_type,
        top_k=3
    )

    # Re-trigger controlled grounded AI simplification for new version
    en_text, hi_text, source, g_score, g_note = await generate_simplified_citizen_communication(
        disaster_type=new_warning.disaster_type,
        title=new_warning.title,
        description=new_warning.description,
        severity=new_warning.severity,
        urgency=new_warning.urgency,
        area_name=new_warning.area_name,
        recommended_instructions=new_warning.recommended_instructions,
        retrieved_context_text=formatted_rag_context,
        retrieved_sources=retrieved_sources
    )
    new_warning.ai_simplified_en = en_text
    new_warning.ai_simplified_hi = hi_text
    new_warning.rag_sources_json = json.dumps(retrieved_sources, ensure_ascii=False)
    new_warning.rag_grounding_score = g_score
    new_warning.rag_query_used = retrieval_query
    new_warning.rag_status = "Grounded" if retrieved_sources else "Fallback"
    db.commit()

    log_audit_event(
        db=db,
        event_type="WARNING_UPDATED",
        entity_type="Warning",
        entity_id=new_warning.id,
        user=current_user,
        summary=f"Created Version {new_version_num} for Warning '{new_warning.title}' — RAG: {len(retrieved_sources)} sources ({g_score})"
    )

    return new_warning

@router.post("/{warning_id}/cancel", response_model=WarningOut)
async def cancel_warning(
    warning_id: int,
    cancel_req: WarningCancellationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authority)
):
    """
    Formally cancels an active warning with a recorded reason.
    Scopes cancellation notifications only to previously targeted citizens.
    Preserves all historical response and targeting records.
    """
    warning = db.query(Warning).filter(Warning.id == warning_id).first()
    if not warning:
        raise HTTPException(status_code=404, detail="Warning not found.")

    # RBAC: Authorities can only cancel warnings they issued; Administrators can manage all
    if current_user.role == "authority" and warning.issuing_authority_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to cancel warnings issued by another authority."
        )

    if warning.status == "Cancelled":
        raise HTTPException(
            status_code=400,
            detail="Warning is already cancelled."
        )

    # Only allow cancelling warnings that have been distributed to citizens.
    # Draft / Under Review / Approved warnings have not yet reached any citizen
    # and should be deleted or simply abandoned — not formally cancelled.
    if warning.status not in ["Active", "Updated"]:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only Active or Updated warnings (already distributed to citizens) can be formally cancelled. "
                f"This warning has status '{warning.status}'. "
                f"If it is still in Draft or Under Review, simply discard it or do not distribute it."
            )
        )

    if not cancel_req.cancellation_reason or not cancel_req.cancellation_reason.strip():
        raise HTTPException(
            status_code=400,
            detail="An official cancellation reason is required."
        )

    warning.status = "Cancelled"
    warning.cancellation_reason = cancel_req.cancellation_reason
    
    # Update zones
    zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warning_id).all()
    for z in zones:
        z.situation_status = "Warning Cancelled"
    
    db.commit()
    db.refresh(warning)

    # Real-time WebSocket broadcast
    await ws_manager.broadcast("WARNING_CANCELLED", {
        "warning_id": warning.id,
        "title": warning.title,
        "reason": cancel_req.cancellation_reason,
        "status": "Cancelled"
    })

    log_audit_event(
        db=db,
        event_type="WARNING_CANCELLED",
        entity_type="Warning",
        entity_id=warning.id,
        user=current_user,
        summary=f"Cancelled Warning #{warning.id}: {cancel_req.cancellation_reason}"
    )

    return warning
