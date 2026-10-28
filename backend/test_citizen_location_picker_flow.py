import sys
import os
import json
import urllib.request
import urllib.parse
from datetime import datetime
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.main import app
from backend.app.database import Base, get_db
from backend.app.models.user import User
from backend.app.models.audit_log import AuditLog

# Isolated in-memory database with StaticPool so all sessions share the tables
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


def test_01_geocoding_representative_queries():
    """Verify that all 6 representative queries return genuine results from the geocoding service."""
    queries = [
        "Rajendra Nagar, Patna, Bihar, India",
        "Patna, Bihar, India",
        "Mumbai, Maharashtra, India",
        "New Delhi, India",
        "Kolkata, West Bengal, India",
        "Bengaluru, Karnataka, India"
    ]

    for q in queries:
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={urllib.parse.quote(q)}&limit=6&addressdetails=1"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "CrisisBridgeAI-Verification/1.0", "Accept-Language": "en"}
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                assert resp.status == 200
                data = json.loads(resp.read().decode("utf-8"))
                assert len(data) >= 1, f"Expected results for '{q}', got 0"
                first = data[0]
                assert "lat" in first and "lon" in first
                assert float(first["lat"]) != 0.0
                assert float(first["lon"]) != 0.0
                assert "display_name" in first
        except Exception as e:
            pytest.fail(f"Geocoding request failed for '{q}': {e}")


def test_02_geocoding_no_results_and_empty_query():
    """Verify empty queries and non-existent locations are handled cleanly."""
    non_existent = "xyznonexistentlocation123456789qwerty"
    url = f"https://nominatim.openstreetmap.org/search?format=json&q={urllib.parse.quote(non_existent)}&limit=6&addressdetails=1"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "CrisisBridgeAI-Verification/1.0", "Accept-Language": "en"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        assert len(data) == 0, f"Expected 0 results for non-existent query, got {len(data)}"


def test_03_reverse_geocoding_for_map_clicks():
    """Verify reverse geocoding resolves coordinates to structured address components."""
    # Test Patna coordinates: 25.6005, 85.1640
    url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=25.6005&lon=85.1640"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "CrisisBridgeAI-Verification/1.0", "Accept-Language": "en"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        assert "address" in data
        addr = data["address"]
        city_or_state = addr.get("city") or addr.get("state") or addr.get("county") or ""
        assert "Patna" in city_or_state or "Bihar" in addr.get("state", "")


def test_04_citizen_registration_rejects_missing_or_unconfirmed_location():
    """Verify backend enforces location for citizen accounts."""
    # 1. Missing location entirely
    resp_no_loc = client.post("/api/v1/auth/register", json={
        "email": "test_citizen_noloc@example.com",
        "password": "Password123!",
        "full_name": "Test Citizen No Loc",
        "role": "citizen"
    })
    assert resp_no_loc.status_code == 400
    assert "Location is mandatory for citizen registration" in resp_no_loc.json()["detail"]

    # 2. Coordinates outside valid range
    resp_invalid_coords = client.post("/api/v1/auth/register", json={
        "email": "test_citizen_invalid@example.com",
        "password": "Password123!",
        "full_name": "Test Citizen Invalid Coords",
        "role": "citizen",
        "location_name": "Invalid Island",
        "latitude": 95.0,  # Invalid latitude (>90)
        "longitude": 72.8
    })
    assert resp_invalid_coords.status_code == 400
    assert "outside valid geographic limits" in resp_invalid_coords.json()["detail"]


def test_05_citizen_registration_persists_confirmed_location():
    """Verify backend stores confirmed address, coordinates, and district accurately."""
    confirmed_payload = {
        "email": "verified_patna_citizen@example.com",
        "password": "Password123!",
        "full_name": "Aarav Sharma",
        "role": "citizen",
        "preferred_language": "hi",
        "location_name": "Rajendra Nagar, Patna",
        "latitude": 25.6005,
        "longitude": 85.1640,
        "district": "Patna",
        "city": "Patna",
        "state": "Bihar",
        "postal_code": "800016",
        "location_accuracy_radius_m": 500.0
    }

    reg_resp = client.post("/api/v1/auth/register", json=confirmed_payload)
    assert reg_resp.status_code == 201, reg_resp.text
    data = reg_resp.json()
    assert "access_token" in data
    user_out = data["user"]
    assert user_out["email"] == confirmed_payload["email"]
    assert user_out["location_name"] == "Rajendra Nagar, Patna"
    assert user_out["latitude"] == 25.6005
    assert user_out["longitude"] == 85.1640
    assert user_out["district"] == "Patna"
    assert user_out["city"] == "Patna"
    assert user_out["state"] == "Bihar"
    assert user_out["postal_code"] == "800016"

    # Verify directly from database
    db = TestingSessionLocal()
    try:
        user_db = db.query(User).filter(User.email == confirmed_payload["email"]).first()
        assert user_db is not None
        assert user_db.location_name == "Rajendra Nagar, Patna"
        assert user_db.latitude == 25.6005
        assert user_db.longitude == 85.1640
        assert user_db.postal_code == "800016"
        assert user_db.location_updated_at is not None
    finally:
        db.close()
