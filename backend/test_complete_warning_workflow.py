import os
import sys
import json
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.main import app
from backend.app.database import Base, get_db
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.warning_target_area import WarningTargetArea
from backend.app.models.notification_delivery_record import NotificationDeliveryRecord
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.services.auth_service import get_password_hash

# Setup Isolated In-Memory Database
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
Base.metadata.create_all(bind=test_engine)

client = TestClient(app)
BASE_URL = "/api/v1"

@pytest.fixture(scope="module", autouse=True)
def setup_test_users():
    """Seed test users into isolated database."""
    db = TestingSessionLocal()
    try:
        # Pre-seed existing accounts to verify preservation
        existing_admin = User(
            email="existing_admin@crisisbridge.gov",
            hashed_password=get_password_hash("AdminPass123!"),
            full_name="Director Admin",
            role="administrator"
        )
        existing_authority = User(
            email="existing_authority@crisisbridge.gov",
            hashed_password=get_password_hash("AuthPass123!"),
            full_name="Officer Sharma",
            role="authority",
            department="State Disaster Ops",
            jurisdiction="Mumbai"
        )
        other_authority = User(
            email="other_authority@crisisbridge.gov",
            hashed_password=get_password_hash("OtherAuthPass123!"),
            full_name="Officer Verma",
            role="authority",
            department="Regional SDRF",
            jurisdiction="Pune"
        )
        citizen_inside = User(
            email="citizen_inside@example.com",
            hashed_password=get_password_hash("CitizenPass123!"),
            full_name="Rohan Inside",
            role="citizen",
            location_name="South Mumbai Coastal Zone",
            latitude=18.9220,
            longitude=72.8347,
            preferred_language="en"
        )
        citizen_outside = User(
            email="citizen_outside@example.com",
            hashed_password=get_password_hash("CitizenPass123!"),
            full_name="Pooja Outside",
            role="citizen",
            location_name="Navi Mumbai Suburban Zone",
            latitude=19.0330,
            longitude=73.0297,
            preferred_language="hi"
        )
        citizen_no_loc = User(
            email="citizen_no_loc@example.com",
            hashed_password=get_password_hash("CitizenPass123!"),
            full_name="Vikas NoLoc",
            role="citizen",
            preferred_language="en"
        )
        db.add_all([existing_admin, existing_authority, other_authority, citizen_inside, citizen_outside, citizen_no_loc])
        db.commit()
    finally:
        db.close()
    yield
    # Cleanup overrides if needed
    app.dependency_overrides.clear()


def login_user(email, password):
    resp = client.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── TEST SUITE FOR ALL 22 SCENARIOS ──────────────────────────────────────────

def test_01_valid_authority_warning_creation():
    """Scenario 1: Authorized authority enters valid fields; backend returns persistent record with CAP ID."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")
    
    # Polygon covering South Mumbai (72.80 - 72.85 lng, 18.90 - 18.95 lat)
    south_mumbai_polygon = json.dumps({
        "type": "Polygon",
        "coordinates": [[[72.80, 18.90], [72.85, 18.90], [72.85, 18.95], [72.80, 18.95], [72.80, 18.90]]]
    })

    payload = {
        "disaster_type": "Flood",
        "title": "Severe Flash Flood Inundation Warning",
        "description": "High-tide rainfall surge causing rapid waterlogging in coastal lowlands.",
        "severity": "Severe",
        "urgency": "Immediate",
        "certainty": "Observed",
        "area_name": "South Mumbai Coastal District",
        "recommended_instructions": "• Evacuate low-lying basement and ground floor premises immediately.\n• Do not walk or drive through flooded roads.\n• Disconnect electrical mains and LPG cylinders.",
        "issuing_authority_name": "State Disaster Operations Command",
        "expected_start_time": datetime.utcnow().isoformat(),
        "expiry_time": (datetime.utcnow() + timedelta(days=2)).isoformat(),
        "target_areas": [
            {
                "name": "Colaba & Nariman Point Sector",
                "target_type": "radius",
                "geometry_geojson": south_mumbai_polygon,
                "center_lat": 18.9220,
                "center_lng": 72.8347,
                "radius_km": 4.0,
                "priority_level": "Critical"
            }
        ]
    }

    resp = client.post(f"{BASE_URL}/warnings", json=payload, headers=auth_headers)
    assert resp.status_code == 201, f"Create warning failed: {resp.text}"
    data = resp.json()
    assert data["id"] > 0
    assert data["identifier"].startswith("CB-WARN-")
    assert data["status"] == "Under Review"
    assert data["disaster_type"] == "Flood"
    assert data["severity"] == "Severe"
    assert data["urgency"] == "Immediate"
    assert data["certainty"] == "Observed"


def test_02_missing_or_invalid_fields():
    """Scenario 2: Missing required info, invalid severity, past expiry time return clear 400 validation errors."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")

    # Missing title
    r1 = client.post(f"{BASE_URL}/warnings", json={
        "disaster_type": "Flood", "title": "   ", "description": "Desc",
        "severity": "Severe", "urgency": "Immediate", "certainty": "Observed",
        "area_name": "Area", "recommended_instructions": "Inst", "issuing_authority_name": "Auth"
    }, headers=auth_headers)
    assert r1.status_code == 400
    assert "title cannot be empty" in r1.json()["detail"]

    # Unsupported severity
    r2 = client.post(f"{BASE_URL}/warnings", json={
        "disaster_type": "Flood", "title": "Title", "description": "Desc",
        "severity": "Catastrophic", "urgency": "Immediate", "certainty": "Observed",
        "area_name": "Area", "recommended_instructions": "Inst", "issuing_authority_name": "Auth"
    }, headers=auth_headers)
    assert r2.status_code == 400
    assert "Unsupported severity" in r2.json()["detail"]

    # Past expiry time
    r3 = client.post(f"{BASE_URL}/warnings", json={
        "disaster_type": "Flood", "title": "Title", "description": "Desc",
        "severity": "Severe", "urgency": "Immediate", "certainty": "Observed",
        "area_name": "Area", "recommended_instructions": "Inst", "issuing_authority_name": "Auth",
        "expiry_time": (datetime.utcnow() - timedelta(days=1)).isoformat()
    }, headers=auth_headers)
    assert r3.status_code == 400
    assert "cannot be in the past" in r3.json()["detail"]


def test_03_unauthorized_creation_or_approval():
    """Scenario 3: Citizen cannot create or approve warning; authority B cannot approve warning issued by authority A."""
    cit_headers = login_user("citizen_inside@example.com", "CitizenPass123!")
    auth_b_headers = login_user("other_authority@crisisbridge.gov", "OtherAuthPass123!")

    # Citizen cannot create
    r_cit = client.post(f"{BASE_URL}/warnings", json={
        "disaster_type": "Flood", "title": "Title", "description": "Desc",
        "severity": "Severe", "urgency": "Immediate", "certainty": "Observed",
        "area_name": "Area", "recommended_instructions": "Inst", "issuing_authority_name": "Citizen"
    }, headers=cit_headers)
    assert r_cit.status_code == 403

    # Authority B cannot approve Authority A's warning
    # Warning 1 belongs to existing_authority
    r_auth_b = client.post(f"{BASE_URL}/warnings/1/approve-ai", json={"action": "approve"}, headers=auth_b_headers)
    assert r_auth_b.status_code == 403
    assert "not authorized" in r_auth_b.json()["detail"]


def test_04_geographical_target_preview():
    """Scenario 4: Calculates recipient count from actual registered citizens without mock data."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")

    # Target area covering South Mumbai where citizen_inside is registered
    preview_req = {
        "target_areas": [
            {
                "name": "South Mumbai Zone",
                "target_type": "radius",
                "geometry_geojson": json.dumps({
                    "type": "Polygon",
                    "coordinates": [[[72.80, 18.90], [72.85, 18.90], [72.85, 18.95], [72.80, 18.95], [72.80, 18.90]]]
                }),
                "center_lat": 18.9220,
                "center_lng": 72.8347,
                "radius_km": 4.0,
                "priority_level": "Critical"
            }
        ]
    }
    r = client.post(f"{BASE_URL}/warnings/preview-targeting", json=preview_req, headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total_citizens_targeted"] == 1
    assert data["is_empty"] is False

    # Target area in Delhi where no citizen is registered
    preview_empty = {
        "target_areas": [
            {
                "name": "Delhi Sector 9",
                "target_type": "radius",
                "geometry_geojson": json.dumps({
                    "type": "Polygon",
                    "coordinates": [[[77.20, 28.60], [77.25, 28.60], [77.25, 28.65], [77.20, 28.65], [77.20, 28.60]]]
                }),
                "center_lat": 28.6139,
                "center_lng": 77.2090,
                "radius_km": 3.0,
                "priority_level": "Standard"
            }
        ]
    }
    r_empty = client.post(f"{BASE_URL}/warnings/preview-targeting", json=preview_empty, headers=auth_headers)
    assert r_empty.status_code == 200
    data_empty = r_empty.json()
    assert data_empty["total_citizens_targeted"] == 0
    assert data_empty["is_empty"] is True


def test_05_rag_retrieval_and_ai_generation():
    """Scenario 5 & 8 & 9: RAG retrieves trusted SOPs and generates grounded bilingual communication."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")
    
    # Inspect warning 1 detail to verify RAG grounding
    detail = client.get(f"{BASE_URL}/warnings/1", headers=auth_headers).json()
    assert detail["rag_status"] in ["Grounded", "Fallback"]
    assert detail["ai_simplified_en"] is not None
    assert detail["ai_simplified_hi"] is not None
    
    # Regenerate AI message
    regen_resp = client.post(f"{BASE_URL}/warnings/1/generate-ai", headers=auth_headers)
    assert regen_resp.status_code == 200
    regen_data = regen_resp.json()
    assert regen_data["ai_simplified_en"] is not None
    assert regen_data["ai_simplified_hi"] is not None
    assert regen_data["translation_valid"] is True


def test_06_unapproved_distribution_rejected():
    """Scenario 11: Rejects distribution if human authority has not approved."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")
    db = TestingSessionLocal()
    try:
        w = db.query(Warning).filter(Warning.id == 1).first()
        w.ai_approval_status = "Pending"
        w.status = "Under Review"
        db.commit()
    finally:
        db.close()

    r = client.post(f"{BASE_URL}/warnings/1/distribute", headers=auth_headers)
    assert r.status_code == 400
    assert "mandatory Human Authority Approval" in r.json()["detail"]


def test_07_approval_and_successful_distribution():
    """Scenario 10 & 12: Approves warning and distributes to eligible recipients."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")

    # 1. Approve
    appr = client.post(f"{BASE_URL}/warnings/1/approve-ai", json={"action": "approve"}, headers=auth_headers)
    assert appr.status_code == 200
    assert appr.json()["ai_approval_status"] == "Approved"
    assert appr.json()["status"] == "Active"

    # 2. Distribute
    dist = client.post(f"{BASE_URL}/warnings/1/distribute", headers=auth_headers)
    assert dist.status_code == 200
    assert dist.json()["status"] == "Active"


def test_08_repeated_distribution_idempotency():
    """Scenario 13: Calling distribution again does not create duplicate delivery records."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")
    db = TestingSessionLocal()
    try:
        count_before = db.query(NotificationDeliveryRecord).filter(NotificationDeliveryRecord.warning_id == 1).count()
        assert count_before >= 1

        # Second distribution call
        dist_again = client.post(f"{BASE_URL}/warnings/1/distribute", headers=auth_headers)
        assert dist_again.status_code == 200

        count_after = db.query(NotificationDeliveryRecord).filter(NotificationDeliveryRecord.warning_id == 1).count()
        assert count_after == count_before, "Duplicate delivery records created on repeated distribution!"
    finally:
        db.close()


def test_09_citizen_inside_target_area_visibility():
    """Scenario 5: Citizen inside target area dynamically sees warning on dashboard."""
    cit_inside_headers = login_user("citizen_inside@example.com", "CitizenPass123!")
    r = client.get(f"{BASE_URL}/citizen/active-warnings", headers=cit_inside_headers)
    assert r.status_code == 200
    warns = r.json()
    assert any(w["id"] == 1 for w in warns)


def test_10_citizen_outside_target_area_hidden():
    """Scenario 6: Citizen outside target area does NOT see this warning."""
    cit_outside_headers = login_user("citizen_outside@example.com", "CitizenPass123!")
    r = client.get(f"{BASE_URL}/citizen/active-warnings", headers=cit_outside_headers)
    assert r.status_code == 200
    warns = r.json()
    assert not any(w["id"] == 1 for w in warns)


def test_11_citizen_with_no_location_hidden():
    """Scenario 7: Citizen with no registered location does not receive warning."""
    cit_noloc_headers = login_user("citizen_no_loc@example.com", "CitizenPass123!")
    r = client.get(f"{BASE_URL}/citizen/active-warnings", headers=cit_noloc_headers)
    assert r.status_code == 200
    assert len(r.json()) == 0


def test_12_late_registered_citizen_receives_warning():
    """Scenario 14: New citizen registers in target area AFTER activation and receives warning dynamically with truthful timestamp."""
    reg_new = client.post(f"{BASE_URL}/auth/register", json={
        "email": "late_citizen@example.com",
        "password": "Password123!",
        "full_name": "Arjun LateArrival",
        "role": "citizen",
        "location_name": "South Mumbai Marine Drive",
        "latitude": 18.9240,
        "longitude": 72.8280,
        "preferred_language": "hi"
    })
    assert reg_new.status_code == 201
    late_token = reg_new.json()["access_token"]
    late_headers = {"Authorization": f"Bearer {late_token}"}

    # Portal load
    r = client.get(f"{BASE_URL}/citizen/active-warnings", headers=late_headers)
    assert r.status_code == 200
    active_warns = r.json()
    assert any(w["id"] == 1 for w in active_warns), "Late registering citizen did not dynamically receive active warning!"

    # Verify delivery record has current timestamp, not past distribution timestamp
    db = TestingSessionLocal()
    try:
        new_cit = db.query(User).filter(User.email == "late_citizen@example.com").first()
        deliv = db.query(NotificationDeliveryRecord).filter(
            NotificationDeliveryRecord.warning_id == 1,
            NotificationDeliveryRecord.citizen_id == new_cit.id
        ).first()
        assert deliv is not None
        assert deliv.status == "delivered"
        # Delivered at must be after the citizen registered (within last minute)
        assert (datetime.utcnow() - deliv.delivered_at).total_seconds() < 60
    finally:
        db.close()


def test_13_location_update_recalculates_eligibility():
    """Scenario 15: Citizen moves location. Eligibility is dynamically recalculated; past history preserved."""
    cit_inside_headers = login_user("citizen_inside@example.com", "CitizenPass123!")

    # Verify initial visibility
    r_init = client.get(f"{BASE_URL}/citizen/active-warnings", headers=cit_inside_headers)
    assert any(w["id"] == 1 for w in r_init.json())

    # Citizen moves to Pune (far outside Mumbai flood warning)
    loc_update = client.put(f"{BASE_URL}/auth/profile/location", json={
        "location_name": "Kothrud, Pune",
        "latitude": 18.5074,
        "longitude": 73.8077
    }, headers=cit_inside_headers)
    assert loc_update.status_code == 200

    # Portal reload: citizen should no longer be eligible for Mumbai warning
    r_after = client.get(f"{BASE_URL}/citizen/active-warnings", headers=cit_inside_headers)
    assert not any(w["id"] == 1 for w in r_after.json()), "Citizen still sees warning after moving outside target area!"

    # Verify past delivery records are NOT deleted
    db = TestingSessionLocal()
    try:
        u = db.query(User).filter(User.email == "citizen_inside@example.com").first()
        deliv = db.query(NotificationDeliveryRecord).filter(
            NotificationDeliveryRecord.warning_id == 1,
            NotificationDeliveryRecord.citizen_id == u.id
        ).first()
        assert deliv is not None, "Past delivery record was wiped on location update!"
    finally:
        db.close()


def test_14_citizen_response_association():
    """Scenario 21: Citizen response is accurately associated with authenticated user, warning, and zone."""
    late_cit_headers = login_user("late_citizen@example.com", "Password123!")

    resp = client.post(f"{BASE_URL}/citizen/respond", json={
        "warning_id": 1,
        "response_type": "understand",
        "language_used": "hi",
        "feedback_notes": "सुरक्षा निर्देश समझ लिए हैं।"
    }, headers=late_cit_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["response_type"] == "understand"

    db = TestingSessionLocal()
    try:
        u = db.query(User).filter(User.email == "late_citizen@example.com").first()
        c_resp = db.query(CitizenResponse).filter(
            CitizenResponse.warning_id == 1,
            CitizenResponse.user_id == u.id
        ).first()
        assert c_resp is not None
        assert c_resp.response_type == "understand"
        assert c_resp.response_zone_id is not None
    finally:
        db.close()


def test_15_warning_version_update():
    """Scenario 18: Authority creates version 2.0; historical version 1.0 records remain intact."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")

    v2_resp = client.post(f"{BASE_URL}/warnings/1/version", json={
        "title": "Severe Flash Flood Warning (Updated V2)",
        "severity": "Extreme",
        "recommended_instructions": "Immediate evacuation ordered for all coastal sectors."
    }, headers=auth_headers)
    assert v2_resp.status_code == 200
    v2_data = v2_resp.json()
    assert v2_data["version"] == 2
    assert v2_data["parent_warning_id"] == 1

    db = TestingSessionLocal()
    try:
        w1 = db.query(Warning).filter(Warning.id == 1).first()
        assert w1.status == "Updated"

        # Verify historical responses and delivery records for v1 still exist
        v1_records = db.query(NotificationDeliveryRecord).filter(
            NotificationDeliveryRecord.warning_id == 1,
            NotificationDeliveryRecord.warning_version == 1
        ).all()
        assert len(v1_records) >= 1
    finally:
        db.close()


def test_16_warning_cancellation_lifecycle():
    """Scenario 19 & 20: Authority cancels warning with reason; cancelled warning excluded from citizen dashboards."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")

    # Cancel reason required
    bad_cancel = client.post(f"{BASE_URL}/warnings/1/cancel", json={"cancellation_reason": "  "}, headers=auth_headers)
    assert bad_cancel.status_code == 400

    # Valid cancel
    cancel = client.post(f"{BASE_URL}/warnings/1/cancel", json={
        "cancellation_reason": "Flood waters receded below danger threshold. Threat neutralized."
    }, headers=auth_headers)
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "Cancelled"

    # Cannot approve or distribute cancelled warning
    r_appr = client.post(f"{BASE_URL}/warnings/1/approve-ai", json={"action": "approve"}, headers=auth_headers)
    assert r_appr.status_code == 400

    # Late citizen in target area reloads portal -> Cancelled warning does NOT appear
    late_cit_headers = login_user("late_citizen@example.com", "Password123!")
    r_active = client.get(f"{BASE_URL}/citizen/active-warnings", headers=late_cit_headers)
    assert not any(w["id"] == 1 for w in r_active.json())

    # Brand new citizen registers after cancellation -> Cancelled warning does NOT appear
    reg_post_cancel = client.post(f"{BASE_URL}/auth/register", json={
        "email": "post_cancel_citizen@example.com",
        "password": "Password123!",
        "full_name": "Neel PostCancel",
        "role": "citizen",
        "location_name": "South Mumbai",
        "latitude": 18.9220,
        "longitude": 72.8347
    })
    assert reg_post_cancel.status_code == 201
    post_token = reg_post_cancel.json()["access_token"]
    r_post = client.get(f"{BASE_URL}/citizen/active-warnings", headers={"Authorization": f"Bearer {post_token}"})
    assert not any(w["id"] == 1 for w in r_post.json())


def test_17_warning_expiry_handling():
    """Scenario 17: Expired warning is excluded from active citizen alerts."""
    auth_headers = login_user("existing_authority@crisisbridge.gov", "AuthPass123!")
    
    # Create an already expired warning directly or via DB
    db = TestingSessionLocal()
    try:
        exp_warn = Warning(
            identifier="CB-WARN-EXPIRED-TEST",
            version=1,
            disaster_type="Cyclone",
            title="Expired Cyclone Alert",
            description="Old cyclone",
            severity="Extreme",
            urgency="Immediate",
            certainty="Observed",
            area_name="South Mumbai Coastal District",
            area_polygon_geojson=json.dumps({
                "type": "Polygon",
                "coordinates": [[[72.80, 18.90], [72.85, 18.90], [72.85, 18.95], [72.80, 18.95], [72.80, 18.90]]]
            }),
            expected_start_time=datetime.utcnow() - timedelta(days=5),
            expiry_time=datetime.utcnow() - timedelta(days=2),
            recommended_instructions="Stay indoors.",
            issuing_authority_name="State Disaster Ops",
            issuing_authority_id=2,
            status="Active"
        )
        db.add(exp_warn)
        db.commit()
        exp_id = exp_warn.id
    finally:
        db.close()

    late_cit_headers = login_user("late_citizen@example.com", "Password123!")
    r = client.get(f"{BASE_URL}/citizen/active-warnings", headers=late_cit_headers)
    assert not any(w["id"] == exp_id for w in r.json()), "Expired warning was shown to citizen!"


def test_18_account_credentials_and_history_preserved():
    """Scenario 22: Pre-existing accounts, passwords, and records are intact."""
    db = TestingSessionLocal()
    try:
        admin_user = db.query(User).filter(User.email == "existing_admin@crisisbridge.gov").first()
        assert admin_user is not None
        assert admin_user.role == "administrator"

        auth_user = db.query(User).filter(User.email == "existing_authority@crisisbridge.gov").first()
        assert auth_user is not None
        assert auth_user.role == "authority"

        # Passwords verify cleanly
        login_admin = client.post(f"{BASE_URL}/auth/login", json={
            "email": "existing_admin@crisisbridge.gov",
            "password": "AdminPass123!"
        })
        assert login_admin.status_code == 200
    finally:
        db.close()
