import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, Menu, User, LogOut, LogIn } from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';

export function TopHeader({ onOpenSidebar, isSidebarOpen }) {
  const { user, logout, isAuthority, isAdmin, isCitizen } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="top-header" role="banner">
      <div className="top-header-container">
        {/* Left: Mobile Sidebar Toggle & Compact Branding */}
        <div className="top-header-left">
          {/* Mobile Sidebar Hamburger Toggle */}
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={onOpenSidebar}
            aria-expanded={isSidebarOpen}
            aria-controls="app-sidebar"
            aria-label={isSidebarOpen ? 'Close navigation sidebar' : 'Open navigation sidebar'}
          >
            <Menu size={20} aria-hidden="true" />
          </button>

          {/* Compact Mobile Brand (visible when desktop sidebar is off-canvas) */}
          <Link
            to={isCitizen ? '/citizen' : '/authority'}
            className="top-header-mobile-brand"
            aria-label="CrisisBridge AI Homepage"
          >
            <div className="navbar-logo-icon" style={{ width: 28, height: 28 }} aria-hidden="true">
              <Shield size={16} color="#ffffff" />
            </div>
            <span className="navbar-brand-title" style={{ fontSize: '0.92rem' }}>
              CrisisBridge AI
            </span>
          </Link>
        </div>

        {/* Right: Notification Dropdown, User Info & Logout Button */}
        <div className="top-header-actions">
          {user && (isAuthority || isAdmin) && (
            <NotificationDropdown />
          )}

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <span className="navbar-user-info" title={`${user.full_name} (${user.role})`}>
                <User size={15} aria-hidden="true" />
                <span className="user-name-text"><strong>{user.full_name}</strong></span>
                <span className="user-role-pill">[{user.role?.toUpperCase()}]</span>
              </span>

              <button
                type="button"
                className="btn-nav-logout"
                onClick={handleLogout}
                aria-label="Logout of account"
              >
                <LogOut size={14} aria-hidden="true" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Link to="/login" className="btn-nav-login" aria-label="Login">
                <LogIn size={15} aria-hidden="true" />
                <span>Login</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// Re-export as Navbar for compatibility
export { TopHeader as Navbar };
