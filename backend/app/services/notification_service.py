import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.models.authority_notification import AuthorityNotification
from backend.app.services.websocket_manager import ws_manager

logger = logging.getLogger("crisisbridge.notifications")

class NotificationService:
    def __init__(self):
        self.notification_log = []

    def dispatch_warning_notifications(
        self,
        warning_id: int,
        warning_title: str,
        severity: str,
        zone_names: List[str],
        channels: List[str] = None
    ) -> Dict[str, Any]:
        """
        Dispatches in-app notification alerts and explicitly simulated multi-channel notifications
        (SMS, Push, Email). Clearly marked as Prototype/Simulated.
        """
        if channels is None:
            channels = ["In-App Alert", "Simulated-SMS", "Simulated-Push", "Simulated-Email"]

        timestamp = datetime.utcnow().isoformat()
        
        event_record = {
            "warning_id": warning_id,
            "warning_title": warning_title,
            "severity": severity,
            "targeted_zones": zone_names,
            "channels": channels,
            "timestamp": timestamp,
            "simulation_notice": "External SMS/Push/Email delivery is simulated in this prototype environment.",
            "delivery_status": "Dispatched (In-App Live + Simulated Channels Active)"
        }
        
        self.notification_log.append(event_record)
        logger.info(f"[NOTIF DISPATCH] Warning #{warning_id} '{warning_title}' sent to zones {zone_names} via {channels}")
        return event_record

    async def create_authority_notifications_for_assistance_request(
        self,
        db: Session,
        request: AssistanceRequest,
        citizen: Optional[User] = None
    ) -> List[AuthorityNotification]:
        """
        Creates persistent authority notifications for a newly created citizen assistance request.
        
        Authority Recipient Determination Rule:
        1. Issuing authority of the warning associated with this request (primary incident owner).
        2. Authorities whose jurisdiction matches the request location or warning area.
        3. Platform administrators (overall emergency command oversight).
        4. If no specific jurisdiction matches, falls back to active authorities to ensure emergency requests
           are never left unaddressed. Citizens are strictly excluded.
        5. Enforces idempotency via unique (recipient_id, assistance_request_id, event_type) check.
        """
        created_notifications = []
        try:
            warning = db.query(Warning).filter(Warning.id == request.warning_id).first()
            all_authorities = db.query(User).filter(
                User.role.in_(["authority", "administrator"]),
                User.is_active == True
            ).all()

            recipient_ids = set()

            # 1. Issuing authority of the warning
            if warning and warning.issuing_authority_id:
                recipient_ids.add(warning.issuing_authority_id)

            # 2. Jurisdiction matching & Administrators
            location_lower = (request.location_description or "").lower()
            area_lower = (warning.area_name or "").lower() if warning else ""

            matched_jurisdiction_count = 0
            for auth_user in all_authorities:
                if auth_user.role == "administrator":
                    recipient_ids.add(auth_user.id)
                    continue

                if auth_user.jurisdiction:
                    jur_lower = auth_user.jurisdiction.lower().strip()
                    # Check substring match or word match
                    if (jur_lower in location_lower) or (jur_lower in area_lower) or (location_lower and any(w in location_lower for w in jur_lower.split() if len(w) > 3)):
                        recipient_ids.add(auth_user.id)
                        matched_jurisdiction_count += 1

            # 3. Fallback: If no authorities were matched via jurisdiction or warning, include all active authorities
            if matched_jurisdiction_count == 0 and not (warning and warning.issuing_authority_id):
                for auth_user in all_authorities:
                    if auth_user.role == "authority":
                        recipient_ids.add(auth_user.id)

            # Ensure citizen itself is never a recipient
            if citizen and citizen.id in recipient_ids:
                recipient_ids.discard(citizen.id)

            citizen_name = citizen.full_name if citizen else (request.user.full_name if request.user else "Citizen")
            title = f"New {request.urgency_level} Aid Request: {request.category.replace('_', ' ').title()}"
            message = (
                f"{citizen_name} requested {request.urgency_level.lower()} urgency {request.category.replace('_', ' ')} "
                f"for {request.headcount} {'person' if request.headcount == 1 else 'people'} at {request.location_description}."
            )

            now = datetime.utcnow()
            for recipient_id in recipient_ids:
                # Idempotency check: verify notification doesn't already exist for this (recipient, request, event)
                existing = db.query(AuthorityNotification).filter(
                    AuthorityNotification.recipient_id == recipient_id,
                    AuthorityNotification.assistance_request_id == request.id,
                    AuthorityNotification.event_type == "NEW_ASSISTANCE_REQUEST"
                ).first()

                if not existing:
                    notif = AuthorityNotification(
                        recipient_id=recipient_id,
                        assistance_request_id=request.id,
                        event_type="NEW_ASSISTANCE_REQUEST",
                        title=title,
                        message=message,
                        urgency=request.urgency_level,
                        category=request.category,
                        location_description=request.location_description,
                        citizen_name=citizen_name,
                        headcount=request.headcount,
                        is_read=False,
                        created_at=now
                    )
                    db.add(notif)
                    created_notifications.append(notif)

            if created_notifications:
                db.commit()
                for n in created_notifications:
                    db.refresh(n)

                logger.info(
                    f"[AUTHORITY NOTIFICATION] Created {len(created_notifications)} notification(s) for assistance request #{request.id}"
                )

                # Broadcast real-time event for connected authorities and administrators
                try:
                    payload = {
                        "assistance_request_id": request.id,
                        "title": title,
                        "message": message,
                        "urgency": request.urgency_level,
                        "category": request.category,
                        "location_description": request.location_description,
                        "citizen_name": citizen_name,
                        "headcount": request.headcount,
                        "created_at": now.isoformat(),
                        "recipient_ids": list(recipient_ids)
                    }
                    await ws_manager.broadcast("AUTHORITY_NOTIFICATION_CREATED", payload, target_role="authority")
                    await ws_manager.broadcast("AUTHORITY_NOTIFICATION_CREATED", payload, target_role="administrator")
                except Exception as ws_err:
                    logger.warning(f"WebSocket broadcast error for authority notification: {ws_err}")

        except Exception as err:
            logger.error(f"Failed to generate authority notifications for request #{request.id}: {err}", exc_info=True)
            # Do NOT raise: non-blocking persistence guarantee for assistance request

        return created_notifications

notification_service = NotificationService()
