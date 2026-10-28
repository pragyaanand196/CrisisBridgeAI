import sys
import os
import json
import time

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)
BASE_URL = "/api/v1"

def test_live_end_to_end_system():
    print("=" * 80)
    print("END-TO-END CRISISBRIDGE AI WORKFLOW AUDIT")
    print("=" * 80)

    # 1. Health check
    h = client.get("/health")
    assert h.status_code == 200
    print(f"[1/10] Server Health: {h.json()}")

    ts = int(time.time())
    auth_email = f"e2e_authority_{ts}@disaster.gov"
    cit_email = f"e2e_citizen_{ts}@example.com"
    pwd = "SecurePassword123!"

    # 2. Register and Login Authority
    reg_auth = client.post(f"{BASE_URL}/auth/register", json={
        "email": auth_email,
        "password": pwd,
        "full_name": "Commander E2E Inspector",
        "role": "authority",
        "department": "State Emergency Response",
        "jurisdiction": "Western Maharashtra Region"
    })
    assert reg_auth.status_code == 201, f"Auth reg failed: {reg_auth.text}"
    auth_token = reg_auth.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {auth_token}"}
    print(f"[2/10] Registered and logged in Authority: {auth_email}")

    # Register Citizen in target area (South Mumbai)
    reg_cit = client.post(f"{BASE_URL}/auth/register", json={
        "email": cit_email,
        "password": pwd,
        "full_name": "Rohan Deshmukh",
        "role": "citizen",
        "location_name": "South Mumbai Coastal Zone",
        "latitude": 18.9220,
        "longitude": 72.8347,
        "district": "Mumbai City",
        "city": "Mumbai",
        "state": "Maharashtra",
        "preferred_language": "hi"
    })
    assert reg_cit.status_code == 201, f"Citizen reg failed: {reg_cit.text}"
    cit_token = reg_cit.json()["access_token"]
    cit_headers = {"Authorization": f"Bearer {cit_token}"}
    print(f"       Registered Citizen in target zone: {cit_email} (Prefers: Hindi)")

    # 3. Create a severe earthquake disaster warning
    create_payload = {
        "disaster_type": "Earthquake",
        "title": "Severe Magnitude 6.5 Earthquake Tremor Warning",
        "description": "Strong seismic tremor recorded along regional fault line. Structural instability and falling debris reported.",
        "severity": "Severe",
        "urgency": "Immediate",
        "certainty": "Observed",
        "area_name": "South Mumbai Coastal District",
        "recommended_instructions": "• Drop, Cover, and Hold On under heavy furniture.\n• Evacuate damaged multi-story structures using stairs only.\n• Do not use elevators.\n• Shut off gas valves and main electrical supply.\n• Move to open parks or designated assembly areas.\n• Call 1077 for emergency search and rescue.",
        "issuing_authority_name": "State Disaster Management Authority",
        "target_areas": [
            {
                "name": "South Mumbai Earthquake Impact Zone",
                "target_type": "radius",
                "geometry_geojson": json.dumps({
                    "type": "Polygon",
                    "coordinates": [[[72.80, 18.90], [72.85, 18.90], [72.85, 18.95], [72.80, 18.95], [72.80, 18.90]]]
                }),
                "center_lat": 18.925,
                "center_lng": 72.825,
                "radius_km": 5.0,
                "priority_level": "Critical"
            }
        ]
    }

    warn_resp = client.post(f"{BASE_URL}/warnings", json=create_payload, headers=auth_headers)
    assert warn_resp.status_code == 201, f"Warning creation failed: {warn_resp.text}"
    warn = warn_resp.json()
    warn_id = warn["id"]
    print(f"[3/10] Warning Created #{warn_id} (CAP ID: {warn['identifier']})")
    print(f"       RAG Status: {warn['rag_status']} | Grounding Score: {warn['rag_grounding_score']}")
    
    rag_sources = json.loads(warn["rag_sources_json"])
    assert len(rag_sources) >= 1
    print(f"       Retrieved SOP: '{rag_sources[0]['doc_title']}' (Score: {rag_sources[0]['score']:.2f})")

    # 4. Human Authority Approval & Activation
    appr_resp = client.post(f"{BASE_URL}/warnings/{warn_id}/approve-ai", json={"action": "approve"}, headers=auth_headers)
    assert appr_resp.status_code == 200, f"Approval failed: {appr_resp.text}"
    appr_data = appr_resp.json()
    assert appr_data["status"] == "Active"
    print(f"[4/10] Human Authority Approval recorded & Warning Activated.")

    # 5. Distribute Warning
    dist_resp = client.post(f"{BASE_URL}/warnings/{warn_id}/distribute", headers=auth_headers)
    assert dist_resp.status_code == 200, f"Distribution failed: {dist_resp.text}"
    print(f"[5/10] Warning distributed to targeted response zones.")

    # 6. Citizen Active Warnings & Instruction Audio Playback Checks
    act_resp = client.get(f"{BASE_URL}/citizen/active-warnings", headers=cit_headers)
    assert act_resp.status_code == 200
    active_warnings = act_resp.json()
    assert any(w["id"] == warn_id for w in active_warnings), "Citizen did not receive warning in target area!"
    print(f"[6/10] Citizen Active Warnings: Found {len(active_warnings)} active warning(s).")

    # Check English Instructions & Audio Text
    en_inst = client.get(f"{BASE_URL}/citizen/instructions/{warn_id}?language=en")
    assert en_inst.status_code == 200
    en_data = en_inst.json()
    assert len(en_data["read_aloud_text"]) > 100
    assert len(en_data["bullet_points"]) >= 3
    print(f"       [EN Audio] {len(en_data['read_aloud_text'])} characters for Web Speech TTS.")

    # Check Hindi Instructions & Audio Text
    hi_inst = client.get(f"{BASE_URL}/citizen/instructions/{warn_id}?language=hi")
    assert hi_inst.status_code == 200
    hi_data = hi_inst.json()
    assert len(hi_data["read_aloud_text"]) > 100
    assert len(hi_data["bullet_points"]) >= 3
    print(f"       [HI Audio] {len(hi_data['read_aloud_text'])} characters (Devanagari) for Web Speech TTS.")

    # 8. Citizen Feedback Submission
    resp_payload = {
        "warning_id": warn_id,
        "response_type": "understand",
        "feedback_notes": "We have evacuated to the community football ground and are safe.",
        "delivery_channel": "Web",
        "language_used": "hi"
    }
    fb_resp = client.post(f"{BASE_URL}/citizen/respond", json=resp_payload, headers=cit_headers)
    assert fb_resp.status_code == 200
    print("[8/10] Citizen submitted feedback: 'understand' & safe.")

    # 9. Assistance Request Lifecycle
    asst_payload = {
        "warning_id": warn_id,
        "category": "evacuation",
        "urgency_level": "Critical",
        "headcount": 2,
        "location_description": "Building B, Ground Floor courtyard",
        "latitude": 18.925,
        "longitude": 72.825,
        "contact_phone": "+91-9876543210",
        "special_notes": "Elderly person with minor head injury from falling plaster"
    }
    asst_resp = client.post(f"{BASE_URL}/assistance", json=asst_payload, headers=cit_headers)
    assert asst_resp.status_code == 201
    asst_id = asst_resp.json()["id"]
    print(f"[9/10] Emergency Assistance Request #{asst_id} created.")

    # Authority triage: acknowledge -> dispatch
    ack_resp = client.post(f"{BASE_URL}/assistance/{asst_id}/acknowledge", headers=auth_headers)
    assert ack_resp.status_code == 200, f"Acknowledge failed: {ack_resp.text}"
    disp_resp = client.post(f"{BASE_URL}/assistance/{asst_id}/dispatch", json={"dispatched_unit_notes": "NDRF Ambulance Unit 4"}, headers=auth_headers)
    assert disp_resp.status_code == 200, f"Dispatch failed: {disp_resp.text}"

    # Citizen confirms arrival
    arr_resp = client.post(f"{BASE_URL}/assistance/{asst_id}/verify-arrival", json={"assistance_arrived": True, "citizen_feedback_notes": "First aid team has reached us safely."}, headers=cit_headers)
    assert arr_resp.status_code == 200, f"Verify arrival failed: {arr_resp.text}"

    # Authority resolves
    res_resp = client.post(f"{BASE_URL}/assistance/{asst_id}/resolve", json={"resolution_notes": "First aid provided, transferred to district hospital."}, headers=auth_headers)
    assert res_resp.status_code == 200, f"Resolve failed: {res_resp.text}"
    print("       Assistance triage: Acknowledged -> Dispatched -> Arrived -> Resolved.")

    # 10. Verify Authority Warning Detail Analytics
    detail_resp = client.get(f"{BASE_URL}/warnings/{warn_id}", headers=auth_headers)
    assert detail_resp.status_code == 200, f"Detail failed: {detail_resp.status_code} - {detail_resp.text}"
    detail = detail_resp.json()
    assert detail["rag_sources_json"] is not None
    print(f"[10/10] Authority Warning Detail Analytics Verified: Responses = {detail.get('responses_count', 0)}, RAG Status = {detail.get('rag_status')}.")

    print("=" * 80)
    print("ALL 10 END-TO-END CRISISBRIDGE AI WORKFLOW TESTS PASSED SUCCESSFULLY!")
    print("=" * 80)

if __name__ == "__main__":
    test_live_end_to_end_system()
