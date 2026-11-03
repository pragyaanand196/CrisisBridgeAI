import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useWebSocket } from '../context/WebSocketContext';
import { api } from '../services/api';
import { BackButton } from '../components/common/BackButton';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { INCIDENT_CATEGORIES, SEVERITY_LEVELS } from '../services/citizenIncidentService';
import { IncidentProgressTracker } from '../components/incident/IncidentProgressTracker';
import {
  FileText,
  AlertTriangle,
  MapPin,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  Filter,
  Check,
  RotateCcw,
  Shield,
  ShieldCheck,
  Send,
  Lock,
  MessageSquare,
  Users,
  Building,
  Radio,
  FileCheck,
  HelpCircle,
  Layers,
  ChevronRight,
  Maximize2,
  X,
  Copy,
  Flame,
  Droplets,
  Zap,
  Activity
} from 'lucide-react';

const CONFIGURED_DEPARTMENTS = [
  'National Disaster Response Force (NDRF) - Command Unit',
  'State Disaster Management Authority (SDMA) Control Room',
  'District Emergency Operations Centre (DEOC)',
  'Public Works Department (PWD) - Roads & Bridges Division',
  'Fire and Emergency Services Quick Response Unit',
  'State Electricity Distribution & Power Safety Board',
  'Municipal Corporation - Drainage & Water Supply Division',
  'Public Health & Sanitation Emergency Team'
];

export function AuthorityIncidentReports() {
  const { user, isAuthority, isAdmin } = useAuth();
  const { addToast } = useNotification();
  const { subscribe } = useWebSocket();

  // Data state
  const [reports, setReports] = useState([]);
  const [metrics, setMetrics] = useState({
    total_reports: 0,
    awaiting_review: 0,
    under_investigation: 0,
    resolved_reports: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [jurisdictionFilter, setJurisdictionFilter] = useState('All');
  const [timeRangeFilter, setTimeRangeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority');

  // Review & Details Modal state
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportDetailsLoading, setReportDetailsLoading] = useState(false);
  const [possibleDuplicates, setPossibleDuplicates] = useState([]);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [activeTab, setActiveTab] = useState('details'); // 'details', 'actions', 'updates', 'history'

  // Action form states
  const [actionInProgress, setActionInProgress] = useState(false);
  const [activeActionModal, setActiveActionModal] = useState(null); // 'status', 'verify', 'clarify', 'reject', 'duplicate', 'assign', 'resolve'
  
  // Action inputs
  const [verificationRemarks, setVerificationRemarks] = useState('');
  const [clarificationQuestion, setClarificationQuestion] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [notVerifiedReason, setNotVerifiedReason] = useState('');
  const [duplicateReason, setDuplicateReason] = useState('');
  const [duplicateOfId, setDuplicateOfId] = useState('');
  const [assignDepartment, setAssignDepartment] = useState(CONFIGURED_DEPARTMENTS[0]);
  const [assignNotes, setAssignNotes] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');

  // Investigation Update inputs
  const [updateText, setUpdateText] = useState('');
  const [isUpdatePublic, setIsUpdatePublic] = useState(true);
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);

  // Copy notification state
  const [copiedId, setCopiedId] = useState(null);

  // Load authority incident reports and metrics from backend
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const params = {};
      if (searchQuery && searchQuery.trim()) params.search = searchQuery.trim();
      if (statusFilter && statusFilter !== 'All') params.status = statusFilter;
      if (categoryFilter && categoryFilter !== 'All') params.category = categoryFilter;
      if (severityFilter && severityFilter !== 'All') params.severity = severityFilter;
      if (jurisdictionFilter && jurisdictionFilter !== 'All') params.jurisdiction = jurisdictionFilter;
      if (timeRangeFilter && timeRangeFilter !== 'all') params.time_range = timeRangeFilter;
      if (sortBy) params.sort = sortBy;

      const [fetchedReports, fetchedMetrics] = await Promise.all([
        api.getAuthorityIncidentReports(params),
        api.getIncidentSummaryMetrics()
      ]);

      setReports(fetchedReports || []);
      if (fetchedMetrics) {
        setMetrics(fetchedMetrics);
      }
    } catch (err) {
      console.error('Failed to load incident reports:', err);
      addToast('Failed to load incident reports from server.', 'danger');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, statusFilter, categoryFilter, severityFilter, jurisdictionFilter, timeRangeFilter, sortBy, addToast]);

  // Initial load and filter change trigger
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Real-time WebSocket subscriptions
  useEffect(() => {
    const unsubSubmitted = subscribe('INCIDENT_REPORT_SUBMITTED', (data) => {
      loadData(true);
      addToast(`New Citizen Incident: [${data.report_identifier || 'Report'}] ${data.title} (${data.category}) in ${data.city || data.district || 'Jurisdiction'}`, 'warning', 7000);
    });

    const unsubStatus = subscribe('INCIDENT_STATUS_UPDATED', () => {
      loadData(true);
    });

    const unsubAssigned = subscribe('INCIDENT_ASSIGNED', () => {
      loadData(true);
    });

    const unsubClarification = subscribe('INCIDENT_CLARIFICATION_SUBMITTED', (data) => {
      loadData(true);
      addToast(`Citizen Clarification Received for report ${data.report_identifier}!`, 'info', 6000);
    });

    const unsubResolved = subscribe('INCIDENT_RESOLVED', () => {
      loadData(true);
    });

    return () => {
      if (unsubSubmitted) unsubSubmitted();
      if (unsubStatus) unsubStatus();
      if (unsubAssigned) unsubAssigned();
      if (unsubClarification) unsubClarification();
      if (unsubResolved) unsubResolved();
    };
  }, [subscribe, loadData, addToast]);

  // Fetch full details of an incident report when reviewed
  const handleOpenReportDetails = async (report) => {
    setSelectedReport(report);
    setActiveTab('details');
    setReportDetailsLoading(true);

    try {
      const [fullReport, duplicates] = await Promise.all([
        api.getIncidentReportDetails(report.report_identifier || report.id),
        api.getPossibleIncidentDuplicates(report.report_identifier || report.id).catch(() => [])
      ]);

      setSelectedReport(fullReport);
      setPossibleDuplicates(duplicates || []);
    } catch (err) {
      console.warn('Could not fetch refreshed report details:', err);
    } finally {
      setReportDetailsLoading(false);
    }
  };

  // Copy report ID to clipboard
  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Reset filters
  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setCategoryFilter('All');
    setSeverityFilter('All');
    setJurisdictionFilter('All');
    setTimeRangeFilter('all');
    setSortBy('priority');
  };

  const isFilterActive =
    searchQuery.trim() !== '' ||
    statusFilter !== 'All' ||
    categoryFilter !== 'All' ||
    severityFilter !== 'All' ||
    jurisdictionFilter !== 'All' ||
    timeRangeFilter !== 'all' ||
    sortBy !== 'priority';

  // -------------------------------------------------------------------------
  // Review Actions Handling
  // -------------------------------------------------------------------------

  // 1. Move to Under Review
  const handleMoveToUnderReview = async () => {
    if (!selectedReport) return;
    setActionInProgress(true);
    try {
      const updated = await api.updateIncidentStatus(selectedReport.report_identifier, {
        status: 'Under Review',
        remarks: 'Authority commenced operational triage and verification.'
      });
      setSelectedReport(updated);
      loadData(true);
      addToast(`Report ${selectedReport.report_identifier} moved to Under Review.`, 'info');
    } catch (err) {
      addToast(err.message || 'Failed to update status.', 'danger');
    } finally {
      setActionInProgress(false);
    }
  };

  // 2. Verify Report
  const handleVerifyReport = async (e) => {
    e.preventDefault();
    if (!selectedReport) return;
    setActionInProgress(true);
    try {
      const updated = await api.updateIncidentStatus(selectedReport.report_identifier, {
        status: 'Verified',
        verification_remarks: verificationRemarks.trim() || 'Verified by authorized disaster response official.'
      });
      setSelectedReport(updated);
      setActiveActionModal(null);
      setVerificationRemarks('');
      loadData(true);
      addToast(`Incident Report ${selectedReport.report_identifier} officially verified!`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to verify report.', 'danger');
    } finally {
      setActionInProgress(false);
    }
  };

  // 3. Request Clarification from Citizen
  const handleRequestClarification = async (e) => {
    e.preventDefault();
    if (!selectedReport || !clarificationQuestion.trim()) {
      addToast('Please enter a specific question or clarification message for the citizen.', 'warning');
      return;
    }
    setActionInProgress(true);
    try {
      const updated = await api.updateIncidentStatus(selectedReport.report_identifier, {
        status: 'Clarification Requested',
        clarification_question: clarificationQuestion.trim()
      });
      setSelectedReport(updated);
      setActiveActionModal(null);
      setClarificationQuestion('');
      loadData(true);
      addToast(`Clarification request sent to ${selectedReport.reporter_name}.`, 'info');
    } catch (err) {
      addToast(err.message || 'Failed to request clarification.', 'danger');
    } finally {
      setActionInProgress(false);
    }
  };

  // 4. Reject Report
  const handleRejectReport = async (e) => {
    e.preventDefault();
    if (!selectedReport || !rejectionReason.trim()) {
      addToast('A mandatory rejection reason is required.', 'warning');
      return;
    }
    setActionInProgress(true);
    try {
      const updated = await api.updateIncidentStatus(selectedReport.report_identifier, {
        status: 'Rejected',
        rejection_reason: rejectionReason.trim()
      });
      setSelectedReport(updated);
      setActiveActionModal(null);
      setRejectionReason('');
      loadData(true);
      addToast(`Incident report marked as Rejected.`, 'warning');
    } catch (err) {
      addToast(err.message || 'Failed to reject report.', 'danger');
    } finally {
      setActionInProgress(false);
    }
  };

  // 4b. Mark as Not Verified
  const handleMarkNotVerified = async (e) => {
    e.preventDefault();
    if (!selectedReport || !notVerifiedReason.trim()) {
      addToast('A mandatory reason is required to record Not Verified.', 'warning');
      return;
    }
    setActionInProgress(true);
    try {
      const updated = await api.updateIncidentStatus(selectedReport.report_identifier, {
        status: 'Not Verified',
        rejection_reason: notVerifiedReason.trim()
      });
      setSelectedReport(updated);
      setActiveActionModal(null);
      setNotVerifiedReason('');
      loadData(true);
      addToast(`Incident report marked as Not Verified.`, 'warning');
    } catch (err) {
      addToast(err.message || 'Failed to mark as not verified.', 'danger');
    } finally {
      setActionInProgress(false);
    }
  };

  // 5. Mark as Duplicate
  const handleMarkDuplicate = async (e) => {
    e.preventDefault();
    if (!selectedReport || !duplicateReason.trim()) {
      addToast('A mandatory explanation is required when marking as duplicate.', 'warning');
      return;
    }
    setActionInProgress(true);
    try {
      const updated = await api.updateIncidentStatus(selectedReport.report_identifier, {
        status: 'Duplicate',
        duplicate_reason: duplicateReason.trim(),
        duplicate_of_id: duplicateOfId.trim() || undefined
      });
      setSelectedReport(updated);
      setActiveActionModal(null);
      setDuplicateReason('');
      setDuplicateOfId('');
      loadData(true);
      addToast(`Incident report marked as Duplicate.`, 'info');
    } catch (err) {
      addToast(err.message || 'Failed to mark as duplicate.', 'danger');
    } finally {
      setActionInProgress(false);
    }
  };

  // 6. Department / Team Assignment
  const handleAssignDepartment = async (e) => {
    e.preventDefault();
    if (!selectedReport || !assignDepartment) {
      addToast('Please select a department to assign.', 'warning');
      return;
    }
    setActionInProgress(true);
    try {
      const updated = await api.assignIncidentDepartment(selectedReport.report_identifier, {
        department: assignDepartment,
        team_notes: assignNotes.trim() || undefined
      });
      setSelectedReport(updated);
      setActiveActionModal(null);
      setAssignNotes('');
      loadData(true);
      addToast(`Report assigned to ${assignDepartment}.`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to assign department.', 'danger');
    } finally {
      setActionInProgress(false);
    }
  };

  // 7. Add Public Progress Update or Confidential Internal Note
  const handleAddUpdate = async (e) => {
    e.preventDefault();
    if (!selectedReport || !updateText.trim()) {
      addToast('Please enter an update message.', 'warning');
      return;
    }
    setIsSubmittingUpdate(true);
    try {
      const updated = await api.addIncidentUpdate(selectedReport.report_identifier, {
        note: updateText.trim(),
        is_public: isUpdatePublic
      });
      setSelectedReport(updated);
      setUpdateText('');
      loadData(true);
      addToast(
        isUpdatePublic
          ? 'Public progress update published to citizen.'
          : 'Confidential internal note recorded securely.',
        'success'
      );
    } catch (err) {
      addToast(err.message || 'Failed to add update.', 'danger');
    } finally {
      setIsSubmittingUpdate(false);
    }
  };

  // 8. Resolve Incident
  const handleResolveIncident = async (e) => {
    e.preventDefault();
    if (!selectedReport || !resolutionSummary.trim() || resolutionSummary.trim().length < 5) {
      addToast('Please enter a comprehensive resolution summary (at least 5 characters).', 'warning');
      return;
    }
    setActionInProgress(true);
    try {
      const updated = await api.resolveIncidentReport(selectedReport.report_identifier, {
        resolution_summary: resolutionSummary.trim()
      });
      setSelectedReport(updated);
      setActiveActionModal(null);
      setResolutionSummary('');
      loadData(true);
      addToast(`Incident ${selectedReport.report_identifier} marked as Resolved!`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to resolve incident.', 'danger');
    } finally {
      setActionInProgress(false);
    }
  };

  // Helper for severity badge style
  const getSeverityBadge = (severity) => {
    const s = SEVERITY_LEVELS.find((l) => l.id.toLowerCase() === (severity || '').toLowerCase());
    return {
      label: s ? s.label : severity,
      badgeClass: s ? s.badgeClass : 'badge-minor',
      color: s ? s.color : '#0369a1',
      bg: s ? s.bg : '#e0f2fe'
    };
  };

  return (
    <div className="reports-page authority-incident-page">
      <BackButton fallbackPath="/authority" label="Back to Authority Dashboard" />

      {/* Page Header (Requirement 1) */}
      <div className="page-header-block" style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <h1 className="page-title" style={{ margin: 0, color: 'var(--color-espresso-dark)' }}>
                Incident Reports Management
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  background: 'rgba(139, 58, 43, 0.10)',
                  border: '1px solid rgba(139, 58, 43, 0.25)',
                  color: 'var(--color-terracotta)',
                  fontSize: '0.78rem',
                  fontWeight: 700
                }}
              >
                <Shield size={13} />
                <span>Authority Command</span>
              </span>
            </div>
            <p className="page-subtitle" style={{ maxWidth: '820px', margin: 0 }}>
              Review citizen-reported incidents, verify information, coordinate response teams and monitor resolution.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => loadData(true)}
              disabled={refreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '0.86rem'
              }}
            >
              <RotateCcw size={14} className={refreshing ? 'spin' : ''} />
              <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Authority Summary Metrics Cards (Requirement 2) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.15rem',
          marginBottom: '2rem'
        }}
      >
        {/* Card 1: Total Reports */}
        <div
          className={`card card-hover ${statusFilter === 'All' ? 'card-active-filter' : ''}`}
          onClick={() => setStatusFilter('All')}
          style={{
            cursor: 'pointer',
            padding: '1.15rem 1.25rem',
            background: statusFilter === 'All' ? '#fffdfb' : '#ffffff',
            border: statusFilter === 'All' ? '2px solid var(--color-terracotta)' : '1px solid var(--border-medium)',
            borderRadius: '12px',
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Reports
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'rgba(139, 58, 43, 0.12)',
                color: 'var(--color-terracotta)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Layers size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 900, color: 'var(--color-espresso-dark)', lineHeight: 1.1 }}>
            {metrics.total_reports}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            All field submissions in jurisdiction
          </div>
        </div>

        {/* Card 2: Awaiting Review */}
        <div
          className={`card card-hover ${statusFilter === 'Submitted' ? 'card-active-filter' : ''}`}
          onClick={() => setStatusFilter('Submitted')}
          style={{
            cursor: 'pointer',
            padding: '1.15rem 1.25rem',
            background: statusFilter === 'Submitted' ? '#fff9f0' : '#ffffff',
            border: statusFilter === 'Submitted' ? '2px solid #b45309' : '1px solid var(--border-medium)',
            borderRadius: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Awaiting Review
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: '#fef3c7',
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#b45309', lineHeight: 1.1 }}>
            {metrics.awaiting_review}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            Newly submitted • Pending triage
          </div>
        </div>

        {/* Card 3: Under Investigation */}
        <div
          className={`card card-hover ${statusFilter === 'Under Review' ? 'card-active-filter' : ''}`}
          onClick={() => setStatusFilter('Under Review')}
          style={{
            cursor: 'pointer',
            padding: '1.15rem 1.25rem',
            background: statusFilter === 'Under Review' ? '#f0f9ff' : '#ffffff',
            border: statusFilter === 'Under Review' ? '2px solid #0369a1' : '1px solid var(--border-medium)',
            borderRadius: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Under Investigation
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: '#e0f2fe',
                color: '#0369a1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Activity size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#0369a1', lineHeight: 1.1 }}>
            {metrics.under_investigation}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            Verified / Assigned / Action underway
          </div>
        </div>

        {/* Card 4: Resolved Reports */}
        <div
          className={`card card-hover ${statusFilter === 'Resolved' ? 'card-active-filter' : ''}`}
          onClick={() => setStatusFilter('Resolved')}
          style={{
            cursor: 'pointer',
            padding: '1.15rem 1.25rem',
            background: statusFilter === 'Resolved' ? '#f0fdf4' : '#ffffff',
            border: statusFilter === 'Resolved' ? '2px solid #15803d' : '1px solid var(--border-medium)',
            borderRadius: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Resolved Reports
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: '#dcfce7',
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#15803d', lineHeight: 1.1 }}>
            {metrics.resolved_reports}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            Hazards mitigated and closed
          </div>
        </div>
      </div>

      {/* Search, Filtering and Sorting Bar (Requirement 4) */}
      <div
        className="card"
        style={{
          padding: '1.25rem 1.4rem',
          borderRadius: '12px',
          marginBottom: '2rem',
          border: '1px solid var(--border-medium)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Row 1: Search input */}
          <div style={{ position: 'relative' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }}
            />
            <input
              type="text"
              placeholder="Search reports by ID (e.g. IR-2026), title, category, locality, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{
                paddingLeft: '42px',
                paddingRight: searchQuery ? '36px' : '12px',
                width: '100%',
                height: '42px',
                fontSize: '0.92rem'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: 2
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Row 2: Responsive Filter Dropdowns */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '0.85rem',
              alignItems: 'center'
            }}
          >
            {/* Status Filter */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Status
              </label>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
              >
                <option value="All">All Statuses</option>
                <option value="Submitted">Submitted (New)</option>
                <option value="Under Review">Under Review</option>
                <option value="Clarification Requested">Clarification Requested</option>
                <option value="Verified">Verified</option>
                <option value="Assigned">Assigned</option>
                <option value="Action in Progress">Action in Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Rejected">Rejected</option>
                <option value="Duplicate">Duplicate</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Category
              </label>
              <select
                className="form-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
              >
                <option value="All">All Categories</option>
                {INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Severity Filter */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Citizen-Reported Severity
              </label>
              <select
                className="form-select"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
              >
                <option value="All">All Severities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Moderate">Moderate</option>
                <option value="Low">Low</option>
              </select>
            </div>

            {/* Time Range Filter */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Submission Window
              </label>
              <select
                className="form-select"
                value={timeRangeFilter}
                onChange={(e) => setTimeRangeFilter(e.target.value)}
                style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
              </select>
            </div>

            {/* Sort Filter */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Sort By
              </label>
              <select
                className="form-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ width: '100%', height: '38px', fontSize: '0.86rem' }}
              >
                <option value="priority">Priority Order (Urgent First)</option>
                <option value="severity_desc">Highest Severity First</option>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>

          {/* Row 3: Active Filters & Clear Button */}
          {isFilterActive && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-light)',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Showing filtered operational results ({reports.length} reports match)
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleClearFilters}
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
              >
                Reset All Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Incoming Incident Reports Section (Requirement 3) */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: 0 }}>
              Incoming Incident Reports
            </h2>
            <span
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-medium)',
                borderRadius: '12px',
                padding: '2px 9px',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--color-espresso-dark)'
              }}
            >
              {reports.length}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <Radio size={14} color="#15803d" />
            <span>Operational Dispatch Feed Active</span>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <LoadingSpinner text="Retrieving operational incident records from disaster registry..." />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={<FileText size={42} color="var(--color-terracotta)" />}
            title="No Incident Reports Found"
            description={
              isFilterActive
                ? 'No incoming incident reports match your current filters. Try resetting the filters.'
                : 'No citizen incident reports have been submitted in this jurisdiction yet. Newly submitted reports will appear here automatically in real time.'
            }
          />
        ) : (
          /* Reports Grid / Cards List */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {reports.map((report) => {
              const severityMeta = getSeverityBadge(report.severity);
              const isCriticalOrHigh = report.severity === 'Critical' || report.severity === 'High';

              return (
                <div
                  key={report.id || report.report_identifier}
                  className="card card-hover"
                  style={{
                    padding: '1.35rem 1.5rem',
                    borderRadius: '12px',
                    border: isCriticalOrHigh
                      ? '1px solid rgba(194, 65, 12, 0.40)'
                      : '1px solid var(--border-medium)',
                    background: '#ffffff',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem'
                  }}
                >
                  {/* Top Bar: ID, Status, Severity, Date */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          color: 'var(--color-espresso-dark)',
                          background: 'var(--bg-surface-subtle)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-light)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        {report.report_identifier}
                        <button
                          type="button"
                          title="Copy Report ID"
                          onClick={() => handleCopyId(report.report_identifier)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: copiedId === report.report_identifier ? '#15803d' : 'var(--text-muted)',
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          {copiedId === report.report_identifier ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </span>

                      <Badge status={report.status} label={report.status} />

                      {/* Citizen-Reported Severity Chip */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 9px',
                          borderRadius: '12px',
                          background: severityMeta.bg,
                          color: severityMeta.color,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          border: `1px solid ${severityMeta.color}33`
                        }}
                        title="Citizen-reported field observation"
                      >
                        <AlertTriangle size={12} />
                        <span>Severity: {severityMeta.label}</span>
                      </span>

                      {report.assigned_department && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: '#f3e8ff',
                            color: '#6b21a8',
                            fontSize: '0.74rem',
                            fontWeight: 700
                          }}
                        >
                          <Building size={12} />
                          <span>{report.assigned_department}</span>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <Clock size={14} color="var(--color-terracotta)" />
                      <span>{new Date(report.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Five-Stage Incident Report Progress Tracker (Requirement) */}
                  <div style={{ margin: '2px 0 4px 0', width: '100%' }}>
                    <IncidentProgressTracker report={report} />
                  </div>

                  {/* Title & Short Description */}
                  <div>
                    <h3
                      style={{
                        margin: '0 0 6px 0',
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        color: 'var(--color-espresso-dark)'
                      }}
                    >
                      {report.title}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.9rem',
                        color: 'var(--color-espresso-base)',
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {report.description}
                    </p>
                  </div>

                  {/* Metadata Chips: Category, Location, Risk Assessment */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      flexWrap: 'wrap',
                      fontSize: '0.82rem',
                      color: 'var(--text-muted)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'var(--bg-surface-subtle)'
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--color-espresso-dark)' }}>Category:</strong> {report.category}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={14} color="var(--color-terracotta)" />
                      <span>
                        {[report.location_name, report.city || report.district].filter(Boolean).join(', ') || 'Reported Location'}
                      </span>
                    </div>

                    <div>
                      <strong style={{ color: 'var(--color-espresso-dark)' }}>Ongoing:</strong>{' '}
                      <span style={{ color: report.is_still_occurring === 'Yes' ? '#b45309' : 'inherit', fontWeight: 600 }}>
                        {report.is_still_occurring || 'Not Sure'}
                      </span>
                    </div>

                    <div>
                      <strong style={{ color: 'var(--color-espresso-dark)' }}>People at Risk:</strong>{' '}
                      <span style={{ color: report.are_people_at_risk === 'Yes' ? '#c2410c' : 'inherit', fontWeight: 600 }}>
                        {report.are_people_at_risk || 'Not Sure'}
                        {report.people_affected_count !== null && report.people_affected_count !== undefined
                          ? ` (~${report.people_affected_count})`
                          : ''}
                      </span>
                    </div>

                    {report.photos && report.photos.length > 0 && (
                      <div style={{ color: 'var(--color-terracotta)', fontWeight: 600 }}>
                        📷 {report.photos.length} photo{report.photos.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--border-light)',
                      paddingTop: '0.85rem',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span>Reported by: </span>
                      <strong style={{ color: 'var(--color-espresso-dark)' }}>{report.reporter_name}</strong>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleOpenReportDetails(report)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 18px',
                        fontSize: '0.88rem',
                        fontWeight: 700
                      }}
                    >
                      <Eye size={16} />
                      <span>Review Report</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          FULL INCIDENT REPORT DETAILS MODAL (Requirements 5, 6, 7, 8, 9, 10)
          ========================================================================= */}
      {selectedReport && (
        <Modal
          isOpen={Boolean(selectedReport)}
          onClose={() => {
            setSelectedReport(null);
            setActiveActionModal(null);
          }}
          title={`Incident Report Review: ${selectedReport.report_identifier}`}
          size="lg"
        >
          {reportDetailsLoading ? (
            <LoadingSpinner text="Loading detailed incident dossier..." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Incident Workflow 5-Stage Stepper Tracker */}
              <div style={{ width: '100%', marginBottom: '2px' }}>
                <IncidentProgressTracker report={selectedReport} />
              </div>

              {/* Top Navigation Tabs */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '2px solid var(--border-medium)',
                  gap: '1.5rem',
                  paddingBottom: '2px'
                }}
              >
                {[
                  { id: 'details', label: 'Field Details & Dossier', icon: <FileText size={15} /> },
                  { id: 'actions', label: 'Review & Assignment', icon: <ShieldCheck size={15} /> },
                  { id: 'updates', label: 'Investigation & Updates', icon: <MessageSquare size={15} /> },
                  { id: 'history', label: 'Activity Timeline', icon: <Clock size={15} /> }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 0',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: activeTab === tab.id ? 800 : 600,
                      color: activeTab === tab.id ? 'var(--color-terracotta)' : 'var(--text-muted)',
                      borderBottom: activeTab === tab.id ? '2px solid var(--color-terracotta)' : '2px solid transparent',
                      marginBottom: '-2px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* TAB 1: FIELD DETAILS & DOSSIER */}
              {activeTab === 'details' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Status & Citizen Severity Warning Banner */}
                  <div
                    style={{
                      padding: '0.95rem 1.15rem',
                      borderRadius: '8px',
                      background: '#fff7ed',
                      border: '1px solid #fed7aa',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px'
                    }}
                  >
                    <AlertTriangle size={20} color="#c2410c" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: '0.86rem', color: '#7c2d12', lineHeight: 1.5 }}>
                      <strong>Citizen-Reported Severity Assessment: {selectedReport.severity}</strong>
                      <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#9a3412' }}>
                        This severity level was chosen by the citizen at the time of field observation. It has not yet been designated as an official verified classification. Verify conditions below before taking assignment or dispatch action.
                      </p>
                    </div>
                  </div>

                  {/* Possible Duplicates Warning if detected (Requirement 6) */}
                  {possibleDuplicates.length > 0 && (
                    <div
                      style={{
                        padding: '0.85rem 1.15rem',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        fontSize: '0.84rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e40af', fontWeight: 700, marginBottom: 4 }}>
                        <Layers size={16} />
                        <span>Possible Duplicate Incident Reports Detected ({possibleDuplicates.length})</span>
                      </div>
                      <p style={{ margin: '0 0 8px 0', color: '#1e3a8a', fontSize: '0.8rem' }}>
                        The following reports match this category ({selectedReport.category}) in close geographic proximity. They are shown for authority inspection only and will not be automatically merged or deleted:
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {possibleDuplicates.map((dup) => (
                          <span
                            key={dup.report_identifier}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #93c5fd',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              fontSize: '0.78rem',
                              color: '#1d4ed8'
                            }}
                          >
                            {dup.report_identifier}: {dup.title.slice(0, 30)}... ({dup.status})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Incident Title & Full Description */}
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: '0 0 8px 0' }}>
                      {selectedReport.title}
                    </h3>
                    <div
                      style={{
                        background: 'var(--bg-surface-subtle)',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.92rem',
                        color: 'var(--color-espresso-base)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {selectedReport.description}
                    </div>
                  </div>

                  {/* Core Incident Attribute Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                    <div style={{ background: '#ffffff', border: '1px solid var(--border-medium)', padding: '10px 12px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                        Category
                      </span>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--color-espresso-dark)' }}>{selectedReport.category}</strong>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid var(--border-medium)', padding: '10px 12px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                        Incident Date & Time
                      </span>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--color-espresso-dark)' }}>
                        {selectedReport.incident_date} {selectedReport.incident_time ? `at ${selectedReport.incident_time}` : ''}
                      </strong>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid var(--border-medium)', padding: '10px 12px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                        Still Occurring?
                      </span>
                      <strong style={{ fontSize: '0.92rem', color: selectedReport.is_still_occurring === 'Yes' ? '#b45309' : 'var(--color-espresso-dark)' }}>
                        {selectedReport.is_still_occurring || 'Not Sure'}
                      </strong>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid var(--border-medium)', padding: '10px 12px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                        People Affected / At Risk
                      </span>
                      <strong style={{ fontSize: '0.92rem', color: selectedReport.are_people_at_risk === 'Yes' ? '#c2410c' : 'var(--color-espresso-dark)' }}>
                        {selectedReport.are_people_at_risk || 'Not Sure'}
                        {selectedReport.people_affected_count !== null && selectedReport.people_affected_count !== undefined
                          ? ` (~${selectedReport.people_affected_count} people)`
                          : ''}
                      </strong>
                    </div>
                  </div>

                  {/* Additional Observations if present */}
                  {selectedReport.additional_observations && (
                    <div style={{ background: 'var(--bg-surface-subtle)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>
                        Additional Observations Provided by Citizen
                      </span>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: 'var(--color-espresso-base)' }}>
                        {selectedReport.additional_observations}
                      </p>
                    </div>
                  )}

                  {/* Exact Location Details & Map Coordinates (Requirement 5) */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      padding: '1.15rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <MapPin size={18} color="var(--color-terracotta)" />
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-espresso-dark)' }}>
                        Location & Geographic Verification
                      </h4>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem', fontSize: '0.86rem' }}>
                      <div>
                        <strong>Locality / Location Name:</strong>
                        <div style={{ color: 'var(--color-espresso-dark)', marginTop: 2 }}>
                          {selectedReport.location_name || 'Designated Area'}
                        </div>
                      </div>

                      {selectedReport.address && (
                        <div>
                          <strong>Street Address:</strong>
                          <div style={{ color: 'var(--color-espresso-dark)', marginTop: 2 }}>
                            {selectedReport.address}
                          </div>
                        </div>
                      )}

                      {selectedReport.location_description && (
                        <div>
                          <strong>Landmarks / Access Notes:</strong>
                          <div style={{ color: 'var(--color-espresso-dark)', marginTop: 2 }}>
                            {selectedReport.location_description}
                          </div>
                        </div>
                      )}

                      <div>
                        <strong>Administrative Jurisdiction:</strong>
                        <div style={{ color: 'var(--color-espresso-dark)', marginTop: 2 }}>
                          {[selectedReport.district, selectedReport.city, selectedReport.state, selectedReport.postal_code].filter(Boolean).join(', ') || 'Central Command Zone'}
                        </div>
                      </div>

                      {selectedReport.latitude && selectedReport.longitude && (
                        <div>
                          <strong>GPS Coordinates:</strong>
                          <div style={{ fontFamily: 'monospace', color: 'var(--color-terracotta)', fontWeight: 700, marginTop: 2 }}>
                            Lat: {Number(selectedReport.latitude).toFixed(5)}, Lng: {Number(selectedReport.longitude).toFixed(5)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Photographic Evidence Gallery (Requirement 5) */}
                  {selectedReport.photos && selectedReport.photos.length > 0 && (
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '8px',
                        padding: '1.15rem'
                      }}
                    >
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-espresso-dark)' }}>
                        Supporting Photographic Evidence ({selectedReport.photos.length})
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                        {selectedReport.photos.map((p, idx) => (
                          <div
                            key={p.id || idx}
                            onClick={() => setFullscreenImage(p)}
                            style={{
                              position: 'relative',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              border: '1px solid var(--border-medium)',
                              aspectRatio: '1',
                              cursor: 'pointer',
                              background: '#f8fafc'
                            }}
                          >
                            <img
                              src={p.dataUrl || p.url || p.file_url}
                              alt={p.name || `Evidence ${idx + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0,0,0,0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0,
                                transition: 'opacity 0.2s'
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = 0)}
                            >
                              <Maximize2 size={18} color="#ffffff" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reporter Contact Information (Protected & Role Guarded) */}
                  <div
                    style={{
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      padding: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={15} color="var(--color-terracotta)" />
                        <strong style={{ fontSize: '0.88rem', color: 'var(--color-espresso-dark)' }}>
                          Reporting Citizen Dossier
                        </strong>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#e0e7ff',
                            color: '#3730a3'
                          }}
                        >
                          Confidential Operational Data
                        </span>
                      </div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--color-espresso-base)', marginTop: '4px' }}>
                        Name: <strong>{selectedReport.reporter_name}</strong>
                        {selectedReport.reporter_email && ` • Email: ${selectedReport.reporter_email}`}
                        {selectedReport.reporter_contact && ` • Phone: ${selectedReport.reporter_contact}`}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: REVIEW & ASSIGNMENT (Requirement 6, 7, 8, 10) */}
              {activeTab === 'actions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Current Status & Assignment Snapshot */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      padding: '1.15rem',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '1rem'
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                        Lifecycle Status
                      </span>
                      <div style={{ marginTop: 4 }}>
                        <Badge status={selectedReport.status} label={selectedReport.status} />
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                        Assigned Response Team
                      </span>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-espresso-dark)', marginTop: 4 }}>
                        {selectedReport.assigned_department ? (
                          <span style={{ color: '#6b21a8' }}>{selectedReport.assigned_department}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned (Action Required)</span>
                        )}
                      </div>
                    </div>

                    {selectedReport.verified_at && (
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                          Verification Record
                        </span>
                        <div style={{ fontSize: '0.85rem', color: '#15803d', fontWeight: 600, marginTop: 4 }}>
                          Verified on {new Date(selectedReport.verified_at).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Section A: Operational Review Actions (Requirement 6) */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      padding: '1.25rem'
                    }}
                  >
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--color-espresso-dark)' }}>
                      Authority Review Workflow
                    </h4>
                    <p style={{ margin: '0 0 14px 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                      Triage this incident report. Advance it to Under Review, confirm official verification, or request citizen clarification:
                    </p>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {selectedReport.status === 'Submitted' && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={actionInProgress}
                          onClick={handleMoveToUnderReview}
                          style={{ fontWeight: 700, fontSize: '0.86rem' }}
                        >
                          Mark as Under Review
                        </button>
                      )}

                      {selectedReport.status !== 'Verified' && selectedReport.status !== 'Resolved' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={actionInProgress}
                          onClick={() => setActiveActionModal('verify')}
                          style={{
                            fontWeight: 700,
                            fontSize: '0.86rem',
                            background: '#15803d',
                            borderColor: '#15803d'
                          }}
                        >
                          <FileCheck size={16} />
                          <span>Officially Verify Incident</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={actionInProgress}
                        onClick={() => setActiveActionModal('clarify')}
                        style={{ fontWeight: 700, fontSize: '0.86rem' }}
                      >
                        <HelpCircle size={16} />
                        <span>Request Clarification</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={actionInProgress}
                        onClick={() => setActiveActionModal('duplicate')}
                        style={{ fontWeight: 700, fontSize: '0.86rem' }}
                      >
                        <span>Mark as Duplicate</span>
                      </button>

                      {selectedReport.status !== 'Not Verified' && selectedReport.status !== 'Resolved' && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={actionInProgress}
                          onClick={() => setActiveActionModal('not_verified')}
                          style={{ fontWeight: 700, fontSize: '0.86rem', color: '#dc2626' }}
                        >
                          <XCircle size={16} />
                          <span>Record as Not Verified</span>
                        </button>
                      )}

                      {selectedReport.status !== 'Rejected' && selectedReport.status !== 'Resolved' && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={actionInProgress}
                          onClick={() => setActiveActionModal('reject')}
                          style={{ fontWeight: 700, fontSize: '0.86rem', color: '#b91c1c' }}
                        >
                          <XCircle size={16} />
                          <span>Reject Report</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Section B: Department & Response Team Assignment - Stage 4 Action Initiated (Requirement 7) */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      padding: '1.25rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Building size={18} color="var(--color-terracotta)" />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-espresso-dark)' }}>
                        Stage 4: Assign Department & Initiate Response Action
                      </h4>
                    </div>
                    <p style={{ margin: '0 0 14px 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                      Formally assign and dispatch this verified incident to a configured disaster management department or response unit to initiate response action.
                    </p>

                    <form onSubmit={handleAssignDepartment}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                            Responsible Department / Unit <span style={{ color: 'red' }}>*</span>
                          </label>
                          <select
                            className="form-select"
                            value={assignDepartment}
                            onChange={(e) => setAssignDepartment(e.target.value)}
                            style={{ width: '100%', height: '40px' }}
                          >
                            {CONFIGURED_DEPARTMENTS.map((dept) => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                            Dispatch Instructions & Unit Notes
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. Deploy quick-draining pump unit; inspect road integrity"
                            value={assignNotes}
                            onChange={(e) => setAssignNotes(e.target.value)}
                            style={{ width: '100%', height: '40px' }}
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={actionInProgress}
                        style={{ fontWeight: 700, fontSize: '0.88rem' }}
                      >
                        {selectedReport.assigned_department ? 'Reassign Department' : 'Confirm Assignment & Deploy'}
                      </button>
                    </form>
                  </div>

                  {/* Section C: Resolution Workflow (Requirement 10) */}
                  {selectedReport.status !== 'Resolved' && selectedReport.status !== 'Rejected' && (
                    <div
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '8px',
                        padding: '1.25rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 800, color: '#166534' }}>
                            Ready to Resolve Incident?
                          </h4>
                          <p style={{ margin: 0, fontSize: '0.84rem', color: '#15803d' }}>
                            Once corrective measures have eliminated the hazard or handover is complete, record the official resolution summary.
                          </p>
                        </div>

                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setActiveActionModal('resolve')}
                          style={{
                            background: '#15803d',
                            borderColor: '#15803d',
                            fontWeight: 700
                          }}
                        >
                          <CheckCircle2 size={16} />
                          <span>Resolve Incident</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: INVESTIGATION & UPDATES (Requirement 9) */}
              {activeTab === 'updates' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Post New Update Card */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      padding: '1.25rem'
                    }}
                  >
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--color-espresso-dark)' }}>
                      Record Field Investigation or Progress Update
                    </h4>
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                      Choose whether this update is visible to the citizen or kept as a confidential internal coordination note.
                    </p>

                    <form onSubmit={handleAddUpdate}>
                      <textarea
                        rows={3}
                        className="form-textarea"
                        placeholder="Enter field observations, engineering assessments, actions taken, or safety advisories..."
                        value={updateText}
                        onChange={(e) => setUpdateText(e.target.value)}
                        style={{ width: '100%', marginBottom: '10px' }}
                      />

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        {/* Visibility Switch */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.86rem' }}>
                            <input
                              type="radio"
                              name="update_visibility"
                              checked={isUpdatePublic}
                              onChange={() => setIsUpdatePublic(true)}
                            />
                            <span style={{ fontWeight: isUpdatePublic ? 700 : 400, color: 'var(--color-espresso-dark)' }}>
                              Public Update (Visible to Citizen)
                            </span>
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.86rem' }}>
                            <input
                              type="radio"
                              name="update_visibility"
                              checked={!isUpdatePublic}
                              onChange={() => setIsUpdatePublic(false)}
                            />
                            <span style={{ fontWeight: !isUpdatePublic ? 700 : 400, color: '#b91c1c', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Lock size={13} />
                              <span>Confidential Internal Note</span>
                            </span>
                          </label>
                        </div>

                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={isSubmittingUpdate || !updateText.trim()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 700,
                            padding: '8px 18px'
                          }}
                        >
                          <Send size={15} />
                          <span>Post Update</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Updates Feed */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h4 style={{ margin: '8px 0 0 0', fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-espresso-dark)' }}>
                      Investigation Log & Action Updates
                    </h4>

                    {(selectedReport.events || []).filter(
                      (e) => e.event_type === 'PUBLIC_UPDATE' || e.event_type === 'INTERNAL_NOTE'
                    ).length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                        No investigation updates recorded yet. Post an update above.
                      </div>
                    ) : (
                      (selectedReport.events || [])
                        .filter((e) => e.event_type === 'PUBLIC_UPDATE' || e.event_type === 'INTERNAL_NOTE')
                        .map((update, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: update.is_public ? '#ffffff' : '#fef2f2',
                              border: update.is_public ? '1px solid var(--border-medium)' : '1px solid #fecaca',
                              borderRadius: '8px',
                              padding: '1rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong style={{ fontSize: '0.88rem', color: 'var(--color-espresso-dark)' }}>
                                  {update.actor_name}
                                </strong>
                                <span
                                  style={{
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: update.is_public ? '#dbeafe' : '#fee2e2',
                                    color: update.is_public ? '#1d4ed8' : '#991b1b',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  {update.is_public ? (
                                    <>
                                      <Eye size={12} />
                                      <span>Public Progress Update</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock size={12} />
                                      <span>Confidential Internal Note</span>
                                    </>
                                  )}
                                </span>
                              </div>

                              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                {new Date(update.timestamp).toLocaleString()}
                              </span>
                            </div>

                            <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: 'var(--color-espresso-base)', lineHeight: 1.55 }}>
                              {update.note}
                            </p>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: CHRONOLOGICAL REPORT ACTIVITY & STATUS TIMELINE (Requirement 5 & 8) */}
              {activeTab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-espresso-dark)' }}>
                    Complete Chronological Dossier Timeline
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    Every submission, triage status transition, verification, assignment, clarification inquiry and resolution event is immutably recorded below:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                    {(selectedReport.events || []).map((ev, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          padding: '10px 14px',
                          background: ev.is_public ? '#ffffff' : '#fef2f2',
                          border: ev.is_public ? '1px solid var(--border-medium)' : '1px solid #fecaca',
                          borderRadius: '8px',
                          fontSize: '0.86rem'
                        }}
                      >
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: ev.is_public ? 'var(--color-terracotta)' : '#dc2626',
                            marginTop: '5px',
                            flexShrink: 0
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong>{ev.actor_name}</strong>
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>({ev.actor_role})</span>
                              {ev.status && <Badge status={ev.status} label={ev.status} />}
                              {!ev.is_public && (
                                <span style={{ fontSize: '0.72rem', color: '#b91c1c', fontWeight: 700 }}>
                                  [Internal Only]
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                              {new Date(ev.timestamp).toLocaleString()}
                            </span>
                          </div>

                          <div style={{ marginTop: '4px', color: 'var(--color-espresso-base)', lineHeight: 1.5 }}>
                            {ev.note}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* =========================================================================
          ACTION SUB-MODALS (Verification, Clarification, Reject, Duplicate, Resolve)
          ========================================================================= */}

      {/* Action Sub-Modal 1: Verify Incident */}
      {activeActionModal === 'verify' && selectedReport && (
        <Modal
          isOpen={true}
          onClose={() => setActiveActionModal(null)}
          title={`Verify Incident ${selectedReport.report_identifier}`}
          size="md"
        >
          <form onSubmit={handleVerifyReport}>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.88rem', color: 'var(--color-espresso-base)', lineHeight: 1.5, marginTop: 0 }}>
                Confirming verification certifies that this incident has been vetted by disaster management authorities and is slated for active operational response.
              </p>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Verification Remarks / Field Findings
              </label>
              <textarea
                rows={3}
                className="form-textarea"
                placeholder="e.g. Field inspection by NDRF Sector Unit confirmed bridge abutment damage. Area barricaded."
                value={verificationRemarks}
                onChange={(e) => setVerificationRemarks(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setActiveActionModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={actionInProgress} style={{ background: '#15803d', borderColor: '#15803d', fontWeight: 700 }}>
                {actionInProgress ? 'Saving...' : 'Confirm Verification'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Action Sub-Modal 2: Request Clarification */}
      {activeActionModal === 'clarify' && selectedReport && (
        <Modal
          isOpen={true}
          onClose={() => setActiveActionModal(null)}
          title={`Request Clarification from ${selectedReport.reporter_name}`}
          size="md"
        >
          <form onSubmit={handleRequestClarification}>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.88rem', color: 'var(--color-espresso-base)', lineHeight: 1.5, marginTop: 0 }}>
                Specify what additional information or photos are required from the reporting citizen:
              </p>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Clarification Inquiry <span style={{ color: 'red' }}>*</span>
              </label>
              <textarea
                rows={4}
                className="form-textarea"
                placeholder="e.g. Please confirm if water level has risen since submission and whether power lines are submerged near the landmark."
                value={clarificationQuestion}
                onChange={(e) => setClarificationQuestion(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setActiveActionModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={actionInProgress || !clarificationQuestion.trim()} style={{ fontWeight: 700 }}>
                {actionInProgress ? 'Sending...' : 'Send Inquiry to Citizen'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Action Sub-Modal 3: Mark Duplicate */}
      {activeActionModal === 'duplicate' && selectedReport && (
        <Modal
          isOpen={true}
          onClose={() => setActiveActionModal(null)}
          title={`Mark Report as Duplicate: ${selectedReport.report_identifier}`}
          size="md"
        >
          <form onSubmit={handleMarkDuplicate}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                  Reference Original Incident Report ID (Optional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. IR-2026-1042"
                  value={duplicateOfId}
                  onChange={(e) => setDuplicateOfId(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                  Duplicate Explanation <span style={{ color: 'red' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  className="form-textarea"
                  placeholder="Mandatory reason explaining duplicate status (e.g. Duplicate report of same waterlogging incident on Bailey Road)..."
                  value={duplicateReason}
                  onChange={(e) => setDuplicateReason(e.target.value)}
                  style={{ width: '100%' }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setActiveActionModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={actionInProgress || !duplicateReason.trim()} style={{ fontWeight: 700 }}>
                {actionInProgress ? 'Saving...' : 'Mark as Duplicate'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Action Sub-Modal: Record Not Verified */}
      {activeActionModal === 'not_verified' && selectedReport && (
        <Modal
          isOpen={true}
          onClose={() => setActiveActionModal(null)}
          title={`Record Incident as Not Verified: ${selectedReport.report_identifier}`}
          size="md"
        >
          <form onSubmit={handleMarkNotVerified}>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.88rem', color: '#dc2626', lineHeight: 1.5, marginTop: 0 }}>
                If on-site inspection, lack of evidence or credibility checks indicate the report cannot be verified as an active disaster incident, record the report as Not Verified. A mandatory explanation reason is required.
              </p>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Reason Not Verified <span style={{ color: 'red' }}>*</span>
              </label>
              <textarea
                rows={3}
                className="form-textarea"
                placeholder="e.g. Field inspection by NDRF confirmed drainage clear and water receded; no emergency response required."
                value={notVerifiedReason}
                onChange={(e) => setNotVerifiedReason(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setActiveActionModal(null)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={actionInProgress || !notVerifiedReason.trim()}
                style={{ background: '#dc2626', borderColor: '#dc2626', fontWeight: 700 }}
              >
                {actionInProgress ? 'Saving...' : 'Confirm Not Verified'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Action Sub-Modal 4: Reject Report */}
      {activeActionModal === 'reject' && selectedReport && (
        <Modal
          isOpen={true}
          onClose={() => setActiveActionModal(null)}
          title={`Reject Incident Report: ${selectedReport.report_identifier}`}
          size="md"
        >
          <form onSubmit={handleRejectReport}>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.88rem', color: '#b91c1c', lineHeight: 1.5, marginTop: 0 }}>
                Rejecting a report archives it as unverified or invalid. A clear explanation is mandatory.
              </p>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Rejection Reason <span style={{ color: 'red' }}>*</span>
              </label>
              <textarea
                rows={3}
                className="form-textarea"
                placeholder="e.g. On-site verification revealed reported hazard has already cleared / unrelated to disaster management scope."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setActiveActionModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={actionInProgress || !rejectionReason.trim()} style={{ background: '#b91c1c', borderColor: '#b91c1c', fontWeight: 700 }}>
                {actionInProgress ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Action Sub-Modal 5: Resolve Incident */}
      {activeActionModal === 'resolve' && selectedReport && (
        <Modal
          isOpen={true}
          onClose={() => setActiveActionModal(null)}
          title={`Resolve Incident ${selectedReport.report_identifier}`}
          size="md"
        >
          <form onSubmit={handleResolveIncident}>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.88rem', color: '#15803d', lineHeight: 1.5, marginTop: 0 }}>
                Closing this incident marks the hazard as resolved. Provide a comprehensive summary of actions taken and current ground status:
              </p>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'block', marginBottom: 4 }}>
                Resolution Summary <span style={{ color: 'red' }}>*</span>
              </label>
              <textarea
                rows={4}
                className="form-textarea"
                placeholder="e.g. PWD crews cleared fallen tree, repaired damaged barrier and restored two-lane traffic flow at 14:30. Road safe for public transit."
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setActiveActionModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={actionInProgress || !resolutionSummary.trim()} style={{ background: '#15803d', borderColor: '#15803d', fontWeight: 700 }}>
                {actionInProgress ? 'Resolving...' : 'Confirm Incident Resolution'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Fullscreen Photo Lightbox */}
      {fullscreenImage && (
        <div
          onClick={() => setFullscreenImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.88)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <img
              src={fullscreenImage.dataUrl || fullscreenImage.url || fullscreenImage.file_url}
              alt={fullscreenImage.name || 'Full view'}
              style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            <button
              type="button"
              onClick={() => setFullscreenImage(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'none',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuthorityIncidentReports;
