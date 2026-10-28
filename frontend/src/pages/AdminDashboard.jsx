import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { BackButton } from '../components/common/BackButton';
import { Badge } from '../components/common/Badge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Settings, Users, Sliders, FileText, CheckCircle2, Shield } from 'lucide-react';

export function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const { addToast } = useNotification();

  const [activeTab, setActiveTab] = useState('thresholds');
  const [usersList, setUsersList] = useState([]);
  const [configs, setConfigs] = useState({
    COMMUNICATION_GAP_THRESHOLD: '40.0',
    UNDERSTANDING_GAP_THRESHOLD: '25.0',
    ASSISTANCE_SURGE_THRESHOLD: '5',
    INSUFFICIENT_DATA_THRESHOLD: '3'
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAdminData = useCallback(async () => {
    try {
      const [uList, cfgData, logs] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminConfigs(),
        api.getAuditLogs({ limit: 100 })
      ]);
      setUsersList(uList || []);
      if (cfgData) setConfigs(cfgData);
      setAuditLogs(logs || []);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleUpdateConfig = async (key, val) => {
    try {
      await api.updateAdminConfig(key, val);
      setConfigs((prev) => ({ ...prev, [key]: val }));
      addToast(`Updated threshold ${key} to ${val}`, 'success');
    } catch (err) {
      addToast(err.message || 'Config update failed.', 'danger');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.updateUserRole(userId, { role: newRole });
      addToast(`User role updated to '${newRole}'.`, 'success');
      loadAdminData();
    } catch (err) {
      addToast(err.message || 'Role change failed.', 'danger');
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading admin settings..." fullPage />;
  }

  return (
    <div className="admin-dashboard">
      <BackButton fallbackPath="/" label="Back to Home" />

      {/* Header */}
      <div className="page-header-block">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1 className="page-title">Admin Dashboard</h1>
          <Badge status="Administrator Access" />
        </div>
        <p className="page-subtitle">
          Configure operational alert thresholds, manage users, and view audit history
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'thresholds' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('thresholds')}
        >
          <Sliders size={16} />
          <span>Operational Thresholds</span>
        </button>

        <button
          type="button"
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} />
          <span>User Management</span>
        </button>

        <button
          type="button"
          className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('audit')}
        >
          <FileText size={16} />
          <span>Audit Logs</span>
        </button>
      </div>

      {/* TAB 1: Thresholds */}
      {activeTab === 'thresholds' && (
        <div className="card" style={{ maxWidth: 700 }}>
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>
            <Sliders size={18} color="#0284c7" />
            <span>Alert & Threshold Settings</span>
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>
            Adjust the percentage and count thresholds that trigger gap alerts.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Comm Gap */}
            <div className="form-group">
              <label className="form-label">Communication Gap Threshold (%)</label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="90"
                  className="form-input"
                  style={{ width: 140 }}
                  value={configs.COMMUNICATION_GAP_THRESHOLD}
                  onChange={(e) => setConfigs({ ...configs, COMMUNICATION_GAP_THRESHOLD: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => handleUpdateConfig('COMMUNICATION_GAP_THRESHOLD', configs.COMMUNICATION_GAP_THRESHOLD)}
                >
                  Save
                </button>
              </div>
              <span className="form-hint">Triggers when no-response rate in an active zone exceeds this percentage.</span>
            </div>

            {/* Understanding Gap */}
            <div className="form-group">
              <label className="form-label">Understanding Gap Threshold (%)</label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="90"
                  className="form-input"
                  style={{ width: 140 }}
                  value={configs.UNDERSTANDING_GAP_THRESHOLD}
                  onChange={(e) => setConfigs({ ...configs, UNDERSTANDING_GAP_THRESHOLD: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => handleUpdateConfig('UNDERSTANDING_GAP_THRESHOLD', configs.UNDERSTANDING_GAP_THRESHOLD)}
                >
                  Save
                </button>
              </div>
              <span className="form-hint">Triggers when 'I Don't Understand' responses exceed this percentage.</span>
            </div>

            {/* Assistance Surge */}
            <div className="form-group">
              <label className="form-label">Assistance Surge Threshold (Requests)</label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="50"
                  className="form-input"
                  style={{ width: 140 }}
                  value={configs.ASSISTANCE_SURGE_THRESHOLD}
                  onChange={(e) => setConfigs({ ...configs, ASSISTANCE_SURGE_THRESHOLD: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => handleUpdateConfig('ASSISTANCE_SURGE_THRESHOLD', configs.ASSISTANCE_SURGE_THRESHOLD)}
                >
                  Save
                </button>
              </div>
              <span className="form-hint">Flags zone as 'Assistance Surge' when pending help requests reach this count.</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Users */}
      {activeTab === 'users' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>
            <Users size={18} color="#0284c7" />
            <span>Registered Users</span>
          </h3>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Department / Jurisdiction</th>
                  <th>Current Role</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.full_name}</strong></td>
                    <td>{u.email}</td>
                    <td>{u.department ? `${u.department} (${u.jurisdiction || 'N/A'})` : 'Public Citizen'}</td>
                    <td><Badge status={u.role} /></td>
                    <td>
                      <select
                        className="form-select"
                        style={{ width: 'auto', padding: '3px 8px', fontSize: '0.82rem' }}
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      >
                        <option value="citizen">Citizen</option>
                        <option value="authority">Authority</option>
                        <option value="administrator">Administrator</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Audit Logs */}
      {activeTab === 'audit' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>
            <FileText size={18} color="#0284c7" />
            <span>System Audit Logs</span>
          </h3>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Event Type</th>
                  <th>Entity</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td>{log.user_email || 'System'}</td>
                    <td><Badge status={log.user_role || 'system'} /></td>
                    <td><code>{log.event_type}</code></td>
                    <td>{log.entity_type} #{log.entity_id}</td>
                    <td>{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
