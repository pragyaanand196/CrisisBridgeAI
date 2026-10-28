import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, Lock, Radio, FileText, CheckCircle } from 'lucide-react';

export function Footer() {
  const { user, isAuthority, isCitizen } = useAuth();

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-brand">
          <h4>
            <Shield size={20} color="#0284c7" />
            <span>CrisisBridge AI</span>
          </h4>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.6, maxWidth: '320px' }}>
            Disaster warning delivery and citizen response verification platform for emergency authorities and local communities.
          </p>
        </div>

        <div className="footer-section">
          <h5>Portals</h5>
          <ul className="footer-links">
            {(!user || isCitizen) && <li><Link to="/citizen">Citizen Portal</Link></li>}
            {(!user || isAuthority) && <li><Link to="/authority">Authority Command</Link></li>}
            <li><Link to="/verification">Information Verification</Link></li>
            <li><Link to="/resources">Emergency Resources</Link></li>
          </ul>
        </div>

        <div className="footer-section">
          <h5>Information</h5>
          <ul className="footer-links">
            <li><Link to={isAuthority ? '/authority' : '/citizen'}>Active Warnings</Link></li>
            <li><Link to="/verification">Clarifications</Link></li>
            <li><Link to="/reports">Incident Reports</Link></li>
            {!user && <li><Link to="/login">Account Login</Link></li>}
          </ul>
        </div>

        <div className="footer-section">
          <h5>Standards & Review</h5>
          <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5, marginBottom: '0.75rem' }}>
            Common Alerting Protocol (CAP v1.2) compatible. Mandatory authority approval on all citizen messages.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#38bdf8' }}>
            <Lock size={14} />
            <span>Role-Based Access Control</span>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div>&copy; {new Date().getFullYear()} CrisisBridge AI. All rights reserved.</div>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <span>Primary Source: Official Disaster Authorities</span>
          <span>Verified Reference Guidance</span>
        </div>
      </div>
    </footer>
  );
}
