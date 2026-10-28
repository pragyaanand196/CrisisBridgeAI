import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { BackButton } from '../components/common/BackButton';
import { LocationPicker } from '../components/common/LocationPicker';
import { Shield, UserPlus, Building, MapPin, Phone } from 'lucide-react';

export function RegisterPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'citizen',
    department: '',
    jurisdiction: '',
    phone_number: '',
    location_name: '',
    latitude: null,
    longitude: null,
    district: '',
    city: '',
    state: '',
    postal_code: '',
    location_accuracy_radius_m: 500.0,
    preferred_language: 'en'
  });
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { addToast } = useNotification();
  const navigate = useNavigate();

  const handleLocationChange = (loc) => {
    setFormData((prev) => ({
      ...prev,
      location_name: loc.location_name || '',
      latitude: loc.latitude,
      longitude: loc.longitude,
      district: loc.district || '',
      city: loc.city || '',
      state: loc.state || '',
      postal_code: loc.postal_code || prev.postal_code || '',
      location_accuracy_radius_m: loc.location_accuracy_radius_m || 500.0
    }));
    setLocationConfirmed(Boolean(loc.is_confirmed && loc.location_name && loc.latitude !== null));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.full_name) {
      addToast('Please fill in all mandatory fields.', 'warning');
      return;
    }

    if (formData.role === 'citizen') {
      if (!formData.location_name || formData.latitude === null || formData.longitude === null || !locationConfirmed) {
        addToast('Please select your location on the map and click "Confirm Location".', 'warning');
        return;
      }
    }

    setLoading(true);
    try {
      const user = await register(formData);
      addToast(`Account created successfully! Welcome, ${user.full_name}.`, 'success');
      if (user.role === 'authority' || user.role === 'administrator') {
        navigate('/authority', { replace: true });
      } else {
        navigate('/citizen', { replace: true });
      }
    } catch (err) {
      addToast(err.message || 'Registration failed. Please check your details.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div style={{ maxWidth: 660, width: '100%' }}>
        <BackButton fallbackPath="/login" label="Back to Sign In" />

        <div className="card" style={{ padding: '2.5rem 2.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'var(--gradient-primary)', color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 0 24px rgba(139, 58, 43, 0.45)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
              <UserPlus size={28} />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-espresso-dark)', margin: '0 0 0.5rem 0' }}>Create an Account</h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
              Register for CrisisBridge AI emergency alerts & public safety services
            </p>
          </div>

        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-full-name">
              Full Name <span className="required-star">*</span>
            </label>
            <input
              id="register-full-name"
              type="text"
              className="form-input"
              placeholder="e.g. Officer Rajesh Kumar / Priya Sharma"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
              autoComplete="name"
            />
          </div>

          {/* Email */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-email">
              Email Address <span className="required-star">*</span>
            </label>
            <input
              id="register-email"
              type="email"
              className="form-input"
              placeholder="name@agency.gov or personal email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-password">
              Password <span className="required-star">*</span>
            </label>
            <input
              id="register-password"
              type="password"
              className="form-input"
              placeholder="At least 6 characters"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {/* Role Selection */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-role">
              Account Role <span className="required-star">*</span>
            </label>
            <select
              id="register-role"
              className="form-select"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="citizen">Citizen</option>
              <option value="authority">Disaster Authority</option>
              <option value="administrator">Administrator</option>
            </select>
          </div>

          {/* Preferred Language Selection for Citizens */}
          {formData.role === 'citizen' && (
            <div className="form-group">
              <label className="form-label" htmlFor="register-language">
                Preferred Language <span className="required-star">*</span>
              </label>
              <select
                id="register-language"
                className="form-select"
                value={formData.preferred_language}
                onChange={(e) => setFormData({ ...formData, preferred_language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी (Hindi)</option>
              </select>
            </div>
          )}

          {/* Citizen Location Selection (Mandatory for Citizens) */}
          {formData.role === 'citizen' && (
            <LocationPicker
              value={{
                location_name: formData.location_name,
                latitude: formData.latitude,
                longitude: formData.longitude,
                district: formData.district,
                city: formData.city,
                state: formData.state,
                postal_code: formData.postal_code
              }}
              onChange={handleLocationChange}
              required={true}
              title="Your Location"
            />
          )}

          {/* Authority Metadata */}
          {formData.role === 'authority' && (
            <div className="authority-meta-box">
              <div className="form-group">
                <label className="form-label" htmlFor="register-department">
                  Department / Agency <span className="required-star">*</span>
                </label>
                <input
                  id="register-department"
                  type="text"
                  className="form-input"
                  placeholder="e.g. NDRF Sector Command / Municipal Disaster Ops"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  required={formData.role === 'authority'}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="register-jurisdiction">
                  Jurisdiction / District <span className="required-star">*</span>
                </label>
                <input
                  id="register-jurisdiction"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Riverside District & Coastal Lowlands"
                  value={formData.jurisdiction}
                  onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })}
                  required={formData.role === 'authority'}
                />
              </div>
            </div>
          )}

          {/* Phone Number */}
          <div className="form-group">
            <label className="form-label" htmlFor="register-phone">
              Phone Number (Optional)
            </label>
            <input
              id="register-phone"
              type="tel"
              className="form-input"
              placeholder="e.g. +91 98765 43210"
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              autoComplete="tel"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            style={{ marginTop: '1.25rem' }}
            disabled={loading}
          >
            <UserPlus size={18} />
            <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.88rem', color: '#94a3b8' }}>
          Already registered?{' '}
          <Link to="/login" style={{ fontWeight: 600, color: '#38bdf8' }}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  </div>
  );
}

