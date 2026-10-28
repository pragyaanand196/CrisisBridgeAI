import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Badge } from '../common/Badge';

// Fix Leaflet default marker icons in React bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Icons
const shelterIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const hospitalIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Helper component to adjust bounds for both Target Areas and Response Zones
function MapBoundsAdjuster({ zones, targetAreas, center }) {
  const map = useMap();

  useEffect(() => {
    const bounds = [];
    
    // Check target areas
    if (targetAreas && targetAreas.length > 0) {
      targetAreas.forEach((ta) => {
        if (ta.geometry_geojson) {
          try {
            const geo = typeof ta.geometry_geojson === 'string' ? JSON.parse(ta.geometry_geojson) : ta.geometry_geojson;
            if (geo.coordinates && geo.coordinates[0]) {
              geo.coordinates[0].forEach(([lng, lat]) => bounds.push([lat, lng]));
            }
          } catch (e) {}
        } else if (ta.center_lat && ta.center_lng) {
          bounds.push([ta.center_lat, ta.center_lng]);
        }
      });
    }

    // Check response zones
    if (zones && zones.length > 0) {
      zones.forEach((z) => {
        if (z.polygon_geojson) {
          try {
            const geo = typeof z.polygon_geojson === 'string' ? JSON.parse(z.polygon_geojson) : z.polygon_geojson;
            if (geo.coordinates && geo.coordinates[0]) {
              geo.coordinates[0].forEach(([lng, lat]) => bounds.push([lat, lng]));
            }
          } catch (e) {}
        } else if (z.center_lat && z.center_lng) {
          bounds.push([z.center_lat, z.center_lng]);
        }
      });
    }

    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
      } catch (err) {
        console.warn('Bounds fitting error:', err);
      }
    } else if (center) {
      map.setView(center, 12);
    }
  }, [zones, targetAreas, center, map]);

  return null;
}

// Helper component to observe container resizes and invalidate Leaflet map dimensions immediately
function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    // 1. Initial size invalidations to ensure proper tile rendering after initial mount
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 400);

    // 2. Observe container element for responsive/zoom/layout changes
    let resizeObserver = null;
    const container = map.getContainer();
    if (typeof ResizeObserver !== 'undefined' && container) {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(container);
    }

    // 3. Fallback window resize listener
    const onWindowResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, [map]);

  return null;
}

export function DisasterMap({
  zones = [],
  targetAreas = [],
  resources = [],
  center = [19.0760, 72.8777],
  zoom = 12,
  onZoneClick = null,
  selectedZoneId = null,
  height = '440px'
}) {
  const getZoneColor = (zone) => {
    const status = (zone.situation_status || '').toLowerCase();
    if (status.includes('mismatch')) return { color: '#e11d48', fill: '#ffe4e6', dash: '4, 4' };
    if (status.includes('surge')) return { color: '#c026d3', fill: '#fdf4ff', dash: '3, 6' };
    if (status.includes('gap')) return { color: '#9333ea', fill: '#f5f3ff', dash: '5, 5' };
    if (status.includes('critical') || status.includes('extreme')) return { color: '#dc2626', fill: '#fee2e2', dash: null };
    if (status.includes('attention') || status.includes('moderate')) return { color: '#d97706', fill: '#fef3c7', dash: null };
    if (status.includes('stable')) return { color: '#059669', fill: '#ecfdf5', dash: null };
    return { color: '#0284c7', fill: '#e0f2fe', dash: null };
  };

  const getPriorityColor = (priority) => {
    const p = (priority || '').toLowerCase();
    if (p === 'critical') return { color: '#dc2626', fill: '#fee2e2' };
    if (p === 'immediate') return { color: '#ea580c', fill: '#ffedd5' };
    if (p === 'high') return { color: '#d97706', fill: '#fef3c7' };
    return { color: '#0284c7', fill: '#e0f2fe' };
  };

  return (
    <div className="map-container" style={{ height }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBoundsAdjuster zones={zones} targetAreas={targetAreas} center={center} />
        <MapResizeHandler />

        {/* 1. Target Areas (Authority Defined Warning Geography) */}
        {targetAreas.map((ta, idx) => {
          let coords = [];
          try {
            const geo = typeof ta.geometry_geojson === 'string' ? JSON.parse(ta.geometry_geojson) : ta.geometry_geojson;
            if (geo && geo.coordinates && geo.coordinates[0]) {
              coords = geo.coordinates[0].map(([lng, lat]) => [lat, lng]);
            }
          } catch (err) {
            console.error('Failed to parse target area polygon:', err);
          }

          if (coords.length === 0) return null;
          const style = getPriorityColor(ta.priority_level);

          return (
            <Polygon
              key={`ta-${ta.id || idx}`}
              positions={coords}
              pathOptions={{
                color: style.color,
                weight: 3.5,
                fillColor: style.fill,
                fillOpacity: 0.35,
                dashArray: '6, 6'
              }}
            >
              <Popup>
                <div style={{ minWidth: 190, padding: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{ta.name}</strong>
                    <span className="badge badge-extreme" style={{ fontSize: '0.68rem' }}>{ta.priority_level} Priority</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                    <strong>Target Type:</strong> {ta.target_type}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    Center: {ta.center_lat?.toFixed(3)}°N, {ta.center_lng?.toFixed(3)}°E
                  </div>
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* 2. Response Zones Polygons */}
        {zones.map((zone) => {
          let coords = [];
          try {
            const geo = typeof zone.polygon_geojson === 'string' ? JSON.parse(zone.polygon_geojson) : zone.polygon_geojson;
            if (geo && geo.coordinates && geo.coordinates[0]) {
              coords = geo.coordinates[0].map(([lng, lat]) => [lat, lng]);
            }
          } catch (err) {
            console.error('Failed to parse zone polygon:', err);
          }

          if (coords.length === 0) return null;

          const isSelected = selectedZoneId === zone.id;
          const style = getZoneColor(zone);

          return (
            <Polygon
              key={`zone-${zone.id}`}
              positions={coords}
              pathOptions={{
                color: isSelected ? '#000000' : style.color,
                weight: isSelected ? 4 : 2,
                fillColor: style.fill,
                fillOpacity: 0.55,
                dashArray: style.dash
              }}
              eventHandlers={{
                click: () => onZoneClick && onZoneClick(zone),
              }}
            >
              <Popup>
                <div style={{ minWidth: 220, padding: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: '0.95rem' }}>{zone.name}</strong>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>{zone.code}</span>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <Badge status={zone.situation_status} />
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div><strong>WTA Score:</strong> {zone.wta_score ?? 0} / 100</div>
                    <div><strong>Targeted Citizens:</strong> {zone.targeted_count ?? zone.delivery_count ?? 0}</div>
                    <div><strong>Acknowledgements:</strong> {zone.acknowledgement_count ?? 0}</div>
                    <div><strong>Assistance Requests:</strong> {zone.help_request_count ?? 0}</div>
                    {zone.not_in_area_count > 0 && (
                      <div style={{ color: '#e11d48', fontWeight: 600 }}>
                        <strong>Location Mismatches:</strong> {zone.not_in_area_count}
                      </div>
                    )}
                  </div>
                  {onZoneClick && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-block"
                      style={{ marginTop: 8 }}
                      onClick={() => onZoneClick(zone)}
                    >
                      View Zone Situation Matrix
                    </button>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {/* 3. Emergency Resources Markers */}
        {resources.map((res) => (
          <Marker
            key={`res-${res.id}`}
            position={[res.latitude, res.longitude]}
            icon={res.resource_type === 'Hospital' ? hospitalIcon : shelterIcon}
          >
            <Popup>
              <div style={{ minWidth: 180, padding: 4 }}>
                <strong style={{ fontSize: '0.95rem', display: 'block', marginBottom: 4 }}>{res.name}</strong>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 4 }}>{res.resource_type} • {res.status}</div>
                <div style={{ fontSize: '0.82rem', color: '#334155' }}>{res.address}</div>
                <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                  <strong>Capacity:</strong> {res.capacity_occupied || 0} / {res.capacity_total || 0}
                </div>
                <div style={{ fontSize: '0.82rem', marginTop: 2 }}>
                  <strong>Helpline:</strong> <a href={`tel:${res.contact_phone}`}>{res.contact_phone}</a>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
