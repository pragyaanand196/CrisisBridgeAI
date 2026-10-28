import sys
import os
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
from backend.app.models.warning import Warning
from backend.app.models.response_zone import ResponseZone
from backend.app.models.resource import Resource
from backend.app.services.auth_service import create_access_token, get_password_hash

# Isolated in-memory database with StaticPool so all connections share the tables
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


@pytest.fixture(scope="module", autouse=True)
def setup_test_data():
    """Seeds authority, citizen in zone, citizen outside zone, response zones, and resources."""
    db = TestingSessionLocal()

    # 1. Authority User
    authority_user = User(
        email="authority_resource_test@crisisbridge.gov.in",
        hashed_password=get_password_hash("Password123!"),
        full_name="Cmdr. Ramesh Verma",
        role="authority",
        department="Disaster Response Authority",
        jurisdiction="Patna Central"
    )
    db.add(authority_user)

    # 2. Citizen in Response Zone (Patna coordinates: 25.6100, 85.1100)
    citizen_user = User(
        email="citizen_patna_test@gmail.com",
        hashed_password=get_password_hash("Password123!"),
        full_name="Pawan Sharma",
        role="citizen",
        latitude=25.6100,
        longitude=85.1100,
        location_name="Bailey Road, Patna"
    )
    db.add(citizen_user)

    # 3. Citizen outside Response Zone (Delhi coordinates: 28.6139, 77.2090)
    citizen_outside = User(
        email="citizen_delhi_test@gmail.com",
        hashed_password=get_password_hash("Password123!"),
        full_name="Arpit Kumar",
        role="citizen",
        latitude=28.6139,
        longitude=77.2090,
        location_name="Connaught Place, New Delhi"
    )
    db.add(citizen_outside)
    db.commit()

    # 4. Disaster Warning & Active Response Zone
    warn = Warning(
        identifier="WARN-TEST-CAP-001",
        title="Urban Flash Flood Warning",
        disaster_type="Flood",
        description="Severe waterlogging on Bailey Road corridor",
        severity="Severe",
        urgency="Immediate",
        certainty="Observed",
        status="Active",
        area_name="Bailey Road, Patna",
        recommended_instructions="Evacuate to designated emergency relief shelters.",
        issuing_authority_id=authority_user.id,
        issuing_authority_name=authority_user.full_name
    )
    db.add(warn)
    db.commit()

    zone_a = ResponseZone(
        warning_id=warn.id,
        name="Bailey Road, Patna (Response Zone)",
        code="RZ-A",
        polygon_geojson='{"type":"Polygon","coordinates":[[[85.05,25.55],[85.18,25.55],[85.18,25.68],[85.05,25.68],[85.05,25.55]]]}',
        center_lat=25.6100,
        center_lng=85.1100,
        risk_level="High"
    )
    db.add(zone_a)
    db.commit()

    # 5. Emergency Resource assigned to Zone A (Initial capacity: 0 / 100, Open)
    resource = Resource(
        response_zone_id=zone_a.id,
        name="Bailey Road Community Relief Shelter",
        resource_type="Shelter",
        address="45 East Riverway Blvd, Bailey Road",
        latitude=25.6039,
        longitude=85.1065,
        contact_phone="+919876543210",
        capacity_total=100,
        capacity_occupied=0,
        status="Open",
        verified_by_authority=True
    )
    db.add(resource)

    # 6. Unassigned resource (internal, not in any zone)
    unassigned_resource = Resource(
        response_zone_id=None,
        name="Reserve Logistics Depot",
        resource_type="Food/Water Distribution",
        address="Industrial Area, Sector 4",
        latitude=25.5900,
        longitude=85.0800,
        contact_phone="+919876543299",
        capacity_total=500,
        capacity_occupied=50,
        status="Open",
        verified_by_authority=True
    )
    db.add(unassigned_resource)
    db.commit()
    db.close()


def get_token_headers(email_or_id, role: str) -> dict:
    db = TestingSessionLocal()
    if isinstance(email_or_id, int) or (isinstance(email_or_id, str) and email_or_id.isdigit()):
        user = db.query(User).filter(User.id == int(email_or_id)).first()
    else:
        user = db.query(User).filter(User.email == str(email_or_id)).first()
    db.close()
    sub_val = str(user.id) if user else str(email_or_id)
    token = create_access_token({"sub": sub_val, "role": role})
    return {"Authorization": f"Bearer {token}"}


def test_01_authority_can_update_capacity_from_0_to_50():
    """Changing occupancy from 0 to 50 persists the value and keeps status OPEN (50 < 100)."""
    headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")
    
    resp = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 50}, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["id"] == 1
    assert data["capacity_occupied"] == 50
    assert data["capacity_total"] == 100
    assert data["status"] == "Open"

    # Verify directly from DB
    db = TestingSessionLocal()
    r = db.query(Resource).filter(Resource.id == 1).first()
    assert r.capacity_occupied == 50
    assert r.status == "Open"
    db.close()


def test_02_both_portals_display_50_occupants_and_open():
    """Authority and citizen in response zone both see 50 / 100 occupants and OPEN."""
    auth_headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")
    cit_headers = get_token_headers("citizen_patna_test@gmail.com", "citizen")

    # Authority portal check
    auth_resp = client.get("/api/v1/resources", headers=auth_headers)
    assert auth_resp.status_code == 200
    auth_res = next(r for r in auth_resp.json() if r["id"] == 1)
    assert auth_res["capacity_occupied"] == 50
    assert auth_res["capacity_total"] == 100
    assert auth_res["status"] == "Open"

    # Citizen portal check
    cit_resp = client.get("/api/v1/resources", headers=cit_headers)
    assert cit_resp.status_code == 200
    cit_res = next(r for r in cit_resp.json() if r["id"] == 1)
    assert cit_res["capacity_occupied"] == 50
    assert cit_res["capacity_total"] == 100
    assert cit_res["status"] == "Open"


def test_03_authority_changes_occupancy_to_100_automatically_closes_resource():
    """Changing occupancy to 100 automatically transitions status to CLOSED (100 == 100)."""
    headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")

    resp = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 100}, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["capacity_occupied"] == 100
    assert data["status"] == "Closed"


def test_04_both_portals_display_100_occupants_and_closed():
    """Both authority and citizen portals display 100 / 100 occupants — CLOSED."""
    auth_headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")
    cit_headers = get_token_headers("citizen_patna_test@gmail.com", "citizen")

    # Authority portal sees CLOSED
    auth_resp = client.get("/api/v1/resources", headers=auth_headers)
    auth_res = next(r for r in auth_resp.json() if r["id"] == 1)
    assert auth_res["capacity_occupied"] == 100
    assert auth_res["status"] == "Closed"

    # Citizen portal sees CLOSED (displayed with 100/100, not missing or leaked!)
    cit_resp = client.get("/api/v1/resources", headers=cit_headers)
    cit_res = next(r for r in cit_resp.json() if r["id"] == 1)
    assert cit_res["capacity_occupied"] == 100
    assert cit_res["status"] == "Closed"


def test_05_reducing_occupancy_from_100_to_50_automatically_reopens_resource():
    """When occupancy is reduced below total capacity, resource automatically transitions back to OPEN."""
    headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")

    resp = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 50}, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["capacity_occupied"] == 50
    assert data["status"] == "Open"

    # Verify both portals see OPEN again
    cit_headers = get_token_headers("citizen_patna_test@gmail.com", "citizen")
    cit_resp = client.get("/api/v1/resources", headers=cit_headers)
    cit_res = next(r for r in cit_resp.json() if r["id"] == 1)
    assert cit_res["capacity_occupied"] == 50
    assert cit_res["status"] == "Open"


def test_06_setting_occupancy_to_0_displays_open():
    """Changing occupancy to 0 displays 0 / 100 occupants and OPEN."""
    headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")

    resp = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 0}, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["capacity_occupied"] == 0
    assert data["status"] == "Open"


def test_07_validation_rejects_invalid_capacity_inputs():
    """Negative numbers, decimals, non-numeric values, and numbers > capacity_total are rejected."""
    headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")

    # 1. Negative occupancy
    resp_neg = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": -1}, headers=headers)
    assert resp_neg.status_code == 422
    assert "negative" in resp_neg.text.lower()

    # 2. Exceeding total capacity (101 > 100)
    resp_over = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 101}, headers=headers)
    assert resp_over.status_code == 422
    assert "exceed" in resp_over.text.lower()

    # 3. Decimal number (e.g. 25.5)
    resp_dec = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 25.5}, headers=headers)
    assert resp_dec.status_code == 422
    assert "decimal" in resp_dec.text.lower() or "integer" in resp_dec.text.lower() or "whole number" in resp_dec.text.lower()

    # 4. Non-numeric string
    resp_str = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": "abc"}, headers=headers)
    assert resp_str.status_code == 422

    # 5. Empty payload
    resp_empty = client.patch("/api/v1/resources/1/capacity", json={}, headers=headers)
    assert resp_empty.status_code == 422

    # Verify that the value in DB was preserved (did not save invalid value)
    db = TestingSessionLocal()
    r = db.query(Resource).filter(Resource.id == 1).first()
    assert r.capacity_occupied == 0
    assert r.status == "Open"
    db.close()


def test_08_unchanged_value_returns_cleanly_without_duplicate_update():
    """Saving an unchanged occupancy count returns successfully without error or change."""
    headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")

    resp = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 0}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["capacity_occupied"] == 0


def test_09_citizen_cannot_access_authority_capacity_endpoint():
    """Citizen role is forbidden (403) from updating resource capacity."""
    cit_headers = get_token_headers("citizen_patna_test@gmail.com", "citizen")

    resp = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 25}, headers=cit_headers)
    assert resp.status_code == 403
    assert "authorit" in resp.text.lower() or "restricted" in resp.text.lower()


def test_10_unauthenticated_cannot_access_capacity_endpoint():
    """Unauthenticated request is rejected (401)."""
    resp = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 25})
    assert resp.status_code == 401


def test_11_resource_not_found_returns_404():
    """Non-existent resource ID returns 404."""
    headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")

    resp = client.patch("/api/v1/resources/9999/capacity", json={"capacity_occupied": 25}, headers=headers)
    assert resp.status_code == 404
    assert "not found" in resp.text.lower()


def test_12_citizen_zone_isolation_and_unassigned_protection():
    """
    - Citizen outside the zone (Delhi) sees 0 resources for Patna.
    - Unassigned resource (Reserve Logistics Depot) is never leaked to any citizen.
    """
    delhi_headers = get_token_headers("citizen_delhi_test@gmail.com", "citizen")
    patna_headers = get_token_headers("citizen_patna_test@gmail.com", "citizen")

    # Delhi citizen sees 0 resources
    delhi_resp = client.get("/api/v1/resources", headers=delhi_headers)
    assert delhi_resp.status_code == 200
    assert len(delhi_resp.json()) == 0

    # Patna citizen sees only the Bailey Road shelter, NOT the unassigned depot
    patna_resp = client.get("/api/v1/resources", headers=patna_headers)
    assert patna_resp.status_code == 200
    ids = [r["id"] for r in patna_resp.json()]
    assert 1 in ids
    assert 2 not in ids  # Unassigned depot with ID 2 is not in list


def test_13_preserves_administrative_deactivation():
    """If an authority administratively deactivates a resource, capacity change does not reopen it."""
    headers = get_token_headers("authority_resource_test@crisisbridge.gov.in", "authority")
    db = TestingSessionLocal()
    r = db.query(Resource).filter(Resource.id == 1).first()
    r.status = "Deactivated"
    db.commit()
    db.close()

    # Update capacity to 40
    resp = client.patch("/api/v1/resources/1/capacity", json={"capacity_occupied": 40}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["capacity_occupied"] == 40
    # Status remains Deactivated, not reopened to Open
    assert data["status"] == "Deactivated"

    # Reset back to Open
    db = TestingSessionLocal()
    r = db.query(Resource).filter(Resource.id == 1).first()
    r.status = "Open"
    db.commit()
    db.close()
