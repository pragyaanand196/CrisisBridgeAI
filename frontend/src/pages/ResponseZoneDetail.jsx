import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { BackButton } from '../components/common/BackButton';
import { Badge } from '../components/common/Badge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { DisasterMap } from '../components/map/DisasterMap';
import { MapPin, Users, Activity, Phone, Home, HeartPulse, HelpCircle, Shield } from 'lucide-react';

export function ResponseZoneDetail() {
  const { id } = useParams();
  const [zone, setZone] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadZone = useCallback(async () => {
    try {
      const data = await api.getZoneDetail(id);
      setZone(data);
    } catch (err) {
      console.error('Failed to load response zone:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadZone();
  }, [loadZone]);

  if (loading) {
    return <LoadingSpinner text="Loading zone details..." fullPage />;
  }

  if (!zone) {
    return (
      <div>
        <BackButton fallbackPath="/authority" label="Back to Dashboard" />
        <div className="card">
          <p style={{ textAlign: 'center', color: '#64748b' }}>Response Zone not found.</p>
        </div>
      </div>
    );
  }

  const hasEligibleData = zone.has_warning !== false &&
    zone.situation_status !== 'Insufficient Data' &&
    ((zone.delivery_count || 0) > 0 || (zone.targeted_count || 0) > 0 || (zone.understanding_count || 0) > 0 || (zone.acknowledgement_count || 0) > 0);

  return (
    <div className="zone-detail-page">
      <BackButton fallbackPath="/authority" label="Back to Dashboard" />

      {/* Zone Header */}
      <div className="card" style={{ marginBottom: '1.75rem', borderLeft: '4px solid var(--color-terracotta)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 4 }}>
              <Badge status={zone.situation_status} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-terracotta)' }}>{zone.code}</span>
            </div>
            <h1 style={{ fontSize: '1.75rem', color: 'var(--color-espresso-dark)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>{zone.name}</h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: 4, marginBottom: 0 }}>
              Estimated Population: <strong style={{ color: 'var(--color-espresso-dark)' }}>{(zone.estimated_population || 0).toLocaleString()}</strong> residents &nbsp;•&nbsp; Risk Level: <strong style={{ color: 'var(--color-espresso-dark)' }}>{zone.risk_level}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="wta-gauge-container">
              {hasEligibleData ? (
                <>
                  <span className={`wta-circle ${zone.wta_score >= 70 ? 'wta-high' : zone.wta_score >= 40 ? 'wta-med' : 'wta-low'}`}>
                    {Math.round(zone.wta_score ?? 0)}
                  </span>
                  <div>
                    <strong style={{ fontSize: '0.95rem', display: 'block', color: 'var(--color-espresso-dark)' }}>Warning-to-Action Score</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Citizen response index</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="wta-circle wta-low" style={{ background: '#ede5da', color: 'var(--color-espresso-dark)' }}>
                    N/A
                  </span>
                  <div>
                    <strong style={{ fontSize: '0.95rem', display: 'block', color: 'var(--color-espresso-dark)' }}>Warning-to-Action Score</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>No warning data</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metric-grid" style={{ marginBottom: '1.75rem' }}>
        <div className="metric-card">
          <div className="metric-label">
            <span>Comprehension Rate</span>
            <Users size={16} color="#10b981" />
          </div>
          <div className="metric-value" style={{ color: '#10b981' }}>{hasEligibleData ? `${Math.round(zone.understanding_rate || 0)}%` : 'N/A'}</div>
          <div className="metric-sub">{hasEligibleData ? `${zone.understanding_count || 0} confirmed understood` : 'No warning data'}</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Understanding Gaps</span>
            <HelpCircle size={16} color="#a855f7" />
          </div>
          <div className="metric-value" style={{ color: '#a855f7' }}>{hasEligibleData ? (zone.dont_understand_count || 0) : 'N/A'}</div>
          <div className="metric-sub">Citizens needing simpler instructions</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>Active Assistance Requests</span>
            <HeartPulse size={16} color="#f43f5e" />
          </div>
          <div className="metric-value" style={{ color: '#f43f5e' }}>{hasEligibleData ? (zone.help_request_count || 0) : 'N/A'}</div>
          <div className="metric-sub">Evacuation / Medical needs</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">
            <span>No Response Rate</span>
            <Activity size={16} color="#fb923c" />
          </div>
          <div className="metric-value" style={{ color: '#fb923c' }}>{hasEligibleData ? `${zone.no_response_rate || 0}%` : 'N/A'}</div>
          <div className="metric-sub">Citizens with no recorded response</div>
        </div>
      </div>

      {/* Map & Resources Grid */}
      <div className="authority-grid-2col" style={{ marginBottom: '2rem' }}>
        {/* Local Map */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="card-header">
            <h3 className="card-title">
              <MapPin size={18} color="#38bdf8" />
              <span>Zone Perimeter & Assigned Facilities</span>
            </h3>
          </div>
          <DisasterMap
            zones={[zone]}
            resources={zone.resources || []}
            center={[zone.center_lat, zone.center_lng]}
            height="380px"
          />
        </div>

        {/* Assigned Verified Resources */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="card-header">
            <h3 className="card-title">
              <Home size={18} color="#10b981" />
              <span>Assigned Emergency Resources ({zone.resources?.length || 0})</span>
            </h3>
            <Link to="/resources" className="btn btn-outline btn-sm">
              Manage All
            </Link>
          </div>

          {(!zone.resources || zone.resources.length === 0) ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', padding: '1.5rem 0', textAlign: 'center' }}>
              No verified shelters or hospitals linked to this Response Zone yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {zone.resources.map((res) => (
                <div key={res.id} style={{ background: '#fdfbf7', border: '1px solid #ede5da', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <strong style={{ color: 'var(--color-espresso-dark)' }}>{res.name}</strong>
                    <span className="badge badge-stable" style={{ fontSize: '0.7rem' }}>{res.status}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {res.resource_type} • {res.address}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Capacity: {res.capacity_occupied}/{res.capacity_total}</span>
                    <a href={`tel:${res.contact_phone}`} style={{ fontWeight: 600, color: 'var(--color-terracotta)' }}>Call {res.contact_phone}</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
