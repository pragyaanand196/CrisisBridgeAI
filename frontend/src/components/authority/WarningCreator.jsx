import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Circle, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import {
  AlertTriangle,
  Sparkles,
  MapPin,
  Plus,
  Trash2,
  Users,
  Eye,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Search,
  RefreshCw,
  X,
  Target
} from 'lucide-react';

// Leaflet default icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Red Pin for Authority Target
const targetPinIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Map Tile Resizer on mount/visibility change
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Helper to calculate circular polygon GeoJSON
function makeCircleGeoJSON(lat, lng, radiusKm, points = 32) {
  const coords = [];
  const latDeg = 1.0 / 110.574;
  const latRad = (lat * Math.PI) / 180;
  const lngDeg = 1.0 / (111.320 * Math.max(0.01, Math.cos(latRad)));

  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    const dLat = radiusKm * Math.sin(angle) * latDeg;
    const dLng = radiusKm * Math.cos(angle) * lngDeg;
    coords.push([parseFloat((lng + dLng).toFixed(6)), parseFloat((lat + dLat).toFixed(6))]);
  }
  coords.push(coords[0]);
  return JSON.stringify({ type: 'Polygon', coordinates: [coords] });
}

function MapCenterController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, zoom || 12, { animate: true });
    }
  }, [center, zoom, map]);
  return null;
}

// Map Click Listener
function MapDrawingHandler({ mode, onAddPoint, onSetRadiusCenter }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (mode === 'polygon') {
        onAddPoint([lat, lng]);
      } else if (mode === 'search' || mode === 'radius') {
        onSetRadiusCenter(lat, lng);
      }
    }
  });
  return null;
}

export function WarningCreator({ onWarningCreated, onCancel }) {
  const { user } = useAuth();
  const { addToast } = useNotification();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // 1: Disaster Info, 2: Geographic Target, 3: Confirmation Review

  const [formData, setFormData] = useState({
    disaster_type: 'Flood',
    title: '',
    description: '',
    severity: 'Severe',
    urgency: 'Immediate',
    certainty: 'Observed',
    area_name: '',
    recommended_instructions: '• Move to higher ground immediately.\n• Do not drive through flooded roads or underpasses.\n• Keep emergency phone charged and food/water supplies at hand.\n• Stay tuned to official emergency broadcasts.',
    issuing_authority_name: user?.department ? `${user.department} - ${user.full_name}` : `Disaster Operations - ${user?.full_name || 'Authorized Officer'}`
  });

  // Target areas list (support for multiple geographic targets)
  const [targetAreas, setTargetAreas] = useState([]);

  // Current active targeting mode: 'search' (default), 'polygon', 'radius'
  const [drawMode, setDrawMode] = useState('search');
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [radiusCenter, setRadiusCenter] = useState([19.0760, 72.8777]);
  const [radiusKm, setRadiusKm] = useState(5.0);
  const [currentAreaName, setCurrentAreaName] = useState('');
  const [currentPriority, setCurrentPriority] = useState('High'); // 'Critical', 'Immediate', 'High', 'Standard'

  // Search state for Authority Target Area
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [isSearchingTarget, setIsSearchingTarget] = useState(false);
  const [targetSearchResults, setTargetSearchResults] = useState([]);
  const [targetSearchError, setTargetSearchError] = useState(null);
  const [mapCenter, setMapCenter] = useState([19.0760, 72.8777]);
  const [mapZoom, setMapZoom] = useState(11);

  // Targeting Preview State
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const disasterTypes = [
    'Flood',
    'Cyclone',
    'Earthquake',
    'Wildfire',
    'Chemical Spill',
    'Tsunami',
    'Severe Storm',
    'Landslide',
    'Heatwave',
    'Drought'
  ];

  const handleSearchTargetArea = async (e) => {
    if (e) e.preventDefault();
    if (!targetSearchQuery.trim()) return;

    setIsSearchingTarget(true);
    setTargetSearchError(null);
    setTargetSearchResults([]);

    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(targetSearchQuery.trim())}&limit=6&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );

      if (!resp.ok) {
        throw new Error('Geocoding service unavailable.');
      }

      const data = await resp.json();
      if (!data || data.length === 0) {
        setTargetSearchError(`No matching locations found for "${targetSearchQuery}". Please refine your search query.`);
        return;
      }

      const results = data.map((item) => {
        const addr = item.address || {};
        const locality = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.hamlet || addr.city_district || item.name || '';
        const cityOrTown = addr.city || addr.town || addr.municipality || '';
        const districtName = addr.state_district || addr.county || '';
        const stateName = addr.state || '';

        let displayName = locality;
        if (displayName && cityOrTown && displayName !== cityOrTown) {
          displayName = `${displayName}, ${cityOrTown}`;
        } else if (!displayName) {
          displayName = item.display_name.split(',').slice(0, 2).join(', ');
        }

        return {
          name: displayName,
          city: cityOrTown,
          district: districtName,
          state: stateName,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          fullAddress: item.display_name
        };
      });

      setTargetSearchResults(results);
    } catch (err) {
      console.warn('Target area search error:', err);
      setTargetSearchError('Search failed. Please verify connection and retry.');
    } finally {
      setIsSearchingTarget(false);
    }
  };

  const handleSelectSearchResult = (result) => {
    setRadiusCenter([result.lat, result.lng]);
    setMapCenter([result.lat, result.lng]);
    setMapZoom(12);
    setCurrentAreaName(result.name);
    setTargetSearchResults([]);
    setTargetSearchQuery('');
    setTargetSearchError(null);
  };

  const handleAddPolygonPoint = (pt) => {
    setPolygonPoints((prev) => [...prev, pt]);
  };

  const handleClearDrawing = () => {
    setPolygonPoints([]);
  };

  const handleAddTargetArea = () => {
    let geojsonStr = '';
    let centerLat = 0;
    let centerLng = 0;

    if (drawMode === 'polygon') {
      if (polygonPoints.length < 3) {
        addToast('Please click at least 3 points on the map to define a closed polygon boundary.', 'warning');
        return;
      }
      const ring = polygonPoints.map(([lat, lng]) => [parseFloat(lng.toFixed(6)), parseFloat(lat.toFixed(6))]);
      ring.push(ring[0]); // Close ring
      geojsonStr = JSON.stringify({ type: 'Polygon', coordinates: [ring] });

      centerLat = polygonPoints.reduce((acc, p) => acc + p[0], 0) / polygonPoints.length;
      centerLng = polygonPoints.reduce((acc, p) => acc + p[1], 0) / polygonPoints.length;
    } else {
      // 'search' or 'radius' mode
      if (!radiusCenter || radiusCenter.length < 2) {
        addToast('Please search for a target location or click on the map to set the target center.', 'warning');
        return;
      }
      centerLat = radiusCenter[0];
      centerLng = radiusCenter[1];
      geojsonStr = makeCircleGeoJSON(centerLat, centerLng, radiusKm);
    }

    const name = currentAreaName.trim() || `${formData.area_name || 'Target'} Sector ${targetAreas.length + 1}`;

    const newTarget = {
      name,
      target_type: drawMode === 'polygon' ? 'polygon' : 'radius',
      geometry_geojson: geojsonStr,
      center_lat: parseFloat(centerLat.toFixed(6)),
      center_lng: parseFloat(centerLng.toFixed(6)),
      radius_km: drawMode === 'polygon' ? null : radiusKm,
      priority_level: currentPriority,
      notes: `${currentPriority} Priority target area`
    };

    const updated = [...targetAreas, newTarget];
    setTargetAreas(updated);
    setPolygonPoints([]);
    setCurrentAreaName('');
    addToast(`Added target area '${name}' (${currentPriority} priority).`, 'success');

    // Auto-fetch targeting preview with real DB counts
    fetchTargetingPreview(updated);
  };

  const handleRemoveTargetArea = (idx) => {
    const updated = targetAreas.filter((_, i) => i !== idx);
    setTargetAreas(updated);
    if (updated.length > 0) {
      fetchTargetingPreview(updated);
    } else {
      setPreviewData(null);
    }
  };

  const fetchTargetingPreview = async (areas) => {
    if (!areas || areas.length === 0) return;
    setPreviewLoading(true);
    try {
      const resp = await api.previewTargeting({ target_areas: areas });
      setPreviewData(resp);
    } catch (err) {
      console.warn('Targeting preview error:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (loading) return;
    if (!formData.title.trim() || !formData.area_name.trim() || !formData.recommended_instructions.trim()) {
      addToast('Please complete all required official warning fields.', 'warning');
      return;
    }

    if (targetAreas.length === 0) {
      addToast('Please define and confirm at least one geographic warning target area on the map.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        target_areas: targetAreas,
        area_polygon_geojson: targetAreas[0]?.geometry_geojson || null
      };

      const created = await api.createWarning(payload);
      addToast(`Disaster Warning #${created.identifier} created with ${targetAreas.length} target area(s).`, 'success');
      if (onWarningCreated) {
        onWarningCreated(created);
      }
    } catch (err) {
      addToast(err.message || 'Failed to create disaster warning.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card warning-creator-card" style={{ width: '100%', margin: '0 auto', padding: '2rem 2.25rem' }}>
      {/* Header */}
      <div className="card-header" style={{ marginBottom: '1.75rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--color-terracotta-light)', border: '1px solid var(--color-terracotta-border)', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={24} color="var(--color-terracotta)" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: 0, letterSpacing: '-0.015em' }}>
              Issue Disaster Warning
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '4px 0 0 0', fontWeight: 500 }}>
              Warning Details • Target Area • Review & Approve
            </p>
          </div>
        </div>

        {/* Multi-step progress indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className={`step-badge ${currentStep === 1 ? 'step-badge-active' : 'step-badge-done'}`}>
            1. Warning Details
          </span>
          <span className={`step-badge ${currentStep === 2 ? 'step-badge-active' : (currentStep > 2 || targetAreas.length > 0 ? 'step-badge-done' : 'step-badge-upcoming')}`}>
            2. Target Area ({targetAreas.length})
          </span>
          <span className={`step-badge ${currentStep === 3 ? 'step-badge-active' : 'step-badge-upcoming'}`}>
            3. Review & Approve
          </span>
        </div>
      </div>

      {/* STEP 1: Official Disaster Details */}
      {currentStep === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); setCurrentStep(2); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {/* Disaster Type */}
            <div className="form-group">
              <label className="form-label">Disaster Type *</label>
              <select
                className="form-select"
                value={formData.disaster_type}
                onChange={(e) => setFormData({ ...formData, disaster_type: e.target.value })}
              >
                {disasterTypes.map((dt) => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </select>
            </div>

            {/* Severity */}
            <div className="form-group">
              <label className="form-label">Severity *</label>
              <select
                className="form-select"
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
              >
                <option value="Extreme">Extreme</option>
                <option value="Severe">Severe</option>
                <option value="Moderate">Moderate</option>
                <option value="Minor">Minor</option>
              </select>
            </div>

            {/* Urgency */}
            <div className="form-group">
              <label className="form-label">Urgency *</label>
              <select
                className="form-select"
                value={formData.urgency}
                onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
              >
                <option value="Immediate">Immediate</option>
                <option value="Expected">Expected</option>
                <option value="Future">Future</option>
              </select>
            </div>
          </div>

          {/* Warning Title */}
          <div className="form-group">
            <label className="form-label">Warning Title *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Severe Flash Flood Warning"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          {/* General Affected Region */}
          <div className="form-group">
            <label className="form-label">Affected Region *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Riverside District & Coastal Sector"
              value={formData.area_name}
              onChange={(e) => setFormData({ ...formData, area_name: e.target.value })}
              required
            />
            <span className="form-hint">
              Descriptive region name. You will select the exact geographic target on the map in the next step.
            </span>
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Situation Description *</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Describe observed disaster conditions, affected infrastructure, and current developments..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
            <span className="form-hint">
              Describe the observed disaster conditions and scope of impact.
            </span>
          </div>

          {/* Recommended Instructions */}
          <div className="form-group">
            <label className="form-label">Safety Instructions *</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={formData.recommended_instructions}
              onChange={(e) => setFormData({ ...formData, recommended_instructions: e.target.value })}
              required
            />
            <span className="form-hint">
              Enter official safety instructions. These will be prepared in clear English and Hindi for citizens.
            </span>
          </div>

          {/* Issuing Authority */}
          <div className="form-group">
            <label className="form-label">Issuing Authority</label>
            <input
              type="text"
              className="form-input"
              value={formData.issuing_authority_name}
              onChange={(e) => setFormData({ ...formData, issuing_authority_name: e.target.value })}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
            {onCancel && (
              <button type="button" className="btn btn-outline" onClick={onCancel} disabled={loading}>
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!formData.title.trim() || !formData.area_name.trim() || !formData.description.trim()}
            >
              <span>Next: Select Target Area</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}

      {/* STEP 2: Geographic Target Area Selection */}
      {currentStep === 2 && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={22} color="var(--color-terracotta)" />
              <span>Warning Target Area</span>
            </h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              Select the area where this warning should be delivered. Only registered citizens inside the selected area will receive this warning.
            </p>
          </div>

          {/* Search Bar for Warning Target Area */}
          <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
            <form onSubmit={handleSearchTargetArea} style={{ display: 'flex', gap: '6px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '2.5rem', fontSize: '0.95rem' }}
                  placeholder="Search locality, city, district, or ward (e.g. South Mumbai, Riverside, Pune)..."
                  value={targetSearchQuery}
                  onChange={(e) => {
                    setTargetSearchQuery(e.target.value);
                    if (targetSearchError) setTargetSearchError(null);
                  }}
                />
                <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSearchingTarget || !targetSearchQuery.trim()}
              >
                <span>{isSearchingTarget ? 'Searching...' : 'Search Location'}</span>
              </button>
            </form>

            {/* Target Area Search Dropdown */}
            {targetSearchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                  background: '#ffffff',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  maxHeight: 260,
                  overflowY: 'auto',
                  marginTop: 6
                }}
              >
                <div style={{ padding: '8px 14px', background: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-light)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Select Target Area ({targetSearchResults.length} found):</span>
                  <button
                    type="button"
                    onClick={() => setTargetSearchResults([])}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    <X size={16} />
                  </button>
                </div>
                {targetSearchResults.map((res, i) => (
                  <div
                    key={i}
                    onClick={() => handleSelectSearchResult(res)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: i < targetSearchResults.length - 1 ? '1px solid var(--border-light)' : 'none',
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-terracotta-light)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <MapPin size={18} color="var(--color-terracotta)" style={{ flexShrink: 0 }} />
                    <div>
                      <strong style={{ display: 'block', color: 'var(--color-espresso-dark)' }}>{res.name}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {[res.district, res.city, res.state].filter(Boolean).join(', ') || res.fullAddress}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search Error Feedback */}
          {targetSearchError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '8px 12px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ color: '#fca5a5', fontSize: '0.82rem' }}>{targetSearchError}</span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                onClick={() => handleSearchTargetArea()}
              >
                <RefreshCw size={12} />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Targeting Controls & Precision Modes */}
          <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-espresso-base)' }}>Targeting Mode:</span>
              <button
                type="button"
                className={`btn btn-sm ${drawMode === 'search' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setDrawMode('search'); setPolygonPoints([]); }}
              >
                Search & Radius
              </button>
              <button
                type="button"
                className={`btn btn-sm ${drawMode === 'polygon' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setDrawMode('polygon'); setPolygonPoints([]); }}
              >
                Custom Boundary
              </button>
            </div>

            {/* Priority Selector for Target */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-espresso-base)' }}>Priority:</span>
              <select
                className="form-select"
                style={{ width: 'auto', minHeight: 36, padding: '4px 12px', fontSize: '0.88rem' }}
                value={currentPriority}
                onChange={(e) => setCurrentPriority(e.target.value)}
              >
                <option value="Critical">Critical</option>
                <option value="Immediate">Immediate</option>
                <option value="High">High</option>
                <option value="Standard">Standard</option>
              </select>
            </div>
          </div>

          {/* Radius Slider if search/radius mode is selected */}
          {drawMode !== 'polygon' && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', padding: '0.75rem 1.15rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 700 }}>
                Coverage Radius: {radiusKm} km
              </span>
              <input
                type="range"
                min="1"
                max="40"
                step="0.5"
                value={radiusKm}
                onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
                style={{ flex: 1, minWidth: 160 }}
              />
              <span style={{ fontSize: '0.82rem', color: '#15803d', fontWeight: 600 }}>
                Center: {radiusCenter ? `${radiusCenter[0].toFixed(3)}°N, ${radiusCenter[1].toFixed(3)}°E` : 'Click map to place pin'}
              </span>
            </div>
          )}

          {/* Active Polygon Points Feedback */}
          {drawMode === 'polygon' && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 'var(--radius-md)', padding: '0.75rem 1.15rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.88rem', color: '#0369a1' }}>
                <strong>Boundary Vertices:</strong> {polygonPoints.length} points placed. {polygonPoints.length < 3 ? '(Click on map to add corners)' : '(Ready to add area)'}
              </span>
              {polygonPoints.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ padding: '3px 10px', fontSize: '0.8rem' }}
                  onClick={handleClearDrawing}
                >
                  Clear Points
                </button>
              )}
            </div>
          )}

          {/* Interactive Leaflet Map */}
          <div style={{ height: '360px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-medium)', position: 'relative' }}>
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ width: '100%', height: '100%' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapResizer />
              <MapCenterController center={mapCenter} zoom={mapZoom} />

              <MapDrawingHandler
                mode={drawMode}
                onAddPoint={handleAddPolygonPoint}
                onSetRadiusCenter={(lat, lng) => {
                  setRadiusCenter([lat, lng]);
                  setMapCenter([lat, lng]);
                }}
              />

              {/* In-progress polygon drawing */}
              {drawMode === 'polygon' && polygonPoints.length > 0 && (
                <>
                  {polygonPoints.map((pt, i) => (
                    <Marker key={i} position={pt} />
                  ))}
                  {polygonPoints.length >= 3 && (
                    <Polygon
                      positions={polygonPoints}
                      pathOptions={{ color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 0.35, weight: 2 }}
                    />
                  )}
                </>
              )}

              {/* In-progress radius target display */}
              {drawMode !== 'polygon' && radiusCenter && (
                <>
                  <Marker position={radiusCenter} icon={targetPinIcon} />
                  <Circle
                    center={radiusCenter}
                    radius={radiusKm * 1000}
                    pathOptions={{ color: '#dc2626', fillColor: '#f87171', fillOpacity: 0.3, weight: 2 }}
                  />
                </>
              )}

              {/* Already Confirmed Target Areas */}
              {targetAreas.map((ta, idx) => {
                let coords = [];
                try {
                  const g = JSON.parse(ta.geometry_geojson);
                  if (g.coordinates && g.coordinates[0]) {
                    coords = g.coordinates[0].map(([lng, lat]) => [lat, lng]);
                  }
                } catch {
                  // Ignore invalid geometry JSON
                }

                if (coords.length === 0) return null;
                const color = ta.priority_level === 'Critical' ? '#dc2626' : (ta.priority_level === 'Immediate' ? '#ea580c' : '#0284c7');

                return (
                  <Polygon
                    key={idx}
                    positions={coords}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.45, weight: 3 }}
                  />
                );
              })}
            </MapContainer>
          </div>

          {/* Add Target Area Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="Area Name (e.g. Riverside Sector A)"
              value={currentAreaName}
              onChange={(e) => setCurrentAreaName(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAddTargetArea}
              disabled={drawMode === 'polygon' ? polygonPoints.length < 3 : !radiusCenter}
            >
              <Plus size={16} />
              <span>Add Target Area</span>
            </button>
          </div>

          {/* Defined Target Areas List */}
          <div style={{ marginTop: '1.5rem' }}>
            <h5 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-espresso-dark)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Confirmed Target Areas ({targetAreas.length})</span>
              {targetAreas.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => fetchTargetingPreview(targetAreas)}
                  disabled={previewLoading}
                >
                  <Eye size={14} />
                  <span>{previewLoading ? 'Calculating...' : 'Recalculate Targeting'}</span>
                </button>
              )}
            </h5>

            {targetAreas.length === 0 ? (
              <div style={{ background: '#fdfbf7', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <MapPin size={26} color="var(--color-terracotta)" style={{ marginBottom: 8, display: 'inline' }} />
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>No target area selected yet.</p>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Search for a location or click on the map, then click "Add Target Area".
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {targetAreas.map((ta, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#fdfbf7',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem 1.15rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '0.98rem', color: 'var(--color-espresso-dark)' }}>{ta.name}</strong>
                        <span className={`badge ${ta.priority_level === 'Critical' ? 'badge-extreme' : (ta.priority_level === 'Immediate' ? 'badge-attention' : 'badge-primary')}`} style={{ fontSize: '0.72rem' }}>
                          {ta.priority_level} Priority
                        </span>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2, display: 'block' }}>
                        Type: {ta.target_type} • Center: {ta.center_lat}°N, {ta.center_lng}°E {ta.radius_km ? `• Radius: ${ta.radius_km} km` : ''}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                      onClick={() => handleRemoveTargetArea(i)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Targeting Population Preview Box */}
          {previewData && (
            <div
              style={{
                background: previewData.is_empty ? 'rgba(217, 119, 6, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                border: `1px solid ${previewData.is_empty ? 'rgba(217, 119, 6, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                borderRadius: '8px',
                padding: '1rem',
                marginTop: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={24} color={previewData.is_empty ? '#fbbf24' : '#34d399'} />
                <div>
                  <strong style={{ fontSize: '0.95rem', color: previewData.is_empty ? '#fbbf24' : '#34d399', display: 'block' }}>
                    Targeted Population: {previewData.summary_message}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: previewData.is_empty ? '#fcd34d' : '#a7f3d0' }}>
                    {previewData.is_empty
                      ? 'No registered citizens match this target area.'
                      : 'These registered citizens will receive this warning upon approval.'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {previewData.breakdown_by_area?.map((b, bi) => (
                  <span key={bi} className="badge badge-standard" style={{ fontSize: '0.75rem' }}>
                    {b.target_name}: {b.citizens_count} citizen{b.citizens_count !== 1 ? 's' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setCurrentStep(1)}
            >
              <ArrowLeft size={16} />
              <span>Back to Warning Details</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              disabled={targetAreas.length === 0}
              onClick={() => setCurrentStep(3)}
            >
              <span>Review Targeting</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Confirmation Review & Submit */}
      {currentStep === 3 && (
        <div>
          <div style={{ background: '#fdfbf7', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-espresso-dark)', marginBottom: '1rem' }}>
              Warning & Target Area Summary
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', fontSize: '0.92rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Warning Title:</span>
                <strong style={{ display: 'block', color: 'var(--color-espresso-dark)', fontSize: '1rem', marginTop: 2 }}>{formData.title}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Disaster / Severity:</span>
                <strong style={{ display: 'block', color: 'var(--color-espresso-dark)', fontSize: '1rem', marginTop: 2 }}>{formData.disaster_type} • {formData.severity} ({formData.urgency})</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Affected Region:</span>
                <strong style={{ display: 'block', color: 'var(--color-espresso-dark)', fontSize: '1rem', marginTop: 2 }}>{formData.area_name}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Target Areas:</span>
                <strong style={{ display: 'block', color: 'var(--color-terracotta)', fontSize: '1rem', marginTop: 2 }}>
                  {targetAreas.length} area(s) ({previewData ? `${previewData.total_citizens_targeted} citizen(s) targeted` : 'Ready to verify'})
                </strong>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Safety Instructions:</span>
              <div style={{ fontSize: '0.92rem', color: 'var(--text-main)', marginTop: 6, whiteSpace: 'pre-wrap', background: '#ffffff', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', lineHeight: 1.5 }}>
                {formData.recommended_instructions}
              </div>
            </div>
          </div>

          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', padding: '0.95rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem', color: '#15803d', fontWeight: 600, lineHeight: 1.45 }}>
              Target area confirmed. Relevant SOP guidance will be retrieved and drafts generated in English and Hindi for authority review.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setCurrentStep(2)}
              disabled={loading}
            >
              <ArrowLeft size={16} />
              <span>Back to Target Area</span>
            </button>

            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleSubmit}
              disabled={loading}
            >
              <Sparkles size={18} />
              <span>{loading ? 'Generating Drafts...' : 'Create Warning & Draft Citizen Messages'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

