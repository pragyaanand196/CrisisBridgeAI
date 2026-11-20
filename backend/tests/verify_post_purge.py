import sqlite3
import os
import requests
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_verification():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "crisisbridge.db"))
    print(f"=== 1. DIRECT DATABASE VERIFICATION ===")
    print(f"Database: {db_path}")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    tables = [
        "users",
        "warnings",
        "warning_target_areas",
        "response_zones",
        "notification_delivery_records",
        "citizen_responses",
        "assistance_requests",
        "authority_notifications",
        "verification_reports",
        "resources",
        "system_configs",
        "audit_logs"
    ]

    for t in tables:
        cnt = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  Table '{t}': {cnt} records")
        assert cnt == 0, f"Expected 0 records in '{t}', found {cnt}"

    fk_violations = cur.execute("PRAGMA foreign_key_check;").fetchall()
    print(f"  Foreign Key Violations: {len(fk_violations)}")
    assert len(fk_violations) == 0, f"FK violations: {fk_violations}"
    conn.close()
    print("  [PASS] Database is completely empty of user accounts and warnings with 0 FK violations.\n")

    print("=== 2. API ENDPOINTS & EMPTY STATE VERIFICATION ===")
    # 2.1 Warnings endpoint
    r = requests.get(f"{BASE_URL}/warnings")
    print(f"  GET /warnings: status={r.status_code}, data={r.json()}")
    assert r.status_code == 200 and r.json() == []

    # 2.2 Active warnings endpoint
    r = requests.get(f"{BASE_URL}/warnings?status_filter=Active")
    print(f"  GET /warnings?status_filter=Active: status={r.status_code}, data={r.json()}")
    assert r.status_code == 200 and r.json() == []

    # 2.2b Citizen active warnings endpoint
    r = requests.get(f"{BASE_URL}/citizen/active-warnings")
    print(f"  GET /citizen/active-warnings: status={r.status_code}, data={r.json()}")
    assert r.status_code == 200 and r.json() == []

    # 2.3 Reports list
    r = requests.get(f"{BASE_URL}/reports")
    print(f"  GET /reports: status={r.status_code}, count={len(r.json())}")
    assert r.status_code == 200 and r.json() == []

    # 2.4 Assistance requests (protected by require_authority)
    r = requests.get(f"{BASE_URL}/assistance")
    print(f"  GET /assistance (Unauthenticated): status={r.status_code}")
    assert r.status_code == 401

    # 2.5 Verification portal reports
    r = requests.get(f"{BASE_URL}/verification/reports")
    print(f"  GET /verification/reports: status={r.status_code}, count={len(r.json())}")
    assert r.status_code == 200 and r.json() == []

    # 2.6 Resources
    r = requests.get(f"{BASE_URL}/resources")
    print(f"  GET /resources: status={r.status_code}, count={len(r.json())}")
    assert r.status_code == 200 and r.json() == []

    # 2.7 Overview metrics
    r = requests.get(f"{BASE_URL}/analytics/overview")
    print(f"  GET /analytics/overview: status={r.status_code}, data={r.json()}")
    assert r.status_code == 200
    ov = r.json()
    assert ov.get("active_warnings_count") == 0
    assert ov.get("total_response_zones") == 0
    assert ov.get("active_gaps_count") == 0
    assert ov.get("pending_assistance_requests") == 0

    # 2.8 Zone health matrix
    r = requests.get(f"{BASE_URL}/analytics/zone-health-matrix")
    print(f"  GET /analytics/zone-health-matrix: status={r.status_code}, total_zones={r.json().get('total_zones')}")
    assert r.status_code == 200
    hm = r.json()
    assert hm.get("total_zones") == 0
    assert hm.get("active_gap_alerts") == []
    print("  [PASS] All public and dashboard endpoints return clean empty states.\n")

    print("=== 3. NEW USER REGISTRATION & AUTHENTICATION WORKFLOW VERIFICATION ===")
    # 3.1 Citizen registration
    citizen_payload = {
        "email": "fresh_citizen_verifier@crisisbridge.gov",
        "password": "CitizenSecurePass123!",
        "full_name": "Aarav Sharma",
        "role": "citizen",
        "location_name": "Connaught Place, New Delhi",
        "latitude": 28.6315,
        "longitude": 77.2167,
        "district": "New Delhi",
        "city": "New Delhi",
        "state": "Delhi",
        "postal_code": "110001",
        "preferred_language": "en"
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=citizen_payload)
    print(f"  POST /auth/register (Citizen): status={r.status_code}")
    assert r.status_code == 201, f"Citizen registration failed: {r.text}"
    cit_data = r.json()
    assert "access_token" in cit_data
    assert cit_data["user"]["email"] == citizen_payload["email"]
    assert cit_data["user"]["role"] == "citizen"

    # 3.2 Citizen login
    login_payload = {
        "email": "fresh_citizen_verifier@crisisbridge.gov",
        "password": "CitizenSecurePass123!"
    }
    r = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
    print(f"  POST /auth/login (Citizen): status={r.status_code}")
    assert r.status_code == 200
    cit_token = r.json()["access_token"]

    # 3.3 Authenticated request using citizen token
    headers = {"Authorization": f"Bearer {cit_token}"}
    r = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    print(f"  GET /auth/me (Citizen): status={r.status_code}, user={r.json().get('full_name')}")
    assert r.status_code == 200
    assert r.json()["email"] == citizen_payload["email"]

    # 3.4 Authority registration
    authority_payload = {
        "email": "fresh_authority_verifier@crisisbridge.gov",
        "password": "AuthoritySecurePass123!",
        "full_name": "Capt. Vikram Rathore",
        "role": "authority",
        "department": "National Disaster Response Force (NDRF)",
        "preferred_language": "en"
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=authority_payload)
    print(f"  POST /auth/register (Authority): status={r.status_code}")
    assert r.status_code == 201, f"Authority registration failed: {r.text}"
    auth_data = r.json()
    assert "access_token" in auth_data
    assert auth_data["user"]["role"] == "authority"

    # 3.5 Authority login
    auth_login_payload = {
        "email": "fresh_authority_verifier@crisisbridge.gov",
        "password": "AuthoritySecurePass123!"
    }
    r = requests.post(f"{BASE_URL}/auth/login", json=auth_login_payload)
    print(f"  POST /auth/login (Authority): status={r.status_code}")
    assert r.status_code == 200
    auth_token = r.json()["access_token"]

    # 3.6 Authenticated authority notifications and assistance endpoints
    auth_headers = {"Authorization": f"Bearer {auth_token}"}
    r = requests.get(f"{BASE_URL}/notifications", headers=auth_headers)
    print(f"  GET /notifications (Authority): status={r.status_code}, count={len(r.json())}")
    assert r.status_code == 200 and r.json() == []

    r = requests.get(f"{BASE_URL}/assistance", headers=auth_headers)
    print(f"  GET /assistance (Authority authenticated): status={r.status_code}, count={len(r.json())}")
    assert r.status_code == 200 and r.json() == []

    print("  [PASS] Registration, authentication, token issuance, and protected endpoints fully functional.\n")

    # 3.7 Cleanup the temporary verification users to maintain pure 0-user state
    print("=== 4. CLEANUP OF VERIFICATION ACCOUNTS ===")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("DELETE FROM audit_logs;")
    cur.execute("DELETE FROM users WHERE email IN ('fresh_citizen_verifier@crisisbridge.gov', 'fresh_authority_verifier@crisisbridge.gov');")
    conn.commit()

    final_users_count = cur.execute("SELECT COUNT(*) FROM users;").fetchone()[0]
    final_warnings_count = cur.execute("SELECT COUNT(*) FROM warnings;").fetchone()[0]
    final_audit_count = cur.execute("SELECT COUNT(*) FROM audit_logs;").fetchone()[0]
    conn.close()

    print(f"  Final users in DB: {final_users_count}")
    print(f"  Final warnings in DB: {final_warnings_count}")
    print(f"  Final audit logs in DB: {final_audit_count}")
    assert final_users_count == 0
    assert final_warnings_count == 0
    assert final_audit_count == 0
    print("  [PASS] Verification accounts cleared. Database is in 100% clean state.")

if __name__ == "__main__":
    test_verification()
