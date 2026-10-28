import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useWebSocket } from '../context/WebSocketContext';
import { BackButton } from '../components/common/BackButton';
import { Badge } from '../components/common/Badge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { DisasterMap } from '../components/map/DisasterMap';
import { HumanApprovalModal } from '../components/authority/HumanApprovalModal';
import { Modal } from '../components/common/Modal';
import {
  Send,
  Sparkles,
  RefreshCw,
  XCircle,
  Clock,
  MapPin,
  AlertTriangle,
  Layers,
  CheckCircle2,
  AlertOctagon,
  HelpCircle,
  Radio,
  FileSpreadsheet,
  Activity,
  UserCheck,
  Filter,
  Shield,
  History,
  Info
} from 'lucide-react';

export function AuthorityWarningDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useNotification();
  const { subscribe } = useWebSocket();

  const [warning, setWarning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState(null);

  // Filters for Citizen Responses
  const [responseFilterType, setResponseFilterType] = useState('ALL');
  const [responseFilterZone, setResponseFilterZone] = useState('ALL');

  // Modals
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isDistributeModalOpen, setIsDistributeModalOpen] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Version update form
  const [versionForm, setVersionForm] = useState({
    title: '',
    severity: 'Severe',
    recommended_instructions: '',
    area_name: ''
  });

  // Cancel form
  const [cancelReason, setCancelReason] = useState('');

  const loadWarning = useCallback(async () => {
    try {
      const data = await api.getWarningDetail(id);
      setWarning(data);
      setVersionForm({
        title: data.title,
        severity: data.severity,
        recommended_instructions: data.recommended_instructions,
        area_name: data.area_name
      });
    } catch (err) {
      addToast(err.message || 'Failed to load warning details.', 'danger');
    } finally {
      setLoading(false);
    }
  }, [id, addToast]);

  useEffect(() => {
    loadWarning();
    const unsubResp = subscribe('CITIZEN_RESPONSE_RECEIVED', (data) => {
      if (!data || Number(data.warning_id) === Number(id)) {
        loadWarning();
      }
    });
    const unsubWarn = subscribe('WARNING_DISTRIBUTED', (data) => {
      if (!data || Number(data.warning_id) === Number(id)) {
        loadWarning();
      }
    });
    const unsubCancel = subscribe('WARNING_CANCELLED', (data) => {
      if (!data || Number(data.warning_id) === Number(id)) {
        loadWarning();
      }
    });
    return () => {
      unsubResp();
      unsubWarn();
      unsubCancel();
    };
  }, [id, loadWarning, subscribe]);

  // Distribute
  const handleDistribute = async () => {
    setModalLoading(true);
    try {
      await api.distributeWarning(warning.id);
      addToast('Warning distributed successfully across all targeted response zones.', 'success');
      setIsDistributeModalOpen(false);
      loadWarning();
    } catch (err) {
      addToast(err.message || 'Distribution failed.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  // Human Approval
  const handleApproveAIMessage = async (actionData) => {
    setModalLoading(true);
    try {
      await api.approveAIMessage(warning.id, actionData);
      setIsApprovalModalOpen(false);
      addToast('Human Authority Approval recorded. Ready for distribution.', 'success');
      loadWarning();
    } catch (err) {
      addToast(err.message || 'Approval action failed.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  // Regenerate AI Message
  const handleRegenerateAIMessage = async () => {
    setModalLoading(true);
    try {
      await api.generateAIMessage(warning.id);
      addToast('AI message and SOP guidance regenerated successfully.', 'success');
      loadWarning();
    } catch (err) {
      addToast(err.message || 'Failed to regenerate AI message.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  // Create Version Update
  const handleCreateVersion = async (e) => {
    e.preventDefault();
    setModalLoading(true);
    try {
      const updated = await api.versionWarning(warning.id, versionForm);
      setIsVersionModalOpen(false);
      addToast(`Created Warning Version ${updated.version}.0. Historical records preserved.`, 'success');
      navigate(`/warnings/${updated.id}`);
    } catch (err) {
      addToast(err.message || 'Failed to create updated warning version.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  // Cancel Warning
  const handleCancelWarning = async (e) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      addToast('Please enter an official cancellation reason.', 'warning');
      return;
    }
    setModalLoading(true);
    try {
      await api.cancelWarning(warning.id, { cancellation_reason: cancelReason });
      setIsCancelModalOpen(false);
      addToast('Warning cancelled. Scoped notifications sent to targeted citizens.', 'success');
      loadWarning();
    } catch (err) {
      addToast(err.message || 'Failed to cancel warning.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading disaster warning details & geospatial analytics..." fullPage />;
  }

  if (!warning) {
    return (
      <div className="warning-response-monitor" style={{ padding: '2rem' }}>
        <BackButton fallbackPath="/authority" label="Back to Authority Operations" />
        <EmptyState
          icon={<AlertTriangle size={48} color="#f43f5e" />}
          title="Warning Not Found"
          description="This disaster warning has been cleared from the database or does not exist."
          actionText="Return to Dashboard"
          onAction={() => navigate('/authority')}
        />
      </div>
    );
  }

  const analytics = warning.delivery_analytics || {};
  const isDistributed = warning.status === 'Active' || warning.status === 'Updated';
  const isApproved = warning.ai_approval_status === 'Approved' || warning.ai_approval_status === 'Edited';

  // Filter individual citizen responses
  const citizenResponses = warning.citizen_responses || [];
  const filteredResponses = citizenResponses.filter((r) => {
    const matchesType = responseFilterType === 'ALL' || r.response_type === responseFilterType;
    const matchesZone = responseFilterZone === 'ALL' || String(r.zone_id) === String(responseFilterZone);
    return matchesType && matchesZone;
  });

  const timelineEvents = warning.timeline_events || [];
  const situationConditions = analytics.situation_conditions || [];

  return (
    <div className="warning-response-monitor" style={{ paddingBottom: '3rem' }}>
      <BackButton fallbackPath="/authority" label="Back to Authority Operations" />

      {/* Top Warning Identity Header */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 6, flexWrap: 'wrap' }}>
              <Badge status={warning.severity} />
              <span className={`badge ${warning.status === 'Active' ? 'badge-stable' : (warning.status === 'Cancelled' ? 'badge-extreme' : 'badge-attention')}`}>
                Status: {warning.status}
              </span>
              <span className="badge badge-standard">Version {warning.version}.0</span>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>CAP ID: {warning.identifier}</span>
            </div>

            <h1 className="page-title" style={{ fontSize: '1.75rem', margin: '4px 0 8px 0' }}>
              {warning.title}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.86rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={15} color="var(--color-terracotta)" />
                <span><strong style={{ color: 'var(--color-espresso-dark)' }}>Target Region:</strong> {warning.area_name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={15} color="var(--color-terracotta)" />
                <span><strong style={{ color: 'var(--color-espresso-dark)' }}>Issuing Authority:</strong> {warning.creator_authority_name || warning.issuing_authority_name} {warning.creator_authority_department ? `(${warning.creator_authority_department})` : ''}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Radio size={15} color="#15803d" />
                <span><strong style={{ color: '#15803d' }}>Channels:</strong> {warning.distribution_channels || 'Web, Simulated SMS, Push'}</span>
              </div>
              {warning.rag_grounding_score && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={15} color="var(--color-terracotta)" />
                  <span><strong style={{ color: 'var(--color-espresso-dark)' }}>RAG Grounding:</strong> <span style={{ color: 'var(--color-terracotta)', fontWeight: 600 }}>{warning.rag_grounding_score}</span></span>
                </div>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => { setLoading(true); loadWarning(); }}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>

            {/* Human Approval Button */}
            {!isApproved && warning.status !== 'Cancelled' && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsApprovalModalOpen(true)}
              >
                <Sparkles size={14} />
                <span>Review & Approve</span>
              </button>
            )}

            {/* Distribute Button */}
            {isApproved && warning.status !== 'Active' && warning.status !== 'Cancelled' && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsDistributeModalOpen(true)}
              >
                <Send size={14} />
                <span>Distribute Warning</span>
              </button>
            )}

            {/* Version Update Button */}
            {warning.status !== 'Cancelled' && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setIsVersionModalOpen(true)}
              >
                <Layers size={14} />
                <span>Create New Version (v{warning.version + 1})</span>
              </button>
            )}

            {/* Cancel Button — only for distributed (Active/Updated) warnings */}
            {(warning.status === 'Active' || warning.status === 'Updated') && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                onClick={() => setIsCancelModalOpen(true)}
              >
                <XCircle size={14} />
                <span>Cancel Warning</span>
              </button>
            )}

            {/* Post-Disaster Report Link */}
            <Link
              to={`/reports/${warning.id}`}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <FileSpreadsheet size={14} />
              <span>Situation Report</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Response Situation Summary */}
      <div className="card" style={{ marginBottom: '1.75rem', borderLeft: '4px solid #0284c7' }}>
        <div className="card-header" style={{ marginBottom: '0.75rem' }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={18} color="#0284c7" />
              <span>Response Situation Summary</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Evaluated from citizen responses and delivery status
            </span>
          </div>
          <span className="badge badge-primary">
            Status: {analytics.overall_situation || 'Insufficient Data'}
          </span>
        </div>

        {situationConditions.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.88rem' }}>No active operational signals evaluated yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {situationConditions.map((cond, idx) => {
              let bg = 'rgba(20, 11, 42, 0.75)';
              let border = 'rgba(168, 85, 247, 0.25)';
              let iconColor = '#38bdf8';
              let titleColor = '#ffffff';

              if (cond.severity === 'Critical') {
                bg = 'rgba(45, 15, 20, 0.85)';
                border = 'rgba(239, 68, 68, 0.35)';
                iconColor = '#f43f5e';
                titleColor = '#fca5a5';
              } else if (cond.severity === 'High') {
                bg = 'rgba(45, 25, 10, 0.85)';
                border = 'rgba(245, 158, 11, 0.35)';
                iconColor = '#fbbf24';
                titleColor = '#fde68a';
              } else if (cond.severity === 'Stable') {
                bg = 'rgba(10, 35, 20, 0.85)';
                border = 'rgba(34, 197, 94, 0.35)';
                iconColor = '#4ade80';
                titleColor = '#bbf7d0';
              }

              return (
                <div
                  key={idx}
                  style={{
                    background: bg,
                    border: `1px solid ${border}`,
                    borderRadius: '8px',
                    padding: '0.85rem 1.25rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                  }}
                >
                  <div style={{ marginTop: 2, flexShrink: 0 }}>
                    {cond.severity === 'Critical' ? (
                      <AlertOctagon size={20} color={iconColor} />
                    ) : cond.severity === 'High' ? (
                      <AlertTriangle size={20} color={iconColor} />
                    ) : cond.severity === 'Stable' ? (
                      <CheckCircle2 size={20} color={iconColor} />
                    ) : (
                      <Info size={20} color={iconColor} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: 3 }}>
                      <strong style={{ fontSize: '0.95rem', color: titleColor }}>
                        {cond.title}
                      </strong>
                      {cond.evidence_metric && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                          Evidence: {cond.evidence_metric}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.86rem', color: '#cbd5e1', margin: '0 0 4px 0', lineHeight: 1.5 }}>
                      {cond.description}
                    </p>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      <strong style={{ color: '#38bdf8' }}>Recommended Action:</strong> {cond.recommendation}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Warning Lifecycle & Response Counts */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-espresso-dark)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={18} color="var(--color-terracotta)" />
          <span>Warning Lifecycle & Response Counts (v{warning.version}.0)</span>
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
          {/* 1. Targeted */}
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid var(--color-terracotta)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>1. Targeted</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: '4px 0' }}>
              {analytics.total_targeted ?? 0}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Targeted citizens</span>
          </div>

          {/* 2. Notification Attempted */}
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #818cf8' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>2. Attempted</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#818cf8', margin: '4px 0' }}>
              {analytics.notification_attempted ?? 0}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Notifications dispatched</span>
          </div>

          {/* 3. Delivered */}
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #10b981' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>3. Delivered</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981', margin: '4px 0' }}>
              {analytics.delivered_count ?? 0}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Delivered successfully</span>
          </div>

          {/* 4. Delivery Failed */}
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #f43f5e' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>4. Failed</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f43f5e', margin: '4px 0' }}>
              {analytics.failed_count ?? 0}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Delivery errors</span>
          </div>

          {/* 5. Understood */}
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #4ade80' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>5. Understood</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4ade80', margin: '4px 0' }}>
              {analytics.understood_count ?? 0}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Understood & Safe</span>
          </div>

          {/* 6. Don't Understand */}
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #fbbf24' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>6. Don't Understand</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbbf24', margin: '4px 0' }}>
              {analytics.dont_understand_count ?? 0}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Understanding gap</span>
          </div>

          {/* 7. Help Requests */}
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #f43f5e' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>7. Need Help</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f43f5e', margin: '4px 0' }}>
              {analytics.help_requested_count ?? 0}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Assistance requests</span>
          </div>

          {/* 8. Not in Area */}
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #c084fc' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>8. Not in Area</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#c084fc', margin: '4px 0' }}>
              {analytics.not_in_area_count ?? 0}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Outside target zone</span>
          </div>

          {/* 9. No Response */}
          <div className="card" style={{ padding: '1rem', borderLeft: '4px solid #94a3b8' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>9. No Response</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#cbd5e1', margin: '4px 0' }}>
              {analytics.no_response_count ?? 0}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Awaiting response</span>
          </div>
        </div>
      </div>

      {/* Target Areas & Response Zones Map */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">
              <MapPin size={18} color="#0284c7" />
              <span>Target Areas & Response Zones Map</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Target boundaries and operational status
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span className="badge badge-extreme">Critical Priority</span>
            <span className="badge badge-attention">Immediate Priority</span>
            <span className="badge badge-primary">Standard Priority</span>
          </div>
        </div>

        <DisasterMap
          targetAreas={warning.target_areas || []}
          zones={warning.response_zones || []}
          selectedZoneId={selectedZone?.id}
          onZoneClick={(z) => setSelectedZone(z)}
          height="400px"
        />

        {/* Selected Zone Detail Drawer */}
        {selectedZone && (
          <div style={{ marginTop: '1rem', background: '#fdfbf7', border: '1px solid #ede5da', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '1rem', color: 'var(--color-espresso-dark)' }}>{selectedZone.name} ({selectedZone.code})</strong>
                <Badge status={selectedZone.situation_status} />
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setSelectedZone(null)}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Targeted Population:</span>
                <strong style={{ display: 'block', color: 'var(--color-espresso-dark)' }}>{selectedZone.targeted_count || selectedZone.delivery_count || 0} citizens</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>WTA Score:</span>
                <strong style={{ display: 'block', color: 'var(--color-terracotta)' }}>{selectedZone.wta_score ?? 0} / 100</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Understood & Safe:</span>
                <strong style={{ display: 'block', color: '#15803d' }}>{selectedZone.understanding_count ?? 0}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Help Requests:</span>
                <strong style={{ display: 'block', color: '#dc2626' }}>{selectedZone.help_request_count ?? 0}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Location Mismatches:</span>
                <strong style={{ display: 'block', color: '#e11d48' }}>{selectedZone.not_in_area_count ?? 0}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Response Zones Table */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">
              <Shield size={18} color="#0284c7" />
              <span>Response Zones Summary</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Citizen response breakdown across response zones
            </span>
          </div>
        </div>

        {(!warning.response_zones || warning.response_zones.length === 0) ? (
          <p style={{ color: '#64748b', fontSize: '0.88rem', padding: '1rem 0' }}>No response zones configured for this warning.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Zone Code / Name</th>
                  <th>Targeted</th>
                  <th>Delivered</th>
                  <th>Understood</th>
                  <th>Don't Understand</th>
                  <th>Need Help</th>
                  <th>Not In Area</th>
                  <th>No Response</th>
                  <th>WTA Score</th>
                  <th>Situation Status</th>
                </tr>
              </thead>
              <tbody>
                {warning.response_zones.map((zone) => (
                  <tr key={zone.id}>
                    <td>
                      <strong>{zone.code}</strong> - {zone.name}
                    </td>
                    <td>{zone.targeted_count ?? 0}</td>
                    <td>{zone.delivery_count ?? 0}</td>
                    <td>
                      <span style={{ color: '#059669', fontWeight: 600 }}>{zone.understanding_count ?? 0}</span>
                    </td>
                    <td>
                      <span style={{ color: '#d97706', fontWeight: 600 }}>{zone.dont_understand_count ?? 0}</span>
                    </td>
                    <td>
                      <span style={{ color: zone.help_request_count > 0 ? '#dc2626' : '#64748b', fontWeight: zone.help_request_count > 0 ? 700 : 400 }}>
                        {zone.help_request_count ?? 0}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: zone.not_in_area_count > 0 ? '#9333ea' : '#64748b' }}>
                        {zone.not_in_area_count ?? 0}
                      </span>
                    </td>
                    <td>{zone.no_response_count ?? 0}</td>
                    <td>
                      <strong>{zone.wta_score ?? 0}</strong> / 100
                    </td>
                    <td>
                      <Badge status={zone.situation_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Citizen Responses Panel */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 className="card-title">
              <UserCheck size={18} color="#0284c7" />
              <span>Citizen Responses ({citizenResponses.length} Received)</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Responses submitted by targeted citizens (Version {warning.version}.0)
            </span>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: '#64748b' }}>
              <Filter size={14} />
              <span>Type:</span>
            </div>
            <select
              className="form-select"
              style={{ padding: '3px 8px', fontSize: '0.82rem', width: 'auto' }}
              value={responseFilterType}
              onChange={(e) => setResponseFilterType(e.target.value)}
            >
              <option value="ALL">All Response Types</option>
              <option value="understand">Understood & Safe</option>
              <option value="dont_understand">Don't Understand</option>
              <option value="need_help">Need Help</option>
              <option value="not_in_area">Not in Area</option>
            </select>

            <select
              className="form-select"
              style={{ padding: '3px 8px', fontSize: '0.82rem', width: 'auto' }}
              value={responseFilterZone}
              onChange={(e) => setResponseFilterZone(e.target.value)}
            >
              <option value="ALL">All Response Zones</option>
              {(warning.response_zones || []).map((z) => (
                <option key={z.id} value={z.id}>{z.code} - {z.name}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredResponses.length === 0 ? (
          <EmptyState
            icon={<UserCheck size={36} color="#64748b" />}
            title="No citizen responses received yet."
            description={analytics.total_targeted === 0 ? "No registered citizens found in this warning area." : "Awaiting responses from targeted citizens in this region."}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Citizen Identifier</th>
                  <th>Response Status</th>
                  <th>Response Zone</th>
                  <th>Target Area</th>
                  <th>Channel / Lang</th>
                  <th>Response Time</th>
                  <th>Assistance Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredResponses.map((r) => {
                  let statusBadgeClass = 'badge-primary';
                  let statusText = r.response_type;
                  if (r.response_type === 'understand') {
                    statusBadgeClass = 'badge-stable';
                    statusText = 'Understood & Safe';
                  } else if (r.response_type === 'dont_understand') {
                    statusBadgeClass = 'badge-attention';
                    statusText = "Don't Understand";
                  } else if (r.response_type === 'need_help') {
                    statusBadgeClass = 'badge-extreme';
                    statusText = 'Need Help';
                  } else if (r.response_type === 'not_in_area') {
                    statusBadgeClass = 'badge-attention';
                    statusText = 'Not in Area';
                  }

                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.display_identifier}</strong>
                        {r.feedback_notes && (
                          <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                            "{r.feedback_notes}"
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${statusBadgeClass}`}>
                          {statusText}
                        </span>
                      </td>
                      <td>{r.zone_name || 'General Zone'}</td>
                      <td>{r.target_area_name || warning.area_name}</td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                          {r.delivery_channel || 'Web'} • {r.language_used?.toUpperCase() || 'EN'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : 'N/A'}
                        </span>
                        {r.updated_at && (
                          <div style={{ fontSize: '0.72rem', color: '#0284c7' }}>
                            Updated: {new Date(r.updated_at).toLocaleTimeString()}
                          </div>
                        )}
                      </td>
                      <td>
                        {r.assistance_request_id ? (
                          <div>
                            <span className="badge badge-extreme" style={{ fontSize: '0.72rem' }}>
                              {r.assistance_category || 'Rescue'} ({r.assistance_status || 'Pending'})
                            </span>
                            {r.assistance_headcount && (
                              <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                                Headcount: {r.assistance_headcount}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Situation Timeline */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">
              <History size={18} color="#0284c7" />
              <span>Situation Timeline</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Chronological event progression
            </span>
          </div>
        </div>

        {timelineEvents.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.88rem', padding: '1rem 0' }}>No timeline events recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '0.5rem 0' }}>
            {timelineEvents.map((evt) => (
              <div
                key={evt.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  borderLeft: '2px solid #e2e8f0',
                  paddingLeft: '1rem',
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '-6px',
                    top: '4px',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: evt.badge_type === 'extreme' ? '#dc2626' : evt.badge_type === 'stable' ? '#16a34a' : evt.badge_type === 'attention' ? '#d97706' : '#0284c7'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.92rem', color: 'var(--color-espresso-dark)' }}>{evt.title}</strong>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : ''}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                    {evt.description}
                  </p>
                  {evt.actor && (
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-terracotta)', display: 'block', marginTop: 2 }}>
                      Actor: {evt.actor}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Citizen Messages & Guidance Card */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="#7c3aed" />
            <h3 className="card-title">Citizen Messages & Retrieved Guidance</h3>
          </div>
          <span className={`badge ${isApproved ? 'badge-stable' : 'badge-attention'}`}>
            Approval Status: {warning.ai_approval_status}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
            <strong style={{ fontSize: '0.9rem', color: '#1e293b', display: 'block', marginBottom: 6 }}>
              English Message:
            </strong>
            <p style={{ fontSize: '0.88rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
              {warning.ai_simplified_en || warning.recommended_instructions}
            </p>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
            <strong style={{ fontSize: '0.9rem', color: '#1e293b', display: 'block', marginBottom: 6 }}>
              हिंदी (Hindi) Message:
            </strong>
            <p style={{ fontSize: '0.88rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
              {warning.ai_simplified_hi || 'Generating Hindi translation upon approval...'}
            </p>
          </div>
        </div>

        {/* RAG Sources */}
        {warning?.rag_sources_json && (() => {
          let sources = [];
          try { sources = JSON.parse(warning.rag_sources_json); } catch (e) { sources = []; }
          if (!sources || sources.length === 0) return null;
          return (
            <div style={{ marginTop: '1rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '0.85rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '6px' }}>
                <strong style={{ fontSize: '0.86rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={16} color="#0284c7" />
                  <span>Retrieved Safety Guidance (RAG Sources)</span>
                </strong>
                {warning.rag_grounding_score && (
                  <span className="badge badge-stable" style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', fontWeight: 600 }}>
                    Source Grounding: {warning.rag_grounding_score}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {sources.map((s, idx) => {
                  const relevancePct = s.score ? Math.round(s.score * 100) : null;
                  return (
                    <details key={idx} style={{ background: '#ffffff', border: '1px solid #e0f2fe', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
                      <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#0369a1', fontWeight: 600 }}>
                        <span>• {s.doc_title || s.source_agency} — {s.topic || s.disaster_type}</span>
                        {relevancePct && (
                          <span style={{ fontSize: '0.7rem', color: '#0284c7', background: '#f0f9ff', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                            {relevancePct}% Match
                          </span>
                        )}
                      </summary>
                      {s.text && (
                        <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.78rem', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: 2 }}>
                            Agency: {s.source_agency}
                          </div>
                          {s.text.trim()}
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Human Approval Modal */}
      <HumanApprovalModal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        warning={warning}
        onApprove={handleApproveAIMessage}
        onRegenerate={handleRegenerateAIMessage}
        loading={modalLoading}
      />

      {/* Distribute Confirmation Modal */}
      <Modal
        isOpen={isDistributeModalOpen}
        onClose={() => setIsDistributeModalOpen(false)}
        title="Confirm Warning Distribution"
      >
        <div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
            <strong style={{ fontSize: '0.95rem', color: '#166534', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <CheckCircle2 size={18} color="#16a34a" />
              <span>Ready for Distribution</span>
            </strong>
            <p style={{ fontSize: '0.85rem', color: '#14532d', margin: 0 }}>
              This warning has been approved by the authority. Distributing will send alerts to registered citizens in the target area.
            </p>
          </div>

          <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div><strong>Affected Region:</strong> {warning.area_name}</div>
            <div><strong>Target Areas:</strong> {warning.target_areas?.length || 1} defined boundaries</div>
            <div><strong>Channels:</strong> Web Broadcast, Simulated SMS, Push Notifications</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsDistributeModalOpen(false)}
              disabled={modalLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDistribute}
              disabled={modalLoading}
            >
              <Send size={15} />
              <span>{modalLoading ? 'Distributing...' : 'Confirm & Distribute'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Version Update Modal */}
      <Modal
        isOpen={isVersionModalOpen}
        onClose={() => setIsVersionModalOpen(false)}
        title={`Update Warning (Create Version ${warning.version + 1}.0)`}
      >
        <form onSubmit={handleCreateVersion}>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
            Creating a new version preserves previous targeting and response records of Version {warning.version}.0 in the history.
          </p>

          <div className="form-group">
            <label className="form-label">Warning Title *</label>
            <input
              type="text"
              className="form-input"
              value={versionForm.title}
              onChange={(e) => setVersionForm({ ...versionForm, title: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Severity</label>
            <select
              className="form-select"
              value={versionForm.severity}
              onChange={(e) => setVersionForm({ ...versionForm, severity: e.target.value })}
            >
              <option value="Extreme">Extreme</option>
              <option value="Severe">Severe</option>
              <option value="Moderate">Moderate</option>
              <option value="Minor">Minor</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Updated Instructions *</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={versionForm.recommended_instructions}
              onChange={(e) => setVersionForm({ ...versionForm, recommended_instructions: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsVersionModalOpen(false)}
              disabled={modalLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={modalLoading}
            >
              <span>{modalLoading ? 'Creating Version...' : `Publish Version ${warning.version + 1}.0`}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel Warning Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Warning"
      >
        <form onSubmit={handleCancelWarning}>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
            <strong style={{ fontSize: '0.92rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <AlertTriangle size={17} color="#dc2626" />
              <span>Warning Cancellation</span>
            </strong>
            <p style={{ fontSize: '0.84rem', color: '#7f1d1d', margin: 0 }}>
              Cancelling will mark this warning as inactive and notify citizens in the target area that the threat has passed.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Cancellation Reason *</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="e.g. Flood waters have receded below danger levels; area declared safe."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={modalLoading}
            >
              Keep Warning Active
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ background: '#dc2626', borderColor: '#dc2626' }}
              disabled={modalLoading || !cancelReason.trim()}
            >
              <span>{modalLoading ? 'Cancelling...' : 'Confirm Cancellation'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
