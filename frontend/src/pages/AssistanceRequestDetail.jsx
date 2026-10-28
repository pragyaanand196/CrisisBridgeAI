import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { useWebSocket } from '../context/WebSocketContext';
import { BackButton } from '../components/common/BackButton';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import {
  HelpCircle,
  Users,
  MapPin,
  Phone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Truck,
  ShieldCheck,
  Radio,
  Check,
  ExternalLink,
  AlertOctagon,
  RefreshCw
} from 'lucide-react';

export function AssistanceRequestDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useNotification();
  const { subscribe } = useWebSocket();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dispatch modal state
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchUnit, setDispatchUnit] = useState('NDRF Quick Response Team 2');
  const [dispatchLoading, setDispatchLoading] = useState(false);

  // Resolve modal state
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('Rescue operation verified and completed.');
  const [resolveLoading, setResolveLoading] = useState(false);

  // Action loading for Acknowledge
  const [ackLoading, setAckLoading] = useState(false);

  const loadRequest = useCallback(async (quiet = false) => {
    if (!requestId) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await api.getAssistanceRequestDetail(requestId);
      setRequest(data);
    } catch (err) {
      console.error('Error fetching assistance request detail:', err);
      setError(err.message || 'Emergency assistance request could not be found.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  // Live real-time WebSocket listeners
  useEffect(() => {
    const unsubAck = subscribe('ASSISTANCE_ACKNOWLEDGED', (data) => {
      if (String(data.id) === String(requestId)) {
        loadRequest(true);
      }
    });

    const unsubDisp = subscribe('ASSISTANCE_DISPATCHED', (data) => {
      if (String(data.id) === String(requestId)) {
        loadRequest(true);
      }
    });

    const unsubVerif = subscribe('ASSISTANCE_VERIFIED', (data) => {
      if (String(data.id) === String(requestId)) {
        loadRequest(true);
        addToast(`Citizen Response: ${data.citizen_name || 'Citizen'} submitted verification evidence.`, 'info', 6000);
      }
    });

    const unsubStatus = subscribe('ASSISTANCE_STATUS_UPDATED', (data) => {
      if (String(data.id) === String(requestId)) {
        loadRequest(true);
      }
    });

    return () => {
      unsubAck();
      unsubDisp();
      unsubVerif();
      unsubStatus();
    };
  }, [subscribe, requestId, loadRequest, addToast]);

  // Acknowledge handler
  const handleAcknowledge = async () => {
    if (!request || ackLoading) return;
    setAckLoading(true);
    try {
      const updated = await api.acknowledgeAssistance(request.id);
      setRequest(updated);
      addToast(`Assistance Request #${request.id} acknowledged. Citizen notified.`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to acknowledge assistance request.', 'danger');
    } finally {
      setAckLoading(false);
    }
  };

  // Dispatch handler
  const handleDispatchSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!request || dispatchLoading) return;
    setDispatchLoading(true);
    try {
      const unit = dispatchUnit.trim() || 'Disaster Quick Response Unit';
      const updated = await api.dispatchAssistance(request.id, { dispatched_unit_notes: unit });
      setRequest(updated);
      setIsDispatchModalOpen(false);
      addToast(`Rescue Unit '${unit}' deployed to ${request.location_description}. Follow-up verification sent to citizen.`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to dispatch response unit.', 'danger');
    } finally {
      setDispatchLoading(false);
    }
  };

  // Resolve handler
  const handleResolveSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!request || resolveLoading) return;
    setResolveLoading(true);
    try {
      const notes = resolutionNotes.trim() || 'Assistance request resolved.';
      const updated = await api.resolveAssistance(request.id, { resolution_notes: notes });
      setRequest(updated);
      setIsResolveModalOpen(false);
      addToast(`Assistance Request #${request.id} resolved and closed successfully.`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to resolve assistance request.', 'danger');
    } finally {
      setResolveLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <BackButton fallbackPath="/authority" label="Back to Emergency Assistance Requests" />
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <LoadingSpinner size="lg" />
          <p style={{ marginTop: '1rem', color: '#cbd5e1', fontSize: '0.95rem', fontWeight: 600 }}>
            Loading emergency assistance request details...
          </p>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <BackButton fallbackPath="/authority" label="Back to Emergency Assistance Requests" />
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
          <AlertOctagon size={44} color="#f43f5e" style={{ margin: '0 auto 1rem auto' }} />
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-espresso-dark)', marginBottom: '0.5rem' }}>
            Request Not Found or Access Denied
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
            {error || 'The emergency assistance request could not be retrieved. It may have been resolved, archived, or you may lack authorized jurisdiction.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => loadRequest()}
            >
              <RefreshCw size={14} />
              <span>Retry</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/authority')}
            >
              <span>Return to Authority Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isArrivalConfirmed = request.citizen_verification_status === 'Assistance Arrived';
  const isArrivalNotReceived = request.citizen_verification_status === 'Assistance Not Arrived';
  const isPendingVerification = request.status === 'Dispatched' && !request.citizen_verified_at;

  const defaultResolveText = isArrivalConfirmed
    ? 'Rescue unit arrival confirmed by citizen. Assistance operation concluded successfully.'
    : isArrivalNotReceived
    ? 'Additional operational response deployed and situation stabilized.'
    : 'Assistance operation completed by dispatched unit.';

  return (
    <div className="assistance-detail-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Top Back Navigation */}
      <div style={{ marginBottom: '1.25rem' }}>
        <BackButton fallbackPath="/authority" label="Back to Emergency Assistance Requests" />
      </div>

      {/* Header Banner */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          padding: '1.5rem 1.75rem',
          background: 'linear-gradient(135deg, rgba(20, 11, 42, 0.9) 0%, rgba(35, 15, 65, 0.85) 100%)',
          borderColor: 'rgba(168, 85, 247, 0.35)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '12px',
                background:
                  request.urgency_level === 'Critical'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : request.urgency_level === 'High'
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(56, 189, 248, 0.2)',
                border:
                  request.urgency_level === 'Critical'
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : request.urgency_level === 'High'
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : '1px solid rgba(56, 189, 248, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color:
                  request.urgency_level === 'Critical'
                    ? '#f87171'
                    : request.urgency_level === 'High'
                    ? '#fbbf24'
                    : '#38bdf8',
                boxShadow: '0 0 20px rgba(0, 0, 0, 0.3)'
              }}
            >
              <HelpCircle size={28} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h1 className="page-title" style={{ fontSize: '1.45rem', margin: 0 }}>
                  Assistance Request #{request.id}
                </h1>
                <Badge status={request.status} />
                <Badge status={request.urgency_level} />
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} color="var(--text-muted)" />
                <span>Received {new Date(request.created_at).toLocaleString()}</span>
                {request.zone_name && (
                  <>
                    <span>•</span>
                    <span style={{ color: 'var(--color-terracotta)', fontWeight: 600 }}>{request.zone_name}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Quick Status Refresh Button */}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => loadRequest(true)}
            title="Refresh latest request status"
          >
            <RefreshCw size={13} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Details + Operational Lifecycle */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.75rem' }}>
        {/* Left Column: Citizen Request Data */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div className="card-header" style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>
            <h3 className="card-title" style={{ fontSize: '1.05rem' }}>
              <Users size={18} color="var(--color-terracotta)" />
              <span>Citizen & Incident Details</span>
            </h3>
            <span
              className="badge"
              style={{
                textTransform: 'capitalize',
                background: '#faeee9',
                color: 'var(--color-terracotta)',
                border: '1px solid #e7cdbf'
              }}
            >
              {request.category?.replace('_', ' ')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.88rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Requester Name
              </span>
              <strong style={{ display: 'block', color: 'var(--color-espresso-dark)', fontSize: '0.95rem', marginTop: '2px' }}>
                {request.user_full_name || 'Citizen (Anonymous / Guest)'}
              </strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Headcount Needing Assistance
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-espresso-dark)', marginTop: '2px' }}>
                <Users size={16} color="var(--color-terracotta)" />
                <strong style={{ fontSize: '0.95rem' }}>
                  {request.headcount} {request.headcount === 1 ? 'person' : 'people'}
                </strong>
              </div>
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Location & Landmark Description
              </span>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', color: 'var(--color-espresso-dark)', marginTop: '2px' }}>
                <MapPin size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '3px' }} />
                <span>{request.location_description}</span>
              </div>
              {request.latitude && request.longitude && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-terracotta)', marginLeft: '22px', display: 'block', marginTop: '2px', fontWeight: 600 }}>
                  Coordinates: {request.latitude.toFixed(4)}°N, {request.longitude.toFixed(4)}°E
                </span>
              )}
            </div>

            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Contact Phone
              </span>
              {request.contact_phone ? (
                <div style={{ marginTop: '3px' }}>
                  <a
                    href={`tel:${request.contact_phone}`}
                    className="btn btn-outline btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-terracotta)', borderColor: '#e7cdbf' }}
                  >
                    <Phone size={13} />
                    <span>Call {request.contact_phone}</span>
                  </a>
                </div>
              ) : (
                <span style={{ display: 'block', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                  Not provided
                </span>
              )}
            </div>

            {request.warning_title && (
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Linked Disaster Warning
                </span>
                <Link
                  to={`/warnings/${request.warning_id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--color-terracotta)',
                    marginTop: '2px',
                    textDecoration: 'none',
                    fontWeight: 600
                  }}
                >
                  <ExternalLink size={13} />
                  <span>{request.warning_title}</span>
                </Link>
              </div>
            )}

            {request.special_notes && (
              <div
                style={{
                  background: '#fdfbf7',
                  border: '1px solid #ede5da',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  marginTop: '0.5rem'
                }}
              >
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Citizen Special Notes
                </span>
                <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                  {request.special_notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Operational Response & Lifecycle Chain */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div className="card-header" style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>
            <h3 className="card-title" style={{ fontSize: '1.05rem' }}>
              <ShieldCheck size={18} color="#10b981" />
              <span>Response & Verification Status</span>
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              Real-time lifecycle
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.88rem' }}>
            {/* Step 1: Acknowledgement */}
            <div
              style={{
                background: request.acknowledged_at ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                border: request.acknowledged_at ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ color: request.acknowledged_at ? '#38bdf8' : '#cbd5e1', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={15} />
                  <span>1. Authority Acknowledgement</span>
                </strong>
                <span className={`badge ${request.acknowledged_at ? 'badge-primary' : 'badge-standard'}`} style={{ fontSize: '0.7rem' }}>
                  {request.acknowledged_at ? 'Acknowledged' : 'Pending'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1' }}>
                {request.acknowledged_at
                  ? `Acknowledged at ${new Date(request.acknowledged_at).toLocaleString()}`
                  : 'Awaiting operational acknowledgement by disaster response officer.'}
              </p>
            </div>

            {/* Step 2: Rescue Unit Dispatch */}
            <div
              style={{
                background: request.dispatched_at ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                border: request.dispatched_at ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ color: request.dispatched_at ? '#c084fc' : '#cbd5e1', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Truck size={15} />
                  <span>2. Rescue Unit Deployment</span>
                </strong>
                <span className={`badge ${request.dispatched_at ? 'badge-attention' : 'badge-standard'}`} style={{ fontSize: '0.7rem' }}>
                  {request.dispatched_at ? 'Dispatched' : 'Not Dispatched'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1' }}>
                {request.dispatched_at ? (
                  <>
                    <strong>Unit:</strong> {request.dispatched_unit_notes || 'Disaster Quick Response Team'}
                    <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.78rem', marginTop: '2px' }}>
                      Dispatched at {new Date(request.dispatched_at).toLocaleString()}
                    </span>
                  </>
                ) : (
                  'No rescue or relief unit has been deployed yet.'
                )}
              </p>
            </div>

            {/* Step 3: Citizen Arrival Confirmation */}
            <div
              style={{
                background: isArrivalConfirmed
                  ? 'rgba(16, 185, 129, 0.1)'
                  : isArrivalNotReceived
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(255, 255, 255, 0.02)',
                border: isArrivalConfirmed
                  ? '1px solid rgba(16, 185, 129, 0.35)'
                  : isArrivalNotReceived
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ color: isArrivalConfirmed ? '#4ade80' : isArrivalNotReceived ? '#f87171' : '#cbd5e1', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Radio size={15} />
                  <span>3. Citizen Response-Area Verification</span>
                </strong>
                <span
                  className={`badge ${
                    isArrivalConfirmed ? 'badge-stable' : isArrivalNotReceived ? 'badge-extreme' : 'badge-standard'
                  }`}
                  style={{ fontSize: '0.7rem' }}
                >
                  {request.citizen_verification_status || 'Awaiting Prompt'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1' }}>
                {isArrivalConfirmed ? (
                  <>
                    <strong style={{ color: '#4ade80' }}>Verified:</strong> Citizen confirmed help has arrived.
                    {request.citizen_verified_at && (
                      <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.78rem', marginTop: '2px' }}>
                        Confirmed at {new Date(request.citizen_verified_at).toLocaleString()}
                      </span>
                    )}
                    {request.citizen_verification_notes && (
                      <span style={{ display: 'block', color: '#bbf7d0', fontStyle: 'italic', marginTop: '3px' }}>
                        "{request.citizen_verification_notes}"
                      </span>
                    )}
                  </>
                ) : isArrivalNotReceived ? (
                  <>
                    <strong style={{ color: '#f87171' }}>Alert:</strong> Citizen reported help has not arrived yet.
                    {request.citizen_verified_at && (
                      <span style={{ display: 'block', color: '#fca5a5', fontSize: '0.78rem', marginTop: '2px' }}>
                        Reported at {new Date(request.citizen_verified_at).toLocaleString()}
                      </span>
                    )}
                    {request.citizen_verification_notes && (
                      <span style={{ display: 'block', color: '#fecaca', fontStyle: 'italic', marginTop: '3px' }}>
                        "{request.citizen_verification_notes}"
                      </span>
                    )}
                  </>
                ) : isPendingVerification ? (
                  'Prompt "Has emergency assistance reached your location?" is active on the citizen portal.'
                ) : (
                  'Prompt will be sent to citizen upon unit dispatch.'
                )}
              </p>
            </div>

            {/* Step 4: Resolution */}
            <div
              style={{
                background: request.status === 'Resolved' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                border: request.status === 'Resolved' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <strong style={{ color: request.status === 'Resolved' ? '#4ade80' : '#cbd5e1', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={15} />
                  <span>4. Authority Resolution</span>
                </strong>
                <span className={`badge ${request.status === 'Resolved' ? 'badge-stable' : 'badge-standard'}`} style={{ fontSize: '0.7rem' }}>
                  {request.status === 'Resolved' ? 'Resolved & Closed' : 'Open'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1' }}>
                {request.status === 'Resolved' ? (
                  <>
                    <strong>Resolution Notes:</strong> {request.resolution_notes || 'Assistance operation completed.'}
                    {request.resolved_at && (
                      <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.78rem', marginTop: '2px' }}>
                        Closed at {new Date(request.resolved_at).toLocaleString()}
                      </span>
                    )}
                  </>
                ) : (
                  'Assistance request remains open until confirmed and officially resolved by response authorities.'
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Action Controls Bar */}
      <div
        className="card"
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <strong style={{ fontSize: '0.95rem', color: 'var(--color-espresso-dark)', display: 'block' }}>
            Operational Actions
          </strong>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {request.status === 'Resolved'
              ? 'This request is officially closed. No further triage actions required.'
              : 'Execute verified triage operations across the response chain.'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Acknowledge Button */}
          {request.status === 'Pending' && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleAcknowledge}
              disabled={ackLoading}
            >
              <Check size={16} />
              <span>{ackLoading ? 'Acknowledging...' : 'Acknowledge Request'}</span>
            </button>
          )}

          {/* Dispatch Button */}
          {(request.status === 'Pending' || request.status === 'Acknowledged') && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setDispatchUnit('NDRF Quick Response Team 2');
                setIsDispatchModalOpen(true);
              }}
            >
              <Truck size={16} />
              <span>Dispatch Response Team</span>
            </button>
          )}

          {/* Resolve Button */}
          {request.status === 'Dispatched' && (
            <button
              type="button"
              className={`btn ${isArrivalConfirmed ? 'btn-success' : 'btn-primary'}`}
              onClick={() => {
                setResolutionNotes(defaultResolveText);
                setIsResolveModalOpen(true);
              }}
            >
              <CheckCircle2 size={16} />
              <span>Resolve Assistance Request</span>
            </button>
          )}

          {/* Closed State indicator */}
          {request.status === 'Resolved' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4ade80', fontSize: '0.88rem', fontWeight: 600 }}>
              <CheckCircle2 size={18} color="#4ade80" />
              <span>Request Resolved & Completed</span>
            </div>
          )}
        </div>
      </div>

      {/* Dispatch Modal */}
      <Modal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        title="Dispatch Emergency Response Team"
        size="md"
      >
        <form onSubmit={handleDispatchSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
            Deploy a verified emergency response unit to <strong>{request.location_description}</strong> for <strong>{request.category?.replace('_', ' ')}</strong> assistance ({request.headcount} people).
          </p>

          <div className="form-group">
            <label className="form-label">Select Response Unit *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {[
                'NDRF Quick Response Team 2',
                'NDRF Medical Evacuation Unit 4',
                'City Fire & Rescue Brigade Sector A',
                'State Disaster Rapid Relief Boat 1',
                'Civil Defense Emergency Shelter Team'
              ].map((unitName) => (
                <label
                  key={unitName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: dispatchUnit === unitName ? '#faeee9' : '#fdfbf7',
                    border: dispatchUnit === unitName ? '1px solid var(--color-terracotta)' : '1px solid #ede5da',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    color: 'var(--color-espresso-dark)'
                  }}
                >
                  <input
                    type="radio"
                    name="dispatchUnitOption"
                    value={unitName}
                    checked={dispatchUnit === unitName}
                    onChange={(e) => setDispatchUnit(e.target.value)}
                    style={{ accentColor: 'var(--color-terracotta)' }}
                  />
                  <span>{unitName}</span>
                </label>
              ))}
            </div>

            <label className="form-label" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
              Or enter custom response unit identifier:
            </label>
            <input
              type="text"
              className="form-input"
              value={dispatchUnit}
              onChange={(e) => setDispatchUnit(e.target.value)}
              placeholder="e.g. Special Operations Unit 7"
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsDispatchModalOpen(false)}
              disabled={dispatchLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={dispatchLoading || !dispatchUnit.trim()}
            >
              <Truck size={16} />
              <span>{dispatchLoading ? 'Deploying...' : 'Deploy Response Unit'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Resolve Modal */}
      <Modal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        title="Resolve Assistance Request"
        size="md"
      >
        <form onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
            Review verification feedback from citizen before marking this emergency request as officially resolved and closed.
          </p>

          {isArrivalConfirmed && (
            <div style={{ background: 'rgba(10, 35, 20, 0.85)', border: '1px solid rgba(34, 197, 94, 0.4)', borderRadius: '6px', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} color="#4ade80" />
              <span style={{ fontSize: '0.84rem', color: '#bbf7d0' }}>
                Citizen verified assistance has arrived successfully.
              </span>
            </div>
          )}

          {isArrivalNotReceived && (
            <div style={{ background: 'rgba(45, 15, 20, 0.85)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '6px', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color="#f87171" />
              <span style={{ fontSize: '0.84rem', color: '#fca5a5' }}>
                Notice: Citizen earlier reported assistance had not arrived. Confirm that secondary deployment has succeeded.
              </span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Official Resolution Notes *</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Record operational resolution notes and verified citizen safety status..."
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsResolveModalOpen(false)}
              disabled={resolveLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-success"
              disabled={resolveLoading || !resolutionNotes.trim()}
            >
              <CheckCircle2 size={16} />
              <span>{resolveLoading ? 'Resolving...' : 'Confirm Resolution'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
export default AssistanceRequestDetail;
