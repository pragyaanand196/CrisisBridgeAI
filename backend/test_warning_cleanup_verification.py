import sys
import os
import json
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.main import app
from backend.app.database import SessionLocal
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.audit_log import AuditLog
from backend.app.services.auth_service import verify_password

client = TestClient(app)


def test_01_users_table_and_credentials_preserved():
    """Verify that all 31 user accounts exist, with unchanged IDs, roles, and password hashes."""
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.id).all()
        assert len(users) == 31, f"Expected 31 users, found {len(users)}"

        # Verify key baseline accounts
        admin = db.query(User).filter(User.email == "admin@crisisbridge.gov").first()
        assert admin is not None
        assert admin.role == "administrator"
        assert verify_password("AdminPass123!", admin.hashed_password)

        officer = db.query(User).filter(User.email == "officer@ndrf.gov").first()
        assert officer is not None
        assert officer.role == "authority"
        assert verify_password("OfficerPass123!", officer.hashed_password)

        citizen = db.query(User).filter(User.email == "citizen@example.com").first()
        assert citizen is not None
        assert citizen.role == "citizen"
        assert verify_password("CitizenPass123!", citizen.hashed_password)
        assert citizen.location_name == "Riverside Sector 4, Mumbai"

        # Verify registered citizen accounts exist with intact profiles
        pawan = db.query(User).filter(User.email == "pawan819@gmail.com").first()
        assert pawan is not None
        assert pawan.role == "citizen"

        ramesh = db.query(User).filter(User.email == "ramesh619@gmail.com").first()
        assert ramesh is not None
        assert ramesh.role == "citizen"

        amit = db.query(User).filter(User.email == "amitsharma617@gmail.com").first()
        assert amit is not None
        assert amit.role == "authority"

    finally:
        db.close()


def test_02_auth_login_endpoints_work():
    """Verify authority and citizen can authenticate via HTTP POST /api/v1/auth/login."""
    # Authority login
    auth_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "officer@ndrf.gov", "password": "OfficerPass123!"}
    )
    assert auth_resp.status_code == 200, auth_resp.text
    auth_data = auth_resp.json()
    assert "access_token" in auth_data
    assert auth_data["user"]["role"] == "authority"

    # Citizen login
    cit_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@example.com", "password": "CitizenPass123!"}
    )
    assert cit_resp.status_code == 200, cit_resp.text
    cit_data = cit_resp.json()
    assert "access_token" in cit_data
    assert cit_data["user"]["role"] == "citizen"


def test_03_zero_active_warnings_in_apis():
    """Confirm active warning APIs return genuine empty state (no deleted warnings reappear)."""
    # Citizen active warnings
    cit_login = client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@example.com", "password": "CitizenPass123!"}
    )
    cit_token = cit_login.json()["access_token"]
    cit_headers = {"Authorization": f"Bearer {cit_token}"}

    cit_warns_resp = client.get("/api/v1/citizen/active-warnings", headers=cit_headers)
    assert cit_warns_resp.status_code == 200
    assert cit_warns_resp.json() == [], f"Expected empty list, got: {cit_warns_resp.json()}"

    # Authority warnings list
    auth_login = client.post(
        "/api/v1/auth/login",
        json={"email": "officer@ndrf.gov", "password": "OfficerPass123!"}
    )
    auth_token = auth_login.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {auth_token}"}

    auth_warns_resp = client.get("/api/v1/warnings", headers=auth_headers)
    assert auth_warns_resp.status_code == 200
    assert auth_warns_resp.json() == [], f"Expected empty list, got: {auth_warns_resp.json()}"

    # Overview analytics shows 0 active warnings
    overview_resp = client.get("/api/v1/analytics/overview")
    assert overview_resp.status_code == 200
    ov_data = overview_resp.json()
    assert ov_data["active_warnings_count"] == 0
    assert ov_data["total_response_zones"] == 0
    assert ov_data["pending_assistance_requests"] == 0


def test_04_audit_logs_are_preserved():
    """Confirm historical audit logs remain and include the WARNINGS_CLEARED event."""
    db = SessionLocal()
    try:
        logs = db.query(AuditLog).all()
        assert len(logs) >= 116, f"Expected at least 116 audit logs, found {len(logs)}"

        cleanup_log = (
            db.query(AuditLog)
            .filter(AuditLog.event_type == "WARNINGS_CLEARED")
            .first()
        )
        assert cleanup_log is not None
        assert "Controlled maintenance" in cleanup_log.summary
    finally:
        db.close()


def test_05_admin_maintenance_endpoint_rbac():
    """Verify the admin maintenance endpoint is protected by RBAC and requires confirmation."""
    # Citizen attempt -> 403 Forbidden
    cit_login = client.post(
        "/api/v1/auth/login",
        json={"email": "citizen@example.com", "password": "CitizenPass123!"}
    )
    cit_headers = {"Authorization": f"Bearer {cit_login.json()['access_token']}"}

    cit_maint_resp = client.get("/api/v1/admin/maintenance/inspection", headers=cit_headers)
    assert cit_maint_resp.status_code == 403

    # Admin attempt without confirm=True -> 400 Bad Request
    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crisisbridge.gov", "password": "AdminPass123!"}
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    admin_insp_resp = client.get("/api/v1/admin/maintenance/inspection", headers=admin_headers)
    assert admin_insp_resp.status_code == 200
    insp_data = admin_insp_resp.json()
    assert insp_data["to_remove"]["warnings_count"] == 0
    assert insp_data["to_preserve"]["users_count"] == 31

    # Calling clear-warnings without confirm -> 400
    no_confirm_resp = client.post(
        "/api/v1/admin/maintenance/clear-warnings",
        json={"confirm": False},
        headers=admin_headers
    )
    assert no_confirm_resp.status_code == 400


def test_06_create_warning_workflow_operates_normally():
    """Verify that after cleanup, authorities can still create, approve, and distribute new warnings."""
    auth_login = client.post(
        "/api/v1/auth/login",
        json={"email": "officer@ndrf.gov", "password": "OfficerPass123!"}
    )
    auth_token = auth_login.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {auth_token}"}

    sample_polygon = json.dumps({
        "type": "Polygon",
        "coordinates": [[[72.80, 18.90], [72.85, 18.90], [72.85, 18.95], [72.80, 18.95], [72.80, 18.90]]]
    })

    create_payload = {
        "disaster_type": "Flood",
        "title": "Fresh Post-Cleanup River Flood Advisory",
        "description": "Rising water levels near riverbank; residents advised to move to higher ground.",
        "severity": "Moderate",
        "urgency": "Expected",
        "certainty": "Likely",
        "area_name": "Riverside Sector 4, Mumbai",
        "recommended_instructions": "Move valuables to upper floors. Avoid low-lying roads.",
        "issuing_authority_name": "NDRF Disaster Command",
        "target_areas": [
            {
                "name": "Riverside Sector 4 High Ground",
                "target_type": "radius",
                "geometry_geojson": sample_polygon,
                "center_lat": 18.922,
                "center_lng": 72.834,
                "radius_km": 15.0,
                "priority_level": "High"
            }
        ]
    }

    warn_id = None
    try:
        # 1. Create a fresh warning
        create_resp = client.post("/api/v1/warnings", json=create_payload, headers=auth_headers)
        assert create_resp.status_code == 201, create_resp.text
        created_warn = create_resp.json()
        warn_id = created_warn["id"]
        assert created_warn["status"] in ["Draft", "Under Review"]

        # 2. Approve warning
        approve_resp = client.post(
            f"/api/v1/warnings/{warn_id}/approve-ai",
            json={"action": "approve"},
            headers=auth_headers
        )
        assert approve_resp.status_code == 200, approve_resp.text
        assert approve_resp.json()["ai_approval_status"] == "Approved"

        # 3. Distribute warning
        dist_resp = client.post(
            f"/api/v1/warnings/{warn_id}/distribute",
            headers=auth_headers
        )
        assert dist_resp.status_code == 200, dist_resp.text
        assert dist_resp.json()["status"] == "Active"

        # 4. Verify warning now appears in list
        list_resp = client.get("/api/v1/warnings", headers=auth_headers)
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 1
        assert list_resp.json()[0]["id"] == warn_id

    finally:
        # 5. Clean up the test warning using our safe maintenance service so DB remains pristine
        admin_login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@crisisbridge.gov", "password": "AdminPass123!"}
        )
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
        clean_resp = client.post(
            "/api/v1/admin/maintenance/clear-warnings",
            json={"confirm": True},
            headers=admin_headers
        )
        assert clean_resp.status_code == 200
        assert clean_resp.json()["user_verification"]["total_accounts"] == 31

    # Final check: warnings list is empty again
    final_list = client.get("/api/v1/warnings", headers=auth_headers)
    assert final_list.status_code == 200
    assert final_list.json() == []
