import React, { useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX } from '../../context/SidebarWidthContext';
import {
  Shield,
  Radio,
  MapPin,
  CheckCircle,
  FileText,
  Settings,
  PlusCircle,
  X,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

/** Minimum pixel width at which labels are shown (below = icon-only mode). */
const ICON_ONLY_THRESHOLD = 210;

export function Sidebar({ isOpen, onClose }) {
  const { user, logout, isAdmin, isCitizen } = useAuth();
  const { width, setWidth, collapsed, toggleCollapsed, effectiveWidth } = useSidebarWidth();
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const isActive = (path) => location.pathname === path;

  // Auto-close drawer on route change (mobile drawer)
  useEffect(() => {
    if (onClose) onClose();
  }, [location.pathname]);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close drawer on outside click (mobile/tablet overlay mode)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isOpen && sidebarRef.current && !sidebarRef.current.contains(e.target) && onClose) {
        const toggleBtn = document.querySelector('.sidebar-toggle-btn');
        if (!toggleBtn || !toggleBtn.contains(e.target)) {
          onClose();
        }
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleLogout = () => {
    if (onClose) onClose();
    logout();
    navigate('/login', { replace: true });
  };

  /* ─── Drag-to-resize logic ─────────────────────────────────────────── */
  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return;
    const delta = e.clientX - dragStartX.current;
    const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidth.current + delta));
    setWidth(newWidth);
  }, [setWidth]);

  const onPointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.classList.remove('is-resizing-sidebar');
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const onHandlePointerDown = useCallback((e) => {
    // Only on desktop (>=1024px) and not collapsed
    if (window.innerWidth < 1024 || collapsed) return;
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = width;
    document.body.classList.add('is-resizing-sidebar');
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }, [width, collapsed, onPointerMove, onPointerUp]);

  // Keyboard resizing on the handle (Arrow keys)
  const onHandleKeyDown = useCallback((e) => {
    if (collapsed) return;
    const STEP = 10;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setWidth(Math.min(SIDEBAR_MAX, width + STEP));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setWidth(Math.max(SIDEBAR_MIN, width - STEP));
    }
  }, [width, collapsed, setWidth]);

  // Role-Aware Navigation Links
  const getNavLinks = () => {
    if (!user) {
      return [
        { name: 'Citizen Portal',      path: '/citizen',       icon: <Radio size={18} /> },
        { name: 'Authority Dashboard', path: '/authority',     icon: <Shield size={18} /> },
        { name: 'Create Warning',      path: '/authority/warnings/create', icon: <PlusCircle size={18} /> },
        { name: 'Verify Information',  path: '/verification',  icon: <CheckCircle size={18} /> },
        { name: 'Emergency Resources', path: '/resources',     icon: <MapPin size={18} /> },
        { name: 'Incident Reports',    path: '/reports',       icon: <FileText size={18} /> },
      ];
    }
    if (user.role === 'citizen') {
      return [
        { name: 'Citizen Portal',      path: '/citizen',       icon: <Radio size={18} /> },
        { name: 'Verify Information',  path: '/verification',  icon: <CheckCircle size={18} /> },
        { name: 'Emergency Resources', path: '/resources',     icon: <MapPin size={18} /> },
        { name: 'Incident Reports',    path: '/reports',       icon: <FileText size={18} /> },
      ];
    }
    if (user.role === 'administrator') {
      return [
        { name: 'Authority Dashboard', path: '/authority',     icon: <Shield size={18} /> },
        { name: 'Create Warning',      path: '/authority/warnings/create', icon: <PlusCircle size={18} /> },
        { name: 'Admin Dashboard',     path: '/admin',         icon: <Settings size={18} /> },
        { name: 'Verify Information',  path: '/verification',  icon: <CheckCircle size={18} /> },
        { name: 'Emergency Resources', path: '/resources',     icon: <MapPin size={18} /> },
        { name: 'Incident Reports',    path: '/reports',       icon: <FileText size={18} /> },
      ];
    }
    // Default Authority
    return [
      { name: 'Authority Dashboard', path: '/authority',     icon: <Shield size={18} /> },
      { name: 'Create Warning',      path: '/authority/warnings/create', icon: <PlusCircle size={18} /> },
      { name: 'Verify Information',  path: '/verification',  icon: <CheckCircle size={18} /> },
      { name: 'Emergency Resources', path: '/resources',     icon: <MapPin size={18} /> },
      { name: 'Incident Reports',    path: '/reports',       icon: <FileText size={18} /> },
    ];
  };

  const navLinks = getNavLinks();

  return (
    <>
      {/* Backdrop for mobile drawer */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        id="app-sidebar"
        ref={sidebarRef}
        className={`app-sidebar${isOpen ? ' open' : ''}${collapsed ? ' sidebar-collapsed' : ''}`}
        aria-label="Main Navigation Sidebar"
        style={{ width: `${effectiveWidth}px` }}
      >
        {/* Region 1: Brand & Logo Region */}
        <div className="sidebar-header">
          <Link
            to={isCitizen ? '/citizen' : '/authority'}
            className="sidebar-brand"
            aria-label="CrisisBridge AI Homepage"
            title="CrisisBridge AI Homepage"
            onClick={onClose}
          >
            <div className="navbar-logo-icon" aria-hidden="true">
              <Shield size={20} color="#ffffff" />
            </div>
            {!collapsed && (
              <div className="sidebar-brand-text">
                <span className="sidebar-brand-title">CrisisBridge AI</span>
                <span className="brand-badge">Public Safety</span>
              </div>
            )}
          </Link>

          {/* Close button on mobile drawer */}
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close navigation sidebar"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Region 2: Middle Scrollable Navigation Region */}
        <div className="sidebar-nav-container">
          {!collapsed && (
            <div className="sidebar-section-title">
              {isCitizen ? 'Citizen Services' : isAdmin ? 'Command & Admin' : 'Authority Navigation'}
            </div>
          )}

          <nav className="sidebar-nav" aria-label="Role Navigation">
            {navLinks.map((link) => {
              const active = isActive(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`sidebar-nav-link${active ? ' active' : ''}${collapsed ? ' sidebar-nav-link--icon-only' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  aria-label={link.name}
                  title={collapsed ? link.name : undefined}
                  onClick={onClose}
                >
                  <span className="sidebar-link-icon" aria-hidden="true">
                    {link.icon}
                  </span>
                  {!collapsed && (
                    <span className="sidebar-link-text">{link.name}</span>
                  )}
                  {collapsed && (
                    <span className="sidebar-nav-tooltip" role="tooltip">
                      {link.name}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Region 3: User Profile & Sign Out Footer */}
        {user && (
          <div className="sidebar-footer">
            <div
              className="sidebar-user-card"
              title={`${user.full_name} (${user.role})`}
              aria-label={`Logged in as ${user.full_name}, ${user.role}`}
            >
              <div className="sidebar-user-avatar" aria-hidden="true">
                {isCitizen && user?.full_name ? (
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>
                    {user.full_name.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <User size={16} />
                )}
              </div>
              {!collapsed && (
                <div className="sidebar-user-details">
                  <span className="sidebar-user-name">{user.full_name}</span>
                  <span className="sidebar-user-role">{user.role}</span>
                </div>
              )}
              {collapsed && (
                <span className="sidebar-footer-tooltip" role="tooltip">
                  {user.full_name} ({user.role})
                </span>
              )}
            </div>

            {/* Sign Out button (visible in both expanded and collapsed modes) */}
            <button
              type="button"
              className="sidebar-signout-btn"
              onClick={handleLogout}
              aria-label={`Sign out ${user.full_name}`}
              title={collapsed ? `Sign out ${user.full_name}` : undefined}
            >
              <LogOut size={15} aria-hidden="true" />
              {!collapsed && <span>Sign Out</span>}
              {collapsed && (
                <span className="sidebar-footer-tooltip" role="tooltip">
                  Sign Out
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── Collapse / Expand Toggle Button ─────────────────────────────── */}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (window.innerWidth < 1024 && isOpen && onClose) {
              onClose();
            } else {
              toggleCollapsed();
            }
          }}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed
            ? <ChevronRight size={14} aria-hidden="true" />
            : <ChevronLeft size={14} aria-hidden="true" />
          }
        </button>

        {/* ── Drag-to-Resize Handle (desktop only, hidden when collapsed) ─── */}
        {!collapsed && (
          <div
            className="sidebar-resize-handle"
            role="separator"
            aria-label="Sidebar resize handle — drag left or right, or press Arrow keys to resize"
            aria-valuenow={width}
            aria-valuemin={SIDEBAR_MIN}
            aria-valuemax={SIDEBAR_MAX}
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={onHandlePointerDown}
            onKeyDown={onHandleKeyDown}
          >
            <span className="sidebar-resize-handle__grip" aria-hidden="true">
              <span className="srh-dot" />
              <span className="srh-dot" />
              <span className="srh-dot" />
            </span>
          </div>
        )}
      </aside>
    </>
  );
}

