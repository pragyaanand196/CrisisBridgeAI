import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Search, Navigation, CheckCircle2, Shield, AlertCircle, RefreshCw, X, Check } from 'lucide-react';

// Setup Leaflet marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Terracotta-Red Pin for Citizen Location
const citizenPinIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer1 = setTimeout(() => map.invalidateSize(), 150);
    const timer2 = setTimeout(() => map.invalidateSize(), 500);

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);
  return null;
}

function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      onLocationSelect(lat, lng);
    }
  });
  return null;
}

function MapCenterController({ center, zoom }) {
  const map = useMap();
  const lastCenterRef = useRef(null);

  useEffect(() => {
    if (center && center[0] && center[1]) {
      const prev = lastCenterRef.current;
      if (!prev || prev[0] !== center[0] || prev[1] !== center[1] || prev[2] !== zoom) {
        lastCenterRef.current = [center[0], center[1], zoom];
        map.setView(center, zoom || 13, { animate: true });
      }
    }
  }, [center, zoom, map]);

  return null;
}

export function LocationPicker({
  value = {},
  onChange,
  required = true,
  title = "Where are you located?"
}) {
  const [selectedLat, setSelectedLat] = useState(value.latitude || null);
  const [selectedLng, setSelectedLng] = useState(value.longitude || null);
  const [locationName, setLocationName] = useState(value.location_name || '');
  const [district, setDistrict] = useState(value.district || '');
  const [city, setCity] = useState(value.city || '');
  const [state, setState] = useState(value.state || '');
  const [postalCode, setPostalCode] = useState(value.postal_code || '');

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [locatingDevice, setLocatingDevice] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(Boolean(value.latitude && value.longitude && value.location_name));

  const defaultCenter = selectedLat && selectedLng ? [selectedLat, selectedLng] : [20.5937, 78.9629];
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(selectedLat && selectedLng ? 13 : 5);

  // Stale request guards
  const activeSearchIdRef = useRef(0);
  const activeGeocodeIdRef = useRef(0);

  // Sync internal coordinate/address state if the parent externally updates the location prop
  // (e.g. pre-populating on profile edit). Does NOT touch isConfirmed — confirmation is only
  // set by the user clicking "Confirm Location" or explicitly cleared by handleClearSelection.
  useEffect(() => {
    if (value.latitude && value.longitude) {
      setSelectedLat(value.latitude);
      setSelectedLng(value.longitude);
      setMapCenter([value.latitude, value.longitude]);
      setMapZoom(13);
      if (value.location_name) setLocationName(value.location_name);
      if (value.district) setDistrict(value.district);
      if (value.city) setCity(value.city);
      if (value.state) setState(value.state);
      if (value.postal_code) setPostalCode(value.postal_code);
      // NOTE: intentionally NOT calling setIsConfirmed(true) here.
      // Displaying a confirmed badge without the user clicking "Confirm Location"
      // causes the child UI to show "LOCATION CONFIRMED" while the parent
      // registration form still has locationConfirmed = false, which triggers
      // the spurious toast when the user clicks "Create Account".
    }
  }, [value.latitude, value.longitude, value.location_name]);

  const handleMapClick = async (lat, lng) => {
    const geocodeId = ++activeGeocodeIdRef.current;

    setSelectedLat(lat);
    setSelectedLng(lng);
    setMapCenter([lat, lng]);
    setMapZoom(13);
    setIsConfirmed(false); // Invalidate confirmation
    setSearchError(null);

    // Initial placeholder while reverse geocoding completes
    const fallbackName = `Selected Area (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E)`;
    setLocationName(fallbackName);

    // Notify parent immediately of unconfirmed change so stale confirmation cannot be submitted
    if (onChange) {
      onChange({
        location_name: fallbackName,
        latitude: lat,
        longitude: lng,
        district: '',
        city: '',
        state: '',
        postal_code: '',
        location_accuracy_radius_m: 500.0,
        is_confirmed: false
      });
    }

    // Reverse geocode via Nominatim
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        {
          headers: { 'Accept-Language': 'en' },
          signal: AbortSignal.timeout(8000)
        }
      );

      // Check if another map click or search occurred while waiting
      if (geocodeId !== activeGeocodeIdRef.current) return;

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.address) {
          const addr = data.address;
          const sub = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.hamlet || addr.quarter || addr.city_district || '';
          const c = addr.city || addr.town || addr.municipality || '';
          const d = addr.state_district || addr.county || '';
          const s = addr.state || '';
          const p = addr.postcode || '';

          let resolved = '';
          if (sub && c && sub !== c) {
            resolved = `${sub}, ${c}`;
          } else if (sub) {
            resolved = d ? `${sub}, ${d}` : sub;
          } else if (data.name) {
            resolved = c ? `${data.name}, ${c}` : data.name;
          } else if (c) {
            resolved = `${c} Area`;
          } else if (d) {
            resolved = `${d} District Area`;
          } else {
            resolved = data.display_name ? data.display_name.split(',').slice(0, 2).join(', ') : fallbackName;
          }

          setLocationName(resolved);
          setDistrict(d);
          setCity(c);
          setState(s);
          setPostalCode(p);

          // Update parent with enriched address details (still unconfirmed until user clicks Confirm)
          if (onChange) {
            onChange({
              location_name: resolved,
              latitude: lat,
              longitude: lng,
              district: d,
              city: c,
              state: s,
              postal_code: p,
              location_accuracy_radius_m: 500.0,
              is_confirmed: false
            });
          }
        }
      }
    } catch (err) {
      // Discard errors from aborted or superseded calls
      if (geocodeId !== activeGeocodeIdRef.current) return;
      console.warn('Reverse geocoding unavailable, using coordinate label:', err);
    }
  };

  const handleSelectSearchResult = (result) => {
    // Invalidate any active background reverse geocoding
    activeGeocodeIdRef.current++;

    setSelectedLat(result.lat);
    setSelectedLng(result.lng);
    setMapCenter([result.lat, result.lng]);
    setMapZoom(14);
    setLocationName(result.name);
    setDistrict(result.district || '');
    setCity(result.city || '');
    setState(result.state || '');
    setPostalCode(result.postal_code || '');
    setSearchResults([]);
    setSearchQuery('');
    setSearchError(null);
    setIsConfirmed(false); // Invalidate confirmation on selection change

    // Notify parent immediately that new location is selected but unconfirmed
    if (onChange) {
      onChange({
        location_name: result.name,
        latitude: result.lat,
        longitude: result.lng,
        district: result.district || '',
        city: result.city || '',
        state: result.state || '',
        postal_code: result.postal_code || '',
        location_accuracy_radius_m: 500.0,
        is_confirmed: false
      });
    }
  };

  const handleSearchLocality = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
      e.stopPropagation();
    }

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchError('Please enter a city, town, village, or neighborhood to search.');
      return;
    }

    if (isSearching) return;

    const searchId = ++activeSearchIdRef.current;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=6&addressdetails=1`,
        {
          headers: { 'Accept-Language': 'en' },
          signal: AbortSignal.timeout(8000)
        }
      );

      // Check for stale response
      if (searchId !== activeSearchIdRef.current) return;

      if (resp.status === 429) {
        throw new Error('Search rate limit reached. Please wait a few seconds and try again.');
      }

      if (!resp.ok) {
        throw new Error(`Search service error (${resp.status}). Please try again.`);
      }

      const data = await resp.json();
      if (!data || data.length === 0) {
        setSearchError(`No locations found for "${trimmed}". Please check the spelling or search by city/town.`);
        return;
      }

      const apiResults = data.map((item) => {
        const addr = item.address || {};
        const locality = addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.hamlet || addr.quarter || addr.city_district || item.name || '';
        const cityOrTown = addr.city || addr.town || addr.municipality || '';
        const districtName = addr.state_district || addr.county || '';
        const stateName = addr.state || '';
        const pcode = addr.postcode || '';

        let primaryName = locality;
        if (primaryName && cityOrTown && primaryName.toLowerCase() !== cityOrTown.toLowerCase()) {
          primaryName = `${primaryName}, ${cityOrTown}`;
        } else if (!primaryName) {
          primaryName = item.display_name.split(',').slice(0, 2).join(', ');
        }

        return {
          name: primaryName,
          city: cityOrTown,
          district: districtName,
          state: stateName,
          postal_code: pcode,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          fullAddress: item.display_name
        };
      });

      setSearchResults(apiResults);
    } catch (err) {
      if (searchId !== activeSearchIdRef.current) return;
      console.warn('Location search error:', err);
      if (err.name === 'TimeoutError') {
        setSearchError('Search request timed out. Please check your connection and try again.');
      } else {
        setSearchError(err.message || 'Location search failed. Please verify your connection and try again.');
      }
    } finally {
      if (searchId === activeSearchIdRef.current) {
        setIsSearching(false);
      }
    }
  };

  const handleUseDeviceLocation = () => {
    if (!navigator.geolocation) {
      setSearchError('Geolocation is not supported by your browser. Please search for your area above.');
      return;
    }

    setLocatingDevice(true);
    setSearchError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingDevice(false);
        const { latitude, longitude } = pos.coords;
        handleMapClick(latitude, longitude);
      },
      (err) => {
        setLocatingDevice(false);
        console.warn('Geolocation failed:', err);
        let msg = 'Could not access device location. Please search for your locality or select it on the map.';
        if (err.code === 1) {
          msg = 'Location permission was denied. You can search for your city or click directly on the map.';
        } else if (err.code === 2) {
          msg = 'Position unavailable. Please search for your city or click directly on the map.';
        } else if (err.code === 3) {
          msg = 'Location request timed out. Please search for your locality above.';
        }
        setSearchError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirmLocation = () => {
    if (!selectedLat || !selectedLng || !locationName.trim()) {
      setSearchError('Please select a valid location on the map before confirming.');
      return;
    }

    setIsConfirmed(true);
    setSearchError(null);

    if (onChange) {
      onChange({
        location_name: locationName.trim(),
        latitude: selectedLat,
        longitude: selectedLng,
        district: district || '',
        city: city || '',
        state: state || '',
        postal_code: postalCode || '',
        location_accuracy_radius_m: 500.0,
        is_confirmed: true
      });
    }
  };

  const handleClearSelection = () => {
    activeGeocodeIdRef.current++;
    setSelectedLat(null);
    setSelectedLng(null);
    setLocationName('');
    setDistrict('');
    setCity('');
    setState('');
    setPostalCode('');
    setIsConfirmed(false);
    setSearchResults([]);
    setSearchError(null);
    setSearchQuery('');

    if (onChange) {
      onChange({
        location_name: '',
        latitude: null,
        longitude: null,
        district: '',
        city: '',
        state: '',
        postal_code: '',
        location_accuracy_radius_m: 500.0,
        is_confirmed: false
      });
    }
  };

  const hasSelection = selectedLat !== null && selectedLng !== null && locationName.trim().length > 0;

  return (
    <div className="location-picker-card">
      {/* Title & Explanation */}
      <div className="location-picker-header">
        <div>
          <label className="form-label location-picker-title" htmlFor="input-location-search">
            <MapPin size={18} color="var(--color-terracotta)" />
            <span>{title}</span>
            {required && <span className="required-star">*</span>}
          </label>
          <p className="location-picker-subtitle">
            Select your location to receive emergency warnings for your area.
          </p>
        </div>

        <button
          type="button"
          id="btn-use-current-location"
          className="btn-use-location"
          onClick={handleUseDeviceLocation}
          disabled={locatingDevice}
          aria-label="Use device current location"
        >
          <Navigation size={14} color="var(--color-terracotta)" />
          <span>{locatingDevice ? 'Detecting...' : 'Use Current Location'}</span>
        </button>
      </div>

      {/* Map Search Bar - NON-NESTED (div container to prevent interfering with parent form submit) */}
      <div className="location-search-wrapper">
        <div className="location-search-row">
          <div className="location-search-input-box">
            <input
              id="input-location-search"
              type="text"
              className="form-input location-search-input"
              placeholder="Search city, town, village, or neighborhood..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (searchError) setSearchError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSearchLocality();
                }
              }}
              aria-label="Search locality for emergency warnings"
            />
            <Search size={16} className="location-search-icon" aria-hidden="true" />
          </div>
          <button
            id="btn-location-search"
            type="button"
            className="btn-location-search"
            disabled={isSearching || !searchQuery.trim()}
            onClick={() => handleSearchLocality()}
            aria-label="Search location"
          >
            <span>{isSearching ? 'Searching...' : 'Search'}</span>
          </button>
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div id="location-search-results-dropdown" className="location-dropdown" role="listbox">
            <div className="location-dropdown-header">
              <span>Search Results ({searchResults.length}) — Click to select:</span>
              <button
                type="button"
                onClick={() => setSearchResults([])}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-warm-brown)', display: 'inline-flex', padding: 2 }}
                aria-label="Close search results"
              >
                <X size={15} />
              </button>
            </div>
            {searchResults.map((res, i) => (
              <div
                key={i}
                className="location-dropdown-item"
                onClick={() => handleSelectSearchResult(res)}
                role="option"
                aria-selected={false}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectSearchResult(res);
                  }
                }}
              >
                <MapPin size={16} color="var(--color-terracotta)" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', color: 'var(--color-espresso-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {res.name}
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-warm-brown)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[res.district, res.city, res.state].filter(Boolean).join(', ') || res.fullAddress}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search or Geocoding Error Message */}
      {searchError && (
        <div id="location-picker-error" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', fontSize: '0.84rem' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{searchError}</span>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#991b1b', borderColor: '#fca5a5', background: '#ffffff' }}
            onClick={() => handleSearchLocality()}
          >
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Interactive Map */}
      <div className="location-map-frame">
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
          <MapClickHandler onLocationSelect={handleMapClick} />

          {selectedLat && selectedLng && (
            <>
              <Marker position={[selectedLat, selectedLng]} icon={citizenPinIcon} />
              <Circle
                center={[selectedLat, selectedLng]}
                radius={500}
                pathOptions={{
                  color: isConfirmed ? '#15803d' : '#8b3a2b',
                  fillColor: isConfirmed ? '#16a34a' : '#c2410c',
                  fillOpacity: 0.18,
                  weight: 2
                }}
              />
            </>
          )}
        </MapContainer>
      </div>

      {/* Location Confirmation & Details Bar */}
      <div style={{ marginTop: '0.85rem' }}>
        {hasSelection ? (
          <div
            id="location-selection-box"
            className={`location-selected-card ${isConfirmed ? 'location-selected-card--confirmed' : 'location-selected-card--pending'}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ minWidth: 200, flex: 1 }}>
                <span style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: isConfirmed ? 'var(--status-stable)' : 'var(--color-terracotta)',
                  letterSpacing: '0.04em',
                  display: 'block'
                }}>
                  {isConfirmed ? '✓ Confirmed Alert Location' : 'Selected Location (Pending Confirmation)'}
                </span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--color-espresso-dark)', display: 'block', marginTop: 2 }}>
                  {locationName}
                </strong>
                <span style={{ fontSize: '0.82rem', color: isConfirmed ? '#166534' : 'var(--color-warm-brown)' }}>
                  {[district, city, state].filter(Boolean).join(', ') || 'Local Warning Area'} &bull; ({selectedLat?.toFixed(4)}°, {selectedLng?.toFixed(4)}°)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  id="btn-clear-location"
                  className="btn btn-outline btn-sm"
                  onClick={handleClearSelection}
                  style={{ fontSize: '0.82rem', background: '#ffffff', color: 'var(--color-espresso-base)' }}
                >
                  Clear
                </button>

                {!isConfirmed ? (
                  <button
                    type="button"
                    id="btn-confirm-location"
                    className="btn btn-primary btn-sm"
                    onClick={handleConfirmLocation}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.86rem', fontWeight: 700, padding: '7px 16px' }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Confirm Location</span>
                  </button>
                ) : (
                  <span
                    id="badge-location-confirmed"
                    className="badge badge-stable"
                    style={{
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      padding: '6px 14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: '#bbf7d0',
                      color: '#14532d',
                      border: '1px solid #86efac'
                    }}
                  >
                    <Check size={15} />
                    <span>Location Confirmed</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div
            id="location-instruction-box"
            className="location-instruction-card"
          >
            <div className="location-instruction-text">
              <AlertCircle size={17} color="var(--color-terracotta)" style={{ flexShrink: 0 }} />
              <span>Search above or click the map to choose your location, then click <strong>"Confirm Location"</strong>.</span>
            </div>
            <button
              type="button"
              id="btn-confirm-location-disabled"
              className="btn-confirm-disabled"
              disabled={true}
              title="Please choose a location on the map or search first"
            >
              <CheckCircle2 size={15} color="#6a574e" />
              <span>Confirm Location</span>
            </button>
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="location-privacy-notice">
        <Shield size={15} color="var(--color-terracotta)" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong style={{ color: 'var(--color-espresso-dark)' }}>Privacy:</strong>{' '}
          Your location is only used to deliver relevant disaster alerts and is never shared publicly.
        </span>
      </div>
    </div>
  );
}
