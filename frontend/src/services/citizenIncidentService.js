/**
 * CrisisBridge AI — Citizen Incident Reporting Storage & Sync Service
 *
 * Provides persistent, authenticated-citizen-isolated storage for field incident
 * reports (hazards, road damage, infrastructure failure, fallen trees, etc.).
 *
 * Connects directly to backend API (/api/v1/incidents) while maintaining local caching
 * for offline resilience and privacy isolation between citizens.
 */

import { api } from './api';

const STORAGE_PREFIX = 'crisisbridge_citizen_incidents_';

export const INCIDENT_CATEGORIES = [
  'Flooding / Waterlogging',
  'Road or Bridge Damage',
  'Building Damage / Collapse',
  'Fire Incident',
  'Electrical Hazard',
  'Landslide / Soil Erosion',
  'Water Contamination',
  'Drainage or Sewage Problem',
  'Fallen Tree / Blocked Road',
  'Damaged Public Infrastructure',
  'Public Safety Hazard',
  'Other'
];

export const SEVERITY_LEVELS = [
  {
    id: 'Low',
    label: 'Low',
    badgeClass: 'badge-minor',
    color: '#0369a1',
    bg: '#e0f2fe',
    description: 'Minor localized hazard, no immediate danger to life or mobility'
  },
  {
    id: 'Moderate',
    label: 'Moderate',
    badgeClass: 'badge-moderate',
    color: '#b45309',
    bg: '#fef3c7',
    description: 'Disruptive condition, potential hazard to pedestrians or traffic'
  },
  {
    id: 'High',
    label: 'High',
    badgeClass: 'badge-severe',
    color: '#c2410c',
    bg: '#ffedd5',
    description: 'Significant hazard, property damage or elevated risk of injury'
  },
  {
    id: 'Critical',
    label: 'Critical',
    badgeClass: 'badge-extreme',
    color: '#b91c1c',
    bg: '#fee2e2',
    description: 'Extreme danger, structural collapse, or immediate threat to public safety'
  }
];

export const REPORT_STATUSES = [
  { id: 'Submitted', label: 'Submitted', variant: 'warning' },
  { id: 'Under Review', label: 'Under Review', variant: 'info' },
  { id: 'Clarification Requested', label: 'Clarification Requested', variant: 'gap' },
  { id: 'Verified', label: 'Verified', variant: 'stable' },
  { id: 'Assigned', label: 'Assigned', variant: 'info' },
  { id: 'Action in Progress', label: 'Action in Progress', variant: 'severe' },
  { id: 'Resolved', label: 'Resolved', variant: 'stable' },
  { id: 'Rejected', label: 'Rejected', variant: 'draft' },
  { id: 'Duplicate', label: 'Duplicate', variant: 'draft' }
];

function getStorageKey(userId) {
  if (!userId) return null;
  return `${STORAGE_PREFIX}${userId}`;
}

function normalizeBackendReport(bReport) {
  const events = bReport.events || [];
  const statusHistory = events.map(e => ({
    status: e.status || e.event_type,
    timestamp: e.timestamp,
    note: e.note,
    author: e.actor_role === 'authority' || e.actor_role === 'administrator' ? 'Disaster Authority' : 'Citizen'
  }));

  // Format routing status
  let routingStatus = 'Logged in Central Disaster Monitoring Registry';
  if (bReport.assigned_department) {
    routingStatus = `Assigned to ${bReport.assigned_department}`;
  }

  return {
    id: bReport.report_identifier || `IR-${bReport.id}`,
    backend_id: bReport.id,
    report_identifier: bReport.report_identifier || bReport.id,
    citizen_id: bReport.citizen_id,
    reporter_name: bReport.reporter_name,
    reporter_email: bReport.reporter_email || '',
    reporter_contact: bReport.reporter_contact || '',
    title: bReport.title,
    category: bReport.category,
    description: bReport.description,
    severity: bReport.severity,
    incident_date: bReport.incident_date,
    incident_time: bReport.incident_time || '',
    is_still_occurring: bReport.is_still_occurring || 'Not Sure',
    are_people_at_risk: bReport.are_people_at_risk || 'Not Sure',
    people_affected_count: bReport.people_affected_count,
    additional_observations: bReport.additional_observations || '',
    location_name: bReport.location_name || '',
    location_description: bReport.location_description || '',
    address: bReport.address || '',
    district: bReport.district || '',
    city: bReport.city || '',
    state: bReport.state || '',
    postal_code: bReport.postal_code || '',
    latitude: bReport.latitude,
    longitude: bReport.longitude,
    location_is_confirmed: bReport.location_is_confirmed,
    photos: bReport.photos || [],
    immediate_danger: bReport.immediate_danger,
    emergency_assistance_needed: bReport.emergency_assistance_needed,
    accuracy_confirmed: bReport.accuracy_confirmed,
    status: bReport.status,
    routing_status: routingStatus,
    assigned_department: bReport.assigned_department,
    verified_at: bReport.verified_at,
    verification_remarks: bReport.verification_remarks,
    assigned_at: bReport.assigned_at,
    assigned_team_notes: bReport.assigned_team_notes,
    rejection_reason: bReport.rejection_reason,
    duplicate_reason: bReport.duplicate_reason,
    resolution_summary: bReport.resolution_summary,
    resolved_at: bReport.resolved_at,
    submitted_at: bReport.created_at,
    created_at: bReport.created_at,
    updated_at: bReport.updated_at,
    events: bReport.events || [],
    status_history: statusHistory.length > 0 ? statusHistory : [
      {
        status: bReport.status,
        timestamp: bReport.created_at,
        note: 'Incident report logged in disaster registry.',
        author: 'Citizen'
      }
    ],
    clarifications: []
  };
}

export const citizenIncidentService = {
  /**
   * Retrieves all incident reports submitted by the given authenticated citizen from local cache.
   */
  getCitizenReports(userId) {
    if (!userId) return [];
    try {
      const key = getStorageKey(userId);
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.sort((a, b) => new Date(b.created_at || b.submitted_at) - new Date(a.created_at || a.submitted_at));
    } catch (err) {
      console.error('Failed to retrieve citizen incident reports from storage:', err);
      return [];
    }
  },

  /**
   * Fetches fresh reports from the backend and updates local storage.
   */
  async fetchCitizenReports(userId) {
    if (!userId) return [];
    try {
      const backendReports = await api.getMyIncidentReports();
      if (Array.isArray(backendReports)) {
        const normalized = backendReports.map(normalizeBackendReport);
        const key = getStorageKey(userId);
        try {
          localStorage.setItem(key, JSON.stringify(normalized));
        } catch (e) {
          console.warn('LocalStorage save failed:', e);
        }
        return normalized;
      }
    } catch (err) {
      console.warn('Backend fetch failed, falling back to local cache:', err);
    }
    return this.getCitizenReports(userId);
  },

  /**
   * Submits and persists a new incident report for the authenticated citizen.
   */
  async submitReport(userId, reportData, currentUser) {
    if (!userId) {
      throw new Error('Authentication required: Citizen ID is missing.');
    }

    // 1. Sanitize payload fields to match backend Pydantic schema precisely
    const sanitizedPayload = {
      title: (reportData.title || '').trim(),
      category: reportData.category || 'Other',
      description: (reportData.description || '').trim(),
      severity: reportData.severity || 'Moderate',
      incident_date: reportData.incident_date || new Date().toISOString().split('T')[0],
      incident_time: reportData.incident_time || '',
      is_still_occurring: reportData.is_still_occurring || 'Not Sure',
      are_people_at_risk: reportData.are_people_at_risk || 'Not Sure',
      people_affected_count: (reportData.people_affected_count !== '' && reportData.people_affected_count !== null && reportData.people_affected_count !== undefined)
        ? Math.max(0, parseInt(reportData.people_affected_count, 10) || 0)
        : null,
      additional_observations: (reportData.additional_observations || '').trim(),
      location_name: (reportData.location_name || '').trim(),
      location_description: (reportData.location_description || '').trim(),
      address: (reportData.address || '').trim(),
      district: (reportData.district || '').trim(),
      city: (reportData.city || '').trim(),
      state: (reportData.state || '').trim(),
      postal_code: (reportData.postal_code || '').trim(),
      latitude: (reportData.latitude !== '' && reportData.latitude !== null && reportData.latitude !== undefined)
        ? Number(reportData.latitude)
        : null,
      longitude: (reportData.longitude !== '' && reportData.longitude !== null && reportData.longitude !== undefined)
        ? Number(reportData.longitude)
        : null,
      location_is_confirmed: Boolean(reportData.location_is_confirmed),
      response_zone_id: (reportData.response_zone_id !== '' && reportData.response_zone_id !== null && reportData.response_zone_id !== undefined)
        ? parseInt(reportData.response_zone_id, 10)
        : null,
      response_zone_name: reportData.response_zone_name || null,
      photos: Array.isArray(reportData.photos) ? reportData.photos : [],
      immediate_danger: reportData.immediate_danger || 'Not Sure',
      emergency_assistance_needed: reportData.emergency_assistance_needed || 'No',
      accuracy_confirmed: Boolean(reportData.accuracy_confirmed),
      additional_contact: (reportData.additional_contact || '').trim()
    };

    // 2. Submit to backend API - do not swallow errors so UI can display genuine error and preserve inputs
    const backendResponse = await api.submitIncidentReport(sanitizedPayload);
    if (!backendResponse || !backendResponse.report_identifier) {
      throw new Error(backendResponse?.detail || 'Incident report submission failed. Please verify your inputs and try again.');
    }

    const createdReport = normalizeBackendReport(backendResponse);

    // 3. Update local cache for instant responsive citizen UI
    const key = getStorageKey(userId);
    const existingReports = this.getCitizenReports(userId);
    const updated = [createdReport, ...existingReports.filter(r => r.id !== createdReport.id && r.id !== createdReport.report_identifier)];
    try {
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (storageErr) {
      console.warn('LocalStorage cache update warning:', storageErr);
    }

    return createdReport;
  },

  /**
   * Appends clarification or additional evidence to an existing report.
   */
  async addClarification(userId, reportId, clarificationText, additionalPhotos = []) {
    if (!userId || !reportId) {
      throw new Error('Invalid clarification parameters.');
    }

    const key = getStorageKey(userId);
    const existingReports = this.getCitizenReports(userId);
    const reportIndex = existingReports.findIndex(r => r.id === reportId);

    // Call backend API
    try {
      const backendUpdated = await api.submitCitizenIncidentClarification(reportId, {
        clarification_text: clarificationText,
        photos: additionalPhotos
      });
      if (backendUpdated) {
        const normalized = normalizeBackendReport(backendUpdated);
        if (reportIndex !== -1) {
          existingReports[reportIndex] = normalized;
        } else {
          existingReports.unshift(normalized);
        }
        localStorage.setItem(key, JSON.stringify(existingReports));
        return normalized;
      }
    } catch (apiErr) {
      console.warn('Backend clarification API error, updating local record:', apiErr);
    }

    if (reportIndex === -1) {
      throw new Error('Target incident report not found.');
    }

    const report = { ...existingReports[reportIndex] };
    const nowIso = new Date().toISOString();

    const clarificationEntry = {
      id: `CLAR-${Date.now()}`,
      timestamp: nowIso,
      note: (clarificationText || '').trim(),
      photos: Array.isArray(additionalPhotos) ? additionalPhotos : []
    };

    report.clarifications = [...(report.clarifications || []), clarificationEntry];
    report.updated_at = nowIso;

    const historyItem = {
      status: report.status === 'Clarification Requested' ? 'Clarification Submitted' : report.status,
      timestamp: nowIso,
      note: `Citizen provided additional information: "${clarificationText.slice(0, 90)}${clarificationText.length > 90 ? '...' : ''}"`,
      author: 'Citizen'
    };
    report.status_history = [...(report.status_history || []), historyItem];

    if (report.status === 'Clarification Requested') {
      report.status = 'Under Review';
    }

    if (additionalPhotos.length > 0) {
      report.photos = [...(report.photos || []), ...additionalPhotos];
    }

    existingReports[reportIndex] = report;
    localStorage.setItem(key, JSON.stringify(existingReports));
    return report;
  }
};
