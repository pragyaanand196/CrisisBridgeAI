import sys
import requests
import json
import sqlite3
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_BACKEND_URL = "http://127.0.0.1:8000"
API_URL = "http://127.0.0.1:8000/api/v1"
FRONTEND_URL = "http://localhost:5173"

def main():
    print("=== FINAL CITIZEN PORTAL RUNTIME VERIFICATION ===")

    # 1. Verify frontend assets & bundle
    print("\n[1] Verifying frontend static assets & bundle...")
    img_resp = requests.get(f"{FRONTEND_URL}/flood-rescue-convoy.jpg")
    print(f"  GET /flood-rescue-convoy.jpg -> Status {img_resp.status_code}, Length {len(img_resp.content)} bytes, Content-Type: {img_resp.headers.get('content-type')}")
    assert img_resp.status_code == 200, "Background image asset flood-rescue-convoy.jpg failed to load!"
    assert len(img_resp.content) > 100000, "Background image size is too small!"

    html_resp = requests.get(FRONTEND_URL)
    print(f"  GET / -> Status {html_resp.status_code}, Length {len(html_resp.content)} bytes")
    assert html_resp.status_code == 200
    assert "Playfair Display" in html_resp.text, "Google font Playfair Display link missing in index.html"

    # 2. Verify backend health
    print("\n[2] Verifying backend health...")
    health_resp = requests.get(f"{ROOT_BACKEND_URL}/health")
    print(f"  GET /health -> Status {health_resp.status_code}, Body: {health_resp.text}")
    assert health_resp.status_code == 200

    # Clean pre-existing test users and warnings if any
    for p in ["crisisbridge.db", "../crisisbridge.db"]:
        if os.path.exists(p):
            conn = sqlite3.connect(p)
            cur = conn.cursor()
            existing_tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            for t in ["warnings", "warning_target_areas", "response_zones", "notification_delivery_records", "authority_notifications", "citizen_responses", "assistance_requests", "audit_logs"]:
                if t in existing_tables:
                    cur.execute(f"DELETE FROM {t}")
            if "users" in existing_tables:
                cur.execute("DELETE FROM users WHERE email IN ('bailey.citizen@safety.gov.in', 'cmd.officer@safety.gov.in')")
            conn.commit()
            conn.close()

    # 3. Test Citizen Registration with location 'Bailey Road, Patna'
    print("\n[3] Testing Citizen Registration with 'Bailey Road, Patna'...")
    cit_payload = {
        "email": "bailey.citizen@safety.gov.in",
        "password": "Password123!",
        "full_name": "Pawan Sharma",
        "phone_number": "+919876543210",
        "role": "citizen",
        "location_name": "Bailey Road, Patna",
        "latitude": 25.6100,
        "longitude": 85.1100,
        "district": "Patna",
        "city": "Patna",
        "state": "Bihar",
        "postal_code": "800001",
        "preferred_language": "en"
    }
    r_cit = requests.post(f"{API_URL}/auth/register", json=cit_payload)
    print(f"  POST /auth/register -> Status {r_cit.status_code}")
    assert r_cit.status_code in (200, 201), f"Citizen reg failed: {r_cit.text}"
    cit_token = r_cit.json().get("access_token")
    cit_id = r_cit.json().get("user", {}).get("id")
    cit_headers = {"Authorization": f"Bearer {cit_token}"}
    print(f"  Citizen registered: ID {cit_id}, Name: {r_cit.json().get('user', {}).get('full_name')}, Location: {r_cit.json().get('user', {}).get('location_name')}")

    # 4. Empty State Verification
    print("\n[4] Verifying Citizen Warnings Empty State...")
    warn_resp = requests.get(f"{API_URL}/citizen/active-warnings", headers=cit_headers)
    print(f"  GET /citizen/active-warnings -> Status {warn_resp.status_code}, count: {len(warn_resp.json())}")
    assert warn_resp.status_code == 200
    assert len(warn_resp.json()) == 0, "Expected empty warnings list"

    # 5. Populated State Verification: Create, Approve & Distribute Warning
    print("\n[5] Verifying Active Warning Populated State...")
    auth_payload = {
        "email": "cmd.officer@safety.gov.in",
        "password": "Password123!",
        "full_name": "Command Officer",
        "phone_number": "+919111111111",
        "role": "authority",
        "department": "National Disaster Response Force (NDRF)",
        "badge_number": "NDRF-PATNA-01"
    }
    r_auth = requests.post(f"{API_URL}/auth/register", json=auth_payload)
    assert r_auth.status_code in (200, 201), f"Auth reg failed: {r_auth.text}"
    auth_token = r_auth.json().get("access_token")
    auth_id = r_auth.json().get("user", {}).get("id")
    auth_headers = {"Authorization": f"Bearer {auth_token}"}

    geojson_str = json.dumps({
        "type": "Polygon",
        "coordinates": [
            [
                [85.0, 25.5],
                [85.3, 25.5],
                [85.3, 25.7],
                [85.0, 25.7],
                [85.0, 25.5]
            ]
        ]
    })
    warn_payload = {
        "title": "Severe Flash Flood Warning - Patna Urban Sector",
        "description": "Rising water levels along Ganga river inundating low-lying residential sectors.",
        "disaster_type": "Flood",
        "severity": "Extreme",
        "urgency": "Immediate",
        "certainty": "Observed",
        "area_name": "Patna Urban",
        "recommended_instructions": "Move to designated shelter floors immediately. Turn off gas and electrical mains.",
        "issuing_authority_name": "National Disaster Response Force (NDRF)",
        "target_areas": [
            {
                "name": "Patna Urban",
                "target_type": "Circle",
                "geometry_geojson": geojson_str,
                "center_lat": 25.6100,
                "center_lng": 85.1100,
                "radius_km": 15.0,
                "priority_level": "Immediate"
            }
        ]
    }
    r_warn = requests.post(f"{API_URL}/warnings", json=warn_payload, headers=auth_headers)
    assert r_warn.status_code in (200, 201), f"Create warning failed: {r_warn.text}"
    warning_id = r_warn.json().get("id")
    print(f"  Warning created: ID {warning_id}")

    r_app = requests.post(f"{API_URL}/warnings/{warning_id}/approve-ai", json={"action": "approve"}, headers=auth_headers)
    assert r_app.status_code == 200

    r_dist = requests.post(f"{API_URL}/warnings/{warning_id}/distribute", headers=auth_headers)
    assert r_dist.status_code == 200
    print(f"  Warning #{warning_id} distributed.")

    r_cit_warns = requests.get(f"{API_URL}/citizen/active-warnings", headers=cit_headers)
    assert r_cit_warns.status_code == 200
    cit_list = r_cit_warns.json()
    print(f"  Citizen active warnings count: {len(cit_list)}")
    assert len(cit_list) == 1, "Citizen should have received 1 targeted warning!"
    print(f"  Warning Title: {cit_list[0]['title']}, Severity: {cit_list[0]['severity']}")

    # 6. Verify Authority Dashboard API integrity
    print("\n[6] Verifying Authority Dashboard APIs remain intact...")
    r_matrix = requests.get(f"{API_URL}/analytics/zone-health-matrix", headers=auth_headers)
    print(f"  GET /analytics/zone-health-matrix -> Status {r_matrix.status_code}")
    assert r_matrix.status_code == 200

    r_overview = requests.get(f"{API_URL}/analytics/overview", headers=auth_headers)
    print(f"  GET /analytics/overview -> Status {r_overview.status_code}")
    assert r_overview.status_code == 200

    # 7. Clean up all test records
    print("\n[7] Cleaning up test records to preserve pristine database state...")
    for p in ["crisisbridge.db", "../crisisbridge.db"]:
        if os.path.exists(p):
            conn = sqlite3.connect(p)
            cur = conn.cursor()
            existing_tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            for t in ["warnings", "warning_target_areas", "response_zones", "notification_delivery_records", "authority_notifications", "citizen_responses", "assistance_requests", "audit_logs"]:
                if t in existing_tables:
                    cur.execute(f"DELETE FROM {t}")
            if "users" in existing_tables:
                cur.execute("DELETE FROM users WHERE email IN ('bailey.citizen@safety.gov.in', 'cmd.officer@safety.gov.in')")
            conn.commit()
            u_cnt = cur.execute("SELECT count(*) FROM users").fetchone()[0] if "users" in existing_tables else 0
            w_cnt = cur.execute("SELECT count(*) FROM warnings").fetchone()[0] if "warnings" in existing_tables else 0
            conn.close()
            print(f"  DB at {p} verified: users={u_cnt}, warnings={w_cnt}")

    print("\n[✔] ALL VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
