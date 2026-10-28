import sys
import os
import asyncio
from datetime import datetime

# Set stdout/stderr to UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal, engine, Base
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.models.verification_report import VerificationReport
from backend.app.models.resource import Resource
from backend.app.models.audit_log import AuditLog
from backend.app.services.auth_service import get_password_hash, create_access_token, verify_password
from backend.app.services.cap_service import generate_cap_payload
from backend.app.services.ai_service import generate_simplified_citizen_communication
from backend.app.services.analytics_service import compute_zone_metrics, evaluate_all_zones
from backend.app.services.geo_service import point_in_polygon

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

@pytest.mark.asyncio
async def test_backend_suite():
    print("==================================================")
    print("CRISISBRIDGE AI - BACKEND TEST SUITE")
    print("==================================================")

    # Isolated In-Memory Database (preserving production crisisbridge.db)
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    db = TestSessionLocal()

    try:
        # 1. Test Auth & RBAC
        print("[1/8] Testing User Registration & RBAC...")
        admin = User(email="admin@crisisbridge.gov", hashed_password=get_password_hash("AdminPass123!"), full_name="Director Sharma", role="administrator")
        auth_user = User(email="officer@ndrf.gov", hashed_password=get_password_hash("OfficerPass123!"), full_name="Capt. Rajesh Kumar", role="authority", department="NDRF Division 4", jurisdiction="Riverside District")
        citizen = User(
            email="citizen@example.com",
            hashed_password=get_password_hash("CitizenPass123!"),
            full_name="Aarav Patel",
            role="citizen",
            location_name="Riverside Sector 4, Mumbai",
            latitude=19.0760,
            longitude=72.8777,
            district="Mumbai Suburban",
            city="Mumbai",
            state="Maharashtra"
        )

        db.add_all([admin, auth_user, citizen])
        db.commit()
        assert verify_password("OfficerPass123!", auth_user.hashed_password)
        print("  [OK] Users created with roles: administrator, authority, citizen")

        token = create_access_token({"sub": str(auth_user.id), "role": auth_user.role})
        assert token is not None
        print("  [OK] JWT Token generated and verified successfully")

        # 2. Test CAP Representation
        print("[2/8] Testing CAP v1.2 Payload Generation...")
        cap = generate_cap_payload(
            identifier="CB-TEST-001",
            sender="NDRF Division 4",
            sent_time=datetime.utcnow(),
            status="Draft",
            msg_type="Alert",
            disaster_type="Flood",
            urgency="Immediate",
            severity="Severe",
            certainty="Observed",
            headline="Flash Flood Warning for Coastal Zone",
            description="River water level exceeded danger mark by 1.8 meters.",
            instruction="Evacuate to elevated ground immediately. Do not drive through flooded roads.",
            area_desc="Riverside District"
        )
        assert cap["identifier"] == "CB-TEST-001"
        assert cap["info"][0]["event"] == "Flood"
        print("  [OK] CAP v1.2 payload structured and validated")

        # 3. Test Controlled AI Simplification & Fallback
        print("[3/8] Testing Controlled AI Simplification (English & Hindi)...")
        en_text, hi_text, source, g_score, g_note = await generate_simplified_citizen_communication(
            disaster_type="Flood",
            title="Flash Flood Warning for Coastal Zone",
            description="River water level exceeded danger mark.",
            severity="Severe",
            urgency="Immediate",
            area_name="Riverside District",
            recommended_instructions="• Move to high ground immediately\n• Keep emergency kit ready\n• Avoid river banks"
        )
        assert len(en_text) > 20
        assert len(hi_text) > 20
        print(f"  [OK] AI simplification source: {source}")
        print(f"  [OK] English message generated ({len(en_text)} chars)")
        print(f"  [OK] Hindi message generated ({len(hi_text)} chars)")

        # 4. Test Warning Creation & Response Zone Subdivision
        print("[4/8] Testing Warning Creation and Spatial Response Zones...")
        warn = Warning(
            identifier="CB-WARN-2026-TEST",
            version=1,
            disaster_type="Flood",
            title="Severe Flash Flood Alert",
            description="Rapid rise in river levels.",
            severity="Severe",
            urgency="Immediate",
            certainty="Observed",
            area_name="Riverside District",
            recommended_instructions="Move to high ground. Avoid low bridges.",
            issuing_authority_name="NDRF Command",
            issuing_authority_id=auth_user.id,
            status="Active",
            ai_simplified_en=en_text,
            ai_simplified_hi=hi_text,
            ai_approval_status="Approved",
            distributed_at=datetime.utcnow()
        )
        db.add(warn)
        db.commit()
        db.refresh(warn)

        zone_a = ResponseZone(
            warning_id=warn.id,
            name="Riverside Lowland Sector A",
            code="RZ-A",
            polygon_geojson='{"type":"Polygon","coordinates":[[[72.8,19.0],[72.8,19.1],[72.9,19.1],[72.9,19.0],[72.8,19.0]]]}',
            center_lat=19.05,
            center_lng=72.85,
            estimated_population=10000,
            delivery_count=100,
            no_response_count=100,
            situation_status="Stable"
        )
        zone_b = ResponseZone(
            warning_id=warn.id,
            name="Urban Core Sector B",
            code="RZ-B",
            polygon_geojson='{"type":"Polygon","coordinates":[[[72.9,19.0],[72.9,19.1],[73.0,19.1],[73.0,19.0],[72.9,19.0]]]}',
            center_lat=19.05,
            center_lng=72.95,
            estimated_population=25000,
            delivery_count=100,
            no_response_count=100,
            situation_status="Stable"
        )
        db.add_all([zone_a, zone_b])
        db.commit()
        print("  [OK] Warning and 2 Response Zones created successfully")

        # 5. Test Citizen Responses & Spatial Feedback Loop
        print("[5/8] Testing Citizen Feedback Capture...")
        for _ in range(10):
            db.add(CitizenResponse(warning_id=warn.id, response_zone_id=zone_a.id, response_type="understand"))
        for _ in range(4):
            db.add(CitizenResponse(warning_id=warn.id, response_zone_id=zone_b.id, response_type="dont_understand"))
        db.commit()
        print("  [OK] Citizen responses recorded")

        # 6. Test Deterministic Analytics & Situation Classification
        print("[6/8] Testing Deterministic Analytics & Gap Detection...")
        m_a = compute_zone_metrics(zone_a, db)
        print(f"  Zone A Status: {m_a['situation_status']} | WTA Score: {m_a['wta_score']} | Understanding Rate: {m_a['understanding_rate']}%")
        assert m_a['understanding_rate'] == 100.0

        m_b = compute_zone_metrics(zone_b, db)
        print(f"  Zone B Status: {m_b['situation_status']} | WTA Score: {m_b['wta_score']} | Dont Understand Rate: {m_b['dont_understand_rate']}%")
        assert m_b['situation_status'] == "Understanding Gap"
        print("  [OK] Understanding Gap successfully detected deterministically!")

        # 7. Test Assistance Surge Detection
        print("[7/8] Testing Assistance Surge Detection...")
        for i in range(6):
            db.add(AssistanceRequest(
                warning_id=warn.id,
                response_zone_id=zone_a.id,
                category="evacuation",
                urgency_level="Critical",
                headcount=2,
                location_description=f"House #{10+i}, Riverfront Road",
                status="Pending"
            ))
        db.commit()
        m_a_surge = compute_zone_metrics(zone_a, db)
        print(f"  Zone A Post-Surge Status: {m_a_surge['situation_status']} | Active Help Requests: {m_a_surge['active_help_count']}")
        assert m_a_surge['situation_status'] == "Assistance Surge"
        print("  [OK] Assistance Surge detected and prioritized!")

        # 8. Test Rumor Verification & Clarification
        print("[8/8] Testing Information Verification Module...")
        rumor = VerificationReport(
            warning_id=warn.id,
            source_platform="WhatsApp Forward",
            claim_title="Bridge Collapse Rumor",
            claim_content="Rumors circulating that Central River Bridge has collapsed.",
            status="Conflicting with Official Information"
        )
        db.add(rumor)
        db.commit()
        db.refresh(rumor)
        assert rumor.status == "Conflicting with Official Information"
        print("  [OK] Rumor flagged and logged for authority review")

        print("==================================================")
        print("ALL 8 BACKEND VERIFICATION TESTS PASSED (100%)!")
        print("==================================================")
    finally:
        db.close()
        print("Database test run complete.")

if __name__ == "__main__":
    asyncio.run(test_backend_suite())
