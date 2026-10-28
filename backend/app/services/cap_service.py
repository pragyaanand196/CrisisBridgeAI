import json
import uuid
from datetime import datetime
from typing import Dict, Any

def generate_cap_payload(
    identifier: str,
    sender: str,
    sent_time: datetime,
    status: str,
    msg_type: str,
    disaster_type: str,
    urgency: str,
    severity: str,
    certainty: str,
    headline: str,
    description: str,
    instruction: str,
    area_desc: str,
    polygon_geojson: str = None
) -> Dict[str, Any]:
    """
    Constructs a standard CAP v1.2 (Common Alerting Protocol) JSON representation
    for official emergency interoperability.
    """
    sent_iso = sent_time.isoformat() if isinstance(sent_time, datetime) else str(sent_time)
    
    cap_alert = {
        "identifier": identifier,
        "sender": sender,
        "sent": sent_iso,
        "status": "Actual" if status in ["Active", "Approved", "Updated"] else "Draft",
        "msgType": msg_type, # Alert, Update, Cancel
        "scope": "Public",
        "code": ["IPAWS-CAPv1.2", "CrisisBridge-2026"],
        "info": [
            {
                "language": "en-US",
                "category": "Safety",
                "event": disaster_type,
                "urgency": urgency,
                "severity": severity,
                "certainty": certainty,
                "eventCode": [{"valueName": "SAME", "value": disaster_type.upper()[:3]}],
                "headline": headline,
                "description": description,
                "instruction": instruction,
                "senderName": sender,
                "area": [
                    {
                        "areaDesc": area_desc,
                        "polygon": polygon_geojson
                    }
                ]
            }
        ]
    }
    return cap_alert
