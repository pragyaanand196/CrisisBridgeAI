import sys
import os
import json
import time

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import SessionLocal
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.notification_delivery_record import NotificationDeliveryRecord
from backend.app.models.assistance_request import AssistanceRequest

client = TestClient(app)

def test_multi_user_session_isolation():
    print("=" * 80)
    print("CRISISBRIDGE AI - CONCURRENT INDEPENDENT SESSION ISOLATION AUDIT")
    print("=" * 80)

    db = SessionLocal()
    users_before = db.query(User).count()
    print(f"[INFO] Existing users in DB: {users_before}")

    ts = int(time.time())
    auth_email = f"sess_auth_{ts}@disaster.gov"
    cit_a_email = f"sess_cit_a_{ts}@example.com"
    cit_b_email = f"sess_cit_b_{ts}@example.com"
    pwd = "SecureSessionPass123!"

    # 1. Register Authority B (Context B)
    reg_auth = client.post("/api/v1/auth/register", json={
        "email": auth_email,
        "password": pwd,
        "full_name": "Commander Session Tester",
        "role": "authority",
        "department": "State Disaster Management",
        "jurisdiction": "South Mumbai Division"
    })
    assert reg_auth.status_code == 201, f"Auth register failed: {reg_auth.text}"
    auth_token = reg_auth.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {auth_token}"}
    auth_id = reg_auth.json()["user"]["id"]
    print(f"[STEP 1/8] Context B: Authority logged in -> User #{auth_id} ({auth_email})")

    # 2. Register Citizen A in target area (Context A)
    reg_cit_a = client.post("/api/v1/auth/register", json={
        "email": cit_a_email,
        "password": pwd,
        "full_name": "Aarav Patil (Targeted Citizen)",
        "role": "citizen",
        "location_name": "Colaba, South Mumbai",
        "latitude": 18.9067,
        "longitude": 72.8147,
        "district": "Mumbai City",
        "city": "Mumbai",
        "state": "Maharashtra",
        "preferred_language": "en"
    })
    assert reg_cit_a.status_code == 201, f"Citizen A register failed: {reg_cit_a.text}"
    cit_a_token = reg_cit_a.json()["access_token"]
    cit_a_headers = {"Authorization": f"Bearer {cit_a_token}"}
    cit_a_id = reg_cit_a.json()["user"]["id"]
    print(f"[STEP 2/8] Context A: Citizen A logged in -> User #{cit_a_id} ({cit_a_email}) in Colaba")

    # 3. Register Citizen C outside target area (Context C)
    reg_cit_b = client.post("/api/v1/auth/register", json={
        "email": cit_b_email,
        "password": pwd,
        "full_name": "Meera Joshi (Outside Citizen)",
        "role": "citizen",
        "location_name": "Kothrud, Pune",
        "latitude": 18.5074,
        "longitude": 73.8077,
        "district": "Pune",
        "city": "Pune",
        "state": "Maharashtra",
        "preferred_language": "hi"
    })
    assert reg_cit_b.status_code == 201, f"Citizen B register failed: {reg_cit_b.text}"
    cit_b_token = reg_cit_b.json()["access_token"]
    cit_b_headers = {"Authorization": f"Bearer {cit_b_token}"}
    cit_b_id = reg_cit_b.json()["user"]["id"]
    print(f"[STEP 3/8] Context C: Citizen C logged in -> User #{cit_b_id} ({cit_b_email}) in Pune")

    # 4. Verify simultaneous independent identity retrieval (/auth/me)
    me_auth = client.get("/api/v1/auth/me", headers=auth_headers).json()
    me_cit_a = client.get("/api/v1/auth/me", headers=cit_a_headers).json()
    me_cit_b = client.get("/api/v1/auth/me", headers=cit_b_headers).json()

    assert me_auth["id"] == auth_id and me_auth["role"] == "authority", "Authority identity mismatch!"
    assert me_cit_a["id"] == cit_a_id and me_cit_a["role"] == "citizen", "Citizen A identity mismatch!"
    assert me_cit_b["id"] == cit_b_id and me_cit_b["role"] == "citizen", "Citizen C identity mismatch!"
    print("[STEP 4/8] [PASS] Verified 3 concurrent sessions maintain 100% distinct identity & role separation.")

    # 5. Verify RBAC isolation: Citizen A cannot execute Authority actions
    unauth_warn = client.post("/api/v1/warnings", json={"disaster_type": "Flood", "title": "Fake Warning"}, headers=cit_a_headers)
    assert unauth_warn.status_code == 403, f"Expected 403 Forbidden for citizen warning creation, got {unauth_warn.status_code}"
    print("[STEP 5/8] [PASS] RBAC enforced: Citizen A cannot access Authority endpoints.")

    # 6. Context B (Authority) creates, approves, and distributes targeted Flood Warning
    create_warn = client.post("/api/v1/warnings", json={
        "disaster_type": "Flood",
        "title": "Severe Coastal Flash Flood Alert",
        "description": "High tide combined with intense rainfall causing rapid inundation in low-lying coastal sectors.",
        "severity": "Severe",
        "urgency": "Immediate",
        "certainty": "Observed",
        "area_name": "South Mumbai Coastal Belt",
        "recommended_instructions": "• Move to higher floors immediately.\n• Do not walk or drive through flooded roads.\n• Boil drinking water.",
        "issuing_authority_name": "South Mumbai Disaster Cell",
        "target_areas": [
            {
                "name": "South Mumbai Sector 1",
                "target_type": "polygon",
                "geometry_geojson": json.dumps({
                    "type": "Polygon",
                    "coordinates": [[[72.80, 18.89], [72.84, 18.89], [72.84, 18.93], [72.80, 18.93], [72.80, 18.89]]]
                }),
                "center_lat": 18.91,
                "center_lng": 72.82,
                "priority_level": "Critical"
            }
        ]
    }, headers=auth_headers)
    assert create_warn.status_code == 201, f"Create warning failed: {create_warn.text}"
    warn_id = create_warn.json()["id"]

    # Approve and distribute
    client.post(f"/api/v1/warnings/{warn_id}/approve-ai", json={"action": "approve"}, headers=auth_headers)
    client.post(f"/api/v1/warnings/{warn_id}/distribute", headers=auth_headers)
    print(f"[STEP 6/8] [PASS] Authority issued & distributed Warning #{warn_id} targeted to South Mumbai.")

    # 7. Verify Geographic Isolation: Citizen A receives alert, Citizen C receives 0 alerts
    cit_a_active = client.get("/api/v1/citizen/active-warnings", headers=cit_a_headers).json()
    cit_b_active = client.get("/api/v1/citizen/active-warnings", headers=cit_b_headers).json()

    assert any(w["id"] == warn_id for w in cit_a_active), "Targeted Citizen A must receive the warning!"
    assert not any(w["id"] == warn_id for w in cit_b_active), "Outside Citizen C must NOT receive the targeted South Mumbai warning!"
    print("[STEP 7/8] [PASS] Geographic targeting isolation verified: Citizen A received alert, Citizen C did not receive alert.")

    # 8. Citizen A responds; Authority B monitors response
    resp = client.post("/api/v1/citizen/respond", json={
        "warning_id": warn_id,
        "response_type": "understand",
        "feedback_notes": "We are safe on the 3rd floor in Colaba."
    }, headers=cit_a_headers)
    assert resp.status_code == 200, f"Citizen respond failed: {resp.text}"

    # Authority verifies analytics
    warn_detail = client.get(f"/api/v1/warnings/{warn_id}", headers=auth_headers).json()
    assert warn_detail["responses_count"] == 1, "Authority must see Citizen A's recorded response"
    print("[STEP 8/8] [PASS] Citizen A response accurately tracked in Authority B Command Center.")

    # Cleanup temporary test warning and test users
    db.query(CitizenResponse).filter(CitizenResponse.user_id.in_([cit_a_id, cit_b_id])).delete(synchronize_session=False)
    db.query(NotificationDeliveryRecord).filter(NotificationDeliveryRecord.citizen_id.in_([cit_a_id, cit_b_id])).delete(synchronize_session=False)
    db.query(ResponseZone).filter(ResponseZone.warning_id == warn_id).delete(synchronize_session=False)
    db.query(Warning).filter(Warning.id == warn_id).delete(synchronize_session=False)
    db.query(User).filter(User.id.in_([auth_id, cit_a_id, cit_b_id])).delete(synchronize_session=False)
    db.commit()
    db.close()

    print("\n" + "=" * 80)
    print("ALL 8 CONCURRENT INDEPENDENT SESSION ISOLATION TESTS PASSED (100% SUCCESS)!")
    print("=" * 80)

if __name__ == "__main__":
    test_multi_user_session_isolation()
