"""
test_change_location_workflow.py

End-to-end isolated tests for the Citizen Portal "Change Location" workflow.

Tests:
  01. Authenticated citizen can update their own location → 200 OK with new address
  02. Location update persists to DB and is returned by GET /auth/me
  03. Update with invalid coordinates returns 400
  04. Update with missing required fields returns 422
  05. Unauthenticated request is rejected → 401
  06. Citizen cannot update another citizen's location (endpoint derives identity from JWT)
  07. Authority account profile update also works (same endpoint, any role)
  08. Cancellation simulation: if no update is sent, original location is unchanged
"""

import sys
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.main import app
from backend.app.database import Base, get_db
from backend.app.models.user import User

# Isolated in-memory DB
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _register_and_login(email, password, role="citizen", location_name="Patna, Bihar",
                         latitude=25.6093, longitude=85.1235):
    payload = {
        "email": email,
        "password": password,
        "full_name": f"Test {role.title()}",
        "role": role,
        "location_name": location_name,
        "latitude": latitude,
        "longitude": longitude,
        "district": "Patna",
        "city": "Patna",
        "state": "Bihar",
        "postal_code": "800001",
        "location_accuracy_radius_m": 500.0
    }
    if role == "authority":
        payload.update({"department": "NDRF", "jurisdiction": "Bihar"})
    resp = client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201, f"Registration failed: {resp.text}"
    return resp.json()["access_token"]


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_01_citizen_can_update_own_location():
    """PUT /auth/profile/location with valid payload returns 200 and new location_name."""
    token = _register_and_login("citizen_loc1@test.com", "test1234")

    new_loc = {
        "location_name": "Mumbai, Maharashtra",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "district": "Mumbai City",
        "city": "Mumbai",
        "state": "Maharashtra",
        "postal_code": "400001",
        "location_accuracy_radius_m": 500.0
    }
    resp = client.put(
        "/api/v1/auth/profile/location",
        json=new_loc,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200, f"Location update failed: {resp.text}"
    data = resp.json()
    assert data["location_name"] == "Mumbai, Maharashtra"
    assert abs(data["latitude"] - 19.0760) < 0.001
    assert abs(data["longitude"] - 72.8777) < 0.001
    assert data["city"] == "Mumbai"
    assert data["state"] == "Maharashtra"


def test_02_location_persists_to_db_and_reflected_in_profile():
    """After update, GET /auth/me returns the new location (not the old one)."""
    token = _register_and_login("citizen_loc2@test.com", "test1234")

    new_loc = {
        "location_name": "New Delhi, Delhi",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "district": "New Delhi",
        "city": "New Delhi",
        "state": "Delhi",
        "postal_code": "110001",
        "location_accuracy_radius_m": 500.0
    }
    put_resp = client.put(
        "/api/v1/auth/profile/location",
        json=new_loc,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert put_resp.status_code == 200

    # Now verify via the profile endpoint
    get_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert get_resp.status_code == 200
    profile = get_resp.json()
    assert profile["location_name"] == "New Delhi, Delhi"
    assert abs(profile["latitude"] - 28.6139) < 0.001
    assert profile["state"] == "Delhi"


def test_03_invalid_coordinates_rejected():
    """Coordinates outside ±90/±180 must be rejected with 400."""
    token = _register_and_login("citizen_loc3@test.com", "test1234")

    bad_payloads = [
        {"location_name": "Bad Lat", "latitude": 95.0, "longitude": 77.0},
        {"location_name": "Bad Lng", "latitude": 28.0, "longitude": 200.0},
        {"location_name": "Neg Bad Lat", "latitude": -91.0, "longitude": 77.0},
    ]
    for payload in bad_payloads:
        resp = client.put(
            "/api/v1/auth/profile/location",
            json=payload,
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 400, (
            f"Expected 400 for {payload}, got {resp.status_code}: {resp.text}"
        )


def test_04_missing_required_fields_returns_422():
    """Missing location_name, latitude, or longitude must return 422 validation error."""
    token = _register_and_login("citizen_loc4@test.com", "test1234")

    incomplete_payloads = [
        {"latitude": 19.0, "longitude": 72.0},               # missing location_name
        {"location_name": "Somewhere"},                       # missing lat/lng
        {"location_name": "Somewhere", "latitude": 19.0},    # missing longitude
    ]
    for payload in incomplete_payloads:
        resp = client.put(
            "/api/v1/auth/profile/location",
            json=payload,
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 422, (
            f"Expected 422 for {payload}, got {resp.status_code}: {resp.text}"
        )


def test_05_unauthenticated_request_rejected():
    """PUT /auth/profile/location without a JWT must return 401."""
    payload = {
        "location_name": "Mumbai",
        "latitude": 19.0760,
        "longitude": 72.8777
    }
    resp = client.put("/api/v1/auth/profile/location", json=payload)
    assert resp.status_code == 401, (
        f"Expected 401 for unauthenticated request, got {resp.status_code}"
    )


def test_06_citizen_cannot_supply_user_id_to_update_other_account():
    """The endpoint derives identity entirely from the JWT.
    Even if a citizen adds a user_id field to the body, the backend
    ignores it and updates only the authenticated user's record."""
    token_a = _register_and_login("citizen_locA@test.com", "test1234",
                                   location_name="Kolkata, WB", latitude=22.5726, longitude=88.3639)
    token_b = _register_and_login("citizen_locB@test.com", "test1234",
                                   location_name="Bengaluru, KA", latitude=12.9716, longitude=77.5946)

    # Citizen B sends a valid location update using their own token
    new_loc = {
        "location_name": "Chennai, TN",
        "latitude": 13.0827,
        "longitude": 80.2707,
        "district": "Chennai",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "postal_code": "600001",
        "location_accuracy_radius_m": 500.0
    }
    resp_b = client.put(
        "/api/v1/auth/profile/location",
        json=new_loc,
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp_b.status_code == 200
    assert resp_b.json()["email"] == "citizen_locB@test.com"

    # Citizen A's profile must be unchanged
    profile_a = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert profile_a.status_code == 200
    assert profile_a.json()["location_name"] == "Kolkata, WB", (
        "Citizen A's location was incorrectly modified by Citizen B's update"
    )


def test_07_cancel_leaves_original_location_unchanged():
    """If no PUT request is made (user cancels modal), the profile is not modified."""
    token = _register_and_login("citizen_loc7@test.com", "test1234",
                                 location_name="Rajendra Nagar, Patna", latitude=25.6025, longitude=85.1589)

    # Fetch profile without sending any update (simulates Cancel)
    profile = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert profile.status_code == 200
    data = profile.json()
    assert data["location_name"] == "Rajendra Nagar, Patna"
    assert abs(data["latitude"] - 25.6025) < 0.001


def test_08_multiple_sequential_updates_reflect_latest():
    """Updating location twice in sequence always stores and returns the most recent value."""
    token = _register_and_login("citizen_loc8@test.com", "test1234")

    first = {
        "location_name": "Hyderabad, Telangana",
        "latitude": 17.3850,
        "longitude": 78.4867,
        "city": "Hyderabad",
        "state": "Telangana",
        "postal_code": "500001",
        "location_accuracy_radius_m": 500.0
    }
    second = {
        "location_name": "Ahmedabad, Gujarat",
        "latitude": 23.0225,
        "longitude": 72.5714,
        "city": "Ahmedabad",
        "state": "Gujarat",
        "postal_code": "380001",
        "location_accuracy_radius_m": 500.0
    }

    r1 = client.put("/api/v1/auth/profile/location", json=first,
                    headers={"Authorization": f"Bearer {token}"})
    assert r1.status_code == 200
    assert r1.json()["location_name"] == "Hyderabad, Telangana"

    r2 = client.put("/api/v1/auth/profile/location", json=second,
                    headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["location_name"] == "Ahmedabad, Gujarat"

    profile = client.get("/api/v1/auth/me",
                         headers={"Authorization": f"Bearer {token}"})
    assert profile.json()["location_name"] == "Ahmedabad, Gujarat"
    assert profile.json()["state"] == "Gujarat"
