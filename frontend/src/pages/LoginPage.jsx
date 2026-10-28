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
    <div className="auth-container">
      <div className="card" style={{ maxWidth: 460, width: '100%', padding: '2.5rem 2.25rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'var(--gradient-primary)', color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 0 24px rgba(139, 58, 43, 0.45)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
            <Shield size={30} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: '0 0 0.5rem 0' }}>CrisisBridge AI</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            Sign in to access disaster warnings and emergency response systems
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" htmlFor="login-email">
              Email Address <span className="required-star">*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="name@agency.gov or personal email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" htmlFor="login-password">
              Password <span className="required-star">*</span>
            </label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={loading}
          >
            <LogIn size={18} />
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          </button>
        </form>

        <div style={{ marginTop: '1.75rem', textAlign: 'center', fontSize: '0.88rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ fontWeight: 600, color: 'var(--color-terracotta)', textDecoration: 'none' }}>
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
