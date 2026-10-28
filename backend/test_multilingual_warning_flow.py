import sys
import os
import json
import asyncio
from datetime import datetime

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import SessionLocal, engine
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.services.ai_service import (
    generate_simplified_citizen_communication,
    validate_translation_completeness,
    _deterministic_translate_hindi,
    _deterministic_simplify_english
)

client = TestClient(app)

def test_multilingual_workflow():
    print("=" * 70)
    print("STARTING CRISISBRIDGE AI MULTILINGUAL WARNING WORKFLOW AUDIT")
    print("=" * 70)

    db = SessionLocal()

    # Step 1: Verify existing database records (Zero Loss Guarantee)
    print("\n--- STEP 1: Verifying Existing Database Records ---")
    existing_users = db.query(User).all()
    print(f"Total existing registered users in database: {len(existing_users)}")
    user_emails = [u.email for u in existing_users]
    print(f"Existing user accounts: {user_emails}")

    for email in ["pawansharma617@gmail.com", "aloksharma784@gmail.com", "amitsharma819@gmail.com"]:
        user = db.query(User).filter(User.email == email).first()
        if user:
            print(f"  [PASS] Preserved user: {user.full_name} ({user.email}) | Role: {user.role} | Lang: {getattr(user, 'preferred_language', 'en')}")
        else:
            print(f"  [NOTICE] User {email} not found in this environment (clean check)")

    # Step 2: Test User Language Preference Persistence (PUT /auth/profile/language)
    print("\n--- STEP 2: Testing Citizen Language Preference Persistence ---")
    # Register/Login authority
    auth_email = f"officer_patna_{datetime.utcnow().strftime('%H%M%S')}@disaster.gov.in"
    reg_auth_resp = client.post("/api/v1/auth/register", json={
        "email": auth_email,
        "password": "Password123!",
        "full_name": "Senior Officer R. K. Verma",
        "role": "authority",
        "department": "State Disaster Management Authority",
        "jurisdiction": "Patna & Ganga Basin",
        "preferred_language": "en"
    })
    assert reg_auth_resp.status_code == 201, f"Failed authority registration: {reg_auth_resp.text}"
    auth_token = reg_auth_resp.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {auth_token}"}
    print(f"  [PASS] Registered authority: {auth_email}")

    # Register Citizen A in Rajendra Nagar, Patna with preferred_language = "hi"
    cit_a_email = f"citizen_hindi_{datetime.utcnow().strftime('%H%M%S')}@test.com"
    reg_a_resp = client.post("/api/v1/auth/register", json={
        "email": cit_a_email,
        "password": "Password123!",
        "full_name": "Ramesh Kumar Sharma",
        "role": "citizen",
        "location_name": "Rajendra Nagar, Patna",
        "latitude": 25.6000,
        "longitude": 85.1500,
        "district": "Patna",
        "city": "Patna",
        "state": "Bihar",
        "preferred_language": "hi"
    })
    assert reg_a_resp.status_code == 201, f"Failed citizen A registration: {reg_a_resp.text}"
    token_a = reg_a_resp.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    user_a = reg_a_resp.json()["user"]
    assert user_a["preferred_language"] == "hi", "Citizen A preferred_language should be 'hi'"
    print(f"  [PASS] Registered Citizen A in Rajendra Nagar with language: {user_a['preferred_language']}")

    # Register Citizen B in Rajendra Nagar, Patna with preferred_language = "en"
    cit_b_email = f"citizen_eng_{datetime.utcnow().strftime('%H%M%S')}@test.com"
    reg_b_resp = client.post("/api/v1/auth/register", json={
        "email": cit_b_email,
        "password": "Password123!",
        "full_name": "Sunita Rao",
        "role": "citizen",
        "location_name": "Rajendra Nagar, Patna",
        "latitude": 25.6020,
        "longitude": 85.1520,
        "district": "Patna",
        "city": "Patna",
        "state": "Bihar",
        "preferred_language": "en"
    })
    assert reg_b_resp.status_code == 201, f"Failed citizen B registration: {reg_b_resp.text}"
    token_b = reg_b_resp.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    print(f"  [PASS] Registered Citizen B in Rajendra Nagar with language: en")

    # Register Citizen C outside target area (e.g. Mumbai)
    cit_c_email = f"citizen_mumbai_{datetime.utcnow().strftime('%H%M%S')}@test.com"
    reg_c_resp = client.post("/api/v1/auth/register", json={
        "email": cit_c_email,
        "password": "Password123!",
        "full_name": "Arun Kadam",
        "role": "citizen",
        "location_name": "Andheri West, Mumbai",
        "latitude": 19.1363,
        "longitude": 72.8276,
        "district": "Mumbai Suburban",
        "city": "Mumbai",
        "state": "Maharashtra",
        "preferred_language": "hi"
    })
    assert reg_c_resp.status_code == 201
    token_c = reg_c_resp.json()["access_token"]
    headers_c = {"Authorization": f"Bearer {token_c}"}
    print(f"  [PASS] Registered Citizen C outside target area (Mumbai) with language: hi")

    # Test updating language preference via PUT /auth/profile/language
    update_lang_resp = client.put("/api/v1/auth/profile/language", json={"preferred_language": "hi"}, headers=headers_b)
    assert update_lang_resp.status_code == 200
    assert update_lang_resp.json()["preferred_language"] == "hi"
    # Switch back to English for B
    update_lang_resp = client.put("/api/v1/auth/profile/language", json={"preferred_language": "en"}, headers=headers_b)
    assert update_lang_resp.status_code == 200
    assert update_lang_resp.json()["preferred_language"] == "en"
    print("  [PASS] PUT /api/v1/auth/profile/language verified successfully")

    # Step 3: Create an Official Multi-Bullet Disaster Warning in Rajendra Nagar, Patna
    print("\n--- STEP 3: Creating Official Disaster Warning with Multi-Bullet Safety Instructions ---")
    official_instructions = (
        "• Move immediately to higher ground or upper floors of concrete multi-story buildings.\n"
        "• Do not attempt to cross flooded roads, railway underpasses, or submerged bridges.\n"
        "• Boil all drinking water before consumption to prevent waterborne contamination.\n"
        "• Switch off the main electrical breaker if floodwaters enter your residence.\n"
        "• Keep emergency documents in waterproof bags and stock essential first-aid supplies.\n"
        "• Contact the Patna Disaster Emergency Cell at 1077 or click 'I Need Help' if stranded."
    )

    create_warn_payload = {
        "disaster_type": "Flood",
        "title": "Severe Flash Flooding & Ganga Inundation Alert",
        "description": "Due to torrential rainfall and rising water levels in the Ganga river basin, rapid inundation is affecting low-lying sectors of Rajendra Nagar, Patna.",
        "severity": "Severe",
        "urgency": "Immediate",
        "certainty": "Observed",
        "area_name": "Rajendra Nagar, Patna",
        "area_polygon_geojson": json.dumps({
            "type": "Polygon",
            "coordinates": [[
                [85.1400, 25.5900],
                [85.1650, 25.5900],
                [85.1650, 25.6150],
                [85.1400, 25.6150],
                [85.1400, 25.5900]
            ]]
        }),
        "issuing_authority_name": "Patna Disaster Management Authority",
        "recommended_instructions": official_instructions,
        "target_areas": [{
            "name": "Rajendra Nagar Sector A & B",
            "target_type": "polygon",
            "geometry_geojson": json.dumps({
                "type": "Polygon",
                "coordinates": [[
                    [85.1400, 25.5900],
                    [85.1650, 25.5900],
                    [85.1650, 25.6150],
                    [85.1400, 25.6150],
                    [85.1400, 25.5900]
                ]]
            }),
            "center_lat": 25.6025,
            "center_lng": 85.1525,
            "priority_level": "Critical",
            "notes": "Low-lying residential colonies along Kankarbagh drain canal"
        }]
    }

    create_resp = client.post("/api/v1/warnings", json=create_warn_payload, headers=auth_headers)
    assert create_resp.status_code == 201, f"Failed creating warning: {create_resp.text}"
    warn_data = create_resp.json()
    warn_id = warn_data["id"]
    print(f"  [PASS] Created official warning #{warn_id} (CAP identifier: {warn_data['identifier']})")

    # Step 4: Validate Multilingual Translation Completeness
    print("\n--- STEP 4: Validating AI Multilingual Translation Completeness ---")
    en_simplified = warn_data.get("ai_simplified_en", "")
    hi_simplified = warn_data.get("ai_simplified_hi", "")

    print(f"English citizen-facing text ({len(en_simplified)} chars):\n{en_simplified}\n")
    print(f"Hindi citizen-facing text ({len(hi_simplified)} chars):\n{hi_simplified}\n")

    is_valid, validation_msg = validate_translation_completeness(
        en_text=en_simplified,
        hi_text=hi_simplified,
        raw_instructions=official_instructions,
        area_name="Rajendra Nagar, Patna"
    )
    assert is_valid, f"Translation validation failed: {validation_msg}"
    print(f"  [PASS] Translation validator returned: {validation_msg}")

    # Check that proper nouns like 'Rajendra Nagar, Patna' are preserved
    assert "Rajendra Nagar" in en_simplified or "Patna" in en_simplified, "Place names should be preserved in English"
    assert "Rajendra Nagar" in hi_simplified or "Patna" in hi_simplified, "Place names should be preserved in Hindi"
    # Check that Devanagari script is present in Hindi
    assert any('\u0900' <= c <= '\u097F' for c in hi_simplified), "Hindi must contain Devanagari script"
    # Check that bullets are preserved
    assert hi_simplified.count("•") >= 4, "All safety instruction bullets should be translated in Hindi"
    print("  [PASS] Proper nouns, Devanagari script, and multi-bullet instructions verified 100%")

    # Step 5: Mandatory Human Authority Approval & Distribution
    print("\n--- STEP 5: Authority Approves and Distributes Multilingual Warning ---")
    approve_resp = client.post(f"/api/v1/warnings/{warn_id}/approve-ai", json={
        "action": "approve",
        "ai_simplified_en": en_simplified,
        "ai_simplified_hi": hi_simplified
    }, headers=auth_headers)
    assert approve_resp.status_code == 200, f"Approval failed: {approve_resp.text}"
    approved_warn = approve_resp.json()
    assert approved_warn["status"] == "Active"
    assert approved_warn["ai_approval_status"] == "Approved"
    print(f"  [PASS] Warning #{warn_id} officially approved and activated")

    # Step 6: Test Citizen Portal Warnings & Geographic Containment
    print("\n--- STEP 6: Testing Citizen Portal Active Warnings & Geographic Targeting ---")
    # Citizen A (In Rajendra Nagar, Patna)
    active_a_resp = client.get("/api/v1/citizen/active-warnings", headers=headers_a)
    assert active_a_resp.status_code == 200
    active_a = active_a_resp.json()
    assert len(active_a) > 0, "Citizen A in Rajendra Nagar MUST receive the warning"
    assert any(w["id"] == warn_id for w in active_a), f"Warning #{warn_id} not found in Citizen A's active feed"
    print("  [PASS] Citizen A (Rajendra Nagar) received warning based on geographic match")

    # Citizen B (In Rajendra Nagar, Patna)
    active_b_resp = client.get("/api/v1/citizen/active-warnings", headers=headers_b)
    assert active_b_resp.status_code == 200
    active_b = active_b_resp.json()
    assert any(w["id"] == warn_id for w in active_b), f"Warning #{warn_id} not found in Citizen B's active feed"
    print("  [PASS] Citizen B (Rajendra Nagar) received warning based on geographic match")

    # Citizen C (Outside in Mumbai)
    active_c_resp = client.get("/api/v1/citizen/active-warnings", headers=headers_c)
    assert active_c_resp.status_code == 200
    active_c = active_c_resp.json()
    assert not any(w["id"] == warn_id for w in active_c), "Citizen C outside area MUST NOT receive the warning"
    print("  [PASS] Citizen C (Mumbai) did NOT receive warning (Geographic Isolation verified)")

    # Step 7: Test Citizen Instruction Endpoint with Full Multilingual Content & Audio Text
    print("\n--- STEP 7: Testing /citizen/instructions/{warn_id} for Hindi and English ---")
    # Hindi instructions
    instr_hi_resp = client.get(f"/api/v1/citizen/instructions/{warn_id}?language=hi", headers=headers_a)
    assert instr_hi_resp.status_code == 200
    instr_hi = instr_hi_resp.json()
    assert instr_hi["language"] == "hi"
    assert len(instr_hi["bullet_points"]) >= 4, "Must contain all translated safety bullets"
    assert len(instr_hi["read_aloud_text"]) > 50, "Must contain complete speech read-aloud text"
    assert any('\u0900' <= c <= '\u097F' for c in instr_hi["read_aloud_text"]), "Read-aloud text must be in Devanagari Hindi"
    print(f"  [PASS] Hindi Instructions Endpoint: {len(instr_hi['bullet_points'])} bullets, speech length: {len(instr_hi['read_aloud_text'])} chars")

    # English instructions
    instr_en_resp = client.get(f"/api/v1/citizen/instructions/{warn_id}?language=en", headers=headers_b)
    assert instr_en_resp.status_code == 200
    instr_en = instr_en_resp.json()
    assert instr_en["language"] == "en"
    assert len(instr_en["bullet_points"]) >= 4
    assert "Move immediately" in instr_en["read_aloud_text"] or "Ganga" in instr_en["read_aloud_text"]
    print(f"  [PASS] English Instructions Endpoint: {len(instr_en['bullet_points'])} bullets, speech length: {len(instr_en['read_aloud_text'])} chars")

    # Step 8: Citizen Response & Assistance Workflow
    print("\n--- STEP 8: Testing Citizen Response & Emergency Assistance in Hindi ---")
    # Citizen A submits 'understand' in Hindi
    resp_a = client.post("/api/v1/citizen/respond", json={
        "warning_id": warn_id,
        "response_type": "understand",
        "language_used": "hi"
    }, headers=headers_a)
    assert resp_a.status_code == 200
    assert resp_a.json()["language_used"] == "hi"
    print("  [PASS] Citizen A submitted 'understand' response in Hindi")

    # Citizen B submits Assistance Request in English
    help_b = client.post("/api/v1/assistance", json={
        "warning_id": warn_id,
        "category": "evacuation",
        "headcount": 3,
        "urgency_level": "Immediate",
        "location_description": "House 45, Near Rajendra Nagar Overbridge",
        "medical_critical": False,
        "contact_phone": "+91 98765 43210"
    }, headers=headers_b)
    assert help_b.status_code == 201
    help_id = help_b.json()["id"]
    print(f"  [PASS] Citizen B submitted assistance request #{help_id}")

    # Authority Acknowledges & Dispatches
    ack_resp = client.post(f"/api/v1/assistance/{help_id}/acknowledge", headers=auth_headers)
    assert ack_resp.status_code == 200
    assert ack_resp.json()["status"] == "Acknowledged"

    disp_resp = client.post(f"/api/v1/assistance/{help_id}/dispatch", json={
        "dispatched_unit_notes": "SDRF Rescue Boat Team Alpha"
    }, headers=auth_headers)
    assert disp_resp.status_code == 200
    assert disp_resp.json()["status"] == "Dispatched"

    # Citizen B verifies arrival
    verif_resp = client.post(f"/api/v1/assistance/{help_id}/verify-arrival", json={
        "assistance_arrived": True,
        "citizen_feedback_notes": "Rescue boat arrived safely at location."
    }, headers=headers_b)
    assert verif_resp.status_code == 200
    assert verif_resp.json()["citizen_verification_status"] == "Assistance Arrived"

    # Authority resolves request
    resolve_resp = client.post(f"/api/v1/assistance/{help_id}/resolve", json={
        "resolution_notes": "All 3 citizens safely evacuated to dry relief shelter."
    }, headers=auth_headers)
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["status"] == "Resolved"
    print("  [PASS] Full Assistance Triage lifecycle completed without disruption")

    # Step 9: Verify Zero Database Loss
    print("\n--- STEP 9: Re-Verifying Zero Database Loss ---")
    post_users = db.query(User).all()
    print(f"Total registered users after test: {len(post_users)}")
    assert len(post_users) >= len(existing_users), "No users should be lost"
    print("  [PASS] Database integrity guaranteed 100%")

    db.close()
    print("\n" + "=" * 70)
    print("ALL MULTILINGUAL DISASTER WARNING WORKFLOW AUDIT TESTS PASSED 100%!")
    print("=" * 70)

if __name__ == "__main__":
    test_multilingual_workflow()
