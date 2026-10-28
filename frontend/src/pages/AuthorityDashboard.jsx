import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useWebSocket } from '../context/WebSocketContext';
import { DisasterMap } from '../components/map/DisasterMap';
import { SituationMatrix } from '../components/authority/SituationMatrix';
import { GapDetectionAlerts } from '../components/authority/GapDetectionAlerts';
import { AssistanceTriageTable } from '../components/authority/AssistanceTriageTable';
import { HumanApprovalModal } from '../components/authority/HumanApprovalModal';
import { BackButton } from '../components/common/BackButton';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Badge } from '../components/common/Badge';
import { NotificationDropdown } from '../components/common/NotificationDropdown';
import {
  Shield,
  PlusCircle,
  AlertTriangle,
  MapPin,
  Users,
  Activity,
  CheckCircle,
  Radio,
  FileText,
  RefreshCw,
  Sparkles,
  Send,
  Eye,
  User,
  LogOut
} from 'lucide-react';

export function AuthorityDashboard() {
  const { user, logout, isAuthority } = useAuth();
  const { addToast } = useNotification();
  const { subscribe } = useWebSocket();
  const navigate = useNavigate();
  const location = useLocation();

  const [warnings, setWarnings] = useState([]);
  const [activeWarning, setActiveWarning] = useState(null);
  const [healthMatrix, setHealthMatrix] = useState(null);
  const [overview, setOverview] = useState(null);
  const [assistanceRequests, setAssistanceRequests] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (location.state?.roleNotice) {
      addToast(location.state.roleNotice, 'warning', 6000);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, addToast]);

  // Modals state
  const [approvalModalWarning, setApprovalModalWarning] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      const [warnList, matrix, ovStats, helpList, resList] = await Promise.all([
        api.getWarnings(),
        api.getZoneHealthMatrix(),
        api.getSystemOverview(),
        api.getAssistanceRequests(),
        api.getResources()
      ]);

      setWarnings(warnList || []);
      setHealthMatrix(matrix);
      setOverview(ovStats);
      setAssistanceRequests(helpList || []);
      setResources(resList || []);

      // Set most recent active or draft warning
      if (warnList && warnList.length > 0) {
        const active = warnList.find((w) => w.status === 'Active') || warnList[0];
        setActiveWarning(active);
      } else {
        setActiveWarning(null);
      }
    } catch (err) {
      console.error('Failed to load authority dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();

    // Subscribe to live events
    const unsubResp = subscribe('CITIZEN_RESPONSE_RECEIVED', () => loadDashboardData());
    const unsubHelp = subscribe('ASSISTANCE_REQUEST_CREATED', () => loadDashboardData());
    const unsubAck = subscribe('ASSISTANCE_ACKNOWLEDGED', () => loadDashboardData());
    const unsubDisp = subscribe('ASSISTANCE_DISPATCHED', () => loadDashboardData());
    const unsubVerif = subscribe('ASSISTANCE_VERIFIED', () => loadDashboardData());
    const unsubStatus = subscribe('ASSISTANCE_STATUS_UPDATED', () => loadDashboardData());
    const unsubWarn = subscribe('WARNING_DISTRIBUTED', () => loadDashboardData());
    const unsubCancel = subscribe('WARNING_CANCELLED', () => loadDashboardData());
    const unsubReg = subscribe('CITIZEN_REGISTERED', () => loadDashboardData());
    const unsubLoc = subscribe('CITIZEN_LOCATION_UPDATED', () => loadDashboardData());

    return () => {
      unsubResp();
      unsubHelp();
      unsubAck();
      unsubDisp();
      unsubVerif();
      unsubStatus();
      unsubWarn();
      unsubCancel();
      unsubReg();
      unsubLoc();
    };
  }, [loadDashboardData, subscribe]);

  // Handle human authority approval
  const handleApproveAIMessage = async (actionData) => {
    if (!approvalModalWarning) return;
    setModalLoading(true);
    try {
      const approved = await api.approveAIMessage(approvalModalWarning.id, actionData);
      setApprovalModalWarning(null);
      addToast(`AI Citizen Communication officially approved for Warning #${approved.identifier}. Ready for distribution.`, 'success');
      loadDashboardData();
    } catch (err) {
      addToast(err.message || 'Approval failed.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  // Regenerate AI
  const handleRegenerateAI = async () => {
    if (!approvalModalWarning) return;
    setModalLoading(true);
    try {
      const res = await api.generateAIMessage(approvalModalWarning.id);
      setApprovalModalWarning((prev) => ({
        ...prev,
        ai_simplified_en: res.ai_simplified_en,
        ai_simplified_hi: res.ai_simplified_hi
      }));
      addToast('AI Communication regenerated successfully.', 'info');
    } catch (err) {
      addToast(err.message || 'Regeneration failed.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  // Distribute Warning
  const handleDistributeWarning = async (warningId) => {
    try {
      await api.distributeWarning(warningId);
      addToast('Warning distributed across all Response Zones & simulated channels activated!', 'success', 8000);
      loadDashboardData();
    } catch (err) {
      addToast(err.message || 'Distribution failed.', 'danger');
    }
  };

  // Acknowledge Assistance
  const handleAcknowledgeAssistance = async (id) => {
    try {
      await api.acknowledgeAssistance(id);
      addToast(`Assistance request #${id} acknowledged. Notification dispatched to citizen.`, 'success');
      loadDashboardData();
    } catch (err) {
      addToast(err.message || 'Failed to acknowledge assistance request.', 'danger');
    }
  };

  // Dispatch Assistance
  const handleDispatchAssistance = async (id, dispatchData) => {
    try {
      await api.dispatchAssistance(id, dispatchData);
      addToast(`Unit '${dispatchData.dispatched_unit_notes || 'Response Team'}' dispatched. Verification prompt sent to citizen.`, 'success');
      loadDashboardData();
    } catch (err) {
      addToast(err.message || 'Failed to dispatch assistance request.', 'danger');
    }
  };

  // Resolve Assistance
  const handleResolveAssistance = async (id, resolveData) => {
    try {
      await api.resolveAssistance(id, resolveData);
      addToast(`Assistance request #${id} verified and resolved.`, 'success');
      loadDashboardData();
    } catch (err) {
      addToast(err.message || 'Failed to resolve assistance request.', 'danger');
    }
  };

  // Update Assistance status (fallback)
  const handleUpdateAssistanceStatus = async (id, newStatus, unitNotes = null) => {
    try {
      if (newStatus === 'Acknowledged') {
        await api.acknowledgeAssistance(id);
      } else if (newStatus === 'Dispatched') {
        await api.dispatchAssistance(id, { dispatched_unit_notes: unitNotes });
      } else if (newStatus === 'Resolved') {
        await api.resolveAssistance(id, { resolution_notes: unitNotes });
      } else {
        await api.updateAssistanceStatus(id, {
          status: newStatus,
          dispatched_unit_notes: unitNotes
        });
      }
      addToast(`Assistance request #${id} updated to ${newStatus}.`, 'success');
      loadDashboardData();
    } catch (err) {
      addToast(err.message || 'Failed to update assistance request.', 'danger');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading authority dashboard..." fullPage />;
  }

  return (
    <div className="authority-dashboard">
      {/* ── Upper Disaster Photography Hero Section ── */}
      <section className="authority-hero-section" aria-label="Authority Overview Hero">
        <div className="authority-hero-bg-layer" style={{ backgroundImage: "url('/flood-rescue-convoy.png')" }} />
        <div className="authority-hero-overlay" />

        <div className="authority-hero-content">
          <div className="authority-top-actions-bar">
            <BackButton fallbackPath="/" label="Back to Home" />

            <div className="hero-actions-right">
              <NotificationDropdown />

              {user && (
                <span className="hero-user-pill" title={`${user.full_name} (${user.role})`}>
                  <User size={15} aria-hidden="true" />
                  <span className="hero-user-name"><strong>{user.full_name}</strong></span>
                  <span className="hero-user-role">[{user.role?.toUpperCase()}]</span>
                </span>
              )}

              <button
                type="button"
                className="btn-hero-logout"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
                aria-label="Logout of account"
              >
                <LogOut size={14} aria-hidden="true" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          <div className="authority-header-main">
            <div className="authority-title-row">
              <h1 className="authority-page-title">Authority Dashboard</h1>
              <span className="operational-pill">
                <span className="operational-dot" /> OPERATIONAL
              </span>
            </div>
            <p className="authority-subtitle">
              {user?.department ? `${user.department} - ` : 'NDRF - '}Manage active warnings, monitor response zones, and coordinate assistance.
            </p>
          </div>

          {/* KPI 4 Summary Cards */}
          {overview && (
            <div className="metric-grid">
              <div className="metric-card">
                <div className="metric-card-top">
                  <div className="metric-icon-box metric-icon-warning">
                    <AlertTriangle size={18} />
                  </div>
                  <span className="metric-label-text">ACTIVE WARNINGS</span>
                </div>
                <div className="metric-value-number">
                  {overview.active_warnings_count}
                </div>
                <div className="metric-sub-text">Active alerts</div>
              </div>

              <div className="metric-card">
                <div className="metric-card-top">
                  <div className="metric-icon-box metric-icon-zones">
                    <MapPin size={18} />
                  </div>
                  <span className="metric-label-text">RESPONSE ZONES</span>
                </div>
                <div className="metric-value-number">
                  {overview.total_response_zones}
                </div>
                <div className="metric-sub-text">Monitored zones</div>
              </div>

              <div className="metric-card">
                <div className="metric-card-top">
                  <div className="metric-icon-box metric-icon-gaps">
                    <Radio size={18} />
                  </div>
                  <span className="metric-label-text">COMMUNICATION GAPS</span>
                </div>
                <div className="metric-value-number">
                  {overview.active_gaps_count}
                </div>
                <div className="metric-sub-text">Flagged areas</div>
              </div>

              <div className="metric-card">
                <div className="metric-card-top">
                  <div className="metric-icon-box metric-icon-pending">
                    <RefreshCw size={18} />
                  </div>
                  <span className="metric-label-text">PENDING ASSISTANCE</span>
                </div>
                <div className="metric-value-number">
                  {overview.pending_assistance_requests}
                </div>
                <div className="metric-sub-text">Awaiting dispatch</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Urgent Gap Alerts Section ── */}
      {healthMatrix?.active_gap_alerts && healthMatrix.active_gap_alerts.length > 0 && (
        <section aria-label="Communication Gap Alerts">
          <GapDetectionAlerts
            alerts={healthMatrix.active_gap_alerts}
            onResolveGap={(alert) => {
              if (activeWarning) {
                navigate(`/warnings/${activeWarning.id}`);
              }
            }}
          />
        </section>
      )}

      {/* ── Active Warning Summary Card ── */}
      {activeWarning ? (
        <section className="card active-warning-summary-card" aria-label="Active Disaster Warning Summary">
          <div className="active-warning-content">
            <div className="active-warning-info">
              <div className="active-warning-badges-row">
                <Badge status={activeWarning.status} />
                <Badge status={activeWarning.severity} />
                <span className="active-warning-code">
                  {activeWarning.identifier} (v{activeWarning.version}.0)
                </span>
              </div>
              <h3 className="active-warning-title">{activeWarning.title}</h3>
              <p className="active-warning-meta">
                <strong className="meta-highlight">Target Area:</strong> {activeWarning.area_name} &nbsp;•&nbsp; <strong className="meta-highlight">AI Approval:</strong> {activeWarning.ai_approval_status}
              </p>
            </div>

            <div className="active-warning-actions">
              {activeWarning.status !== 'Active' && activeWarning.status !== 'Cancelled' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setApprovalModalWarning(activeWarning)}
                >
                  <Sparkles size={14} />
                  <span>Review Citizen Message</span>
                </button>
              )}

              {activeWarning.ai_approval_status === 'Approved' && activeWarning.status !== 'Active' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleDistributeWarning(activeWarning.id)}
                >
                  <Send size={14} />
                  <span>Distribute Warning</span>
                </button>
              )}

              <Link to={`/warnings/${activeWarning.id}`} className="btn btn-outline btn-sm btn-view-warning">
                <Eye size={14} />
                <span>View Warning Details</span>
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<Shield size={40} color="var(--color-terracotta)" />}
          title="No warnings available"
          description="Create an emergency warning to target zones and distribute clear citizen instructions."
          actionText="Create Warning"
          onAction={() => navigate('/authority/warnings/create')}
        />
      )}

      {/* ── Main 2-Panel Grid: Interactive Health Map & Response Zones Matrix ── */}
      <section className="authority-grid-2col" style={{ marginBottom: '2.5rem' }} aria-label="Response Zones and Situation Matrix">
        {/* Panel 1: Geographic Health Map */}
        <div className="card response-map-panel">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <MapPin size={18} color="var(--color-terracotta)" />
                <span>Response Zones & Zone Status</span>
              </h3>
              <span className="card-subtitle">
                Status of monitored zones
              </span>
            </div>
          </div>

          <DisasterMap
            zones={healthMatrix?.zones || []}
            resources={resources}
            height="440px"
            onZoneClick={(zone) => navigate(`/zones/${zone.id || zone.zone_id}`)}
          />

          <div className="map-legend">
            <span className="legend-item">
              <span className="legend-dot dot-stable" />
              <span>Stable</span>
            </span>
            <span className="legend-item">
              <span className="legend-dot dot-attention" />
              <span>Attention</span>
            </span>
            <span className="legend-item">
              <span className="legend-dot dot-critical" />
              <span>Critical</span>
            </span>
            <span className="legend-item">
              <span className="legend-dot dot-gap" />
              <span>Gap Alert</span>
            </span>
            <span className="legend-item">
              <span className="legend-dot dot-surge" />
              <span>Assistance Surge</span>
            </span>
          </div>
        </div>

        {/* Panel 2: Response Zones Health Matrix */}
        <SituationMatrix
          zones={healthMatrix?.zones || []}
          onSelectZone={(zone) => navigate(`/zones/${zone.id || zone.zone_id}`)}
        />
      </section>

      {/* ── Emergency Assistance Triage Section ── */}
      <section style={{ marginBottom: '2.5rem' }} aria-label="Emergency Assistance Requests Queue">
        <AssistanceTriageTable
          requests={assistanceRequests}
          onUpdateStatus={handleUpdateAssistanceStatus}
          onAcknowledge={handleAcknowledgeAssistance}
          onDispatch={handleDispatchAssistance}
          onResolve={handleResolveAssistance}
        />
      </section>

      {/* Mandatory Human Approval Layer Modal */}
      <HumanApprovalModal
        isOpen={!!approvalModalWarning}
        onClose={() => setApprovalModalWarning(null)}
        warning={approvalModalWarning}
        onApprove={handleApproveAIMessage}
        onRegenerate={handleRegenerateAI}
        loading={modalLoading}
      />
    </div>
  );
}
