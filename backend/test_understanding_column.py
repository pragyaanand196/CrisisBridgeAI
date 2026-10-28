import os
import sys
import json
import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import Base, SessionLocal
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.warning_target_area import WarningTargetArea
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.notification_delivery_record import NotificationDeliveryRecord
from backend.app.services.auth_service import get_password_hash
from backend.app.services.geo_service import (
    compute_zone_eligible_understanding,
    circle_to_polygon_geojson
)
from backend.app.services.analytics_service import compute_zone_metrics

# ── Isolated In-Memory Database for Unit & Business Logic Tests ────────────────

@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()

def create_sample_warning_and_zone(db, center_lat=19.0760, center_lng=72.8777, radius_km=5.0):
    """Creates a standard warning, radius target area, and matching response zone."""
    polygon_geojson = circle_to_polygon_geojson(center_lat, center_lng, radius_km)
    
    warning = Warning(
        identifier="CB-WARN-TEST-001",
        version=1,
        disaster_type="Cyclone",
        title="Cyclone Alert",
        description="Severe cyclonic winds expected.",
        severity="Severe",
        urgency="Immediate",
        certainty="Observed",
        area_name="Mumbai Central Sector",
        area_polygon_geojson=polygon_geojson,
        recommended_instructions="Move to safe shelter immediately.",
        issuing_authority_name="Disaster Management Authority",
        issuing_authority_id=1,
        status="Active",
        ai_approval_status="Approved",
        distributed_at=datetime.utcnow()
    )
    db.add(warning)
    db.commit()
    db.refresh(warning)

    target_area = WarningTargetArea(
        warning_id=warning.id,
        warning_version=warning.version,
        name="Mumbai Central Sector Area",
        target_type="radius",
        geometry_geojson=polygon_geojson,
        center_lat=center_lat,
        center_lng=center_lng,
        radius_km=radius_km,
        priority_level="Critical"
    )
    db.add(target_area)

    zone = ResponseZone(
        warning_id=warning.id,
        name="Mumbai Central Response Zone",
        code="RZ-A",
        polygon_geojson=polygon_geojson,
        center_lat=center_lat,
        center_lng=center_lng,
        estimated_population=25000,
        risk_level="High",
        situation_status="Stable"
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)

    return warning, zone


# ── TEST SUITE ────────────────────────────────────────────────────────────────

def test_01_seventeen_eligible_citizens_eight_understanding(test_db):
    """Case 1: 17 eligible citizens with 8 understanding confirmations displays 8/17 (approx 47.1%)."""
    warning, zone = create_sample_warning_and_zone(test_db)

    # Register 17 citizens inside the zone (around center 19.0760, 72.8777)
    citizens = []
    for i in range(17):
        c = User(
            email=f"cit_zone_{i}@example.com",
            hashed_password=get_password_hash("Pass123!"),
            full_name=f"Citizen {i}",
            role="citizen",
            latitude=19.0760 + (i * 0.001), # Well within 5km radius
            longitude=72.8777 + (i * 0.001),
            location_name=f"Sector Street {i}"
        )
        test_db.add(c)
        citizens.append(c)
    test_db.commit()

    # 8 citizens submit "understand" response
    for i in range(8):
        resp = CitizenResponse(
            warning_id=warning.id,
            warning_version=warning.version,
            response_zone_id=zone.id,
            user_id=citizens[i].id,
            response_type="understand"
        )
        test_db.add(resp)
    test_db.commit()

    res = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res["eligible_citizens_count"] == 17, f"Expected 17, got {res['eligible_citizens_count']}"
    assert res["understanding_confirmed_count"] == 8, f"Expected 8, got {res['understanding_confirmed_count']}"

    pct = (res["understanding_confirmed_count"] / res["eligible_citizens_count"]) * 100
    assert round(pct, 1) == 47.1, f"Expected 47.1%, got {round(pct, 1)}%"


def test_02_newly_registered_eligible_citizen_changes_denominator(test_db):
    """Case 2: A newly registered eligible citizen changes 8/17 to 8/18."""
    warning, zone = create_sample_warning_and_zone(test_db)

    # 17 existing citizens
    citizens = []
    for i in range(17):
        c = User(
            email=f"citizen_{i}@example.com",
            hashed_password=get_password_hash("Pass123!"),
            full_name=f"Citizen {i}",
            role="citizen",
            latitude=19.0760 + (i * 0.001),
            longitude=72.8777 + (i * 0.001),
            location_name=f"Street {i}"
        )
        test_db.add(c)
        citizens.append(c)
    test_db.commit()

    for i in range(8):
        test_db.add(CitizenResponse(
            warning_id=warning.id,
            warning_version=warning.version,
            response_zone_id=zone.id,
            user_id=citizens[i].id,
            response_type="understand"
        ))
    test_db.commit()

    # New citizen registers inside the zone
    new_citizen = User(
        email="new_arrival@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="New Resident",
        role="citizen",
        latitude=19.0770,
        longitude=72.8780,
        location_name="New Apartment Building"
    )
    test_db.add(new_citizen)
    test_db.commit()

    res = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res["eligible_citizens_count"] == 18, f"Expected denominator 18, got {res['eligible_citizens_count']}"
    assert res["understanding_confirmed_count"] == 8, f"Expected numerator 8, got {res['understanding_confirmed_count']}"


def test_03_citizen_confirms_understanding_changes_numerator(test_db):
    """Case 3: That new citizen then confirms understanding and the result changes to 9/18."""
    warning, zone = create_sample_warning_and_zone(test_db)

    citizens = []
    for i in range(17):
        c = User(
            email=f"cit_{i}@example.com",
            hashed_password=get_password_hash("Pass123!"),
            full_name=f"Citizen {i}",
            role="citizen",
            latitude=19.0760 + (i * 0.001),
            longitude=72.8777 + (i * 0.001),
            location_name=f"Street {i}"
        )
        test_db.add(c)
        citizens.append(c)
    test_db.commit()

    for i in range(8):
        test_db.add(CitizenResponse(
            warning_id=warning.id,
            warning_version=warning.version,
            response_zone_id=zone.id,
            user_id=citizens[i].id,
            response_type="understand"
        ))
    test_db.commit()

    # 18th citizen registers
    new_citizen = User(
        email="citizen_18@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Citizen 18",
        role="citizen",
        latitude=19.0770,
        longitude=72.8780,
        location_name="New Street"
    )
    test_db.add(new_citizen)
    test_db.commit()

    # Citizen 18 confirms understanding
    test_db.add(CitizenResponse(
        warning_id=warning.id,
        warning_version=warning.version,
        response_zone_id=zone.id,
        user_id=new_citizen.id,
        response_type="understand"
    ))
    test_db.commit()

    res = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res["eligible_citizens_count"] == 18, f"Expected 18, got {res['eligible_citizens_count']}"
    assert res["understanding_confirmed_count"] == 9, f"Expected 9, got {res['understanding_confirmed_count']}"
    pct = (res["understanding_confirmed_count"] / res["eligible_citizens_count"]) * 100
    assert pct == 50.0


def test_04_citizen_outside_zone_does_not_change_denominator(test_db):
    """Case 4: A citizen outside the target zone does not change the denominator."""
    warning, zone = create_sample_warning_and_zone(test_db)

    # 5 citizens inside zone
    for i in range(5):
        test_db.add(User(
            email=f"inside_{i}@example.com",
            hashed_password=get_password_hash("Pass123!"),
            full_name=f"Inside Citizen {i}",
            role="citizen",
            latitude=19.0760,
            longitude=72.8777
        ))
    test_db.commit()

    # Register citizens far away (e.g., Delhi, Pune, Kolkata)
    test_db.add(User(
        email="pune_citizen@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Pune Resident",
        role="citizen",
        latitude=18.5204,
        longitude=73.8567
    ))
    test_db.add(User(
        email="delhi_citizen@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Delhi Resident",
        role="citizen",
        latitude=28.6139,
        longitude=77.2090
    ))
    test_db.commit()

    res = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res["eligible_citizens_count"] == 5, f"Expected 5, got {res['eligible_citizens_count']}"


def test_05_authority_account_is_not_counted(test_db):
    """Case 5: Authority accounts within the zone are NOT counted in denominator."""
    warning, zone = create_sample_warning_and_zone(test_db)

    # 3 citizens in zone
    for i in range(3):
        test_db.add(User(
            email=f"cit_{i}@example.com",
            hashed_password=get_password_hash("Pass123!"),
            full_name=f"Citizen {i}",
            role="citizen",
            latitude=19.0760,
            longitude=72.8777
        ))
    
    # 2 authority accounts located at the exact same coordinates
    test_db.add(User(
        email="officer_in_zone@disaster.gov",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Cmdr. Operations",
        role="authority",
        latitude=19.0760,
        longitude=72.8777
    ))
    test_db.add(User(
        email="admin_in_zone@crisisbridge.gov",
        hashed_password=get_password_hash("Pass123!"),
        full_name="System Admin",
        role="administrator",
        latitude=19.0760,
        longitude=72.8777
    ))
    test_db.commit()

    res = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res["eligible_citizens_count"] == 3, f"Expected 3 (authorities excluded), got {res['eligible_citizens_count']}"


def test_06_duplicate_responses_count_only_once(test_db):
    """Case 6: Duplicate responses from one citizen count only once (no inflation)."""
    warning, zone = create_sample_warning_and_zone(test_db)

    cit = User(
        email="active_responder@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Active Responder",
        role="citizen",
        latitude=19.0760,
        longitude=72.8777
    )
    test_db.add(cit)
    test_db.commit()

    # Citizen clicks "I Understand" 5 times (rapid clicks / retries)
    for _ in range(5):
        test_db.add(CitizenResponse(
            warning_id=warning.id,
            warning_version=warning.version,
            response_zone_id=zone.id,
            user_id=cit.id,
            response_type="understand"
        ))
    test_db.commit()

    res = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res["eligible_citizens_count"] == 1
    assert res["understanding_confirmed_count"] == 1, f"Expected 1, got {res['understanding_confirmed_count']}"


def test_07_citizen_with_no_response_remains_in_denominator(test_db):
    """Case 7: A citizen with no response remains in denominator (0/N and 0% confirmed)."""
    warning, zone = create_sample_warning_and_zone(test_db)

    for i in range(4):
        test_db.add(User(
            email=f"silent_{i}@example.com",
            hashed_password=get_password_hash("Pass123!"),
            full_name=f"Silent Citizen {i}",
            role="citizen",
            latitude=19.0760,
            longitude=72.8777
        ))
    test_db.commit()

    # Zero responses submitted
    res = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res["eligible_citizens_count"] == 4
    assert res["understanding_confirmed_count"] == 0


def test_08_dont_understand_or_help_not_counted_as_understanding(test_db):
    """Case 8: 'dont_understand', 'need_help', 'not_in_area' are NOT counted as understanding."""
    warning, zone = create_sample_warning_and_zone(test_db)

    citizens = []
    for i in range(4):
        c = User(
            email=f"cit_types_{i}@example.com",
            hashed_password=get_password_hash("Pass123!"),
            full_name=f"Citizen {i}",
            role="citizen",
            latitude=19.0760,
            longitude=72.8777
        )
        test_db.add(c)
        citizens.append(c)
    test_db.commit()

    # Citizen 0: understand
    test_db.add(CitizenResponse(warning_id=warning.id, warning_version=warning.version, response_zone_id=zone.id, user_id=citizens[0].id, response_type="understand"))
    # Citizen 1: dont_understand
    test_db.add(CitizenResponse(warning_id=warning.id, warning_version=warning.version, response_zone_id=zone.id, user_id=citizens[1].id, response_type="dont_understand"))
    # Citizen 2: need_help
    test_db.add(CitizenResponse(warning_id=warning.id, warning_version=warning.version, response_zone_id=zone.id, user_id=citizens[2].id, response_type="need_help"))
    # Citizen 3: not_in_area
    test_db.add(CitizenResponse(warning_id=warning.id, warning_version=warning.version, response_zone_id=zone.id, user_id=citizens[3].id, response_type="not_in_area"))
    test_db.commit()

    res = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res["eligible_citizens_count"] == 4
    assert res["understanding_confirmed_count"] == 1, f"Expected 1, got {res['understanding_confirmed_count']}"

    # Now Citizen 0 changes response to "need_help"
    test_db.add(CitizenResponse(
        warning_id=warning.id,
        warning_version=warning.version,
        response_zone_id=zone.id,
        user_id=citizens[0].id,
        response_type="need_help",
        updated_at=datetime.utcnow()
    ))
    test_db.commit()

    res_after = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res_after["eligible_citizens_count"] == 4
    assert res_after["understanding_confirmed_count"] == 0, f"Expected 0 after update, got {res_after['understanding_confirmed_count']}"


def test_09_citizen_location_change_updates_denominator(test_db):
    """Case 9: A citizen moving into or out of zone updates the denominator correctly."""
    warning, zone = create_sample_warning_and_zone(test_db)

    # Citizen starts inside zone
    c = User(
        email="moving_citizen@example.com",
        hashed_password=get_password_hash("Pass123!"),
        full_name="Moving Citizen",
        role="citizen",
        latitude=19.0760,
        longitude=72.8777
    )
    test_db.add(c)
    test_db.commit()

    # Confirms understanding
    test_db.add(CitizenResponse(
        warning_id=warning.id,
        warning_version=warning.version,
        response_zone_id=zone.id,
        user_id=c.id,
        response_type="understand"
    ))
    test_db.commit()

    res_in = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res_in["eligible_citizens_count"] == 1
    assert res_in["understanding_confirmed_count"] == 1

    # Citizen moves OUT of zone to Pune
    c.latitude = 18.5204
    c.longitude = 73.8567
    c.location_name = "Pune"
    test_db.commit()

    res_out = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res_out["eligible_citizens_count"] == 0, f"Expected 0 after move, got {res_out['eligible_citizens_count']}"
    assert res_out["understanding_confirmed_count"] == 0, f"Expected 0 after move, got {res_out['understanding_confirmed_count']}"

    # Citizen moves BACK into zone
    c.latitude = 19.0760
    c.longitude = 72.8777
    c.location_name = "Mumbai Central"
    test_db.commit()

    res_back = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res_back["eligible_citizens_count"] == 1
    assert res_back["understanding_confirmed_count"] == 1


def test_10_zero_eligible_citizens_state(test_db):
    """Case 10: Zero eligible registered citizens displays empty state (0/0)."""
    warning, zone = create_sample_warning_and_zone(test_db)

    # No registered citizens in DB
    res = compute_zone_eligible_understanding(zone, test_db, warning)
    assert res["eligible_citizens_count"] == 0
    assert res["understanding_confirmed_count"] == 0


def test_11_metrics_integration_and_api_fidelity(test_db):
    """Case 11: compute_zone_metrics correctly outputs eligible_citizens_count and understanding_confirmed_count."""
    warning, zone = create_sample_warning_and_zone(test_db)

    for i in range(10):
        c = User(
            email=f"user_{i}@example.com",
            hashed_password=get_password_hash("Pass123!"),
            full_name=f"User {i}",
            role="citizen",
            latitude=19.0760,
            longitude=72.8777
        )
        test_db.add(c)
    test_db.commit()

    m = compute_zone_metrics(zone, test_db)
    assert "eligible_citizens_count" in m
    assert "understanding_confirmed_count" in m
    assert m["eligible_citizens_count"] == 10
    assert m["understanding_confirmed_count"] == 0


def test_12_existing_warning_and_database_data_remains_intact():
    """Case 12: Verifies that the production database crisisbridge.db has not been altered or deleted."""
    db = SessionLocal()
    try:
        # Warning 1 must still exist, be Active, version 1, Approved
        w = db.query(Warning).filter(Warning.id == 1).first()
        assert w is not None, "Production warning 1 must exist!"
        assert w.identifier == "CB-WARN-20261018-782898", f"Unexpected identifier: {w.identifier}"
        assert w.status == "Active", f"Unexpected status: {w.status}"
        assert w.version == 1, f"Unexpected version: {w.version}"
        assert w.ai_approval_status == "Approved"

        # Response zones for warning 1 must be preserved
        zones = db.query(ResponseZone).filter(ResponseZone.warning_id == 1).all()
        assert len(zones) >= 1, "Response zones for warning 1 must be preserved"

        # Historical delivery records must be intact
        deliveries = db.query(NotificationDeliveryRecord).filter(NotificationDeliveryRecord.warning_id == 1).all()
        assert len(deliveries) >= 12, f"Expected at least 12 historical delivery records, found {len(deliveries)}"

        # Citizen response records must be intact
        responses = db.query(CitizenResponse).filter(CitizenResponse.warning_id == 1).all()
        assert len(responses) >= 1, "Historical citizen responses must be intact"
        assert any(r.response_type == "understand" for r in responses), "Understanding response must be intact"

        # Total users preserved
        users_count = db.query(User).count()
        assert users_count >= 30, f"Expected at least 30 users, found {users_count}"

        print(f"\n[OK] Production DB integrity verified: Warning #{w.id} ({w.identifier}) is Active and intact.")
    finally:
        db.close()
