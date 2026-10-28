import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import {
  Shield,
  Radio,
  MapPin,
  CheckCircle,
  FileText,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Users,
  Activity,
  HeartHandshake
} from 'lucide-react';

export function LandingPage() {
  const { user, isAuthority, isCitizen } = useAuth();
  const [activeWarnings, setActiveWarnings] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getCitizenActiveWarnings().catch(() => []),
      api.getSystemOverview().catch(() => null)
    ]).then(([warnings, stats]) => {
      setActiveWarnings(warnings || []);
      setOverview(stats);
      setLoading(false);
    });
  }, []);

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="landing-hero">
        <div className="hero-pill">
          <Activity size={14} />
          <span>Disaster Warning & Response Platform</span>
        </div>
        <h1 className="hero-title">
          CrisisBridge AI
        </h1>
        <p className="hero-subtitle">
          Issue official disaster warnings, deliver translated safety instructions to affected communities, and verify citizen response in real time.
        </p>
        <div className="hero-actions">
          {user ? (
            isAuthority ? (
              <Link to="/authority" className="btn btn-primary btn-lg">
                <Shield size={18} />
                <span>Open Authority Command Center</span>
              </Link>
            ) : (
              <Link to="/citizen" className="btn btn-danger btn-lg">
                <Radio size={18} />
                <span>Open Citizen Portal</span>
              </Link>
            )
          ) : (
            <>
              <Link to="/citizen" className="btn btn-danger btn-lg">
                <Radio size={18} />
                <span>Citizen Portal</span>
              </Link>
              <Link to="/authority" className="btn btn-hero-outline btn-lg">
                <Shield size={18} />
                <span>Authority Command Center</span>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Live System Operational Overview KPIs */}
      {overview && (
        <div className="metric-grid" style={{ marginBottom: '2.5rem' }}>
          <div className="metric-card">
            <div className="metric-label">
              <span>Active Warnings</span>
              <AlertTriangle size={16} color="#dc2626" />
            </div>
            <div className="metric-value" style={{ color: overview.active_warnings_count > 0 ? '#dc2626' : '#059669' }}>
              {overview.active_warnings_count}
            </div>
            <div className="metric-sub">Active alerts</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">
              <span>Response Zones</span>
              <MapPin size={16} color="#0284c7" />
            </div>
            <div className="metric-value">
              {overview.total_response_zones}
            </div>
            <div className="metric-sub">Monitored areas</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">
              <span>Citizens Reached</span>
              <Users size={16} color="#059669" />
            </div>
            <div className="metric-value">
              {(overview.total_citizens_reached || 0).toLocaleString()}
            </div>
            <div className="metric-sub">Notifications sent</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">
              <span>Comprehension Rate</span>
              <CheckCircle size={16} color="#0284c7" />
            </div>
            <div className="metric-value">
              {overview.overall_understanding_rate}%
            </div>
            <div className="metric-sub">Citizens confirmed understood</div>
          </div>
        </div>
      )}

      {/* Active Alerts Banner if any */}
      {activeWarnings.length > 0 && (
        <section style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.35rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={22} color="#f87171" />
              <span>Active Emergency Warnings</span>
            </h3>
            <Link
              to={isAuthority ? '/authority' : '/citizen'}
              style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8' }}
            >
              {isAuthority ? 'View in Command Center →' : 'View in Citizen Portal →'}
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {activeWarnings.map((warn) => (
              <div key={warn.id} className="card card-hover" style={{ borderLeft: '4px solid #ef4444' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                  <Badge status={warn.severity} />
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>v{warn.version}.0</span>
                </div>
                <h4 style={{ fontSize: '1.15rem', color: '#f8fafc', marginBottom: '0.5rem' }}>{warn.title}</h4>
                <p style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '1rem' }}>
                  <strong style={{ color: '#f1f5f9' }}>Target Area:</strong> {warn.area_name}
                </p>
                <Link
                  to={isAuthority ? `/warnings/${warn.id}` : '/citizen'}
                  className="btn btn-outline btn-sm btn-block"
                >
                  <span>{isAuthority ? 'Manage Warning' : 'View Instructions'}</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How the Warning Workflow Works */}
      <section className="workflow-section">
        <div className="section-header">
          <div className="section-tag">Workflow</div>
          <h2 style={{ color: 'var(--color-espresso-dark)', marginBottom: '0.5rem', fontWeight: 800 }}>Disaster Warning & Response Process</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem' }}>
            From official warning issuance to citizen notification, audio instructions, and emergency response verification.
          </p>
        </div>

        <div className="workflow-steps-grid">
          <div className="step-card">
            <div className="step-number">1</div>
            <h4 className="step-title">Warning Details & Target Area</h4>
            <p className="step-desc">
              Authorities create structured disaster warnings and select target areas on the map.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">2</div>
            <h4 className="step-title">RAG Retrieval & Citizen Draft</h4>
            <p className="step-desc">
              Relevant safety guidance is retrieved from trusted SOPs and drafted in plain English and Hindi.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">3</div>
            <h4 className="step-title">Authority Review & Approval</h4>
            <p className="step-desc">
              Authorized emergency officers review, edit, and approve all messages before distribution.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">4</div>
            <h4 className="step-title">Citizen Delivery & Audio</h4>
            <p className="step-desc">
              Targeted citizens receive alerts, toggle languages, and listen to spoken instructions.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">5</div>
            <h4 className="step-title">Response & Assistance Triage</h4>
            <p className="step-desc">
              Citizens confirm understanding or request emergency rescue, tracked live in the command center.
            </p>
          </div>

          <div className="step-card">
            <div className="step-number">6</div>
            <h4 className="step-title">Post-Incident Reports</h4>
            <p className="step-desc">
              Complete audit records and response timelines are generated for post-disaster analysis.
            </p>
          </div>
        </div>
      </section>

      {/* Role Portals */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div className="section-header">
          <div className="section-tag">Portals</div>
          <h2 style={{ color: 'var(--color-espresso-dark)', marginBottom: '0.5rem', fontWeight: 800 }}>{user ? 'Available Portals & Modules' : 'Select Your Portal'}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem' }}>
            {user
              ? 'Access services and verified tools tailored to your authenticated account.'
              : 'Access services designed for citizens, disaster authorities, and fact-checking.'}
          </p>
        </div>

        <div className="role-grid">
          {(!user || isCitizen) && (
            <div className="role-card">
              <div className="role-icon" style={{ background: '#faeee9', color: 'var(--color-terracotta)' }}>
                <Radio size={26} />
              </div>
              <h3 style={{ fontSize: '1.3rem', color: 'var(--color-espresso-dark)', marginBottom: '0.5rem', fontWeight: 700 }}>Citizen Portal</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                View emergency warnings for your registered area, listen to safety instructions in Hindi or English, and request assistance.
              </p>
              <Link to="/citizen" className="btn btn-outline" style={{ marginTop: 'auto' }}>
                <span>Open Citizen Portal</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {(!user || isAuthority) && (
            <div className="role-card">
              <div className="role-icon" style={{ background: '#faeee9', color: 'var(--color-terracotta)' }}>
                <Shield size={26} />
              </div>
              <h3 style={{ fontSize: '1.3rem', color: 'var(--color-espresso-dark)', marginBottom: '0.5rem', fontWeight: 700 }}>Authority Command Center</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                Issue warnings, review RAG guidance, approve citizen messages, monitor response zones, and dispatch emergency units.
              </p>
              <Link to="/authority" className="btn btn-primary" style={{ marginTop: 'auto' }}>
                <span>Open Command Center</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          )}

          <div className="role-card">
            <div className="role-icon" style={{ background: '#faeee9', color: 'var(--color-terracotta)' }}>
              <CheckCircle size={26} />
            </div>
            <h3 style={{ fontSize: '1.3rem', color: 'var(--color-espresso-dark)', marginBottom: '0.5rem', fontWeight: 700 }}>Information Verification</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Check public reports against official disaster warnings and view verified clarifications.
            </p>
            <Link to="/verification" className="btn btn-outline" style={{ marginTop: 'auto' }}>
              <span>Verify Information</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Disaster Preparedness Guidelines */}
      <section className="card" style={{ padding: '2.25rem', marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '1.4rem', color: 'var(--color-espresso-dark)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800 }}>
          <HeartHandshake size={24} color="var(--color-terracotta)" />
          <span>Public Safety & Emergency Preparedness Guide</span>
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.35rem', marginTop: '1rem' }}>
          <div style={{ background: '#fdfbf7', padding: '1.25rem', borderRadius: '12px', border: '1px solid #ede5da' }}>
            <strong style={{ fontSize: '0.98rem', color: 'var(--color-terracotta)', display: 'block', marginBottom: '6px' }}>1. Emergency Go-Bag</strong>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Pack 3 days of non-perishable food, potable water (3L/person/day), essential medications, copies of IDs, power bank, and a flashlight.
            </p>
          </div>

          <div style={{ background: '#fdfbf7', padding: '1.25rem', borderRadius: '12px', border: '1px solid #ede5da' }}>
            <strong style={{ fontSize: '0.98rem', color: '#dc2626', display: 'block', marginBottom: '6px' }}>2. Flood Precautions</strong>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Turn off gas valves and electrical mains if floodwaters rise. Never walk or drive through moving water deeper than 15 cm (6 inches).
            </p>
          </div>

          <div style={{ background: '#fdfbf7', padding: '1.25rem', borderRadius: '12px', border: '1px solid #ede5da' }}>
            <strong style={{ fontSize: '0.98rem', color: '#15803d', display: 'block', marginBottom: '6px' }}>3. Rumor Verification</strong>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Always check CrisisBridge AI's verified feed before forwarding social media messages or panic-inducing claims.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
