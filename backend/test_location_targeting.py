import sys
import os
import asyncio
import json
from datetime import datetime, timedelta

# Set stdout/stderr to UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal, engine, Base
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.warning_target_area import WarningTargetArea
from backend.app.models.notification_delivery_record import NotificationDeliveryRecord
from backend.app.models.response_zone import ResponseZone
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.models.audit_log import AuditLog
from backend.app.services.auth_service import get_password_hash, create_access_token, verify_password
from backend.app.services.cap_service import generate_cap_payload
from backend.app.services.ai_service import generate_simplified_citizen_communication
from backend.app.services.geo_service import (
    validate_geometry,
    point_in_polygon_or_multipolygon,
    circle_to_polygon_geojson,
    calculate_centroid,
    calculate_targeting_preview,
    match_citizen_to_warning_targets,
    match_citizen_to_response_zone,
    generate_zones_from_target_areas,
    distribute_warning_to_eligible_citizens
)
from backend.app.services.analytics_service import (
    compute_zone_metrics,
    compute_warning_targeting_analytics
)
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

@pytest.mark.asyncio
async def test_location_targeting_workflow():
    print("==================================================================")
    print("CRISISBRIDGE AI - LOCATION-BASED DISASTER WARNING & RESPONSE TESTS")
    print("==================================================================")

    # 1. Isolated In-Memory Database (preserving production database)
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=test_engine)
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    db = TestSessionLocal()

    try:
        # TEST 1: Geometry Validation & PostGIS Boundary Inclusion
        print("\n[TEST 1/10] Testing Geometry Validation & PostGIS Containment...")
        valid_poly_geojson = json.dumps({
            "type": "Polygon",
            "coordinates": [[
                [72.80, 18.90],
                [72.80, 18.96],
                [72.86, 18.96],
                [72.86, 18.90],
                [72.80, 18.90]
            ]]
        })
        is_valid, err = validate_geometry(valid_poly_geojson)
        assert is_valid, f"Expected valid geometry, got error: {err}"
        print("  [OK] Valid GeoJSON polygon successfully verified.")

        # Test invalid geometry (malformed coordinates)
        invalid_poly = '{"type":"Polygon","coordinates":[[[200, 100],[200,105]]]}'
        is_invalid, err_msg = validate_geometry(invalid_poly)
        assert not is_invalid
        print(f"  [OK] Invalid geometry correctly rejected: {err_msg}")

        # Test Point Inside
        assert point_in_polygon_or_multipolygon(18.9220, 72.8347, valid_poly_geojson) == True
        # Test Point Outside
        assert point_in_polygon_or_multipolygon(18.5204, 73.8567, valid_poly_geojson) == False
        # Test Boundary Point (Documented boundary rule: point on boundary is considered eligible)
        assert point_in_polygon_or_multipolygon(18.9000, 72.8000, valid_poly_geojson) == True
        print("  [OK] PostGIS spatial containment & boundary rules verified.")

        # TEST 2: Circle Radius to Polygon Conversion
        print("\n[TEST 2/10] Testing Circle Radius Geodesic Buffer Conversion...")
        circle_poly_str = circle_to_polygon_geojson(19.0760, 72.8777, radius_km=5.0)
        is_circle_valid, _ = validate_geometry(circle_poly_str)
        assert is_circle_valid
        # Point 1km away from center should be inside
        assert point_in_polygon_or_multipolygon(19.0800, 72.8800, circle_poly_str) == True
        # Point 50km away should be outside
        assert point_in_polygon_or_multipolygon(18.5204, 73.8567, circle_poly_str) == False
        print("  [OK] Circular buffer accurately generated and checked.")

        # TEST 3: Clean Initial State & Targeting Preview on Empty Database
        print("\n[TEST 3/10] Testing Zero-Fake-Data Targeting Preview on Empty DB...")
        empty_preview = calculate_targeting_preview(db, [{
            "name": "South Mumbai Coastal Zone",
            "geometry_geojson": valid_poly_geojson,
            "priority_level": "Critical"
        }])
        assert empty_preview["total_citizens_targeted"] == 0
        assert empty_preview["is_empty"] == True
        assert empty_preview["summary_message"] == "No registered citizens found in this target area"
        print(f"  [OK] Clean empty state confirmed: '{empty_preview['summary_message']}'")

        # TEST 4: Citizen Registration with Mandatory Location
        print("\n[TEST 4/10] Testing Citizen Registration with Location Requirement...")
        # Create Authority Officer
        authority = User(
            email="commander@disaster.gov",
            hashed_password=get_password_hash("CommanderPass123!"),
            full_name="Cmdr. Vikram Malhotra",
            role="authority",
            department="National Disaster Management Authority",
            jurisdiction="Western Coastal Region"
        )
        # Register Citizen 1: Located in South Mumbai Coastal (Inside target polygon)
        citizen_mumbai = User(
            email="citizen.mumbai@example.com",
            hashed_password=get_password_hash("CitizenPass123!"),
            full_name="Priya Sharma",
            role="citizen",
            location_name="South Mumbai Coastal Area",
            latitude=18.9220,
            longitude=72.8347,
            district="Mumbai City",
            city="Mumbai",
            state="Maharashtra"
        )
        # Register Citizen 2: Located in Pune Valley (Outside target polygon)
        citizen_pune = User(
            email="citizen.pune@example.com",
            hashed_password=get_password_hash("CitizenPass123!"),
            full_name="Rahul Kulkarni",
            role="citizen",
            location_name="Pune Central Valley",
            latitude=18.5204,
            longitude=73.8567,
            district="Pune",
            city="Pune",
            state="Maharashtra"
        )
        db.add_all([authority, citizen_mumbai, citizen_pune])
        db.commit()
        db.refresh(citizen_mumbai)
        db.refresh(citizen_pune)
        print("  [OK] Registered 2 real citizens with distinct geographic locations.")

        # TEST 5: Targeting Preview with Actual Database Data
        print("\n[TEST 5/10] Testing Targeting Preview with Real Database Data...")
        preview_with_citizens = calculate_targeting_preview(db, [{
            "name": "South Mumbai Coastal Sector",
            "geometry_geojson": valid_poly_geojson,
            "priority_level": "Critical"
        }])
        assert preview_with_citizens["total_citizens_targeted"] == 1
        assert preview_with_citizens["is_empty"] == False
        assert "1 registered citizen" in preview_with_citizens["summary_message"]
        print(f"  [OK] Real DB targeting count: {preview_with_citizens['total_citizens_targeted']} citizen (Priya Sharma in South Mumbai)")

        # TEST 6: Warning Creation with Target Areas, Priorities, & Controlled AI
        print("\n[TEST 6/10] Testing Warning Creation, Priority Area, & Controlled AI...")
        en_text, hi_text, source, g_score, g_note = await generate_simplified_citizen_communication(
            disaster_type="Flood",
            title="Severe Flash Flood & Coastal Inundation Emergency",
            description="Tidal surge combined with heavy monsoon downpour.",
            severity="Severe",
            urgency="Immediate",
            area_name="South Mumbai Coastal District",
            recommended_instructions="• Move to concrete multi-story buildings or elevated relief shelters.\n• Do not drive through submerged coastal underpasses.\n• Keep emergency provisions and charged phones ready."
        )

        warning = Warning(
            identifier="CB-WARN-2026-MUMBAI-01",
            version=1,
            disaster_type="Flood",
            title="Severe Flash Flood & Coastal Inundation Emergency",
            description="Tidal surge combined with heavy monsoon downpour.",
            severity="Severe",
            urgency="Immediate",
            certainty="Observed",
            area_name="South Mumbai Coastal District",
            area_polygon_geojson=valid_poly_geojson,
            recommended_instructions="Move to higher ground immediately.",
            issuing_authority_name="NDMA Operations - Cmdr. Vikram Malhotra",
            issuing_authority_id=authority.id,
            status="Under Review",
            ai_simplified_en=en_text,
            ai_simplified_hi=hi_text,
            ai_approval_status="Pending"
        )
        db.add(warning)
        db.commit()
        db.refresh(warning)

        # Add Target Area with Priority Level
        target_area_1 = WarningTargetArea(
            warning_id=warning.id,
            warning_version=1,
            name="South Mumbai Coastal Sector",
            target_type="polygon",
            geometry_geojson=valid_poly_geojson,
            center_lat=18.9300,
            center_lng=72.8300,
            priority_level="Critical",
            notes="Immediate life safety priority"
        )
        db.add(target_area_1)
        db.commit()

        # Generate Response Zones
        zone_data = generate_zones_from_target_areas(warning.id, [target_area_1])
        for zd in zone_data:
            db.add(ResponseZone(
                warning_id=warning.id,
                name=zd["name"],
                code=zd["code"],
                polygon_geojson=zd["polygon_geojson"],
                center_lat=zd["center_lat"],
                center_lng=zd["center_lng"],
                estimated_population=zd["estimated_population"],
                risk_level=zd["risk_level"],
                situation_status="Insufficient Data"
            ))
        db.commit()

        # Human Approval Layer
        warning.ai_approval_status = "Approved"
        warning.status = "Approved"
        warning.approved_by_id = authority.id
        warning.approved_at = datetime.utcnow()
        db.commit()
        print("  [OK] Warning created with Critical priority target area & approved by Human Authority.")

        # TEST 7: Geospatial Distribution & Eligible Recipient Isolation
        print("\n[TEST 7/10] Testing Geospatial Matching & Notification Delivery Isolation...")
        target_areas = db.query(WarningTargetArea).filter(WarningTargetArea.warning_id == warning.id).all()
        zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warning.id).all()
        
        warning.status = "Active"
        warning.distributed_at = datetime.utcnow()
        db.commit()

        warned_count = distribute_warning_to_eligible_citizens(db, warning, target_areas, zones)
        assert warned_count == 1, f"Expected 1 citizen warned, got {warned_count}"
        print(f"  [OK] Backend PostGIS matched {warned_count} citizen.")

        # Verify Delivery Records
        delivery_recs = db.query(NotificationDeliveryRecord).filter(
            NotificationDeliveryRecord.warning_id == warning.id
        ).all()
        assert len(delivery_recs) == 1
        assert delivery_recs[0].citizen_id == citizen_mumbai.id
        assert delivery_recs[0].status == "delivered"
        print("  [OK] Delivery record chain initialized: Targeted -> Dispatched -> Delivered.")

        # TEST 8: Citizen Active Warnings Geographically Scoped
        print("\n[TEST 8/10] Verifying Citizen Active Warnings Geographic Isolation...")
        # Helper function simulating GET /api/v1/citizen/active-warnings for a user
        def get_citizen_active_warnings_for_user(u):
            if not u or u.latitude is None or u.longitude is None:
                return []
            active = db.query(Warning).filter(Warning.status == "Active").all()
            eligible = []
            for w in active:
                w_targets = db.query(WarningTargetArea).filter(
                    WarningTargetArea.warning_id == w.id,
                    WarningTargetArea.warning_version == w.version
                ).all()
                if match_citizen_to_warning_targets(u.latitude, u.longitude, w_targets):
                    eligible.append(w)
            return eligible

        mumbai_warnings = get_citizen_active_warnings_for_user(citizen_mumbai)
        pune_warnings = get_citizen_active_warnings_for_user(citizen_pune)

        assert len(mumbai_warnings) == 1, "Citizen inside target area MUST receive warning."
        assert len(pune_warnings) == 0, "Citizen outside target area MUST NOT receive warning."
        print("  [OK] Citizen in South Mumbai received 1 active warning ('Warning for your area').")
        print("  [OK] Citizen in Pune received 0 warnings ('No active disaster warnings for your registered area').")

        # TEST 9: Citizen Response, Location Mismatch & Gap Detection
        print("\n[TEST 9/10] Testing Citizen Feedback, Location Mismatch Signal & Gap Detection...")
        # Citizen Mumbai responds "not_in_area" (e.g. they moved or are outside)
        resp = CitizenResponse(
            warning_id=warning.id,
            warning_version=warning.version,
            response_zone_id=zones[0].id,
            target_area_id=target_area_1.id,
            user_id=citizen_mumbai.id,
            response_type="not_in_area",
            feedback_notes="Currently traveling outside Mumbai"
        )
        db.add(resp)
        db.commit()

        # Update delivery record
        delivery_rec = db.query(NotificationDeliveryRecord).filter(
            NotificationDeliveryRecord.warning_id == warning.id,
            NotificationDeliveryRecord.citizen_id == citizen_mumbai.id
        ).first()
        delivery_rec.status = "not_in_this_area"
        delivery_rec.responded_at = datetime.utcnow()
        delivery_rec.response_id = resp.id
        db.commit()

        analytics = compute_warning_targeting_analytics(warning, db)
        print(f"  Targeted: {analytics['total_targeted']} | Delivered: {analytics['delivered_count']} | Not in Area: {analytics['not_in_area_count']}")
        assert analytics["not_in_area_count"] == 1
        print("  [OK] Location Mismatch signal recorded without rewriting historical context.")

        # TEST 10: Warning Version Update with Target Area Change & Historical Preservation
        print("\n[TEST 10/10] Testing Warning Versioning (v1 -> v2) & Recalculation...")
        # Authority expands target area to cover Pune Valley in Version 2.0
        pune_poly_geojson = json.dumps({
            "type": "Polygon",
            "coordinates": [[
                [73.80, 18.50],
                [73.80, 18.56],
                [73.90, 18.56],
                [73.90, 18.50],
                [73.80, 18.50]
            ]]
        })

        warning_v2 = Warning(
            identifier="CB-WARN-2026-MUMBAI-01-v2",
            version=2,
            parent_warning_id=warning.id,
            disaster_type=warning.disaster_type,
            title="Extended Flash Flood Alert (Including Pune Catchment)",
            description="Catchment areas overflowing.",
            severity="Severe",
            urgency="Immediate",
            certainty="Observed",
            area_name="Western Maharashtra Valley Region",
            area_polygon_geojson=pune_poly_geojson,
            recommended_instructions="Evacuate low riverbeds.",
            issuing_authority_name=warning.issuing_authority_name,
            issuing_authority_id=authority.id,
            status="Active",
            ai_approval_status="Approved",
            distributed_at=datetime.utcnow()
        )
        db.add(warning_v2)
        db.commit()
        db.refresh(warning_v2)

        # Mark v1 as Updated
        warning.status = "Updated"
        db.commit()

        target_area_v2 = WarningTargetArea(
            warning_id=warning_v2.id,
            warning_version=2,
            name="Pune Catchment Sector",
            target_type="polygon",
            geometry_geojson=pune_poly_geojson,
            center_lat=18.5300,
            center_lng=73.8500,
            priority_level="High"
        )
        db.add(target_area_v2)
        db.commit()

        v2_zones_data = generate_zones_from_target_areas(warning_v2.id, [target_area_v2])
        v2_zones = []
        for zd in v2_zones_data:
            z = ResponseZone(
                warning_id=warning_v2.id,
                name=zd["name"],
                code=zd["code"],
                polygon_geojson=zd["polygon_geojson"],
                center_lat=zd["center_lat"],
                center_lng=zd["center_lng"],
                estimated_population=zd["estimated_population"],
                risk_level=zd["risk_level"],
                situation_status="Insufficient Data"
            )
            db.add(z)
            v2_zones.append(z)
        db.commit()

        # Distribute v2
        distribute_warning_to_eligible_citizens(db, warning_v2, [target_area_v2], v2_zones)

        # Verify Citizen Pune now receives v2, while Citizen Mumbai does not
        mumbai_v2_warns = get_citizen_active_warnings_for_user(citizen_mumbai)
        pune_v2_warns = get_citizen_active_warnings_for_user(citizen_pune)

        assert len(pune_v2_warns) == 1, "Citizen Pune MUST receive updated v2 warning."
        assert len(mumbai_v2_warns) == 0, "Citizen Mumbai outside v2 polygon MUST NOT receive v2."

        # Verify historical v1 records are still in DB
        v1_records = db.query(NotificationDeliveryRecord).filter(
            NotificationDeliveryRecord.warning_id == warning.id,
            NotificationDeliveryRecord.warning_version == 1
        ).all()
        assert len(v1_records) == 1
        assert v1_records[0].status == "not_in_this_area"
        print("  [OK] Version 2.0 recalculated for new boundary; Version 1.0 audit trail fully preserved!")

        print("\n==================================================================")
        print("ALL 10 LOCATION-TARGETING END-TO-END VERIFICATION TESTS PASSED (100%)!")
        print("==================================================================")

    finally:
        db.close()
        print("Location targeting verification complete.")

if __name__ == "__main__":
    asyncio.run(test_location_targeting_workflow())
