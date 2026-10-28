from typing import Dict, Any, Tuple, List
from sqlalchemy.orm import Session
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.models.warning import Warning
from backend.app.models.warning_target_area import WarningTargetArea
from backend.app.models.notification_delivery_record import NotificationDeliveryRecord
from backend.app.models.verification_report import VerificationReport
from backend.app.models.system_config import SystemConfig
from backend.app.config import settings
from backend.app.services.geo_service import compute_zone_eligible_understanding

def get_threshold(db: Session, key: str, default_val: float) -> float:
    """Retrieves dynamic config threshold from DB or returns default."""
    cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if cfg:
        try:
            return float(cfg.value)
        except ValueError:
            pass
    return default_val

def compute_zone_metrics(zone: ResponseZone, db: Session) -> Dict[str, Any]:
    """
    Computes deterministic communication metrics, situation classification,
    and Warning-to-Action (WTA) Score for a single Response Zone.
    """
    # Thresholds
    comm_gap_threshold = get_threshold(db, "COMMUNICATION_GAP_THRESHOLD", settings.DEFAULT_COMMUNICATION_GAP_THRESHOLD)
    und_gap_threshold = get_threshold(db, "UNDERSTANDING_GAP_THRESHOLD", settings.DEFAULT_UNDERSTANDING_GAP_THRESHOLD)
    surge_threshold = int(get_threshold(db, "ASSISTANCE_SURGE_THRESHOLD", float(settings.DEFAULT_ASSISTANCE_SURGE_THRESHOLD)))
    insufficient_data_threshold = int(get_threshold(db, "INSUFFICIENT_DATA_THRESHOLD", float(settings.DEFAULT_INSUFFICIENT_DATA_THRESHOLD)))

    # Delivery records in this zone
    delivery_records = db.query(NotificationDeliveryRecord).filter(
        NotificationDeliveryRecord.response_zone_id == zone.id,
        NotificationDeliveryRecord.warning_version == zone.warning.version if zone.warning else 1
    ).all()
    
    targeted_count = len(delivery_records) if delivery_records else zone.targeted_count
    delivered_count = sum(1 for r in delivery_records if r.status in ["delivered", "acknowledged", "understood", "needs_help", "not_in_this_area"])
    if not delivery_records and zone.delivery_count > 0:
        delivered_count = zone.delivery_count

    # Fetch live counts from citizen responses in this zone
    responses = db.query(CitizenResponse).filter(CitizenResponse.response_zone_id == zone.id).all()
    total_responses = len(responses)

    understand_count = sum(1 for r in responses if r.response_type == "understand")
    safe_count = sum(1 for r in responses if r.response_type == "safe")
    dont_understand_count = sum(1 for r in responses if r.response_type == "dont_understand")
    need_help_count = sum(1 for r in responses if r.response_type == "need_help")
    not_in_area_count = sum(1 for r in responses if r.response_type == "not_in_area")
    
    # Active assistance requests in this zone
    active_assistance = db.query(AssistanceRequest).filter(
        AssistanceRequest.response_zone_id == zone.id,
        AssistanceRequest.status.in_(["Pending", "Acknowledged", "Dispatched"])
    ).all()
    active_help_count = len(active_assistance)
    
    # Conflicting reports associated with this warning
    conflicting_reports = db.query(VerificationReport).filter(
        VerificationReport.warning_id == zone.warning_id,
        VerificationReport.status == "Conflicting with Official Information"
    ).count()

    effective_delivery = max(delivered_count, total_responses)
    no_response_count = max(0, effective_delivery - total_responses)
    ack_count = understand_count + safe_count + dont_understand_count + need_help_count
    
    # Mathematical Rates
    effective_responses = max(1, ack_count + dont_understand_count)
    ack_rate = round((ack_count / max(1, effective_delivery)) * 100, 1) if effective_delivery > 0 else 0.0
    understanding_rate = round((understand_count / effective_responses) * 100, 1) if effective_responses > 0 else 0.0
    dont_understand_rate = round((dont_understand_count / effective_responses) * 100, 1) if effective_responses > 0 else 0.0
    assistance_rate = round((active_help_count / effective_responses) * 100, 1) if effective_responses > 0 else 0.0
    no_response_rate = round((no_response_count / max(1, effective_delivery)) * 100, 1) if effective_delivery > 0 else 0.0
    failure_rate = round((max(0, zone.failure_count) / max(1, effective_delivery)) * 100, 1) if effective_delivery > 0 else 0.0

    # Calculate Warning-to-Action (WTA) Score (0.0 to 100.0)
    raw_wta = (0.40 * understanding_rate) + (0.30 * min(100.0, ack_rate)) + (0.30 * (100.0 - no_response_rate))
    penalty = (failure_rate * 0.5) + (min(30.0, active_help_count * 3.0))
    wta_score = round(max(0.0, min(100.0, raw_wta - penalty)), 1)

    # Parent warning check
    parent_warning = db.query(Warning).filter(Warning.id == zone.warning_id).first()
    warning_status = parent_warning.status if parent_warning else "Active"

    # Authoritative Understanding column metrics (current registered population denominator & confirmed numerator)
    und_stats = compute_zone_eligible_understanding(zone, db, parent_warning)

    # Deterministic Situation Classification (Strict Order of Operational Priority)
    if warning_status == "Cancelled":
        situation = "Warning Cancelled"
        recommendation = "Warning has been formally cancelled by authority. Maintain monitoring for residual needs."
    elif warning_status == "Updated":
        situation = "Warning Updated"
        recommendation = "Updated warning distributed. Awaiting citizen re-acknowledgement."
    elif total_responses < insufficient_data_threshold and effective_delivery < 5:
        situation = "Insufficient Data"
        recommendation = "Awaiting initial citizen responses. Verify notification channel dispatch."
    elif failure_rate >= 25.0:
        situation = "Notification Delivery Failure"
        recommendation = "High delivery failure rate detected. Switch to fallback SMS or emergency broadcast."
    elif active_help_count >= surge_threshold or assistance_rate >= 35.0:
        situation = "Assistance Surge"
        recommendation = f"Urgent: {active_help_count} active assistance requests. Prioritize rescue and relief dispatch."
    elif not_in_area_count >= 2 and (not_in_area_count / max(1, total_responses) >= 0.25 or not_in_area_count >= 3):
        situation = "Location Mismatch"
        recommendation = f"Location Mismatch Alert: {not_in_area_count} respondents reported they are outside this zone. Verify target area boundary."
    elif dont_understand_rate >= und_gap_threshold:
        situation = "Understanding Gap"
        recommendation = f"{dont_understand_rate}% reported difficulty understanding instructions. Deploy simplified/Hindi update."
    elif no_response_rate >= comm_gap_threshold and total_responses > 0:
        situation = "Communication Gap"
        recommendation = f"Low response rate ({no_response_rate}% silent). Possible power/network outage in sector."
    elif conflicting_reports > 0:
        situation = "Conflicting Information"
        recommendation = f"{conflicting_reports} conflicting rumor reports logged. Issue official clarification."
    elif wta_score < 40.0:
        situation = "Critical"
        recommendation = "WTA score critical. Multiple communication bottlenecks require immediate authority intervention."
    elif wta_score < 70.0:
        situation = "Attention Required"
        recommendation = "Response engagement is moderate. Monitor closely and reinforce safety instructions."
    else:
        situation = "Stable"
        recommendation = "High comprehension and response compliance. Situation is operationally stable."

    # Update zone model
    zone.targeted_count = targeted_count
    zone.delivery_count = effective_delivery
    zone.no_response_count = no_response_count
    zone.situation_status = situation
    zone.wta_score = wta_score
    zone.understanding_count = understand_count
    zone.dont_understand_count = dont_understand_count
    zone.help_request_count = active_help_count
    zone.not_in_area_count = not_in_area_count
    zone.acknowledgement_count = ack_count

    return {
        "zone_id": zone.id,
        "zone_name": zone.name,
        "zone_code": zone.code,
        "targeted_count": targeted_count,
        "delivery_count": effective_delivery,
        "wta_score": wta_score,
        "situation_status": situation,
        "delivery_rate": round(100.0 - failure_rate, 1),
        "acknowledgement_rate": ack_rate,
        "understanding_rate": understanding_rate,
        "dont_understand_rate": dont_understand_rate,
        "dont_understand_count": dont_understand_count,
        "assistance_demand_rate": assistance_rate,
        "no_response_rate": no_response_rate,
        "no_response_count": no_response_count,
        "not_in_area_count": not_in_area_count,
        "failure_rate": failure_rate,
        "total_responses": total_responses,
        "active_help_count": active_help_count,
        "operational_recommendation": recommendation,
        "eligible_citizens_count": und_stats["eligible_citizens_count"],
        "understanding_confirmed_count": und_stats["understanding_confirmed_count"]
    }

def compute_warning_targeting_analytics(warning: Warning, db: Session) -> Dict[str, Any]:
    """
    Computes aggregated delivery chain analytics, multi-condition operational situations,
    and zone breakdowns for a warning using strictly deterministic database calculations.
    """
    # 1. Delivery records for this warning and version
    delivery_records = db.query(NotificationDeliveryRecord).filter(
        NotificationDeliveryRecord.warning_id == warning.id,
        NotificationDeliveryRecord.warning_version == warning.version
    ).all()
    
    total_targeted = len(delivery_records)
    attempts = total_targeted  # All targeted have dispatch attempted
    delivered = sum(1 for r in delivery_records if r.status != "delivery_failed")
    failed = sum(1 for r in delivery_records if r.status == "delivery_failed")
    
    # 2. Citizen responses for this warning version
    responses = db.query(CitizenResponse).filter(
        CitizenResponse.warning_id == warning.id,
        CitizenResponse.warning_version == warning.version
    ).all()
    
    understand_cnt = sum(1 for r in responses if r.response_type == "understand")
    safe_cnt = sum(1 for r in responses if r.response_type == "safe")
    dont_understand_cnt = sum(1 for r in responses if r.response_type == "dont_understand")
    help_cnt = sum(1 for r in responses if r.response_type == "need_help")
    not_in_area_cnt = sum(1 for r in responses if r.response_type == "not_in_area")
    ack_cnt = understand_cnt + safe_cnt + dont_understand_cnt + help_cnt
    
    # Active assistance requests for this warning
    active_help_requests = db.query(AssistanceRequest).filter(
        AssistanceRequest.warning_id == warning.id,
        AssistanceRequest.status.in_(["Pending", "Acknowledged", "Dispatched"])
    ).count()
    
    effective_delivery = max(delivered, len(responses))
    no_response_cnt = max(0, effective_delivery - len(responses))
    total_resp = len(responses)

    # Thresholds
    comm_gap_threshold = get_threshold(db, "COMMUNICATION_GAP_THRESHOLD", settings.DEFAULT_COMMUNICATION_GAP_THRESHOLD)
    und_gap_threshold = get_threshold(db, "UNDERSTANDING_GAP_THRESHOLD", settings.DEFAULT_UNDERSTANDING_GAP_THRESHOLD)
    surge_threshold = int(get_threshold(db, "ASSISTANCE_SURGE_THRESHOLD", float(settings.DEFAULT_ASSISTANCE_SURGE_THRESHOLD)))

    # Multi-condition detection list
    conditions: List[Dict[str, Any]] = []

    # Status-based conditions
    if warning.status == "Cancelled":
        conditions.append({
            "condition": "WARNING_CANCELLED",
            "title": "Warning Cancelled",
            "severity": "Info",
            "description": f"Warning has been formally cancelled by authority: {warning.cancellation_reason or 'Operation complete.'}",
            "recommendation": "Maintain monitoring for residual citizen queries or post-incident support.",
            "evidence_metric": "Status: Cancelled"
        })
    elif warning.status == "Updated":
        conditions.append({
            "condition": "WARNING_UPDATED",
            "title": "Warning Updated",
            "severity": "Info",
            "description": "A newer version of this warning has been issued. Historical responses remain preserved.",
            "recommendation": "Inspect latest warning version for active citizen responses.",
            "evidence_metric": f"Version: {warning.version}.0 (Superseded)"
        })

    # Data & Delivery conditions
    if total_targeted == 0:
        conditions.append({
            "condition": "NO_REGISTERED_CITIZENS",
            "title": "No Registered Citizens Found",
            "severity": "Attention",
            "description": "No registered citizens found in this warning area.",
            "recommendation": "Review target polygon boundaries or trigger broad regional broadcast channels.",
            "evidence_metric": "0 citizens in target polygon"
        })
    elif total_resp == 0 and delivered > 0:
        conditions.append({
            "condition": "INSUFFICIENT_DATA",
            "title": "Insufficient Response Data / No Response",
            "severity": "Attention",
            "description": "No citizen responses received yet. Awaiting initial citizen acknowledgements. Non-responding citizens cannot be assumed safe.",
            "recommendation": "Verify notification dispatch across Web, SMS, and Push channels. Continue active monitoring.",
            "evidence_metric": f"0 responses from {delivered} delivered alerts"
        })

    # Delivery Failure Condition
    failure_rate = (failed / max(1, total_targeted)) * 100 if total_targeted > 0 else 0.0
    if failed > 0 and failure_rate >= 20.0:
        conditions.append({
            "condition": "COMMUNICATION_GAP",
            "title": "Communication / Delivery Gap",
            "severity": "High",
            "description": f"Communication/Delivery Gap detected: high notification delivery failures ({failed} failed dispatches, {round(failure_rate, 1)}% failure rate).",
            "recommendation": "Deploy alternative broadcast channels, mobile PA systems, or fallback SMS.",
            "evidence_metric": f"{failed} failed dispatches ({round(failure_rate, 1)}%)"
        })
    elif no_response_cnt >= 5 and (no_response_cnt / max(1, effective_delivery)) * 100 >= comm_gap_threshold and total_resp > 0:
        no_resp_rate = round((no_response_cnt / max(1, effective_delivery)) * 100, 1)
        conditions.append({
            "condition": "COMMUNICATION_GAP",
            "title": "Communication Gap (High Silence)",
            "severity": "High",
            "description": f"Communication/Delivery Gap detected: low citizen response rate ({no_response_cnt} silent citizens, {no_resp_rate}% silent). Possible local power or network outage.",
            "recommendation": "Deploy field emergency wardens and check regional cellular connectivity.",
            "evidence_metric": f"{no_resp_rate}% non-response rate"
        })

    # Understanding Gap Condition
    dont_und_rate = (dont_understand_cnt / max(1, total_resp)) * 100 if total_resp > 0 else 0.0
    if dont_understand_cnt > 0 and dont_und_rate >= und_gap_threshold:
        conditions.append({
            "condition": "UNDERSTANDING_GAP",
            "title": "Understanding Gap",
            "severity": "High",
            "description": f"Understanding Gap detected: a significant portion of responding citizens ({dont_understand_cnt} respondents, {round(dont_und_rate, 1)}%) reported that they did not understand the warning.",
            "recommendation": "Publish simplified plain-language or Hindi clarification bulletin immediately through the warning update workflow.",
            "evidence_metric": f"{dont_understand_cnt} comprehension difficulty reports ({round(dont_und_rate, 1)}%)"
        })

    # Assistance Demand / Surge Condition
    total_help_demand = active_help_requests + help_cnt
    if total_help_demand > 0:
        severity_level = "Critical" if total_help_demand >= surge_threshold else "High"
        conditions.append({
            "condition": "ASSISTANCE_DEMAND",
            "title": "Assistance Demand / Support Required",
            "severity": severity_level,
            "description": f"Assistance demand detected: multiple targeted citizens ({total_help_demand} requests) requested urgent help.",
            "recommendation": "Prioritize emergency rescue teams, ambulance units, and verified emergency shelters in affected sectors.",
            "evidence_metric": f"{total_help_demand} active assistance requests"
        })

    # Location Mismatch Condition
    if not_in_area_cnt > 0:
        loc_rate = (not_in_area_cnt / max(1, total_resp)) * 100 if total_resp > 0 else 0.0
        conditions.append({
            "condition": "LOCATION_MISMATCH",
            "title": "Location Mismatch Signal",
            "severity": "Attention",
            "description": f"Location mismatch detected: several targeted citizens ({not_in_area_cnt} respondents) reported that they are not currently in the targeted area.",
            "recommendation": "Review target polygon boundaries, verify registered citizen locations, or adjust geographic targeting configuration for subsequent warning versions.",
            "evidence_metric": f"{not_in_area_cnt} location mismatch reports ({round(loc_rate, 1)}%)"
        })

    # Stable / Responding Condition
    und_rate = (understand_cnt / max(1, total_resp)) * 100 if total_resp > 0 else 0.0
    if total_resp >= 2 and und_rate >= 65.0 and total_help_demand == 0 and dont_understand_cnt == 0:
        conditions.append({
            "condition": "STABLE_RESPONDING",
            "title": "Stable / Responding",
            "severity": "Stable",
            "description": "Stable/Responding: strong acknowledgement and high comprehension reported by citizens in this area (note: this confirms effective warning communication, not that the disaster itself is over).",
            "recommendation": "Continue operational surveillance and monitor incoming response feeds until warning expiration.",
            "evidence_metric": f"{round(und_rate, 1)}% confirmed understanding with 0 help requests"
        })

    if not conditions:
        conditions.append({
            "condition": "MONITORING_ACTIVE",
            "title": "Active Operational Surveillance",
            "severity": "Info",
            "description": "Active monitoring in progress. Live response feeds and delivery metrics are continuously evaluated.",
            "recommendation": "Maintain readiness and monitor zone indicators.",
            "evidence_metric": f"{total_resp} responses recorded"
        })

    # Determine primary composite status
    primary_condition = conditions[0]["title"]
    for c in conditions:
        if c["severity"] == "Critical":
            primary_condition = c["title"]
            break
        elif c["severity"] == "High" and primary_condition not in ["Critical", "Assistance Demand / Support Required"]:
            primary_condition = c["title"]

    # Evaluate response zones
    zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warning.id).all()
    zone_metrics = [compute_zone_metrics(z, db) for z in zones]
    db.commit()

    return {
        "total_targeted": total_targeted,
        "notification_attempted": attempts,
        "delivered_count": delivered,
        "failed_count": failed,
        "acknowledged_count": ack_cnt,
        "understood_count": understand_cnt + safe_cnt,  # "Understood & Safe" includes both understand + safe responses
        "dont_understand_count": dont_understand_cnt,
        "help_requested_count": total_help_demand,
        "not_in_area_count": not_in_area_cnt,
        "no_response_count": no_response_cnt,
        "location_mismatch_detected": not_in_area_cnt > 0,
        "understanding_gap_detected": (dont_understand_cnt > 0 and dont_und_rate >= und_gap_threshold),
        "communication_gap_detected": (failed > 0 and failure_rate >= 20.0) or (no_response_cnt >= 5 and (no_response_cnt / max(1, effective_delivery)) * 100 >= comm_gap_threshold),
        "assistance_surge_detected": total_help_demand >= surge_threshold,
        "overall_situation": primary_condition,
        "situation_conditions": conditions,
        "zones_breakdown": zone_metrics
    }

def build_warning_situation_timeline(warning: Warning, db: Session) -> List[Dict[str, Any]]:
    """
    Synthesizes a chronological event timeline from actual database records:
    Creation -> AI message generation -> Human Approval -> Distribution & Targets -> Citizen Responses -> Updates/Cancellations.
    """
    events = []

    # 1. Warning Creation
    if warning.created_at:
        events.append({
            "id": f"evt-create-{warning.id}",
            "timestamp": warning.created_at,
            "event_type": "WARNING_CREATED",
            "title": f"Warning Created (Ver. {warning.version}.0)",
            "description": f"Official {warning.severity} {warning.disaster_type} warning drafted by {warning.issuing_authority_name} for '{warning.area_name}'.",
            "badge_type": "primary",
            "actor": warning.issuing_authority_name
        })

    # 2. Human Approval
    if warning.approved_at:
        approver = warning.approver.full_name if warning.approver else warning.issuing_authority_name
        events.append({
            "id": f"evt-approve-{warning.id}",
            "timestamp": warning.approved_at,
            "event_type": "HUMAN_APPROVAL",
            "title": f"Human Authority Approval Recorded",
            "description": f"Controlled citizen communication approved by {approver}. AI plain-language & Hindi messages validated.",
            "badge_type": "stable",
            "actor": approver
        })

    # 3. Warning Distribution
    if warning.distributed_at:
        delivery_count = db.query(NotificationDeliveryRecord).filter(
            NotificationDeliveryRecord.warning_id == warning.id,
            NotificationDeliveryRecord.warning_version == warning.version
        ).count()
        events.append({
            "id": f"evt-distribute-{warning.id}",
            "timestamp": warning.distributed_at,
            "event_type": "WARNING_DISTRIBUTED",
            "title": f"Warning Geographically Distributed",
            "description": f"Warning dispatched across {warning.distribution_channels or 'Web, SMS, Push'} targeting {delivery_count} PostGIS-verified citizens.",
            "badge_type": "stable",
            "actor": "System Dispatch Engine"
        })

    # 4. Citizen Responses
    responses = db.query(CitizenResponse).filter(
        CitizenResponse.warning_id == warning.id,
        CitizenResponse.warning_version == warning.version
    ).order_by(CitizenResponse.created_at.asc()).all()

    type_titles = {
        "understand": "Citizen Confirmed Understanding",
        "safe": "Citizen Reported Safe",
        "dont_understand": "Citizen Reported Understanding Gap",
        "need_help": "Emergency Assistance Requested",
        "not_in_area": "Location Mismatch Reported"
    }

    type_badges = {
        "understand": "stable",
        "safe": "stable",
        "dont_understand": "attention",
        "need_help": "extreme",
        "not_in_area": "attention"
    }

    for idx, resp in enumerate(responses):
        citizen_name = f"Citizen #{resp.user_id}" if resp.user_id else f"Respondent #{idx+1}"
        if resp.user:
            parts = resp.user.full_name.split()
            masked_name = f"{parts[0]} {parts[1][0]}." if len(parts) > 1 else parts[0]
            citizen_name = f"{masked_name} (ID #{resp.user_id})"

        zone_str = f" in {resp.response_zone.name}" if resp.response_zone else ""
        events.append({
            "id": f"evt-resp-{resp.id}",
            "timestamp": resp.created_at or warning.created_at,
            "event_type": f"CITIZEN_RESPONSE_{resp.response_type.upper()}",
            "title": type_titles.get(resp.response_type, f"Citizen Response: {resp.response_type}"),
            "description": f"{citizen_name} submitted '{resp.response_type.replace('_', ' ')}'{zone_str}.{(' Notes: ' + resp.feedback_notes) if resp.feedback_notes else ''}",
            "badge_type": type_badges.get(resp.response_type, "primary"),
            "actor": citizen_name
        })

    # 5. Cancellation event
    if warning.status == "Cancelled" and warning.cancellation_reason:
        events.append({
            "id": f"evt-cancel-{warning.id}",
            "timestamp": warning.updated_at or warning.created_at,
            "event_type": "WARNING_CANCELLED",
            "title": "Warning Formally Cancelled",
            "description": f"Official cancellation notice issued: {warning.cancellation_reason}",
            "badge_type": "extreme",
            "actor": warning.issuing_authority_name
        })

    # Sort chronological ascending
    events.sort(key=lambda x: x["timestamp"] if x["timestamp"] else datetime.min)
    return events

def get_warning_citizen_responses(warning: Warning, db: Session) -> List[Dict[str, Any]]:
    """
    Returns individual citizen responses for this warning version with privacy-safe display identifiers.
    """
    responses = db.query(CitizenResponse).filter(
        CitizenResponse.warning_id == warning.id,
        CitizenResponse.warning_version == warning.version
    ).order_by(CitizenResponse.created_at.desc()).all()

    items = []
    for idx, resp in enumerate(responses):
        display_name = f"Citizen #{resp.user_id}" if resp.user_id else f"Citizen #{idx+1}"
        if resp.user:
            parts = resp.user.full_name.split()
            masked_name = f"{parts[0]} {parts[1][0]}." if len(parts) > 1 else parts[0]
            display_name = f"{masked_name} (#{resp.user_id})"

        # Check assistance request
        help_req = None
        if resp.user_id:
            help_req = db.query(AssistanceRequest).filter(
                AssistanceRequest.warning_id == warning.id,
                AssistanceRequest.user_id == resp.user_id
            ).first()

        items.append({
            "id": resp.id,
            "display_identifier": display_name,
            "response_type": resp.response_type,
            "warning_version": resp.warning_version,
            "zone_id": resp.response_zone_id,
            "zone_name": resp.response_zone.name if resp.response_zone else "General Area",
            "target_area_id": resp.target_area_id,
            "target_area_name": resp.target_area.name if resp.target_area else warning.area_name,
            "language_used": resp.language_used,
            "feedback_notes": resp.feedback_notes,
            "delivery_channel": resp.delivery_channel,
            "created_at": resp.created_at,
            "updated_at": resp.updated_at,
            "assistance_request_id": help_req.id if help_req else None,
            "assistance_category": help_req.category if help_req else None,
            "assistance_headcount": help_req.headcount if help_req else None,
            "assistance_status": help_req.status if help_req else None
        })

    return items

def evaluate_all_zones(db: Session) -> List[Dict[str, Any]]:
    """Evaluates all response zones in the database and updates their state."""
    zones = db.query(ResponseZone).all()
    results = []
    for z in zones:
        m = compute_zone_metrics(z, db)
        results.append(m)
    db.commit()
    return results

