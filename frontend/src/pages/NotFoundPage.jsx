import React from 'react';
import { Link } from 'react-router-dom';
import { BackButton } from '../components/common/BackButton';
import { AlertCircle, Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div style={{ maxWidth: 500, margin: '4rem auto', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
        <AlertCircle size={36} />
      </div>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>404 - Page Not Found</h1>
      <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '1.75rem' }}>
        The requested emergency portal section or record does not exist or has been relocated.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <BackButton fallbackPath="/" label="Go Back" />
        <Link to="/" className="btn btn-primary">
          <Home size={16} />
          <span>Return Home</span>
        </Link>
      </div>
    </div>
  );
}
