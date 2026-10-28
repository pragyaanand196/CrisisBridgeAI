import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useWebSocket } from '../../context/WebSocketContext';
import { useNotification } from '../../context/NotificationContext';
import {
  Bell,
  Check,
  CheckCheck,
  AlertTriangle,
  Users,
  MapPin,
  Clock,
  ExternalLink,
  ShieldAlert,
  X
} from 'lucide-react';

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  const containerRef = useRef(null);
  const navigate = useNavigate();
  const { subscribe } = useWebSocket();
  const { addToast } = useNotification();

  // Load notifications from server
  const loadNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [list, countData] = await Promise.all([
        api.getAuthorityNotifications({ limit: 40 }),
        api.getUnreadNotificationCount()
      ]);
      setNotifications(list || []);
      setUnreadCount(countData?.unread_count ?? (list || []).filter((n) => !n.is_read).length);
    } catch (err) {
      console.warn('Could not load authority notifications:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    loadNotifications(true);
  }, [loadNotifications]);

  // Subscribe to real-time events
  useEffect(() => {
    const unsubCreated = subscribe('AUTHORITY_NOTIFICATION_CREATED', (data) => {
      // Reload list and increment unread badge
      loadNotifications(false);
      addToast(`Emergency Alert: New assistance request from ${data.citizen_name || 'Citizen'} in ${data.location_description}`, 'warning', 7000);
    });

    const unsubReqCreated = subscribe('ASSISTANCE_REQUEST_CREATED', () => {
      loadNotifications(false);
    });

    const unsubStatus = subscribe('ASSISTANCE_STATUS_UPDATED', () => {
      loadNotifications(false);
    });

    const unsubAck = subscribe('ASSISTANCE_ACKNOWLEDGED', () => {
      loadNotifications(false);
    });

    const unsubDisp = subscribe('ASSISTANCE_DISPATCHED', () => {
      loadNotifications(false);
    });

    return () => {
      unsubCreated();
      unsubReqCreated();
      unsubStatus();
      unsubAck();
      unsubDisp();
    };
  }, [subscribe, loadNotifications, addToast]);

  // Outside click listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Escape key listener to close dropdown
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Toggle open
  const toggleDropdown = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      loadNotifications(false);
    }
  };

  // Mark single notification as read
  const handleMarkAsRead = async (e, notif) => {
    e.stopPropagation();
    if (notif.is_read || actionInProgress) return;
    setActionInProgress(true);
    try {
      await api.markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Failed to mark notification read:', err);
    } finally {
      setActionInProgress(false);
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0 || actionInProgress) return;
    setActionInProgress(true);
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
      addToast('All emergency notifications marked as read.', 'info', 4000);
    } catch (err) {
      console.warn('Failed to mark all notifications read:', err);
      addToast('Could not mark all notifications as read.', 'danger');
    } finally {
      setActionInProgress(false);
    }
  };

  // Clicking an item opens the dedicated request details interface
  const handleItemClick = async (notif) => {
    setIsOpen(false);
    if (!notif.is_read) {
      // Mark read in background
      api.markNotificationRead(notif.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    navigate(`/authority/assistance/${notif.assistance_request_id}`);
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return 'Just now';
    try {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diff < 60) return `${Math.max(1, diff)}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return `${Math.floor(diff / 86400)}d ago`;
    } catch {
      return 'Recent';
    }
  };

  return (
    <div className="notification-bell-container" ref={containerRef} style={{ position: 'relative' }}>
      {/* Bell Icon Button */}
      <button
        type="button"
        className={`btn-notification-bell ${isOpen ? 'active' : ''}`}
        onClick={toggleDropdown}
        aria-label={`Emergency Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={unreadCount > 0 ? `${unreadCount} unread emergency assistance request(s)` : 'Emergency Notifications'}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          /* Light-header default: warm terracotta tint bg, warm border, dark espresso icon */
          background: isOpen
            ? 'rgba(139, 58, 43, 0.15)'
            : 'rgba(139, 58, 43, 0.08)',
          border: isOpen
            ? '1px solid var(--color-terracotta, #8b3a2b)'
            : '1px solid var(--color-terracotta-border, #ead5cb)',
          /* Icon: amber when unread (AA on tint), terracotta when read — both visible on cream */
          color: unreadCount > 0 ? '#b45309' : 'var(--color-terracotta, #8b3a2b)',
          cursor: 'pointer',
          transition: 'all 0.18s ease',
          boxShadow: unreadCount > 0
            ? '0 0 12px rgba(180, 83, 9, 0.25)'
            : '0 1px 3px rgba(44, 26, 20, 0.08)'
        }}
      >
        <Bell size={18} strokeWidth={2} />
        {unreadCount > 0 && (
          <span
            className="notification-badge-pill"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              minWidth: '18px',
              height: '18px',
              padding: '0 4px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, var(--color-terracotta, #8b3a2b) 0%, #a84232 100%)',
              color: '#ffffff',
              fontSize: '0.65rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(139, 58, 43, 0.45)',
              border: '1.5px solid #ffffff'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="notification-dropdown-panel"
          role="region"
          aria-label="Recent Emergency Notifications"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 'min(400px, calc(100vw - 2rem))',
            maxHeight: '520px',
            background: '#ffffff',
            border: '1px solid var(--border-medium, #e2d8cb)',
            borderRadius: '12px',
            boxShadow: '0 20px 45px rgba(34, 18, 12, 0.2), 0 4px 12px rgba(34, 18, 12, 0.08)',
            zIndex: 1200,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.85rem 1rem',
              borderBottom: '1px solid var(--border-subtle, #ede5da)',
              background: 'var(--bg-surface-subtle, #f6f2ec)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'rgba(139, 58, 43, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-terracotta, #8b3a2b)'
                }}
              >
                <ShieldAlert size={16} />
              </div>
              <div>
                <strong style={{ fontSize: '0.92rem', color: 'var(--color-espresso-dark, #22120c)', display: 'block', lineHeight: 1.2 }}>
                  Emergency Requests
                </strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #6b5a52)' }}>
                  {unreadCount} unread alert{unreadCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleMarkAllAsRead}
                  disabled={actionInProgress}
                  title="Mark all notifications as read"
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--color-terracotta, #8b3a2b)',
                    borderColor: 'rgba(139, 58, 43, 0.35)',
                    background: 'rgba(139, 58, 43, 0.08)'
                  }}
                >
                  <CheckCheck size={13} />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close notification panel"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary, #6b5a52)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Body: Notifications List */}
          <div
            style={{
              overflowY: 'auto',
              maxHeight: '360px',
              padding: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem'
            }}
          >
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary, #6b5a52)', fontSize: '0.85rem' }}>
                Loading emergency alerts...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                <Bell size={28} color="var(--text-muted, #9e8e84)" style={{ marginBottom: '8px', opacity: 0.6 }} />
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-espresso-dark, #22120c)' }}>
                  No notifications yet
                </p>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary, #6b5a52)', display: 'block', marginTop: '4px' }}>
                  When citizens submit emergency assistance requests in your area, real-time alerts will appear here.
                </span>
              </div>
            ) : (
              notifications.map((notif) => {
                const isUnread = !notif.is_read;
                const urgencyColor =
                  notif.urgency === 'Critical' ? '#dc2626' : notif.urgency === 'High' ? '#d97706' : '#2563eb';

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleItemClick(notif)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleItemClick(notif);
                      }
                    }}
                    style={{
                      background: isUnread ? 'rgba(139, 58, 43, 0.05)' : '#ffffff',
                      border: isUnread ? '1px solid rgba(139, 58, 43, 0.28)' : '1px solid var(--border-subtle, #ede5da)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isUnread
                        ? 'rgba(139, 58, 43, 0.1)'
                        : 'var(--bg-surface-subtle, #f6f2ec)';
                      e.currentTarget.style.borderColor = 'var(--color-terracotta, #8b3a2b)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isUnread
                        ? 'rgba(139, 58, 43, 0.05)'
                        : '#ffffff';
                      e.currentTarget.style.borderColor = isUnread
                        ? 'rgba(139, 58, 43, 0.28)'
                        : 'var(--border-subtle, #ede5da)';
                    }}
                  >
                    {/* Top Row: Unread Dot + Category Badge + Urgency + Time */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {isUnread && (
                          <span
                            style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              background: 'var(--color-terracotta, #8b3a2b)',
                              boxShadow: '0 0 6px rgba(139, 58, 43, 0.5)',
                              display: 'inline-block',
                              flexShrink: 0
                            }}
                            title="Unread notification"
                          />
                        )}
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.68rem',
                            padding: '2px 6px',
                            background: 'rgba(139, 58, 43, 0.1)',
                            color: 'var(--color-terracotta, #8b3a2b)',
                            border: '1px solid rgba(139, 58, 43, 0.22)',
                            textTransform: 'capitalize'
                          }}
                        >
                          {notif.category?.replace('_', ' ') || 'Assistance'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: urgencyColor,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <AlertTriangle size={11} />
                          <span>{notif.urgency}</span>
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #6b5a52)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={11} />
                          {formatTimeAgo(notif.created_at)}
                        </span>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsRead(e, notif)}
                            title="Mark as read"
                            aria-label="Mark notification as read"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted, #9e8e84)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              borderRadius: '4px'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-terracotta, #8b3a2b)')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #9e8e84)')}
                          >
                            <Check size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Middle: Title & Message */}
                    <div style={{ fontSize: '0.84rem', color: 'var(--color-espresso-dark, #22120c)', fontWeight: 600 }}>
                      {notif.title}
                    </div>

                    {/* Location & Requester Info */}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #6b5a52)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <MapPin size={12} color="var(--color-terracotta, #8b3a2b)" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {notif.location_description}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted, #9e8e84)', fontSize: '0.74rem' }}>
                        <Users size={12} color="var(--text-muted, #9e8e84)" style={{ flexShrink: 0 }} />
                        <span>
                          {notif.citizen_name || 'Citizen'} • {notif.headcount} {notif.headcount === 1 ? 'person' : 'people'}
                        </span>
                        {notif.assistance_request_status && (
                          <span
                            style={{
                              marginLeft: 'auto',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color:
                                notif.assistance_request_status === 'Resolved'
                                  ? '#15803d'
                                  : notif.assistance_request_status === 'Dispatched'
                                  ? '#1d4ed8'
                                  : '#b45309'
                            }}
                          >
                            {notif.assistance_request_status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '0.65rem 1rem',
              borderTop: '1px solid var(--border-subtle, #ede5da)',
              background: 'var(--bg-surface-subtle, #f6f2ec)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setIsOpen(false);
                navigate('/authority');
              }}
              style={{
                fontSize: '0.78rem',
                color: 'var(--color-terracotta, #8b3a2b)',
                fontWeight: 600,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0
              }}
            >
              <span>View all in Authority Dashboard</span>
              <ExternalLink size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
