import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Shield, LogIn, Lock, Mail } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { addToast } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = location.state?.from;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      addToast('Please enter both email address and password.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      addToast(`Welcome back, ${user.full_name}!`, 'success');

      // If there was an attempted deep-link that matches the user's role, go there; otherwise role primary page
      if (redirectPath) {
        if (redirectPath.startsWith('/citizen') && user.role !== 'citizen') {
          navigate('/authority', { replace: true });
        } else if (redirectPath.startsWith('/authority') && user.role === 'citizen') {
          navigate('/citizen', { replace: true });
        } else {
          navigate(redirectPath, { replace: true });
        }
      } else {
        if (user.role === 'authority' || user.role === 'administrator') {
          navigate('/authority', { replace: true });
        } else {
          navigate('/citizen', { replace: true });
        }
      }
    } catch (err) {
      addToast(err.message || 'Login failed. Please check your credentials.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      {/* Full-screen blurred disaster response background photograph */}
      <div className="login-bg-media" aria-hidden="true" />
      {/* Subtle dark translucent warm overlay */}
      <div className="login-bg-overlay" aria-hidden="true" />

      {/* Balanced Two-Column Responsive Composition */}
      <div className="login-content-layout">
        {/* Left Column: Visual Promotional Content */}
        <div className="login-promo-section">
          <div className="login-promo-heading-wrapper">
            <div className="login-promo-accent-bar" aria-hidden="true" />
            <h1 className="login-promo-heading">
              <span className="promo-line-text">Turning Disaster</span>
              <span className="promo-line-text">Warnings into</span>
              <span className="promo-line-highlight">Community Action.</span>
            </h1>
          </div>

          {/* Decorative Horizontal Divider with Center Shield/Cyclone Icon */}
          <div className="login-promo-divider" aria-hidden="true">
            <span className="promo-divider-line" />
            <div className="promo-shield-icon-wrapper">
              <svg
                width="34"
                height="38"
                viewBox="0 0 34 38"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="promo-shield-svg"
              >
                {/* Shield Outline */}
                <path
                  d="M17 2.5L4 7.2V17.5C4 26 9.8 33.6 17 36C24.2 33.6 30 26 30 17.5V7.2L17 2.5Z"
                  stroke="#ffffff"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Cyclone / Vortex Emergency Swirl */}
                <path
                  d="M17 11.5C13.2 11.5 11 14.5 12.2 17.8C12.8 19.8 14.8 21.2 17 21.2C20.8 21.2 23 18.2 21.8 14.8C21.2 12.8 19.2 11.5 17 11.5ZM17 18.2C15.5 18.2 14.2 17 14.2 15.5C14.2 14 15.5 12.8 17 12.8C18.5 12.8 19.8 14 19.8 15.5C19.8 17 18.5 18.2 17 18.2Z"
                  fill="#ffffff"
                />
                <circle cx="17" cy="15.5" r="1.8" fill="#ffffff" />
                <path
                  d="M17 10C19.8 8.2 23.5 9.5 24.2 13"
                  stroke="#ffffff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M17 22.8C14.2 24.5 10.5 23.2 9.8 19.8"
                  stroke="#ffffff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="promo-divider-line" />
          </div>
        </div>

        {/* Right Column: Redesigned Login Card */}
        <div className="login-card-container">
          <div className="login-card">
            {/* Top Brand Header */}
            <div className="login-card-header">
              <div className="login-card-badge">
                <Shield size={24} strokeWidth={2.2} />
              </div>
              <h2 className="login-card-title">
                CrisisBridge <span className="brand-accent-ai">AI</span>
              </h2>
              <p className="login-card-subtitle">
                Sign in to access disaster warnings and emergency response systems
              </p>
            </div>

            {/* Authentication Form */}
            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-form-group">
                <label className="login-form-label" htmlFor="login-email">
                  Email Address <span className="required-star">*</span>
                </label>
                <div className="login-input-wrapper">
                  <Mail
                    size={18}
                    className="login-input-icon"
                  />
                  <input
                    id="login-email"
                    type="email"
                    className="login-form-input"
                    placeholder="name@agency.gov or personal email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="login-form-group login-form-group-password">
                <label className="login-form-label" htmlFor="login-password">
                  Password <span className="required-star">*</span>
                </label>
                <div className="login-input-wrapper">
                  <Lock
                    size={18}
                    className="login-input-icon"
                  />
                  <input
                    id="login-password"
                    type="password"
                    className="login-form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="login-submit-button"
                disabled={loading}
              >
                <LogIn size={18} strokeWidth={2.2} />
                <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
              </button>
            </form>

            {/* Soft Layered Wave Decoration at Bottom of Card */}
            <div className="login-card-wave-bg" aria-hidden="true">
              <svg
                viewBox="0 0 400 95"
                preserveAspectRatio="none"
                className="login-card-wave-svg"
              >
                <path
                  d="M0,40 C80,15 160,55 250,28 C320,12 370,35 400,25 L400,95 L0,95 Z"
                  fill="#f5e6e0"
                  fillOpacity="0.65"
                />
                <path
                  d="M0,52 C90,35 180,62 275,44 C335,32 375,48 400,42 L400,95 L0,95 Z"
                  fill="#fcf4f0"
                  fillOpacity="0.9"
                />
              </svg>
            </div>

            {/* Registration Footer */}
            <div className="login-card-footer">
              Don't have an account?{' '}
              <Link to="/register" className="login-create-account-link">
                Create Account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
