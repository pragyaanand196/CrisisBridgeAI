import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useWebSocket } from '../context/WebSocketContext';
import { ActiveWarningCard } from '../components/citizen/ActiveWarningCard';
import { LocationPicker } from '../components/common/LocationPicker';
import { Modal } from '../components/common/Modal';
import { BackButton } from '../components/common/BackButton';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Badge } from '../components/common/Badge';
import {
  ShieldCheck,
  MapPin,
  Phone,
  HeartPulse,
  RefreshCw,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  Truck,
  Clock,
  Radio,
  User,
  LogOut
} from 'lucide-react';

export function CitizenDashboard() {
  const { user, refreshUser, logout } = useAuth();
  const { addToast } = useNotification();
  const { subscribe } = useWebSocket();
  const location = useLocation();
  const navigate = useNavigate();

  const [warnings, setWarnings] = useState([]);
  const [myAssistanceRequests, setMyAssistanceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingState, setRespondingState] = useState({});

  useEffect(() => {
    if (location.state?.roleNotice) {
      addToast(location.state.roleNotice, 'warning', 6000);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, addToast]);

  // Assistance verification feedback inputs per request
  const [verificationNotes, setVerificationNotes] = useState({});
  const [verifyingState, setVerifyingState] = useState({});

  // Location update modal state
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [updatingLocation, setUpdatingLocation] = useState(false);

  const loadCitizenData = useCallback(async () => {
    try {
      const [warns, myHelp] = await Promise.all([
        api.getCitizenActiveWarnings().catch(() => []),
        user ? api.getMyAssistanceRequests().catch(() => []) : Promise.resolve([])
      ]);
      setWarnings(warns || []);
      setMyAssistanceRequests(myHelp || []);
    } catch (err) {
      console.error('Failed to load citizen alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadCitizenData();

    // Subscribe to live events
    const unsubWarn = subscribe('WARNING_DISTRIBUTED', () => loadCitizenData());
    const unsubCancel = subscribe('WARNING_CANCELLED', () => loadCitizenData());
    const unsubHelp = subscribe('ASSISTANCE_REQUEST_CREATED', () => loadCitizenData());
    const unsubAck = subscribe('ASSISTANCE_ACKNOWLEDGED', (data) => {
      loadCitizenData();
      if (data && (!data.citizen_id || (user && data.citizen_id === user.id))) {
        addToast(data.message || 'Your emergency assistance request has been acknowledged by disaster authorities.', 'info', 8000);
      }
    });
    const unsubDisp = subscribe('ASSISTANCE_DISPATCHED', (data) => {
      loadCitizenData();
      if (data && (!data.citizen_id || (user && data.citizen_id === user.id))) {
        addToast(`Rescue Unit Dispatched: ${data.dispatched_unit_notes || 'Response Team'}. Please confirm when assistance arrives.`, 'warning', 10000);
      }
    });
    const unsubVerif = subscribe('ASSISTANCE_VERIFIED', () => loadCitizenData());
    const unsubStatus = subscribe('ASSISTANCE_STATUS_UPDATED', () => loadCitizenData());

    return () => {
      unsubWarn();
      unsubCancel();
      unsubHelp();
      unsubAck();
      unsubDisp();
      unsubVerif();
      unsubStatus();
    };
  }, [loadCitizenData, subscribe, addToast, user]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleCitizenResponse = async (payload) => {
    try {
      await api.submitCitizenResponse(payload);
      setRespondingState((prev) => ({
        ...prev,
        [payload.warning_id]: payload.response_type.replace('_', ' ').toUpperCase()
      }));

      if (payload.response_type === 'understand') {
        addToast('Acknowledgement logged: You confirmed you understand safety instructions.', 'success');
      } else if (payload.response_type === 'dont_understand') {
        addToast('Comprehension feedback received. Review simplified guidance below.', 'warning');
      } else if (payload.response_type === 'not_in_area') {
        addToast('Status recorded: Location Mismatch signal logged with disaster command center.', 'info');
      }
    } catch (err) {
      addToast(err.message || 'Failed to submit response.', 'danger');
    }
  };

  const handleCitizenAssistance = async (payload) => {
    try {
      await api.requestAssistance(payload);
      await api.submitCitizenResponse({
        warning_id: payload.warning_id,
        response_zone_id: payload.response_zone_id,
        response_type: 'need_help',
        feedback_notes: `Need ${payload.category} assistance for ${payload.headcount} people at ${payload.location_description}`
      }).catch(() => {});

      setRespondingState((prev) => ({
        ...prev,
        [payload.warning_id]: 'HELP REQUESTED'
      }));
      addToast('Emergency assistance request dispatched to rescue teams!', 'danger', 10000);
      loadCitizenData();
    } catch (err) {
      addToast(err.message || 'Failed to dispatch assistance request.', 'danger');
    }
  };

  const handleVerifyAssistanceArrival = async (requestId, arrived) => {
    const notes = verificationNotes[requestId] || '';
    setVerifyingState((prev) => ({ ...prev, [requestId]: true }));
    try {
      await api.verifyAssistanceArrival(requestId, {
        assistance_arrived: arrived,
        citizen_feedback_notes: notes
      });

      if (arrived) {
        addToast('Arrival verified: You confirmed emergency assistance has reached your location.', 'success', 8000);
      } else {
        addToast('Feedback logged: Disaster command center notified that assistance has not reached you yet.', 'warning', 8000);
      }
      loadCitizenData();
    } catch (err) {
      addToast(err.message || 'Failed to submit verification.', 'danger');
    } finally {
      setVerifyingState((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const handleSaveLocation = async () => {
    if (!pendingLocation || !pendingLocation.location_name || pendingLocation.latitude == null || pendingLocation.longitude == null) {
      addToast('Please select a location on the map first.', 'warning');
      return;
    }
    if (!pendingLocation.is_confirmed) {
      addToast('Please click "Confirm Location" inside the map before saving.', 'warning');
      return;
    }

    setUpdatingLocation(true);
    try {
      await api.updateCitizenLocation({
        location_name: pendingLocation.location_name,
        latitude: pendingLocation.latitude,
        longitude: pendingLocation.longitude,
        district: pendingLocation.district || '',
        city: pendingLocation.city || '',
        state: pendingLocation.state || '',
        postal_code: pendingLocation.postal_code || '',
        location_accuracy_radius_m: pendingLocation.location_accuracy_radius_m || 500.0
      });
      await refreshUser();
      await loadCitizenData();
      addToast(`Location updated to '${pendingLocation.location_name}'.`, 'success');
      setIsLocationModalOpen(false);
      setPendingLocation(null);
    } catch (err) {
      addToast(err.message || 'Failed to update location. Please try again.', 'danger');
    } finally {
      setUpdatingLocation(false);
    }
  };

  const handleLanguageChange = async (newLang) => {
    if (user) {
      try {
        await api.updateCitizenLanguage({ preferred_language: newLang });
      } catch (err) {
        console.warn('Could not persist language preference:', err);
      }
    }
  };

  if (loading) {
    return <LoadingSpinner text="Checking for active emergency warnings in your area..." fullPage />;
  }

  const hasLocation = user?.latitude !== null && user?.longitude !== null && user?.location_name;

  return (
    <div className="citizen-portal-container">
      {/* ── Continuous Photo Band: photo fades into cream via CSS pseudo-elements ── */}
      <div className="citizen-photo-band" aria-label="Citizen Portal Hero">
        <div className="citizen-hero-content">
          <div className="citizen-top-actions-bar">
            <BackButton fallbackPath="/" label="Back to Home" />

            <div className="citizen-hero-actions-right">
              {user && (
                <span className="citizen-hero-user-pill" title={`${user.full_name} (${user.role})`}>
                  <User size={15} aria-hidden="true" />
                  <span className="citizen-hero-user-name"><strong>{user.full_name}</strong></span>
                  <span className="citizen-hero-user-role">{user.role?.toUpperCase() || 'CITIZEN'}</span>
                </span>
              )}

              <button
                type="button"
                className="btn-citizen-hero-logout"
                onClick={handleLogout}
                aria-label="Logout of citizen account"
              >
                <LogOut size={14} aria-hidden="true" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          <div className="citizen-hero-title-block">
            <h1 className="citizen-portal-heading">Citizen Portal</h1>
            <p className="citizen-portal-subtitle">
              Emergency warnings and response updates for your area
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Body Content Overlapping Lower Hero ── */}
      <div className="citizen-portal-body">
        {/* ── Registered Location Card ── */}
        <div className="citizen-location-card">
          <div className="citizen-location-left">
            <div
              className={`citizen-location-icon-wrapper ${hasLocation ? 'is-active' : 'is-unconfigured'}`}
              aria-hidden="true"
            >
              <MapPin size={22} />
            </div>
            <div className="citizen-location-info">
              <div className="citizen-location-header-row">
                <span className="citizen-location-tag">
                  YOUR REGISTERED LOCATION
                </span>
                {hasLocation && (
                  <span className="citizen-active-status-badge">
                    ACTIVE
                  </span>
                )}
              </div>
              <strong className="citizen-location-name">
                {user?.location_name || 'No location configured'}
              </strong>
              <span className="citizen-location-subtext">
                {hasLocation
                  ? `${[user?.district, user?.city, user?.state].filter(Boolean).join(', ') || 'Registered Location'} • You will receive warnings active for this location`
                  : 'Please set your location to receive warnings for your area'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn-citizen-change-location"
            onClick={() => {
              setPendingLocation({
                location_name: user?.location_name || '',
                latitude: user?.latitude || null,
                longitude: user?.longitude || null,
                district: user?.district || '',
                city: user?.city || '',
                state: user?.state || '',
                postal_code: user?.postal_code || '',
                is_confirmed: Boolean(user?.latitude && user?.longitude && user?.location_name)
              });
              setIsLocationModalOpen(true);
            }}
          >
            <Edit3 size={15} />
            <span>{hasLocation ? 'Change Location' : 'Set Location'}</span>
          </button>
        </div>

        {/* Location Not Configured Notice */}
        {!hasLocation && (
          <div className="citizen-unconfigured-notice">
            <AlertTriangle size={24} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ fontSize: '0.98rem', color: '#92400e', display: 'block', marginBottom: 4 }}>
                Location Required for Warnings
              </strong>
              <p style={{ fontSize: '0.86rem', color: '#78350f', margin: 0 }}>
                You have not set your location yet. Please click "Set Location" above so we can show warnings for your area.
              </p>
            </div>
          </div>
        )}

        {/* Emergency Assistance Request Tracker (if citizen has requested help) */}
        {myAssistanceRequests.length > 0 && (
          <section className="citizen-requests-section" aria-label="Your Emergency Assistance Requests">
            <div className="citizen-section-heading-row">
              <HeartPulse size={20} color="#8b3a2b" />
              <h3 className="citizen-section-title">
                Emergency Assistance Requests ({myAssistanceRequests.length})
              </h3>
            </div>

            <div className="citizen-requests-list">
              {myAssistanceRequests.map((req) => {
                const isDispatched = req.status === 'Dispatched';
                const isAcknowledged = req.status === 'Acknowledged';
                const isPending = req.status === 'Pending';
                const isResolved = req.status === 'Resolved';
                const hasVerifiedArrived = req.citizen_verification_status === 'Assistance Arrived';
                const hasVerifiedNotArrived = req.citizen_verification_status === 'Assistance Not Arrived';

                return (
                  <div
                    key={req.id}
                    className="citizen-request-card"
                    style={{
                      borderLeft: isResolved
                        ? '4px solid #10b981'
                        : isDispatched
                        ? '4px solid #0284c7'
                        : isAcknowledged
                        ? '4px solid #8b3a2b'
                        : '4px solid #d97706'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 4 }}>
                          <Badge status={req.status} />
                          <Badge status={req.urgency_level} />
                          <span style={{ fontSize: '0.78rem', color: '#8c7e75' }}>
                            Request #{req.id} • {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <h4 style={{ fontSize: '1.15rem', color: '#22120c', margin: 0, textTransform: 'capitalize', fontWeight: 700 }}>
                          {req.category.replace('_', ' ')} Assistance ({req.headcount} {req.headcount === 1 ? 'person' : 'people'})
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: '#6b5a52', margin: '4px 0 0 0' }}>
                          <MapPin size={13} style={{ display: 'inline', marginRight: 4, color: '#8b3a2b' }} />
                          {req.location_description}
                        </p>
                      </div>

                      {req.contact_phone && (
                        <div style={{ fontSize: '0.82rem', color: '#6b5a52', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Phone size={13} color="#8b3a2b" />
                          <span>{req.contact_phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Status Detail Banners */}
                    {isPending && (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Clock size={20} color="#d97706" style={{ flexShrink: 0 }} />
                        <div>
                          <strong style={{ fontSize: '0.88rem', color: '#92400e', display: 'block' }}>
                            Request Submitted — Awaiting Review
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: '#78350f' }}>
                            Your request has been sent to emergency teams in your zone.
                          </span>
                        </div>
                      </div>
                    )}

                    {isAcknowledged && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0 }} />
                        <div>
                          <strong style={{ fontSize: '0.88rem', color: '#166534', display: 'block' }}>
                            Request Acknowledged
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: '#15803d' }}>
                            Emergency teams have reviewed your request and are coordinating help.
                            {req.acknowledged_at ? ` (Acknowledged at ${new Date(req.acknowledged_at).toLocaleTimeString()})` : ''}
                          </span>
                        </div>
                      </div>
                    )}

                    {isResolved && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0 }} />
                        <div>
                          <strong style={{ fontSize: '0.88rem', color: '#15803d', display: 'block' }}>
                            Assistance Resolved
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: '#166534' }}>
                            {req.resolution_notes || 'Emergency response completed.'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* DISPATCHED: ACTIONABLE CITIZEN VERIFICATION PROMPT */}
                    {isDispatched && (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                          <Truck size={20} color="#0284c7" />
                          <div>
                            <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                              Rescue Unit Dispatched: {req.dispatched_unit_notes || 'Response Team'}
                            </strong>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block' }}>
                              Dispatched at {new Date(req.dispatched_at || req.updated_at || Date.now()).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {hasVerifiedArrived ? (
                          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                            <div>
                              <strong style={{ fontSize: '0.85rem', color: '#166534', display: 'block' }}>
                                You confirmed help has arrived.
                              </strong>
                              <span style={{ fontSize: '0.78rem', color: '#15803d' }}>
                                Verified at {new Date(req.citizen_verified_at).toLocaleTimeString()}
                                {req.citizen_verification_notes ? ` • "${req.citizen_verification_notes}"` : ''}
                              </span>
                            </div>
                          </div>
                        ) : hasVerifiedNotArrived ? (
                          <div>
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
                              <div>
                                <strong style={{ fontSize: '0.85rem', color: '#991b1b', display: 'block' }}>
                                  You reported help has not arrived yet.
                                </strong>
                                <span style={{ fontSize: '0.78rem', color: '#b91c1c' }}>
                                  Emergency teams have been notified. If help arrives, update your confirmation below:
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              onClick={() => handleVerifyAssistanceArrival(req.id, true)}
                              disabled={verifyingState[req.id]}
                            >
                              <CheckCircle2 size={14} />
                              <span>Help Has Now Arrived</span>
                            </button>
                          </div>
                        ) : (
                          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                            <h5 style={{ fontSize: '0.92rem', color: '#0f172a', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Radio size={16} color="#8b3a2b" />
                              <span>Has assistance reached your location?</span>
                            </h5>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
                              Please confirm if emergency teams or supplies have arrived.
                            </p>

                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                              <input
                                type="text"
                                className="form-input"
                                placeholder="Optional notes for responders..."
                                style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                                value={verificationNotes[req.id] || ''}
                                onChange={(e) => setVerificationNotes({ ...verificationNotes, [req.id]: e.target.value })}
                              />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-success"
                                onClick={() => handleVerifyAssistanceArrival(req.id, true)}
                                disabled={verifyingState[req.id]}
                              >
                                <CheckCircle2 size={16} />
                                <span>Yes, Help Has Arrived</span>
                              </button>

                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ borderColor: 'rgba(220, 38, 38, 0.4)', color: '#dc2626' }}
                                onClick={() => handleVerifyAssistanceArrival(req.id, false)}
                                disabled={verifyingState[req.id]}
                              >
                                <AlertTriangle size={16} />
                                <span>No, Help Has Not Arrived</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Active Warnings Panel (Empty or Populated Cards) ── */}
        <section className="citizen-warning-panel" aria-label="Disaster Warnings for your area">
          {warnings.length === 0 ? (
            <div className="citizen-warning-empty-state">
              <div className="citizen-empty-shield-icon" aria-hidden="true">
                <ShieldCheck size={38} />
              </div>
              <h2 className="citizen-empty-heading">No active warnings for your area.</h2>
              <p className="citizen-empty-desc">
                There are currently no active emergency warnings for {user?.location_name || 'your area'}.
              </p>

              {/* Decorative Peach & Cream Curved Wave Illustration at Card Bottom */}
              <div className="citizen-empty-wave-decoration" aria-hidden="true">
                <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="citizen-wave-svg">
                  <path
                    d="M0,45 C180,85 360,25 540,55 C720,85 900,30 1080,50 C1140,56 1175,68 1200,72 L1200,120 L0,120 Z"
                    fill="rgba(251, 234, 222, 0.45)"
                  />
                  <path
                    d="M0,65 C160,35 340,80 520,60 C700,40 880,80 1040,65 C1120,58 1165,72 1200,78 L1200,120 L0,120 Z"
                    fill="rgba(247, 220, 206, 0.65)"
                  />
                </svg>
              </div>
            </div>
          ) : (
            <div className="citizen-active-warnings-stack">
              {warnings.map((warn) => (
                <ActiveWarningCard
                  key={warn.id}
                  warning={warn}
                  onRespond={handleCitizenResponse}
                  onSubmitAssistance={handleCitizenAssistance}
                  onLanguageChange={handleLanguageChange}
                  defaultLanguage={user?.preferred_language || 'en'}
                  userResponseState={respondingState[warn.id]}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Location Update Modal ── */}
      <Modal
        isOpen={isLocationModalOpen}
        onClose={() => {
          if (!updatingLocation) {
            setIsLocationModalOpen(false);
            setPendingLocation(null);
          }
        }}
        title={hasLocation ? 'Change Registered Location' : 'Set Your Location'}
        size="lg"
      >
        <p style={{ fontSize: '0.86rem', color: '#cbd5e1', marginBottom: '1rem' }}>
          Search for your city, town, or village — or click directly on the map.
          Once you see the green <strong>"Location Confirmed"</strong> badge, click{' '}
          <strong>Save Location</strong> to apply the change.
        </p>

        <LocationPicker
          value={pendingLocation || {}}
          onChange={(loc) => setPendingLocation(loc)}
          required={true}
          title="Select New Location"
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setIsLocationModalOpen(false);
              setPendingLocation(null);
            }}
            disabled={updatingLocation}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveLocation}
            disabled={updatingLocation || !pendingLocation?.is_confirmed || !pendingLocation?.location_name}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <CheckCircle2 size={16} />
            <span>{updatingLocation ? 'Saving...' : 'Save Location'}</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}
