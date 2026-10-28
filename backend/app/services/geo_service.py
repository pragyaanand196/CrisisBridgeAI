import json
import math
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from shapely.geometry import shape, Point, Polygon, MultiPolygon
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from backend.app.models.user import User
from backend.app.models.warning_target_area import WarningTargetArea
from backend.app.models.notification_delivery_record import NotificationDeliveryRecord
from backend.app.models.response_zone import ResponseZone
from backend.app.models.warning import Warning
from backend.app.models.citizen_response import CitizenResponse

def get_citizen_coordinates(citizen: Any) -> Tuple[Optional[float], Optional[float]]:
    """
    Extracts (lat, lng) from citizen entity, checking numeric columns first and location_geojson second.
    """
    lat = getattr(citizen, "latitude", None)
    lng = getattr(citizen, "longitude", None)
    if lat is not None and lng is not None:
        try:
            return float(lat), float(lng)
        except (ValueError, TypeError):
            pass

    geojson_raw = getattr(citizen, "location_geojson", None)
    if geojson_raw:
        try:
            if isinstance(geojson_raw, str):
                data = json.loads(geojson_raw)
            else:
                data = geojson_raw
            if isinstance(data, dict):
                coords = data.get("coordinates")
                if coords and len(coords) >= 2:
                    # GeoJSON is [longitude, latitude]
                    return float(coords[1]), float(coords[0])
        except Exception:
            pass
    return None, None


# Priority ranking map
PRIORITY_RANK = {
    "critical": 5,
    "immediate": 4,
    "high": 3,
    "standard": 2,
    "moderate": 2,
    "low": 1
}

def validate_geometry(geojson_input: Any) -> Tuple[bool, Optional[str]]:
    """
    Validates GeoJSON input. Ensures proper coordinate bounds (-90<=lat<=90, -180<=lng<=180),
    valid geometry types (Polygon, MultiPolygon), and closed rings.
    """
    try:
        if isinstance(geojson_input, str):
            geo_dict = json.loads(geojson_input)
        elif isinstance(geojson_input, dict):
            geo_dict = geojson_input
        else:
            return False, "Geometry must be a valid JSON string or dictionary."
        
        gtype = geo_dict.get("type")
        if gtype not in ["Polygon", "MultiPolygon"]:
            return False, f"Unsupported geometry type '{gtype}'. Expected 'Polygon' or 'MultiPolygon'."
        
        poly = shape(geo_dict)
        if not poly.is_valid:
            # Try to fix minor self-intersections or return error
            poly = poly.buffer(0)
            if not poly.is_valid:
                return False, "Invalid polygon structure (self-intersecting or malformed coordinates)."
        
        # Verify bounding box is within global coordinates
        minx, miny, maxx, maxy = poly.bounds # min_lng, min_lat, max_lng, max_lat
        if minx < -180.0 or maxx > 180.0 or miny < -90.0 or maxy > 90.0:
            return False, "Coordinates outside valid geographic bounds (-180 to 180 longitude, -90 to 90 latitude)."
        
        return True, None
    except Exception as e:
        return False, f"Failed to parse geometry: {str(e)}"

def circle_to_polygon_geojson(lat: float, lng: float, radius_km: float, num_points: int = 32) -> str:
    """
    Generates a GeoJSON Polygon approximating a circular buffer of radius_km around (lat, lng).
    """
    coords = []
    # 1 degree of latitude is approx 110.574 km
    lat_deg_per_km = 1.0 / 110.574
    # 1 degree of longitude is approx 111.320 * cos(lat) km
    lat_rad = math.radians(lat)
    lng_deg_per_km = 1.0 / (111.320 * max(0.01, math.cos(lat_rad)))
    
    for i in range(num_points):
        angle = (2 * math.pi * i) / num_points
        d_lat = radius_km * math.sin(angle) * lat_deg_per_km
        d_lng = radius_km * math.cos(angle) * lng_deg_per_km
        coords.append([round(lng + d_lng, 6), round(lat + d_lat, 6)])
    
    # Close ring
    coords.append(coords[0])
    
    return json.dumps({
        "type": "Polygon",
        "coordinates": [coords]
    })

def haversine_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Computes accurate great-circle geodesic distance in kilometers between two (lat, lng) points.
    """
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def point_in_polygon_or_multipolygon(lat: float, lng: float, polygon_geojson_str: str) -> bool:
    """
    Determines if coordinate (lat, lng) is inside or on the boundary of the GeoJSON polygon/multipolygon.
    Implements boundary-inclusive spatial containment rule.
    """
    try:
        geo_dict = json.loads(polygon_geojson_str)
        poly = shape(geo_dict)
        pt = Point(lng, lat)  # Note: GeoJSON is [longitude, latitude]
        
        # Boundary rule: interior or boundary within precision threshold
        if poly.contains(pt) or poly.covers(pt) or poly.touches(pt):
            return True
        if poly.boundary.distance(pt) < 1e-6:
            return True
        return False
    except Exception:
        return False

# Backward compatibility alias
point_in_polygon = point_in_polygon_or_multipolygon


def calculate_centroid(polygon_geojson_str: str) -> Tuple[float, float]:
    """
    Returns (latitude, longitude) of the centroid for a given polygon.
    """
    try:
        geo_dict = json.loads(polygon_geojson_str)
        poly = shape(geo_dict)
        centroid = poly.centroid
        return (round(centroid.y, 6), round(centroid.x, 6)) # lat, lng
    except Exception:
        return (0.0, 0.0)

def match_citizen_to_warning_targets(citizen_lat: float, citizen_lng: float, target_areas: List[Any]) -> Optional[Any]:
    """
    Evaluates if citizen's location falls inside any target area of a warning.
    Uses boundary-inclusive polygon containment AND geodesic distance calculation for radius targets.
    If matching multiple target areas, returns the target area with the highest priority.
    """
    matched_areas = []
    for area in target_areas:
        is_match = False
        geom_str = getattr(area, "geometry_geojson", None) or (area.get("geometry_geojson") if isinstance(area, dict) else None)
        
        # 1. GeoJSON Polygon/MultiPolygon containment
        if geom_str and point_in_polygon_or_multipolygon(citizen_lat, citizen_lng, geom_str):
            is_match = True
            
        # 2. Direct geodesic radius distance check (dual resilience)
        if not is_match:
            c_lat = getattr(area, "center_lat", None) if not isinstance(area, dict) else area.get("center_lat")
            c_lng = getattr(area, "center_lng", None) if not isinstance(area, dict) else area.get("center_lng")
            r_km = getattr(area, "radius_km", None) if not isinstance(area, dict) else area.get("radius_km")
            
            if c_lat is not None and c_lng is not None and r_km is not None and r_km > 0:
                dist = haversine_distance_km(citizen_lat, citizen_lng, float(c_lat), float(c_lng))
                if dist <= (float(r_km) + 0.1): # 100m boundary tolerance
                    is_match = True
        
        if is_match:
            matched_areas.append(area)
    
    if not matched_areas:
        return None
    
    # Sort by priority rank descending
    def get_rank(a):
        p = getattr(a, "priority_level", None) or (a.get("priority_level") if isinstance(a, dict) else "High")
        return PRIORITY_RANK.get(str(p).lower(), 3)
    
    matched_areas.sort(key=get_rank, reverse=True)
    return matched_areas[0]

def is_citizen_eligible_for_warning(
    citizen_lat: Optional[float],
    citizen_lng: Optional[float],
    warning: Any,
    db: Session
) -> Tuple[bool, Optional[Any]]:
    """
    Single unified source of truth for geographic eligibility across:
    - Targeting preview
    - Publication & recipient distribution
    - Citizen portal active warning retrieval
    - Citizen response zone auto-mapping
    """
    if citizen_lat is None or citizen_lng is None or warning is None:
        return False, None
        
    target_areas = db.query(WarningTargetArea).filter(
        WarningTargetArea.warning_id == warning.id,
        WarningTargetArea.warning_version == warning.version
    ).all()
    
    if target_areas:
        matched = match_citizen_to_warning_targets(citizen_lat, citizen_lng, target_areas)
        if matched:
            return True, matched
            
    # Fallback to combined warning polygon if set
    if getattr(warning, "area_polygon_geojson", None):
        if point_in_polygon_or_multipolygon(citizen_lat, citizen_lng, warning.area_polygon_geojson):
            return True, None
            
    return False, None

def match_citizen_to_response_zone(citizen_lat: float, citizen_lng: float, zones: List[Any]) -> Optional[Any]:
    """
    Matches citizen's coordinates to the specific ResponseZone containing the citizen.
    If outside all zone boundaries (edge case), matches to the closest zone centroid.
    """
    if not zones:
        return None
    
    for z in zones:
        geom_str = getattr(z, "polygon_geojson", None) or (z.get("polygon_geojson") if isinstance(z, dict) else None)
        if geom_str and point_in_polygon_or_multipolygon(citizen_lat, citizen_lng, geom_str):
            return z
    
    # Fallback: find closest zone centroid
    closest_zone = None
    min_dist = float("inf")
    for z in zones:
        z_lat = getattr(z, "center_lat", None) or (z.get("center_lat") if isinstance(z, dict) else 0.0)
        z_lng = getattr(z, "center_lng", None) or (z.get("center_lng") if isinstance(z, dict) else 0.0)
        dist = (citizen_lat - z_lat) ** 2 + (citizen_lng - z_lng) ** 2
        if dist < min_dist:
            min_dist = dist
            closest_zone = z
            
    return closest_zone

def calculate_targeting_preview(db: Session, target_areas_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes real targeting metrics against registered citizens in the database.
    Zero fabrication: If no citizens exist in the area, returns exactly 0 with clear messaging.
    """
    # Fetch all active registered citizens with location
    citizens = db.query(User).filter(
        User.role == "citizen",
        User.is_active == True,
        or_(
            and_(User.latitude.isnot(None), User.longitude.isnot(None)),
            User.location_geojson.isnot(None)
        )
    ).all()
    
    targeted_citizen_ids = set()
    breakdown = []
    
    for idx, area_in in enumerate(target_areas_data):
        area_name = area_in.get("name", f"Target Area {idx + 1}")
        priority = area_in.get("priority_level", "High")
        
        area_count = 0
        for c in citizens:
            c_lat, c_lng = get_citizen_coordinates(c)
            if c_lat is None or c_lng is None:
                continue
            if match_citizen_to_warning_targets(c_lat, c_lng, [area_in]):
                targeted_citizen_ids.add(c.id)
                area_count += 1
        
        breakdown.append({
            "target_name": area_name,
            "priority_level": priority,
            "citizens_count": area_count
        })
    
    total_count = len(targeted_citizen_ids)
    is_empty = (total_count == 0)
    
    if is_empty:
        summary_msg = "No registered citizens found in this target area"
    else:
        summary_msg = f"{total_count} registered citizen{'s' if total_count != 1 else ''} identified in selected target area(s)"
        
    return {
        "total_citizens_targeted": total_count,
        "is_empty": is_empty,
        "summary_message": summary_msg,
        "breakdown_by_area": breakdown
    }

def generate_default_response_zones(warning_id: int, area_name: str, center_lat: float = 19.0760, center_lng: float = 72.8777) -> List[Dict[str, Any]]:
    """
    Generates 3 default geographic Response Zones (Sectors) around the given center
    if the authority did not draw custom sub-zones manually.
    """
    delta = 0.04
    zones = [
        {
            "name": f"{area_name} - Coastal / Lowland Sector A",
            "code": "RZ-A",
            "center_lat": round(center_lat + 0.015, 6),
            "center_lng": round(center_lng - 0.02, 6),
            "estimated_population": 12500,
            "risk_level": "High",
            "polygon_geojson": json.dumps({
                "type": "Polygon",
                "coordinates": [[
                    [center_lng - delta, center_lat],
                    [center_lng - delta, center_lat + delta],
                    [center_lng, center_lat + delta],
                    [center_lng, center_lat],
                    [center_lng - delta, center_lat]
                ]]
            })
        },
        {
            "name": f"{area_name} - Central Urban Sector B",
            "code": "RZ-B",
            "center_lat": round(center_lat + 0.015, 6),
            "center_lng": round(center_lng + 0.02, 6),
            "estimated_population": 28000,
            "risk_level": "Medium",
            "polygon_geojson": json.dumps({
                "type": "Polygon",
                "coordinates": [[
                    [center_lng, center_lat],
                    [center_lng, center_lat + delta],
                    [center_lng + delta, center_lat + delta],
                    [center_lng + delta, center_lat],
                    [center_lng, center_lat]
                ]]
            })
        },
        {
            "name": f"{area_name} - Inland Relief Sector C",
            "code": "RZ-C",
            "center_lat": round(center_lat - 0.02, 6),
            "center_lng": round(center_lng, 6),
            "estimated_population": 9500,
            "risk_level": "Low",
            "polygon_geojson": json.dumps({
                "type": "Polygon",
                "coordinates": [[
                    [center_lng - delta, center_lat - delta],
                    [center_lng - delta, center_lat],
                    [center_lng + delta, center_lat],
                    [center_lng + delta, center_lat - delta],
                    [center_lng - delta, center_lat - delta]
                ]]
            })
        }
    ]
    return zones

def generate_zones_from_target_areas(warning_id: int, target_areas: List[Any]) -> List[Dict[str, Any]]:
    """
    Automatically creates Response Zones mapped 1:1 to authority-defined target areas.
    """
    zones = []
    for idx, area in enumerate(target_areas):
        name = getattr(area, "name", None) or (area.get("name") if isinstance(area, dict) else f"Sector {idx+1}")
        geom = getattr(area, "geometry_geojson", None) or (area.get("geometry_geojson") if isinstance(area, dict) else "")
        c_lat = getattr(area, "center_lat", None) or (area.get("center_lat") if isinstance(area, dict) else 0.0)
        c_lng = getattr(area, "center_lng", None) or (area.get("center_lng") if isinstance(area, dict) else 0.0)
        priority = getattr(area, "priority_level", None) or (area.get("priority_level") if isinstance(area, dict) else "High")
        
        # Map priority to risk level
        risk = "High" if priority in ["Critical", "Immediate", "High"] else "Medium"
        code = f"RZ-{chr(65 + (idx % 26))}"
        if idx >= 26:
            code += str(idx // 26)
            
        zones.append({
            "name": f"{name} (Response Zone)",
            "code": code,
            "polygon_geojson": geom,
            "center_lat": c_lat,
            "center_lng": c_lng,
            "estimated_population": 1000,
            "risk_level": risk
        })
    return zones

def distribute_warning_to_eligible_citizens(
    db: Session,
    warning: Any,
    target_areas: List[Any],
    zones: List[Any]
) -> int:
    """
    Performs deterministic PostGIS/Shapely geospatial matching to identify all registered citizens
    whose locations fall inside the warning's target area(s).
    Creates NotificationDeliveryRecords and initialises zone counts.
    """
    citizens = db.query(User).filter(
        User.role == "citizen",
        User.is_active == True,
        or_(
            and_(User.latitude.isnot(None), User.longitude.isnot(None)),
            User.location_geojson.isnot(None)
        )
    ).all()
    
    zone_targeted_map: Dict[int, int] = {z.id: 0 for z in zones if hasattr(z, "id")}
    eligible_count = 0
    
    for c in citizens:
        c_lat, c_lng = get_citizen_coordinates(c)
        if c_lat is None or c_lng is None:
            continue
        
        # Unified eligibility evaluation (target areas + polygon fallback)
        is_eligible, matched_target = is_citizen_eligible_for_warning(c_lat, c_lng, warning, db)
        if is_eligible:
            matched_zone = match_citizen_to_response_zone(c_lat, c_lng, zones)
            
            target_id = getattr(matched_target, "id", None) if matched_target else None
            zone_id = getattr(matched_zone, "id", None) if matched_zone else None
            
            # Idempotency check: prevent duplicate delivery records on retry / repeated distribution clicks
            existing_rec = db.query(NotificationDeliveryRecord).filter(
                NotificationDeliveryRecord.warning_id == warning.id,
                NotificationDeliveryRecord.warning_version == warning.version,
                NotificationDeliveryRecord.citizen_id == c.id
            ).first()

            if not existing_rec:
                delivery_rec = NotificationDeliveryRecord(
                    warning_id=warning.id,
                    warning_version=warning.version,
                    target_area_id=target_id,
                    response_zone_id=zone_id,
                    citizen_id=c.id,
                    status="delivered", # In simulated web/app multi-channel, record delivered
                    delivery_channel="In-App",
                    delivered_at=warning.distributed_at or datetime.utcnow()
                )
                db.add(delivery_rec)
            else:
                if target_id and not existing_rec.target_area_id:
                    existing_rec.target_area_id = target_id
                if zone_id and not existing_rec.response_zone_id:
                    existing_rec.response_zone_id = zone_id

            eligible_count += 1
            
            if zone_id and zone_id in zone_targeted_map:
                zone_targeted_map[zone_id] += 1
    
    # Update zone counts based on real citizens targeted
    for z in zones:
        if hasattr(z, "id") and z.id in zone_targeted_map:
            z_count = zone_targeted_map[z.id]
            z.targeted_count = z_count
            z.delivery_count = z_count
            z.no_response_count = z_count
            z.situation_status = "Stable" if z_count > 0 else "Insufficient Data"
    
    db.commit()
    return eligible_count

def compute_zone_eligible_understanding(
    zone: ResponseZone,
    db: Session,
    warning: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Computes exact, authoritative citizen understanding metrics for a response zone:
    - Denominator: Distinct currently registered citizen accounts whose registered
      geographic location falls within the warning's actual target zone according to
      the existing location and geographic-targeting logic.
      Excludes authority accounts, duplicate citizen records, citizens from other zones,
      citizens outside the zone, and citizens without valid location coordinates.
    - Numerator: Distinct citizens from that current eligible population whose latest
      valid response for this exact warning & version explicitly confirms understanding
      ('understand' or 'safe').
      Excludes non-understanding responses ('dont_understand', 'need_help', 'not_in_area', etc.).
      Counts each eligible citizen at most once.
    """
    if warning is None and getattr(zone, "warning_id", None):
        warning = getattr(zone, "warning", None) or db.query(Warning).filter(Warning.id == zone.warning_id).first()

    if not warning:
        return {
            "eligible_citizens_count": 0,
            "understanding_confirmed_count": 0,
            "eligible_citizen_ids": [],
            "understanding_citizen_ids": []
        }

    warning_zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warning.id).all()
    if not warning_zones:
        warning_zones = [zone]

    citizens = db.query(User).filter(
        User.role == "citizen",
        User.is_active == True,
        or_(
            and_(User.latitude.isnot(None), User.longitude.isnot(None)),
            User.location_geojson.isnot(None)
        )
    ).all()

    eligible_citizen_ids = set()
    for c in citizens:
        c_lat, c_lng = get_citizen_coordinates(c)
        if c_lat is None or c_lng is None:
            continue

        is_elig, matched_target = is_citizen_eligible_for_warning(c_lat, c_lng, warning, db)
        if not is_elig:
            if zone.polygon_geojson and point_in_polygon_or_multipolygon(c_lat, c_lng, zone.polygon_geojson):
                is_elig = True

        if not is_elig:
            continue

        matched_zone = match_citizen_to_response_zone(c_lat, c_lng, warning_zones)
        if matched_zone and matched_zone.id == zone.id:
            eligible_citizen_ids.add(c.id)

    denominator = len(eligible_citizen_ids)

    numerator = 0
    understanding_citizen_ids = set()
    if eligible_citizen_ids:
        all_responses = db.query(CitizenResponse).filter(
            CitizenResponse.warning_id == warning.id,
            CitizenResponse.warning_version == warning.version,
            CitizenResponse.user_id.in_(eligible_citizen_ids)
        ).order_by(
            CitizenResponse.updated_at.desc(),
            CitizenResponse.created_at.desc(),
            CitizenResponse.id.desc()
        ).all()

        latest_responses = {}
        for r in all_responses:
            if r.user_id not in latest_responses:
                latest_responses[r.user_id] = r

        for uid, resp in latest_responses.items():
            if resp.response_type in ["understand", "safe"]:
                understanding_citizen_ids.add(uid)

        numerator = len(understanding_citizen_ids)

    return {
        "eligible_citizens_count": denominator,
        "understanding_confirmed_count": numerator,
        "eligible_citizen_ids": list(eligible_citizen_ids),
        "understanding_citizen_ids": list(understanding_citizen_ids)
    }


def get_citizen_eligible_response_zones(citizen: Any, db: Session) -> Tuple[str, List[ResponseZone]]:
    """
    Determines the exact ResponseZone(s) that an authenticated citizen belongs to
    based on the citizen's registered geographic location and warning containment.
    
    Returns:
        (status, zones)
        status:
            - 'missing_location': citizen has no valid coordinates registered
            - 'no_active_zone': citizen coordinates do not fall into any active response zone
            - 'matched': citizen matches one or more response zones
    """
    lat, lng = get_citizen_coordinates(citizen)
    if lat is None or lng is None:
        return "missing_location", []

    # Get active/approved/updated warnings
    active_warnings = db.query(Warning).filter(
        Warning.status.in_(["Active", "Approved", "Updated"])
    ).all()

    matched_zone_ids = set()
    matched_zones = []

    for warn in active_warnings:
        is_elig, _ = is_citizen_eligible_for_warning(lat, lng, warn, db)
        warn_zones = db.query(ResponseZone).filter(ResponseZone.warning_id == warn.id).all()

        if is_elig and warn_zones:
            mz = match_citizen_to_response_zone(lat, lng, warn_zones)
            if mz and mz.id not in matched_zone_ids:
                matched_zone_ids.add(mz.id)
                matched_zones.append(mz)

        # Also check direct polygon containment for all zones of active warnings
        for z in warn_zones:
            if z.id not in matched_zone_ids and z.polygon_geojson:
                if point_in_polygon_or_multipolygon(lat, lng, z.polygon_geojson):
                    matched_zone_ids.add(z.id)
                    matched_zones.append(z)

    # Check notification delivery records for this citizen
    citizen_id = getattr(citizen, "id", None)
    if citizen_id:
        deliveries = db.query(NotificationDeliveryRecord).filter(
            NotificationDeliveryRecord.citizen_id == citizen_id,
            NotificationDeliveryRecord.response_zone_id.isnot(None)
        ).all()
        for d in deliveries:
            if d.response_zone_id not in matched_zone_ids:
                rz = db.query(ResponseZone).filter(ResponseZone.id == d.response_zone_id).first()
                if rz:
                    matched_zone_ids.add(rz.id)
                    matched_zones.append(rz)

    if not matched_zones:
        return "no_active_zone", []

    return "matched", matched_zones

