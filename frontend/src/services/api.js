const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export const getSessionToken = () => {
  return sessionStorage.getItem('crisisbridge_token');
};

export const setSessionToken = (token) => {
  if (token) {
    sessionStorage.setItem('crisisbridge_token', token);
  } else {
    sessionStorage.removeItem('crisisbridge_token');
  }
};

export const clearSessionToken = () => {
  sessionStorage.removeItem('crisisbridge_token');
};

async function request(endpoint, options = {}) {
  const token = getSessionToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 204) {
      return null;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.detail || `HTTP Error ${response.status}: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (error) {
    console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, error);
    throw error;
  }
}

export const api = {
  // Auth
  register: (userData) => request('/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
  login: (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  getProfile: () => request('/auth/me'),
  updateCitizenLocation: (locData) => request('/auth/profile/location', { method: 'PUT', body: JSON.stringify(locData) }),
  updateCitizenLanguage: (langData) => request('/auth/profile/language', { method: 'PUT', body: JSON.stringify(langData) }),

  // Warnings
  getWarnings: (status) => request(`/warnings${status ? `?status_filter=${status}` : ''}`),
  getWarningDetail: (id) => request(`/warnings/${id}`),
  previewTargeting: (previewData) => request('/warnings/preview-targeting', { method: 'POST', body: JSON.stringify(previewData) }),
  createWarning: (warningData) => request('/warnings', { method: 'POST', body: JSON.stringify(warningData) }),
  generateAIMessage: (id) => request(`/warnings/${id}/generate-ai`, { method: 'POST' }),
  approveAIMessage: (id, actionData) => request(`/warnings/${id}/approve-ai`, { method: 'POST', body: JSON.stringify(actionData) }),
  distributeWarning: (id) => request(`/warnings/${id}/distribute`, { method: 'POST' }),
  versionWarning: (id, updateData) => request(`/warnings/${id}/version`, { method: 'POST', body: JSON.stringify(updateData) }),
  cancelWarning: (id, reasonData) => request(`/warnings/${id}/cancel`, { method: 'POST', body: JSON.stringify(reasonData) }),
  getWarningTargetingAnalytics: (id) => request(`/warnings/${id}/targeting-analytics`),

  // Zones
  getZones: (warningId) => request(`/zones${warningId ? `?warning_id=${warningId}` : ''}`),
  getZoneDetail: (id) => request(`/zones/${id}`),
  createZone: (zoneData) => request('/zones', { method: 'POST', body: JSON.stringify(zoneData) }),

  // Citizen
  getCitizenActiveWarnings: () => request('/citizen/active-warnings'),
  getSimplifiedInstruction: (warningId, language = 'en') => request(`/citizen/instructions/${warningId}?language=${language}`),
  submitCitizenResponse: (responseData) => request('/citizen/respond', { method: 'POST', body: JSON.stringify(responseData) }),


  // Assistance
  requestAssistance: (assistanceData) => request('/assistance', { method: 'POST', body: JSON.stringify(assistanceData) }),
  getMyAssistanceRequests: () => request('/assistance/my-requests'),
  getAssistanceRequests: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/assistance${query ? `?${query}` : ''}`);
  },
  getAssistanceRequestDetail: (id) => request(`/assistance/${id}`),
  acknowledgeAssistance: (id) => request(`/assistance/${id}/acknowledge`, { method: 'POST' }),
  dispatchAssistance: (id, dispatchData = {}) => request(`/assistance/${id}/dispatch`, { method: 'POST', body: JSON.stringify(dispatchData) }),
  verifyAssistanceArrival: (id, verifyData) => request(`/assistance/${id}/verify-arrival`, { method: 'POST', body: JSON.stringify(verifyData) }),
  resolveAssistance: (id, resolveData = {}) => request(`/assistance/${id}/resolve`, { method: 'POST', body: JSON.stringify(resolveData) }),
  updateAssistanceStatus: (id, updateData) => request(`/assistance/${id}/status`, { method: 'PATCH', body: JSON.stringify(updateData) }),

  // Authority Notifications
  getAuthorityNotifications: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/notifications${query ? `?${query}` : ''}`);
  },
  getUnreadNotificationCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/mark-all-read', { method: 'POST' }),

  // Verification & Clarifications
  getVerificationReports: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/verification/reports${query ? `?${query}` : ''}`);
  },
  submitVerificationReport: (reportData) => request('/verification/reports', { method: 'POST', body: JSON.stringify(reportData) }),
  reviewVerificationReport: (id, reviewData) => request(`/verification/reports/${id}/review`, { method: 'POST', body: JSON.stringify(reviewData) }),
  publishClarification: (clarificationData) => request('/verification/publish-clarification', { method: 'POST', body: JSON.stringify(clarificationData) }),
  getReportRagAnalysis: (id) => request(`/verification/reports/${id}/rag-analysis`),

  // Resources
  getResources: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/resources${query ? `?${query}` : ''}`);
  },
  getEligibleResponseZones: () => request('/resources/eligible-zones'),
  getCitizenResources: () => request('/citizen/resources'),
  createResource: (resData) => request('/resources', { method: 'POST', body: JSON.stringify(resData) }),
  updateResource: (id, resData) => request(`/resources/${id}`, { method: 'PUT', body: JSON.stringify(resData) }),
  deleteResource: (id) => request(`/resources/${id}`, { method: 'DELETE' }),

  // Analytics
  getZoneHealthMatrix: (warningId) => request(`/analytics/zone-health-matrix${warningId ? `?warning_id=${warningId}` : ''}`),
  getSystemOverview: () => request('/analytics/overview'),

  // Reports
  getReportsList: () => request('/reports'),
  getPostDisasterReport: (warningId) => request(`/reports/${warningId}`),

  // Admin
  getAdminUsers: (role) => request(`/admin/users${role ? `?role_filter=${role}` : ''}`),
  updateUserRole: (id, roleData) => request(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify(roleData) }),
  getAdminConfigs: () => request('/admin/configs'),
  updateAdminConfig: (key, value) => request(`/admin/configs?key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`, { method: 'PUT' }),
  getAuditLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/admin/audit-logs${query ? `?${query}` : ''}`);
  }
};
