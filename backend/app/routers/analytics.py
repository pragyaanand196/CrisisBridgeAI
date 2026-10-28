from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.warning import Warning
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.models.resource import Resource
from backend.app.schemas.analytics import ZoneHealthMatrix, SystemOverviewMetrics, GapAlert, WTAScoreBreakdown
from backend.app.services.analytics_service import compute_zone_metrics, evaluate_all_zones, get_threshold
from backend.app.config import settings

router = APIRouter(prefix="/analytics", tags=["Analytics & Health Matrix"])

@router.get("/zone-health-matrix", response_model=ZoneHealthMatrix)
def get_zone_health_matrix(
    warning_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Returns full geographic and operational matrix of all Response Zones,
    including calculated WTA Scores, gap alerts, and situation statuses.
    """
    query = db.query(ResponseZone)
    if warning_id:
        query = query.filter(ResponseZone.warning_id == warning_id)
    zones = query.all()

    breakdowns: List[WTAScoreBreakdown] = []
    gap_alerts: List[GapAlert] = []

    comm_gap_th = get_threshold(db, "COMMUNICATION_GAP_THRESHOLD", settings.DEFAULT_COMMUNICATION_GAP_THRESHOLD)
    und_gap_th = get_threshold(db, "UNDERSTANDING_GAP_THRESHOLD", settings.DEFAULT_UNDERSTANDING_GAP_THRESHOLD)
    surge_th = int(get_threshold(db, "ASSISTANCE_SURGE_THRESHOLD", float(settings.DEFAULT_ASSISTANCE_SURGE_THRESHOLD)))

    stable_cnt = 0
    attention_cnt = 0
    critical_cnt = 0
    gaps_cnt = 0
    surges_cnt = 0

    for z in zones:
        m = compute_zone_metrics(z, db)
        
        breakdown = WTAScoreBreakdown(
            zone_id=z.id,
            zone_name=z.name,
            zone_code=z.code,
            wta_score=m["wta_score"],
            delivery_rate=m["delivery_rate"],
            acknowledgement_rate=m["acknowledgement_rate"],
            understanding_rate=m["understanding_rate"],
            assistance_demand_rate=m["assistance_demand_rate"],
            no_response_rate=m["no_response_rate"],
            failure_rate=m["failure_rate"],
            situation_status=m["situation_status"],
            operational_recommendation=m["operational_recommendation"],
            eligible_citizens_count=m.get("eligible_citizens_count", 0),
            understanding_confirmed_count=m.get("understanding_confirmed_count", 0),
            delivery_count=m.get("delivery_count", z.delivery_count),
            targeted_count=m.get("targeted_count", z.targeted_count),
            acknowledgement_count=m.get("acknowledgement_count", z.acknowledgement_count),
            understanding_count=m.get("understanding_confirmed_count", z.understanding_count),
            help_request_count=m.get("active_help_count", z.help_request_count),
            estimated_population=z.estimated_population or 1000,
            polygon_geojson=z.polygon_geojson,
            center_lat=z.center_lat,
            center_lng=z.center_lng,
            has_warning=bool(z.warning_id)
        )
        breakdowns.append(breakdown)

        # Count categorizations
        status = m["situation_status"]
        if status == "Stable":
            stable_cnt += 1
        elif status == "Attention Required":
            attention_cnt += 1
        elif status == "Critical":
            critical_cnt += 1
        
        # Check Gap Alerts
        if status == "Communication Gap" or m["no_response_rate"] >= comm_gap_th:
            gaps_cnt += 1
            gap_alerts.append(GapAlert(
                alert_type="COMMUNICATION_GAP",
                zone_id=z.id,
                zone_name=z.name,
                severity="High",
                metric_value=m["no_response_rate"],
                threshold=comm_gap_th,
                explanation=f"Warning is not reaching citizens effectively ({m['no_response_rate']}% silent). Potential network/power outage.",
                recommended_action="Deploy mobile PA systems, dispatch field wardens, or trigger fallback SMS broadcast."
            ))
        
        if status == "Understanding Gap" or m["dont_understand_count"] > 0 and (m["dont_understand_count"] / max(1, m["acknowledgement_count"] + m["dont_understand_count"]) * 100) >= und_gap_th:
            gaps_cnt += 1
            gap_alerts.append(GapAlert(
                alert_type="UNDERSTANDING_GAP",
                zone_id=z.id,
                zone_name=z.name,
                severity="High",
                metric_value=m["understanding_rate"],
                threshold=und_gap_th,
                explanation=f"Significant proportion of citizens in {z.name} reported confusion with technical instructions.",
                recommended_action="Publish simplified plain-language or Hindi clarification bulletin immediately."
            ))

        if status == "Assistance Surge" or m["active_help_count"] >= surge_th:
            surges_cnt += 1
            gap_alerts.append(GapAlert(
                alert_type="ASSISTANCE_SURGE",
                zone_id=z.id,
                zone_name=z.name,
                severity="Critical",
                metric_value=float(m["active_help_count"]),
                threshold=float(surge_th),
                explanation=f"Critical surge of {m['active_help_count']} urgent assistance requests in {z.name}.",
                recommended_action="Prioritize emergency rescue teams, water supply, and ambulance units to this sector."
            ))

    db.commit()

    return ZoneHealthMatrix(
        total_zones=len(zones),
        stable_count=stable_cnt,
        attention_required_count=attention_cnt,
        critical_count=critical_cnt,
        gaps_count=gaps_cnt,
        surges_count=surges_cnt,
        zones=breakdowns,
        active_gap_alerts=gap_alerts
    )

@router.get("/overview", response_model=SystemOverviewMetrics)
def get_system_overview(db: Session = Depends(get_db)):
    active_warnings = db.query(Warning).filter(Warning.status == "Active").count()
    zones = db.query(ResponseZone).all()
    total_zones = len(zones)
    
    total_reached = sum(z.delivery_count for z in zones)
    all_responses = db.query(CitizenResponse).all()
    understand_count = sum(1 for r in all_responses if r.response_type == "understand")
    overall_und_rate = round((understand_count / max(1, len(all_responses))) * 100, 1) if all_responses else 0.0

    pending_help = db.query(AssistanceRequest).filter(AssistanceRequest.status.in_(["Pending", "Acknowledged"])).count()
    verified_res = db.query(Resource).filter(Resource.verified_by_authority == True).count()
    
    active_gaps = sum(1 for z in zones if z.situation_status in ["Communication Gap", "Understanding Gap", "Assistance Surge", "Critical"])

    return SystemOverviewMetrics(
        active_warnings_count=active_warnings,
        total_response_zones=total_zones,
        total_citizens_reached=total_reached,
        overall_understanding_rate=overall_und_rate,
        pending_assistance_requests=pending_help,
        verified_resources_count=verified_res,
        active_gaps_count=active_gaps
    )
