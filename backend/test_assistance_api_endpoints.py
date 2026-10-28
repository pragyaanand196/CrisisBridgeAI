import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import SessionLocal
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.response_zone import ResponseZone
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.services.auth_service import get_password_hash, create_access_token

client = TestClient(app)

def test_api_assistance_endpoints():
    print("=" * 70)
    print("TESTING ASSISTANCE TRIAGE API ENDPOINTS (HTTP & RBAC)")
    print("=" * 70)

    db = SessionLocal()
    
    # 1. Setup temporary authority and citizen
    temp_auth_email = "api_test_auth@crisisbridge.gov"
    temp_cit1_email = "api_test_cit1@gmail.com"
    temp_cit2_email = "api_test_cit2@gmail.com"

    # Delete dependent test records first
    old_users = db.query(User).filter(User.email.in_([temp_auth_email, temp_cit1_email, temp_cit2_email])).all()
    old_user_ids = [u.id for u in old_users]
    if old_user_ids:
        db.query(AssistanceRequest).filter(AssistanceRequest.user_id.in_(old_user_ids)).delete(synchronize_session=False)
        db.query(Warning).filter(Warning.issuing_authority_id.in_(old_user_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(old_user_ids)).delete(synchronize_session=False)
        db.commit()

    auth_user = User(
        email=temp_auth_email,
        hashed_password=get_password_hash("pass123"),
        full_name="Officer Gupta",
        role="authority",
        department="NDRF Bihar Command",
        jurisdiction="Patna"
    )
    cit1_user = User(
        email=temp_cit1_email,
        hashed_password=get_password_hash("pass123"),
        full_name="Ramesh Singh",
        role="citizen",
        location_name="Kankerbagh, Patna",
        latitude=25.5941,
        longitude=85.1376
    )
    cit2_user = User(
        email=temp_cit2_email,
        hashed_password=get_password_hash("pass123"),
        full_name="Sita Devi",
        role="citizen",
        location_name="Danapur, Patna",
        latitude=25.6321,
        longitude=85.0441
    )
    db.add_all([auth_user, cit1_user, cit2_user])
    db.commit()
    db.refresh(auth_user)
    db.refresh(cit1_user)
    db.refresh(cit2_user)

    auth_token = create_access_token({"sub": str(auth_user.id), "role": auth_user.role})
    cit1_token = create_access_token({"sub": str(cit1_user.id), "role": cit1_user.role})
    cit2_token = create_access_token({"sub": str(cit2_user.id), "role": cit2_user.role})

    # Get active warning or create one for testing
    warn = db.query(Warning).filter(Warning.status.in_(["Active", "Approved"])).first()
    if not warn:
        warn = Warning(
            identifier="WARN-API-TEST",
            version=1,
            disaster_type="Flood",
            title="Severe Flood Emergency",
            description="Severe flood situation in Kankerbagh area with water rise.",
            severity="Severe",
            urgency="Immediate",
            certainty="Observed",
            area_name="Kankerbagh, Patna",
            recommended_instructions="Evacuate to high ground immediately.",
            issuing_authority_name="NDRF Bihar Command",
            issuing_authority_id=auth_user.id,
            status="Active"
        )
        db.add(warn)
        db.commit()
        db.refresh(warn)

        zone = ResponseZone(
            warning_id=warn.id,
            name="Kankerbagh Sector A",
            code="PATNA-Z1",
            polygon_geojson='{"type":"Polygon","coordinates":[[[85.1,25.5],[85.2,25.5],[85.2,25.6],[85.1,25.6],[85.1,25.5]]]}',
            center_lat=25.5941,
            center_lng=85.1376,
            situation_status="Attention Required"
        )
        db.add(zone)
        db.commit()

    # [TEST 1] Citizen 1 requests assistance
    print("\n[TEST 1] Citizen 1 submits assistance request via POST /api/v1/assistance...")
    req_payload = {
        "warning_id": warn.id,
        "category": "evacuation",
        "urgency_level": "Critical",
        "headcount": 3,
        "location_description": "Near Kankerbagh Main Road Colony",
        "latitude": 25.5941,
        "longitude": 85.1376,
        "contact_phone": "+91 9988776655",
        "special_notes": "Water reached ground floor"
    }
    res = client.post(
        "/api/v1/assistance",
        json=req_payload,
        headers={"Authorization": f"Bearer {cit1_token}"}
    )
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    req_data = res.json()
    req_id = req_data["id"]
    assert req_data["status"] == "Pending"
    assert req_data["category"] == "evacuation"
    print(f"  [OK] Request #{req_id} created with status 'Pending'")

    # [TEST 2] Citizen 1 retrieves own requests via GET /api/v1/assistance/my-requests
    print("\n[TEST 2] Citizen 1 queries GET /api/v1/assistance/my-requests...")
    res = client.get(
        "/api/v1/assistance/my-requests",
        headers={"Authorization": f"Bearer {cit1_token}"}
    )
    assert res.status_code == 200
    my_reqs = res.json()
    assert len(my_reqs) >= 1
    assert any(r["id"] == req_id for r in my_reqs)
    print(f"  [OK] Citizen 1 retrieved {len(my_reqs)} active request(s)")

    # [TEST 3] Citizen 2 (unrelated) queries own requests -> should NOT see Citizen 1's request
    print("\n[TEST 3] Citizen 2 queries GET /api/v1/assistance/my-requests...")
    res = client.get(
        "/api/v1/assistance/my-requests",
        headers={"Authorization": f"Bearer {cit2_token}"}
    )
    assert res.status_code == 200
    cit2_reqs = res.json()
    assert not any(r["id"] == req_id for r in cit2_reqs), "Citizen 2 should NOT see Citizen 1's request"
    print("  [OK] Privacy isolation strictly enforced between citizens")

    # [TEST 4] Citizen tries to acknowledge request -> Forbidden (Authority only)
    print("\n[TEST 4] Citizen 1 attempts to call authority endpoint /acknowledge...")
    res = client.post(
        f"/api/v1/assistance/{req_id}/acknowledge",
        headers={"Authorization": f"Bearer {cit1_token}"}
    )
    assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}"
    print("  [OK] RBAC verified: Citizen cannot acknowledge assistance requests")

    # [TEST 5] Authority acknowledges request
    print("\n[TEST 5] Authority acknowledges request via POST /api/v1/assistance/{id}/acknowledge...")
    res = client.post(
        f"/api/v1/assistance/{req_id}/acknowledge",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert res.status_code == 200
    ack_data = res.json()
    assert ack_data["status"] == "Acknowledged"
    assert ack_data["acknowledged_by_id"] == auth_user.id
    assert ack_data["acknowledged_at"] is not None
    print(f"  [OK] Request #{req_id} acknowledged by Authority #{auth_user.id}")

    # [TEST 6] Authority dispatches rescue unit
    print("\n[TEST 6] Authority dispatches unit via POST /api/v1/assistance/{id}/dispatch...")
    dispatch_payload = {"dispatched_unit_notes": "NDRF Rescue Boat Bravo"}
    res = client.post(
        f"/api/v1/assistance/{req_id}/dispatch",
        json=dispatch_payload,
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert res.status_code == 200
    disp_data = res.json()
    assert disp_data["status"] == "Dispatched"
    assert disp_data["dispatched_by_id"] == auth_user.id
    assert disp_data["dispatched_unit_notes"] == "NDRF Rescue Boat Bravo"
    assert disp_data["citizen_verification_status"] == "Pending Verification"
    print(f"  [OK] Request #{req_id} dispatched; verification status: 'Pending Verification'")

    # [TEST 7] Citizen 2 tries to verify Citizen 1's request -> Forbidden
    print("\n[TEST 7] Citizen 2 attempts to verify Citizen 1's request...")
    res = client.post(
        f"/api/v1/assistance/{req_id}/verify-arrival",
        json={"assistance_arrived": True, "citizen_feedback_notes": "Fake confirmation"},
        headers={"Authorization": f"Bearer {cit2_token}"}
    )
    assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}"
    print("  [OK] Ownership security enforced: Unauthorized citizen rejected")

    # [TEST 8] Citizen 1 verifies arrival: Assistance Arrived
    print("\n[TEST 8] Citizen 1 verifies arrival via POST /api/v1/assistance/{id}/verify-arrival...")
    res = client.post(
        f"/api/v1/assistance/{req_id}/verify-arrival",
        json={"assistance_arrived": True, "citizen_feedback_notes": "NDRF Boat Bravo arrived and evacuated 3 people"},
        headers={"Authorization": f"Bearer {cit1_token}"}
    )
    assert res.status_code == 200
    verif_data = res.json()
    assert verif_data["citizen_verification_status"] == "Assistance Arrived"
    assert verif_data["citizen_verified_at"] is not None
    assert "Boat Bravo" in verif_data["citizen_verification_notes"]
    print(f"  [OK] Citizen response-area verification persisted: 'Assistance Arrived'")

    # [TEST 9] Authority reviews evidence and resolves request
    print("\n[TEST 9] Authority resolves request via POST /api/v1/assistance/{id}/resolve...")
    res = client.post(
        f"/api/v1/assistance/{req_id}/resolve",
        json={"resolution_notes": "All 3 individuals transported to Kankerbagh Community Hall Shelter"},
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["status"] == "Resolved"
    assert res_data["resolved_by_id"] == auth_user.id
    assert res_data["resolved_at"] is not None
    assert "Community Hall Shelter" in res_data["resolution_notes"]
    print(f"  [OK] Request #{req_id} successfully marked 'Resolved' with complete evidence")

    # Cleanup temp actors & test request & warning
    print("\n[CLEANUP] Cleaning Up Temporary Test Records...")
    db.query(AssistanceRequest).filter(AssistanceRequest.id == req_id).delete()
    if warn and warn.identifier == "WARN-API-TEST":
        db.query(ResponseZone).filter(ResponseZone.warning_id == warn.id).delete()
        db.query(Warning).filter(Warning.id == warn.id).delete()
    db.query(User).filter(User.email.in_([temp_auth_email, temp_cit1_email, temp_cit2_email])).delete()
    db.commit()
    db.close()

    print("\n" + "=" * 70)
    print("ALL ASSISTANCE API ENDPOINT TESTS PASSED (100% SUCCESS)!")
    print("=" * 70)

if __name__ == "__main__":
    test_api_assistance_endpoints()
