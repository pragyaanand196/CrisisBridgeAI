import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useWebSocket } from '../context/WebSocketContext';
import { api } from '../services/api';
import { BackButton } from '../components/common/BackButton';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { LocationPicker } from '../components/common/LocationPicker';
import { IncidentProgressTracker } from '../components/incident/IncidentProgressTracker';
import {
  citizenIncidentService,
  INCIDENT_CATEGORIES,
  SEVERITY_LEVELS,
  REPORT_STATUSES
} from '../services/citizenIncidentService';
import {
  FileText,
  PlusCircle,
  AlertTriangle,
  LifeBuoy,
  MapPin,
  Calendar,
  Clock,
  Camera,
  CheckCircle2,
  XCircle,
  Eye,
  ArrowRight,
  Info,
  Shield,
  Upload,
  Trash2,
  Send,
  Search,
  Filter,
  Check,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Maximize2,
  X,
  HelpCircle
} from 'lucide-react';

export function CitizenIncidentReports() {
  const { user } = useAuth();
  const { addToast } = useNotification();
  const { subscribe } = useWebSocket();

  // Citizen-specific submitted reports list
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [submittedSuccessReport, setSubmittedSuccessReport] = useState(null);
  const [photoViewer, setPhotoViewer] = useState({
    isOpen: false,
    reportId: null,
    reportTitle: '',
    photos: [],
    currentIndex: 0,
    hasError: false,
    isLoading: true
  });

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Clarification Form State (inside Details Modal)
  const [clarificationText, setClarificationText] = useState('');
  const [clarificationPhotos, setClarificationPhotos] = useState([]);
  const [isSubmittingClarification, setIsSubmittingClarification] = useState(false);

  // Default empty form
  const getInitialFormData = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const nowHours = String(new Date().getHours()).padStart(2, '0');
    const nowMinutes = String(new Date().getMinutes()).padStart(2, '0');

    return {
      title: '',
      category: 'Flooding / Waterlogging',
      description: '',
      severity: 'Moderate',
      incident_date: today,
      incident_time: `${nowHours}:${nowMinutes}`,
      is_still_occurring: 'Yes',
      are_people_at_risk: 'Not Sure',
      people_affected_count: '',
      additional_observations: '',

      // Location fields
      location_name: '',
      location_description: '',
      address: '',
      district: '',
      city: '',
      state: '',
      postal_code: '',
      latitude: null,
      longitude: null,
      location_is_confirmed: false,
      manual_location_mode: false,

      // Photos
      photos: [],

      // Additional info
      immediate_danger: 'Not Sure',
      emergency_assistance_needed: 'No',
      additional_contact: '',
      accuracy_confirmed: false
    };
  }, []);

  const [formData, setFormData] = useState(getInitialFormData);

  // Load citizen reports strictly for the authenticated citizen ID
  const loadReports = useCallback(async () => {
    if (!user || !user.id) {
      setReports([]);
      setLoading(false);
      return;
    }
    try {
      const cached = citizenIncidentService.getCitizenReports(user.id);
      if (cached && cached.length > 0) {
        setReports(cached);
      }
      const fresh = await citizenIncidentService.fetchCitizenReports(user.id);
      if (fresh && Array.isArray(fresh)) {
        setReports(fresh);
      }
    } catch (err) {
      console.error('Failed to load citizen incident reports:', err);
      addToast('Could not load your incident reports.', 'danger');
    } finally {
      setLoading(false);
    }
  }, [user, addToast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Open Photograph Lightbox Viewer
  const handleOpenPhotoViewer = (report, startIndex = 0) => {
    if (!report || !report.photos || report.photos.length === 0) return;
    const initialIndex = (startIndex >= 0 && startIndex < report.photos.length) ? startIndex : 0;
    setPhotoViewer({
      isOpen: true,
      reportId: report.id,
      reportTitle: report.title,
      photos: report.photos,
      currentIndex: initialIndex,
      hasError: false,
      isLoading: true
    });
  };

  const handleClosePhotoViewer = () => {
    setPhotoViewer(prev => ({
      ...prev,
      isOpen: false,
      photos: [],
      currentIndex: 0,
      hasError: false,
      isLoading: false
    }));
  };

  const handlePrevPhoto = (e) => {
    if (e) e.stopPropagation();
    setPhotoViewer(prev => {
      if (prev.photos.length <= 1) return prev;
      const newIndex = prev.currentIndex > 0 ? prev.currentIndex - 1 : prev.photos.length - 1;
      return {
        ...prev,
        currentIndex: newIndex,
        hasError: false,
        isLoading: true
      };
    });
  };

  const handleNextPhoto = (e) => {
    if (e) e.stopPropagation();
    setPhotoViewer(prev => {
      if (prev.photos.length <= 1) return prev;
      const newIndex = prev.currentIndex < prev.photos.length - 1 ? prev.currentIndex + 1 : 0;
      return {
        ...prev,
        currentIndex: newIndex,
        hasError: false,
        isLoading: true
      };
    });
  };

  // Prevent background scrolling while photo viewer is open & handle Escape / Arrow keys
  useEffect(() => {
    if (!photoViewer.isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClosePhotoViewer();
      } else if (e.key === 'ArrowLeft') {
        handlePrevPhoto();
      } else if (e.key === 'ArrowRight') {
        handleNextPhoto();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [photoViewer.isOpen, photoViewer.photos.length]);

  // Open Create Modal & reset state
  const handleOpenCreateModal = () => {
    setFormData(getInitialFormData());
    setFormErrors({});
    setIsCreateModalOpen(true);
  };

  // Close Create Modal
  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setFormErrors({});
  };

  // Open Report Details & refresh from server
  const handleOpenReportDetails = async (report) => {
    setSelectedReport(report);
    setClarificationText('');
    setClarificationPhotos([]);
    try {
      const full = await api.getIncidentReportDetails(report.id || report.backend_id);
      if (full) {
        setSelectedReport((prev) => ({
          ...prev,
          ...full,
          status_history: (full.events || []).map((e) => ({
            status: e.status || e.event_type,
            timestamp: e.timestamp,
            note: e.note,
            author: e.actor_role === 'authority' || e.actor_role === 'administrator' ? 'Disaster Authority' : 'Citizen'
          }))
        }));
      }
    } catch (err) {
      // Keep cached report state
    }
  };

  // Pre-fill location from authenticated citizen profile
  const handleUseRegisteredLocation = () => {
    if (!user) return;
    setFormData((prev) => ({
      ...prev,
      location_name: user.location_name || prev.location_name || 'Registered Area',
      district: user.district || prev.district || '',
      city: user.city || prev.city || '',
      state: user.state || prev.state || '',
      postal_code: user.postal_code || prev.postal_code || '',
      latitude: user.latitude !== undefined && user.latitude !== null ? user.latitude : prev.latitude,
      longitude: user.longitude !== undefined && user.longitude !== null ? user.longitude : prev.longitude,
      location_is_confirmed: Boolean(user.latitude && user.longitude)
    }));
    addToast('Populated starting coordinates from your registered citizen address. You may adjust or confirm.', 'info');
  };

  // Handle LocationPicker change
  const handleLocationPickerChange = (loc) => {
    setFormData((prev) => ({
      ...prev,
      location_name: loc.location_name || prev.location_name,
      district: loc.district || prev.district,
      city: loc.city || prev.city,
      state: loc.state || prev.state,
      postal_code: loc.postal_code || prev.postal_code,
      latitude: loc.latitude !== undefined ? loc.latitude : prev.latitude,
      longitude: loc.longitude !== undefined ? loc.longitude : prev.longitude,
      location_is_confirmed: Boolean(loc.isConfirmed && loc.latitude !== null && loc.location_name)
    }));

    if (formErrors.location) {
      setFormErrors((prev) => ({ ...prev, location: null }));
    }
  };

  // Photo uploads handler with format & size validation
  const handleFileChange = (e, isClarification = false) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB per image
    const validPhotos = [];
    let errorMessage = null;

    files.forEach((file) => {
      if (!allowedTypes.includes(file.type)) {
        errorMessage = `Unsupported file format: "${file.name}". Only JPEG, PNG, and WebP images are permitted.`;
        return;
      }
      if (file.size > maxSizeBytes) {
        errorMessage = `File "${file.name}" exceeds the 5MB size limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`;
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const photoObj = {
          id: `PHOTO-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: reader.result
        };

        if (isClarification) {
          setClarificationPhotos((prev) => [...prev, photoObj]);
        } else {
          setFormData((prev) => ({
            ...prev,
            photos: [...prev.photos, photoObj]
          }));
        }
      };
      reader.readAsDataURL(file);
    });

    if (errorMessage) {
      addToast(errorMessage, 'danger');
    }

    // Reset file input value so same file can be re-selected if needed
    e.target.value = '';
  };

  const handleRemovePhoto = (photoId, isClarification = false) => {
    if (isClarification) {
      setClarificationPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } else {
      setFormData((prev) => ({
        ...prev,
        photos: prev.photos.filter((p) => p.id !== photoId)
      }));
    }
  };

  // Validate form fields
  const validateForm = () => {
    const errors = {};

    if (!formData.title || formData.title.trim().length < 5) {
      errors.title = 'Incident title is required (minimum 5 characters).';
    }

    if (!formData.category) {
      errors.category = 'Please select a valid incident category.';
    }

    if (!formData.description || formData.description.trim().length < 15) {
      errors.description = 'Please provide a detailed incident description (minimum 15 characters).';
    }

    if (!formData.severity) {
      errors.severity = 'Please select an observed severity level.';
    }

    if (!formData.incident_date) {
      errors.incident_date = 'Incident date of occurrence is required.';
    } else {
      const today = new Date().toISOString().split('T')[0];
      if (formData.incident_date > today) {
        errors.incident_date = 'Incident date cannot be in the future.';
      }
    }

    // Location validation: must have confirmed coordinates or valid manual location name
    if (formData.manual_location_mode) {
      if (!formData.location_name || formData.location_name.trim().length < 3) {
        errors.location = 'Please provide a descriptive location name or address.';
      }
    } else {
      if (!formData.location_name || formData.latitude === null || formData.longitude === null) {
        errors.location = 'Please select a location on the map and click "Confirm Location".';
      }
    }

    // Numerical validation for people affected
    if (formData.people_affected_count !== '' && formData.people_affected_count !== null) {
      const countNum = Number(formData.people_affected_count);
      if (isNaN(countNum) || countNum < 0) {
        errors.people_affected_count = 'Number of people affected cannot be negative.';
      }
    }

    if (!formData.accuracy_confirmed) {
      errors.accuracy_confirmed = 'You must confirm that the information provided is accurate.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // WebSocket: auto-refresh citizen reports list when authority updates a citizen's report
  useEffect(() => {
    if (!user) return;
    const unsubStatus = subscribe('INCIDENT_STATUS_UPDATED', (data) => {
      if (data && data.citizen_id === user.id) {
        loadReports();
        setSelectedReport((prev) => {
          if (!prev) return null;
          if (prev.id === data.report_identifier || prev.backend_id === data.report_id) {
            return { ...prev, status: data.status || prev.status };
          }
          return prev;
        });
      }
    });
    const unsubAssigned = subscribe('INCIDENT_ASSIGNED', (data) => {
      if (data && (!data.citizen_id || data.citizen_id === user.id)) {
        loadReports();
        setSelectedReport((prev) => {
          if (!prev) return null;
          if (prev.id === data.report_identifier || prev.backend_id === data.report_id) {
            return {
              ...prev,
              status: data.status || 'Action Initiated',
              assigned_department: data.department || prev.assigned_department
            };
          }
          return prev;
        });
      }
    });
    const unsubPublicUpdate = subscribe('INCIDENT_PUBLIC_UPDATE', (data) => {
      if (data && data.citizen_id === user.id) {
        loadReports();
      }
    });
    const unsubResolved = subscribe('INCIDENT_RESOLVED', (data) => {
      if (data && data.citizen_id === user.id) {
        loadReports();
        setSelectedReport((prev) => {
          if (!prev) return null;
          if (prev.id === data.report_identifier || prev.backend_id === data.report_id) {
            return {
              ...prev,
              status: 'Resolved',
              resolution_summary: data.resolution_summary || prev.resolution_summary,
              resolved_at: data.resolved_at || prev.resolved_at
            };
          }
          return prev;
        });
      }
    });
    return () => {
      if (unsubStatus) unsubStatus();
      if (unsubAssigned) unsubAssigned();
      if (unsubPublicUpdate) unsubPublicUpdate();
      if (unsubResolved) unsubResolved();
    };
  }, [user, subscribe, loadReports]);

  // Submit new incident report
  const handleSubmitReport = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      addToast('Please correct the highlighted validation errors before submitting.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const saved = await citizenIncidentService.submitReport(user.id, formData, user);

      // Optimistically prepend the newly-saved report to state before closing modal
      // This prevents the brief disappearance caused by loadReports() overwriting state
      setReports((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);

      setIsCreateModalOpen(false);
      setFormData(getInitialFormData());
      setFormErrors({});

      // Show success modal/toast with the confirmed backend report ID
      setSubmittedSuccessReport(saved);
      addToast(`Incident Report ${saved.id} submitted successfully!`, 'success');

      // Background refresh to sync any server-side computed fields
      loadReports();
    } catch (err) {
      console.error('Report submission failed:', err);
      // Do NOT reset formData or close modal on error — citizen can correct and retry
      addToast(err.message || 'Failed to submit incident report. Please try again.', 'danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clarification submission for an existing report
  const handleAddClarification = async (e) => {
    e.preventDefault();
    if (!clarificationText || !clarificationText.trim()) {
      addToast('Please enter clarification or updated observation notes.', 'warning');
      return;
    }

    setIsSubmittingClarification(true);
    try {
      const updated = await citizenIncidentService.addClarification(
        user.id,
        selectedReport.id,
        clarificationText,
        clarificationPhotos
      );
      setSelectedReport(updated);
      setClarificationText('');
      setClarificationPhotos([]);
      loadReports();
      addToast('Clarification details added to your incident report.', 'success');
    } catch (err) {
      console.error('Failed to submit clarification:', err);
      addToast(err.message || 'Failed to submit clarification.', 'danger');
    } finally {
      setIsSubmittingClarification(false);
    }
  };

  // Filtered reports
  const filteredReports = reports.filter((r) => {
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (categoryFilter !== 'All' && r.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (r.title || '').toLowerCase().includes(q);
      const matchId = (r.id || '').toLowerCase().includes(q);
      const matchLoc = (r.location_name || '').toLowerCase().includes(q);
      const matchDesc = (r.description || '').toLowerCase().includes(q);
      if (!matchTitle && !matchId && !matchLoc && !matchDesc) return false;
    }
    return true;
  });

  const getStatusBadgeVariant = (status) => {
    const s = REPORT_STATUSES.find((item) => item.id === status);
    return s ? s.variant : 'draft';
  };

  if (loading) {
    return <LoadingSpinner text="Loading your incident reports..." fullPage />;
  }

  return (
    <div className="reports-page citizen-incident-page">
      <BackButton fallbackPath="/citizen" label="Back to Citizen Portal" />

      {/* Page Header */}
      <div className="page-header-block" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title" style={{ color: 'var(--color-espresso-dark)' }}>My Incident Reports</h1>
            <p className="page-subtitle" style={{ maxWidth: '720px' }}>
              Report hazards, damage and unsafe conditions in your area, and track the action taken by disaster authorities.
            </p>
          </div>
          <button
            type="button"
            id="btn-report-new-incident"
            className="btn btn-primary"
            onClick={handleOpenCreateModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              fontSize: '0.96rem',
              fontWeight: 700,
              boxShadow: '0 4px 14px rgba(139, 58, 43, 0.28)'
            }}
          >
            <PlusCircle size={19} />
            <span>Report a New Incident</span>
          </button>
        </div>
      </div>

      {/* Emergency Assistance Distinction Banner (Requirement 5) */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #fff9f6 0%, #fff 100%)',
          border: '1px solid var(--color-terracotta-border)',
          borderRadius: '12px',
          padding: '1.15rem 1.4rem',
          marginBottom: '2rem',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '10px',
              background: 'var(--color-terracotta-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-terracotta)',
              flexShrink: 0
            }}
          >
            <LifeBuoy size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>
              Need Urgent Rescue, Medical Aid, or Evacuation?
            </h4>
            <div className="emergency-announcement-ticker" role="region" aria-label="Emergency information announcement">
              <div className="emergency-announcement-track">
                <div className="emergency-announcement-item">
                  <span>
                    <strong>Incident Reports</strong> help notify authorities about observed hazards, road blockages, fallen trees and public damage. If you or someone nearby is trapped, injured, or requires immediate rescue, food, or medical supplies, submit an{' '}
                    <Link to="/citizen" className="emergency-ticker-link">
                      Emergency Assistance Request
                    </Link>{' '}
                    from your Citizen Portal.
                  </span>
                  <span className="emergency-ticker-separator" aria-hidden="true">•</span>
                </div>
                <div className="emergency-announcement-item" aria-hidden="true">
                  <span>
                    <strong>Incident Reports</strong> help notify authorities about observed hazards, road blockages, fallen trees and public damage. If you or someone nearby is trapped, injured, or requires immediate rescue, food, or medical supplies, submit an{' '}
                    <Link to="/citizen" tabIndex={-1} className="emergency-ticker-link">
                      Emergency Assistance Request
                    </Link>{' '}
                    from your Citizen Portal.
                  </span>
                  <span className="emergency-ticker-separator" aria-hidden="true">•</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section: My Submitted Reports */}
      <div className="section-block">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>My Submitted Reports</span>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  background: 'var(--color-terracotta-light)',
                  color: 'var(--color-terracotta)',
                  padding: '2px 9px',
                  borderRadius: '12px',
                  border: '1px solid var(--color-terracotta-border)'
                }}
              >
                {reports.length}
              </span>
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Only incident reports filed from your authenticated account are displayed here.
            </p>
          </div>

          {/* Search & Filter Toolbar */}
          {reports.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', minWidth: '220px' }}>
                <Search
                  size={15}
                  color="var(--color-warm-brown)"
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
                <input
                  type="text"
                  placeholder="Search your reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: '6px 12px 6px 32px',
                    fontSize: '0.86rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    background: '#ffffff',
                    width: '100%'
                  }}
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.84rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-medium)',
                  background: '#ffffff',
                  color: 'var(--color-espresso-base)'
                }}
              >
                <option value="All">All Categories</option>
                {INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.84rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-medium)',
                  background: '#ffffff',
                  color: 'var(--color-espresso-base)'
                }}
              >
                <option value="All">All Statuses</option>
                {REPORT_STATUSES.map((st) => (
                  <option key={st.id} value={st.id}>{st.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Empty State (Requirement 1) */}
        {reports.length === 0 ? (
          <EmptyState
            icon={<FileText size={44} color="var(--color-terracotta)" />}
            title="You haven't submitted any incident reports yet"
            description="Report hazards, road blocks, fallen trees, or public safety issues to alert local disaster authorities."
            action={
              <button
                type="button"
                id="btn-report-first-incident"
                className="btn btn-primary"
                onClick={handleOpenCreateModal}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem' }}
              >
                <PlusCircle size={18} />
                <span>Report Your First Incident</span>
              </button>
            }
          />
        ) : filteredReports.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <Filter size={32} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem auto' }} />
            <h3 style={{ fontSize: '1.1rem', color: 'var(--color-espresso-dark)', margin: '0 0 6px 0' }}>No Matching Reports</h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
              No submitted incident reports match your current search and filter criteria.
            </p>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('All');
                setCategoryFilter('All');
              }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: '1.25rem'
            }}
          >
            {filteredReports.map((report) => {
              const sev = SEVERITY_LEVELS.find((s) => s.id === report.severity) || SEVERITY_LEVELS[1];
              const submittedDate = new Date(report.submitted_at || report.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              });
              const submittedTime = new Date(report.submitted_at || report.created_at).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={report.id}
                  className="card card-hover"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '1.25rem',
                    border: '1px solid var(--border-medium)',
                    background: '#ffffff',
                    position: 'relative'
                  }}
                >
                  {/* Top Bar: Status Badge + Report ID */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '6px' }}>
                    <Badge status={report.status} label={report.status} />
                    <span
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: 'var(--color-espresso-base)',
                        background: 'var(--bg-surface-subtle)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)'
                      }}
                    >
                      {report.id}
                    </span>
                  </div>

                  {/* Title & Category */}
                  <h3
                    style={{
                      fontSize: '1.08rem',
                      fontWeight: 700,
                      color: 'var(--color-espresso-dark)',
                      margin: '0 0 6px 0',
                      lineHeight: 1.35
                    }}
                  >
                    {report.title}
                  </h3>

                  <div style={{ marginBottom: '0.85rem' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: '#f1ebe2',
                        color: 'var(--color-warm-brown)'
                      }}
                    >
                      {report.category}
                    </span>
                  </div>

                  {/* Location Information */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '6px',
                      fontSize: '0.84rem',
                      color: 'var(--color-espresso-base)',
                      marginBottom: '0.65rem'
                    }}
                  >
                    <MapPin size={15} color="var(--color-terracotta)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span style={{ fontWeight: 600 }}>
                      {report.location_name || report.location_description || 'Location recorded'}
                      {report.district ? ` • ${report.district}` : ''}
                    </span>
                  </div>

                  {/* Citizen-Reported Severity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Observed Severity:
                    </span>
                    <span
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        background: sev.bg,
                        color: sev.color,
                        border: `1px solid ${sev.color}40`
                      }}
                    >
                      {report.severity}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      (Citizen observation)
                    </span>
                  </div>

                  {/* Photographs Indicator & Interactive View Link */}
                  {report.photos && report.photos.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.80rem',
                        color: 'var(--color-terracotta)',
                        fontWeight: 600,
                        marginBottom: '0.85rem',
                        flexWrap: 'wrap'
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <Camera size={14} />
                        <span>{report.photos.length} photograph{report.photos.length > 1 ? 's' : ''} attached</span>
                      </span>

                      <span style={{ color: 'var(--border-medium, #d5ccc2)', userSelect: 'none' }}>•</span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPhotoViewer(report, 0);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '3px 8px',
                          margin: 0,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          color: 'var(--color-terracotta)',
                          fontWeight: 700,
                          fontSize: '0.80rem',
                          textDecoration: 'underline',
                          textUnderlineOffset: '2px',
                          borderRadius: '4px',
                          transition: 'background-color 0.15s ease, color 0.15s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(194, 84, 56, 0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title={`View ${report.photos.length} attached photograph${report.photos.length > 1 ? 's' : ''}`}
                        aria-label={`View ${report.photos.length} attached photograph${report.photos.length > 1 ? 's' : ''} for report ${report.id}`}
                      >
                        <Eye size={14} />
                        <span>View</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        marginBottom: '0.85rem'
                      }}
                    >
                      <Camera size={13} style={{ opacity: 0.6 }} />
                      <span style={{ fontStyle: 'italic' }}>No photographs attached</span>
                    </div>
                  )}

                  {/* Five-Stage Incident Report Progress Tracker (Requirement) */}
                  <div style={{ width: '100%', margin: '0.35rem 0 0.85rem 0' }}>
                    <IncidentProgressTracker report={report} compact />
                  </div>

                  {/* Submission date info */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '0.78rem',
                      color: 'var(--text-muted)',
                      marginTop: 'auto',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid var(--border-light)',
                      marginBottom: '1rem'
                    }}
                  >
                    <Clock size={13} color="var(--color-terracotta)" />
                    <span>Submitted on {submittedDate} at {submittedTime}</span>
                  </div>

                  {/* View Details Button */}
                  <button
                    type="button"
                    className="btn btn-outline btn-block"
                    onClick={() => handleOpenReportDetails(report)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontWeight: 700,
                      fontSize: '0.88rem'
                    }}
                  >
                    <span>View Details</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          CREATE INCIDENT REPORT MODAL (Requirement 2 & 3)
          ========================================================================= */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        title="Report a New Incident"
        size="lg"
        contentClassName="citizen-incident-create-modal"
      >
        <form className="citizen-incident-create-form" onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Explanatory Banner */}
          <div
            style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-medium)',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px'
            }}
          >
            <Info size={18} color="var(--color-terracotta)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--color-warm-brown)', lineHeight: 1.45 }}>
              Provide accurate observations of observed hazards, damaged infrastructure, or unsafe conditions.
              Fields marked with an asterisk (<span className="required-star">*</span>) are mandatory.
            </p>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION A: Your Details
              ───────────────────────────────────────────────────────────────── */}
          <div
            className="citizen-incident-create-section"
            style={{
              background: '#ffffff',
              border: '1px solid var(--border-medium)',
              borderRadius: '10px',
              padding: '1.15rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
              <Shield size={17} color="var(--color-terracotta)" />
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>
                Section A: Your Details
              </h4>
            </div>

            <div className="citizen-incident-profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.82rem', marginBottom: 2 }}>
                  Verified Name
                </label>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: 'var(--color-espresso-dark)'
                  }}
                >
                  {user?.full_name || 'Authenticated Citizen'}
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.82rem', marginBottom: 2 }}>
                  Registered Email
                </label>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.88rem',
                    color: 'var(--color-warm-brown)'
                  }}
                >
                  {user?.email || 'N/A'}
                </div>
              </div>
            </div>

            <p style={{ margin: '8px 0 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              🔒 Privacy Protected: Your name and contact details are authenticated via CrisisBridge AI and never shown on public incident boards.
            </p>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION B: Incident Details
              ───────────────────────────────────────────────────────────────── */}
          <div
            className="citizen-incident-create-section"
            style={{
              background: '#ffffff',
              border: '1px solid var(--border-medium)',
              borderRadius: '10px',
              padding: '1.15rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
              <AlertTriangle size={17} color="var(--color-terracotta)" />
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>
                Section B: Incident Details
              </h4>
            </div>

            {/* Incident Title */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" htmlFor="input-incident-title">
                Incident Title <span className="required-star">*</span>
              </label>
              <input
                id="input-incident-title"
                type="text"
                className={`form-input${formErrors.title ? ' input-error' : ''}`}
                placeholder="e.g., Road blocked due to fallen tree"
                value={formData.title}
                onChange={(e) => {
                  setFormData({ ...formData, title: e.target.value });
                  if (formErrors.title) setFormErrors({ ...formErrors, title: null });
                }}
              />
              {formErrors.title && (
                <span className="field-error-text" style={{ color: 'var(--status-extreme)', fontSize: '0.78rem', display: 'block', marginTop: 3 }}>
                  {formErrors.title}
                </span>
              )}
            </div>

            {/* Category Dropdown (12 Exact Categories) */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" htmlFor="select-incident-category">
                What type of incident is this? <span className="required-star">*</span>
              </label>
              <select
                id="select-incident-category"
                className={`form-select${formErrors.category ? ' input-error' : ''}`}
                value={formData.category}
                onChange={(e) => {
                  setFormData({ ...formData, category: e.target.value });
                  if (formErrors.category) setFormErrors({ ...formErrors, category: null });
                }}
              >
                {INCIDENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {formErrors.category && (
                <span className="field-error-text" style={{ color: 'var(--status-extreme)', fontSize: '0.78rem', display: 'block', marginTop: 3 }}>
                  {formErrors.category}
                </span>
              )}
            </div>

            {/* Incident Description */}
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" htmlFor="textarea-incident-description">
                Describe What you saw <span className="required-star">*</span>
              </label>
              <textarea
                id="textarea-incident-description"
                rows={4}
                className={`form-textarea${formErrors.description ? ' input-error' : ''}`}
                placeholder="Describe what happened, what you observed, the affected area and any immediate danger to people."
                value={formData.description}
                onChange={(e) => {
                  setFormData({ ...formData, description: e.target.value });
                  if (formErrors.description) setFormErrors({ ...formErrors, description: null });
                }}
                style={{ width: '100%', resize: 'vertical' }}
              />
              {formErrors.description && (
                <span className="field-error-text" style={{ color: 'var(--status-extreme)', fontSize: '0.78rem', display: 'block', marginTop: 3 }}>
                  {formErrors.description}
                </span>
              )}
            </div>

            {/* Citizen-Reported Severity Selection */}
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ marginBottom: 4 }}>
                Observed Severity Level <span className="required-star">*</span>
              </label>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '8px'
                }}
              >
                {SEVERITY_LEVELS.map((sev) => {
                  const isSelected = formData.severity === sev.id;
                  return (
                    <div
                      key={sev.id}
                      onClick={() => setFormData({ ...formData, severity: sev.id })}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: isSelected ? `2px solid ${sev.color}` : '1px solid var(--border-medium)',
                        background: isSelected ? sev.bg : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        textAlign: 'center'
                      }}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={0}
                    >
                      <strong style={{ display: 'block', color: sev.color, fontSize: '0.92rem' }}>
                        {sev.label}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-warm-brown)', display: 'block', marginTop: 3 }}>
                        {sev.id === 'Low' && 'Minor hazard'}
                        {sev.id === 'Moderate' && 'Disruptive'}
                        {sev.id === 'High' && 'Significant risk'}
                        {sev.id === 'Critical' && 'Extreme danger'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {formErrors.severity && (
                <span className="field-error-text" style={{ color: 'var(--status-extreme)', fontSize: '0.78rem', display: 'block', marginTop: 3 }}>
                  {formErrors.severity}
                </span>
              )}
            </div>

            {/* Date & Time of Occurrence */}
            <div className="citizen-incident-date-time-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="input-incident-date">
                  When did it happen? <span className="required-star">*</span>
                </label>
                <input
                  id="input-incident-date"
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  className={`form-input${formErrors.incident_date ? ' input-error' : ''}`}
                  value={formData.incident_date}
                  onChange={(e) => {
                    setFormData({ ...formData, incident_date: e.target.value });
                    if (formErrors.incident_date) setFormErrors({ ...formErrors, incident_date: null });
                  }}
                />
                {formErrors.incident_date && (
                  <span className="field-error-text" style={{ color: 'var(--status-extreme)', fontSize: '0.78rem', display: 'block', marginTop: 3 }}>
                    {formErrors.incident_date}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="input-incident-time">
                  Approximate Time
                </label>
                <input
                  id="input-incident-time"
                  type="time"
                  className="form-input"
                  value={formData.incident_time}
                  onChange={(e) => setFormData({ ...formData, incident_time: e.target.value })}
                />
              </div>
            </div>

            {/* Still occurring & People at risk */}
            <div className="citizen-incident-status-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">
                  Is it happening now? <span className="required-star">*</span>
                </label>
                <div style={{ display: 'flex', gap: '10px', marginTop: 4 }}>
                  {['Yes', 'No', 'Not Sure'].map((opt) => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.86rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="is_still_occurring"
                        value={opt}
                        checked={formData.is_still_occurring === opt}
                        onChange={() => setFormData({ ...formData, is_still_occurring: opt })}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Are people currently affected or at risk? <span className="required-star">*</span>
                </label>
                <div style={{ display: 'flex', gap: '10px', marginTop: 4 }}>
                  {['Yes', 'No', 'Not Sure'].map((opt) => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.86rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="are_people_at_risk"
                        value={opt}
                        checked={formData.are_people_at_risk === opt}
                        onChange={() => setFormData({ ...formData, are_people_at_risk: opt })}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* People affected count & Additional observations */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '0.5rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="input-people-affected">
                  Approximate number of people affected (optional)
                </label>
                <input
                  id="input-people-affected"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g., 5"
                  className={`form-input${formErrors.people_affected_count ? ' input-error' : ''}`}
                  value={formData.people_affected_count}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || Number(val) >= 0) {
                      setFormData({ ...formData, people_affected_count: val });
                      if (formErrors.people_affected_count) setFormErrors({ ...formErrors, people_affected_count: null });
                    }
                  }}
                />
                {formErrors.people_affected_count && (
                  <span className="field-error-text" style={{ color: 'var(--status-extreme)', fontSize: '0.78rem', display: 'block', marginTop: 3 }}>
                    {formErrors.people_affected_count}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="textarea-additional-observations">
                  Additional Observations (optional)
                </label>
                <input
                  id="textarea-additional-observations"
                  type="text"
                  placeholder="e.g., Water rising rapidly, smells like gas"
                  className="form-input"
                  value={formData.additional_observations}
                  onChange={(e) => setFormData({ ...formData, additional_observations: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION C: Incident Location (Requirement 2.C)
              ───────────────────────────────────────────────────────────────── */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--border-medium)',
              borderRadius: '10px',
              padding: '1.15rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={17} color="var(--color-terracotta)" />
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>
                  Section C: Incident Location <span className="required-star">*</span>
                </h4>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {user?.location_name && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleUseRegisteredLocation}
                    style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                  >
                    📍 Use Registered Location as Start
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setFormData((prev) => ({ ...prev, manual_location_mode: !prev.manual_location_mode }))}
                  style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                >
                  {formData.manual_location_mode ? 'Switch to Map Selection' : 'Switch to Manual Input'}
                </button>
              </div>
            </div>

            {/* Map & Search Mode */}
            {!formData.manual_location_mode ? (
              <div style={{ marginBottom: '1rem' }}>
                <LocationPicker
                  value={{
                    location_name: formData.location_name,
                    district: formData.district,
                    city: formData.city,
                    state: formData.state,
                    postal_code: formData.postal_code,
                    latitude: formData.latitude,
                    longitude: formData.longitude,
                    isConfirmed: formData.location_is_confirmed
                  }}
                  onChange={handleLocationPickerChange}
                  required={true}
                  title="Search or Click to Place Incident Pin"
                />
              </div>
            ) : (
              /* Manual Input Fallback Mode */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="manual-location-name">
                    Location Name / Address <span className="required-star">*</span>
                  </label>
                  <input
                    id="manual-location-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g., MG Road Junction, Near City Hospital"
                    value={formData.location_name}
                    onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">District</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Central"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Maharashtra"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">PIN Code</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., 400001"
                      value={formData.postal_code}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Separate Landmark / Directions field (Required by Requirement 2.C) */}
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label className="form-label" htmlFor="input-location-landmarks">
                Landmarks or Directions
              </label>
              <input
                id="input-location-landmarks"
                type="text"
                className="form-input"
                placeholder="e.g., Near the main bridge, beside the government school, opposite bus stand"
                value={formData.location_description}
                onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginTop: 3 }}>
                Helps response teams easily identify the spot during severe weather or night operations.
              </span>
            </div>

            {formErrors.location && (
              <span className="field-error-text" style={{ color: 'var(--status-extreme)', fontSize: '0.78rem', display: 'block', marginTop: 6 }}>
                {formErrors.location}
              </span>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION D: Supporting Evidence (Requirement 2.D)
              ───────────────────────────────────────────────────────────────── */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--border-medium)',
              borderRadius: '10px',
              padding: '1.15rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
              <Camera size={17} color="var(--color-terracotta)" />
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>
                Section D: Supporting Evidence (Photographs)
              </h4>
            </div>

            <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Attach clear pictures of the observed hazard, flood level, or damage. Maximum 5MB per image. Permitted formats: JPG, PNG, WebP.
            </p>

            {/* File Upload Zone */}
            <div
              style={{
                border: '2px dashed var(--border-medium)',
                borderRadius: '8px',
                padding: '1.25rem',
                textAlign: 'center',
                background: 'var(--bg-surface-subtle)',
                marginBottom: '1rem'
              }}
            >
              <input
                id="incident-file-upload"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFileChange(e, false)}
                style={{ display: 'none' }}
              />
              <label
                htmlFor="incident-file-upload"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#ffffff',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--color-espresso-dark)',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <Upload size={16} color="var(--color-terracotta)" />
                <span>Select Photographs</span>
              </label>
              <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Drag and drop or browse files from your device
              </span>
            </div>

            {/* Selected Photo Thumbnails with preview & remove */}
            {formData.photos.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: '10px',
                  marginBottom: '0.5rem'
                }}
              >
                {formData.photos.map((photo) => (
                  <div
                    key={photo.id}
                    style={{
                      position: 'relative',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: '1px solid var(--border-medium)',
                      background: '#000000',
                      aspectRatio: '1 / 1'
                    }}
                  >
                    <img
                      src={photo.dataUrl}
                      alt={photo.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id, false)}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.7)',
                        border: 'none',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      title="Remove image"
                    >
                      <X size={13} />
                    </button>
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'rgba(0,0,0,0.65)',
                        color: '#ffffff',
                        fontSize: '0.66rem',
                        padding: '2px 4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {photo.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                lineHeight: 1.4,
                borderTop: '1px solid var(--border-light)',
                paddingTop: '0.5rem'
              }}
            >
              <em>Backend dependency note: Image evidence is stored securely with your local citizen report profile for review. The backend does not currently host an active binary upload endpoint.</em>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION E: Additional Information & Confirmation (Requirement 2.E)
              ───────────────────────────────────────────────────────────────── */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--border-medium)',
              borderRadius: '10px',
              padding: '1.15rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
              <HelpCircle size={17} color="var(--color-terracotta)" />
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>
                Section E: Additional Information & Safety Confirmation
              </h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">
                  Is immediate danger present? <span className="required-star">*</span>
                </label>
                <div style={{ display: 'flex', gap: '10px', marginTop: 4 }}>
                  {['Yes', 'No', 'Not Sure'].map((opt) => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.86rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="immediate_danger"
                        value={opt}
                        checked={formData.immediate_danger === opt}
                        onChange={() => setFormData({ ...formData, immediate_danger: opt })}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Is emergency assistance required? <span className="required-star">*</span>
                </label>
                <div style={{ display: 'flex', gap: '10px', marginTop: 4 }}>
                  {['No', 'Yes'].map((opt) => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.86rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="emergency_assistance_needed"
                        value={opt}
                        checked={formData.emergency_assistance_needed === opt}
                        onChange={() => setFormData({ ...formData, emergency_assistance_needed: opt })}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Warning if emergency assistance requested */}
            {formData.emergency_assistance_needed === 'Yes' && (
              <div
                style={{
                  background: 'var(--status-extreme-bg)',
                  border: '1px solid var(--status-extreme-border)',
                  borderRadius: '8px',
                  padding: '0.85rem 1rem',
                  marginBottom: '1rem'
                }}
              >
                <p style={{ margin: '0 0 6px 0', fontSize: '0.84rem', color: 'var(--status-extreme)', fontWeight: 700 }}>
                  🚨 Immediate Action Required:
                </p>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-espresso-dark)', lineHeight: 1.45 }}>
                  Submitting an incident report does <strong>NOT</strong> automatically dispatch an emergency rescue team.
                  If someone needs immediate evacuation or medical care, please submit an official{' '}
                  <Link to="/citizen" style={{ color: 'var(--status-extreme)', fontWeight: 700, textDecoration: 'underline' }}>
                    Emergency Assistance Request
                  </Link>{' '}
                  directly from the citizen dashboard.
                </p>
              </div>
            )}

            {/* Optional Alternate Contact */}
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" htmlFor="input-alternate-contact">
                Alternate Contact Phone (optional)
              </label>
              <input
                id="input-alternate-contact"
                type="text"
                placeholder="Only if different from your profile phone number"
                className="form-input"
                value={formData.additional_contact}
                onChange={(e) => setFormData({ ...formData, additional_contact: e.target.value })}
              />
            </div>

            {/* Accuracy Confirmation Checkbox (Requirement 2.E & 3) */}
            <div
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                padding: '0.85rem 1rem'
              }}
            >
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.accuracy_confirmed}
                  onChange={(e) => {
                    setFormData({ ...formData, accuracy_confirmed: e.target.checked });
                    if (formErrors.accuracy_confirmed) setFormErrors({ ...formErrors, accuracy_confirmed: null });
                  }}
                  style={{ marginTop: '3px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.86rem', color: 'var(--color-espresso-dark)', fontWeight: 600 }}>
                  I confirm that the information provided is accurate to the best of my knowledge. <span className="required-star">*</span>
                </span>
              </label>

              <p style={{ margin: '6px 0 0 24px', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Submitting an incident report informs disaster authorities about observed conditions for tracking and resource planning, but does not automatically dispatch personal rescue or medical assistance.
              </p>

              {formErrors.accuracy_confirmed && (
                <span className="field-error-text" style={{ color: 'var(--status-extreme)', fontSize: '0.78rem', display: 'block', marginTop: 4, marginLeft: 24 }}>
                  {formErrors.accuracy_confirmed}
                </span>
              )}
            </div>
          </div>

          {/* Form Action Buttons (Requirement 3) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border-light)'
            }}
          >
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleCloseCreateModal}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-submit-incident-report"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                minWidth: '180px',
                justifyContent: 'center'
              }}
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" inline />
                  <span>Submitting report...</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>Submit Incident Report</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          SUBMISSION SUCCESS CONFIRMATION MODAL (Requirement 3)
          ========================================================================= */}
      {submittedSuccessReport && (
        <Modal
          isOpen={Boolean(submittedSuccessReport)}
          onClose={() => setSubmittedSuccessReport(null)}
          title="Incident Report Submitted"
          size="md"
        >
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#15803d',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem'
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: '0 0 8px 0' }}>
              Report Successfully Logged
            </h3>

            <p style={{ fontSize: '0.88rem', color: 'var(--color-warm-brown)', margin: '0 0 1.25rem 0' }}>
              Your field observation has been recorded in the central disaster monitoring registry.
            </p>

            <div
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                padding: '1rem',
                textAlign: 'left',
                marginBottom: '1.5rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.86rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Incident Report ID:</span>
                <strong style={{ color: 'var(--color-espresso-dark)' }}>{submittedSuccessReport.id}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.86rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Submission Date:</span>
                <span>{new Date(submittedSuccessReport.submitted_at).toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Initial Status:</span>
                <Badge status={submittedSuccessReport.status} label={submittedSuccessReport.status} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setSubmittedSuccessReport(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSelectedReport(submittedSuccessReport);
                  setSubmittedSuccessReport(null);
                }}
              >
                View Full Details
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* =========================================================================
          REPORT DETAILS MODAL (Requirement 4)
          ========================================================================= */}
      {selectedReport && (
        <Modal
          isOpen={Boolean(selectedReport)}
          onClose={() => {
            setSelectedReport(null);
            setClarificationText('');
            setClarificationPhotos([]);
          }}
          title={`Incident Report ${selectedReport.id}`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header info bar: Current Status & Category */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                paddingBottom: '0.85rem',
                borderBottom: '1px solid var(--border-light)'
              }}
            >
              <div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Current Status</span>
                <Badge status={selectedReport.status} label={selectedReport.status} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Category</span>
                <strong style={{ fontSize: '0.88rem', color: 'var(--color-espresso-dark)' }}>{selectedReport.category}</strong>
              </div>
            </div>

            {/* Title & Description */}
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: '0 0 8px 0' }}>
                {selectedReport.title}
              </h3>
              <p
                style={{
                  fontSize: '0.92rem',
                  color: 'var(--color-espresso-base)',
                  lineHeight: 1.55,
                  background: 'var(--bg-surface-subtle)',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  margin: 0,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {selectedReport.description}
              </p>
            </div>

            {/* Severity Card with Field Observation Disclaimer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid var(--border-medium)',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                  Citizen-Reported Severity
                </span>
                <strong style={{ fontSize: '1.05rem', color: 'var(--color-terracotta)' }}>
                  {selectedReport.severity}
                </strong>
              </div>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', maxWidth: '380px', lineHeight: 1.35 }}>
                <em>Note: This is an initial field observation submitted by the citizen and is not an officially verified authority assessment.</em>
              </span>
            </div>

            {/* Key Field Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
              <div style={{ background: 'var(--bg-surface-subtle)', padding: '10px 12px', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Occurred On</span>
                <strong style={{ fontSize: '0.86rem', color: 'var(--color-espresso-dark)' }}>
                  {selectedReport.incident_date} {selectedReport.incident_time ? `at ${selectedReport.incident_time}` : ''}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-surface-subtle)', padding: '10px 12px', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Still Occurring?</span>
                <strong style={{ fontSize: '0.86rem', color: 'var(--color-espresso-dark)' }}>
                  {selectedReport.is_still_occurring || 'Not Sure'}
                </strong>
              </div>

              <div style={{ background: 'var(--bg-surface-subtle)', padding: '10px 12px', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>People At Risk?</span>
                <strong style={{ fontSize: '0.86rem', color: 'var(--color-espresso-dark)' }}>
                  {selectedReport.are_people_at_risk || 'Not Sure'}
                  {selectedReport.people_affected_count !== null && selectedReport.people_affected_count !== undefined
                    ? ` (~${selectedReport.people_affected_count} people)`
                    : ''}
                </strong>
              </div>
            </div>

            {/* Additional observations if any */}
            {selectedReport.additional_observations && (
              <div style={{ background: 'var(--bg-surface-subtle)', padding: '10px 12px', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Additional Observations</span>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.86rem', color: 'var(--color-espresso-base)' }}>
                  {selectedReport.additional_observations}
                </p>
              </div>
            )}

            {/* Location Details Block */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                padding: '1rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <MapPin size={16} color="var(--color-terracotta)" />
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>
                  Location Information
                </h4>
              </div>

              <div style={{ fontSize: '0.86rem', color: 'var(--color-espresso-base)', lineHeight: 1.5 }}>
                <div><strong>Location:</strong> {selectedReport.location_name || 'Recorded Spot'}</div>
                {selectedReport.location_description && (
                  <div><strong>Landmarks / Directions:</strong> {selectedReport.location_description}</div>
                )}
                {(selectedReport.district || selectedReport.state || selectedReport.postal_code) && (
                  <div>
                    <strong>Area Details:</strong> {[selectedReport.district, selectedReport.city, selectedReport.state, selectedReport.postal_code].filter(Boolean).join(', ')}
                  </div>
                )}
                {selectedReport.latitude && selectedReport.longitude && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Coordinates: {selectedReport.latitude.toFixed(5)}°, {selectedReport.longitude.toFixed(5)}°
                  </div>
                )}
              </div>
            </div>

            {/* Attached Photographs Gallery */}
            {selectedReport.photos && selectedReport.photos.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-espresso-dark)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Camera size={16} color="var(--color-terracotta)" />
                  <span>Submitted Photographic Evidence ({selectedReport.photos.length})</span>
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                  {selectedReport.photos.map((p, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleOpenPhotoViewer(selectedReport, idx)}
                      style={{
                        position: 'relative',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-medium)',
                        cursor: 'pointer',
                        aspectRatio: '4 / 3',
                        background: '#1a1a1a'
                      }}
                      title="Click to enlarge"
                    >
                      <img
                        src={p.dataUrl || p.url || p.file_url}
                        alt={p.name || 'Submitted Evidence'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0,
                          transition: 'opacity 0.15s ease'
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

            {/* Report Status History Timeline (Requirement 4) */}
            <div
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                padding: '1rem'
              }}
            >
              <h4 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>
                Report Status History
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(selectedReport.status_history || []).map((ev, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.84rem' }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--color-terracotta)',
                        marginTop: '6px',
                        flexShrink: 0
                      }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong>{ev.status}</strong>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {new Date(ev.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <span style={{ color: 'var(--color-warm-brown)', display: 'block', marginTop: 2 }}>
                        {ev.note}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Department Routing Status Note (Requirement 6) */}
              <div
                style={{
                  marginTop: '12px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border-light)',
                  fontSize: '0.76rem',
                  color: 'var(--text-muted)'
                }}
              >
                <strong>Routing Status:</strong> {selectedReport.routing_status || 'Logged in Central Disaster Monitoring Registry'}
              </div>
            </div>

            {/* Clarification Submission Section (Requirement 4) */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid var(--color-terracotta-border)',
                borderRadius: '8px',
                padding: '1rem'
              }}
            >
              <h4 style={{ margin: '0 0 6px 0', fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-espresso-dark)' }}>
                Submit Additional Information / Clarification
              </h4>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                If disaster authorities have requested clarification, or if the situation on the ground has changed, provide additional information below without creating a duplicate report.
              </p>

              <form onSubmit={handleAddClarification}>
                <textarea
                  rows={3}
                  className="form-textarea"
                  placeholder="Enter clarification details, observed changes, or answers to authority queries..."
                  value={clarificationText}
                  onChange={(e) => setClarificationText(e.target.value)}
                  style={{ width: '100%', marginBottom: '8px' }}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <input
                      id="clarification-photo-upload"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handleFileChange(e, true)}
                      style={{ display: 'none' }}
                    />
                    <label
                      htmlFor="clarification-photo-upload"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-medium)',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      <Camera size={14} color="var(--color-terracotta)" />
                      <span>Attach Photo ({clarificationPhotos.length})</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isSubmittingClarification || !clarificationText.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                  >
                    {isSubmittingClarification ? 'Submitting...' : 'Send Clarification'}
                  </button>
                </div>

                {clarificationPhotos.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {clarificationPhotos.map((p) => (
                      <span
                        key={p.id}
                        style={{
                          fontSize: '0.74rem',
                          background: 'var(--bg-surface-subtle)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-light)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        {p.name}
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(p.id, true)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          <X size={12} color="var(--color-terracotta)" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </form>
            </div>

            {/* Privacy Protection Note */}
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              🔒 <em>Privacy Protected: Internal authority notes and investigations are strictly restricted to official disaster command centers.</em>
            </div>
          </div>
        </Modal>
      )}

      {/* =========================================================================
          PHOTOGRAPH PREVIEW LIGHTBOX MODAL
          ========================================================================= */}
      {photoViewer.isOpen && photoViewer.photos.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photograph Preview Lightbox"
          onClick={handleClosePhotoViewer}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(18, 14, 11, 0.90)',
            backdropFilter: 'blur(6px)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            boxSizing: 'border-box',
            userSelect: 'none'
          }}
        >
          {/* Top Bar: Title, Report ID, Counter, and Close Button */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '1100px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '0.5rem 0',
              zIndex: 2
            }}
          >
            {/* Left: Report info & photo counter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(194, 84, 56, 0.25)',
                  border: '1px solid rgba(194, 84, 56, 0.45)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  color: '#ffffff',
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  letterSpacing: '0.02em'
                }}
              >
                <Camera size={14} color="#fca58e" />
                <span>{photoViewer.reportId || 'Incident Evidence'}</span>
              </div>

              {photoViewer.reportTitle && (
                <span
                  style={{
                    color: '#f0eae1',
                    fontSize: '0.90rem',
                    fontWeight: 600,
                    maxWidth: '400px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                  title={photoViewer.reportTitle}
                >
                  {photoViewer.reportTitle}
                </span>
              )}

              {/* Dynamic Image Counter Pill */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '20px',
                  padding: '3px 10px',
                  color: '#ffffff',
                  fontSize: '0.80rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>
                  {photoViewer.photos.length > 1
                    ? `${photoViewer.currentIndex + 1} of ${photoViewer.photos.length}`
                    : '1 of 1'}
                </span>
              </div>
            </div>

            {/* Right: Close button */}
            <button
              type="button"
              onClick={handleClosePhotoViewer}
              style={{
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, transform 0.15s ease',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-terracotta)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Close viewer (Esc)"
              aria-label="Close viewer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Center Stage: Previous Arrow + Photo Display + Next Arrow */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '1100px',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 0,
              padding: '0.5rem 0'
            }}
            onClick={handleClosePhotoViewer}
          >
            {/* Previous Photo Button (only if multiple photos) */}
            {photoViewer.photos.length > 1 && (
              <button
                type="button"
                onClick={handlePrevPhoto}
                style={{
                  position: 'absolute',
                  left: '10px',
                  zIndex: 10,
                  background: 'rgba(30, 25, 22, 0.78)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: '50%',
                  width: '46px',
                  height: '46px',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  transition: 'background-color 0.15s ease, transform 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-terracotta)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(30, 25, 22, 0.78)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Previous photograph (Left Arrow)"
                aria-label="Previous photograph"
              >
                <ChevronLeft size={24} />
              </button>
            )}

            {/* Central Photograph Container */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxWidth: '92%',
                maxHeight: '100%',
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              {/* Error State with Retry Button */}
              {photoViewer.hasError ? (
                <div
                  style={{
                    background: '#2a1a17',
                    border: '1px solid var(--color-terracotta)',
                    borderRadius: '8px',
                    padding: '2.5rem 2rem',
                    textAlign: 'center',
                    color: '#f0eae1',
                    maxWidth: '400px'
                  }}
                >
                  <AlertTriangle size={36} color="var(--color-terracotta)" style={{ marginBottom: '1rem' }} />
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 700 }}>
                    Unable to Load Photograph
                  </h4>
                  <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.84rem', color: '#c5bcb2', lineHeight: 1.5 }}>
                    The photograph evidence could not be retrieved from the server or local storage.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoViewer(prev => ({ ...prev, hasError: false, isLoading: true }));
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'var(--color-terracotta)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 18px',
                      fontWeight: 600,
                      fontSize: '0.86rem',
                      cursor: 'pointer'
                    }}
                  >
                    <RotateCcw size={15} />
                    <span>Retry Loading</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Loading Spinner */}
                  {photoViewer.isLoading && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1
                      }}
                    >
                      <LoadingSpinner size="large" />
                    </div>
                  )}

                  {/* Photograph Element */}
                  <img
                    key={`${photoViewer.reportId}-${photoViewer.currentIndex}`}
                    src={
                      photoViewer.photos[photoViewer.currentIndex]?.dataUrl ||
                      photoViewer.photos[photoViewer.currentIndex]?.url ||
                      photoViewer.photos[photoViewer.currentIndex]?.path
                    }
                    alt={
                      photoViewer.photos[photoViewer.currentIndex]?.name ||
                      `Incident photograph ${photoViewer.currentIndex + 1}`
                    }
                    onLoad={() => {
                      setPhotoViewer(prev => ({ ...prev, isLoading: false, hasError: false }));
                    }}
                    onError={() => {
                      setPhotoViewer(prev => ({ ...prev, isLoading: false, hasError: true }));
                    }}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '74vh',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      boxShadow: '0 12px 48px rgba(0,0,0,0.65)',
                      display: 'block',
                      opacity: photoViewer.isLoading ? 0.2 : 1,
                      transition: 'opacity 0.2s ease',
                      backgroundColor: '#000000'
                    }}
                  />
                </>
              )}
            </div>

            {/* Next Photo Button (only if multiple photos) */}
            {photoViewer.photos.length > 1 && (
              <button
                type="button"
                onClick={handleNextPhoto}
                style={{
                  position: 'absolute',
                  right: '10px',
                  zIndex: 10,
                  background: 'rgba(30, 25, 22, 0.78)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: '50%',
                  width: '46px',
                  height: '46px',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  transition: 'background-color 0.15s ease, transform 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-terracotta)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(30, 25, 22, 0.78)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Next photograph (Right Arrow)"
                aria-label="Next photograph"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>

          {/* Bottom Bar: Photo Details & Keyboard Hints */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '1100px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              padding: '0.4rem 0',
              zIndex: 2
            }}
          >
            {/* File info if available */}
            {photoViewer.photos[photoViewer.currentIndex]?.name && (
              <div
                style={{
                  fontSize: '0.80rem',
                  color: '#d5ccc2',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>{photoViewer.photos[photoViewer.currentIndex].name}</span>
                {photoViewer.photos[photoViewer.currentIndex].size && (
                  <>
                    <span>•</span>
                    <span>
                      {(photoViewer.photos[photoViewer.currentIndex].size / 1024).toFixed(1)} KB
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Thumbnail navigation dots/strip if multiple photos */}
            {photoViewer.photos.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '4px'
                }}
              >
                {photoViewer.photos.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPhotoViewer(prev => ({
                        ...prev,
                        currentIndex: idx,
                        hasError: false,
                        isLoading: true
                      }));
                    }}
                    style={{
                      width: idx === photoViewer.currentIndex ? '24px' : '8px',
                      height: '8px',
                      borderRadius: '4px',
                      background:
                        idx === photoViewer.currentIndex
                          ? 'var(--color-terracotta)'
                          : 'rgba(255, 255, 255, 0.3)',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    title={`Go to photograph ${idx + 1}`}
                    aria-label={`Go to photograph ${idx + 1}`}
                  />
                ))}
              </div>
            )}

            <div style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
              {photoViewer.photos.length > 1
                ? 'Use ← and → arrow keys to navigate • Esc or click outside to close'
                : 'Press Esc or click outside to close'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
