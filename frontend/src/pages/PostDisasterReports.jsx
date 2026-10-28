import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { BackButton } from '../components/common/BackButton';
import { Badge } from '../components/common/Badge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { FileText, ArrowRight, ShieldCheck, Clock, Calendar, CheckCircle2 } from 'lucide-react';

export function PostDisasterReports() {
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try {
      const data = await api.getReportsList();
      setWarnings(data || []);
    } catch (err) {
      console.error('Failed to load incident reports:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  if (loading) {
    return <LoadingSpinner text="Loading incident reports..." fullPage />;
  }

  return (
    <div className="reports-page">
      <BackButton fallbackPath="/" label="Back to Home" />

      <div className="page-header-block">
        <h1 className="page-title">Post-Disaster Reports</h1>
        <p className="page-subtitle">
          Review post-incident metrics, communication effectiveness, and response history
        </p>
      </div>

      {warnings.length === 0 ? (
        <EmptyState
          icon={<FileText size={36} color="var(--color-terracotta)" />}
          title="No Reports Available"
          description="Reports will appear here once disaster warnings are created and tracked."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {warnings.map((w) => (
            <div key={w.id} className="card card-hover" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <Badge status={w.status} />
                <span className="card-item-subtext" style={{ fontWeight: 600 }}>
                  {w.identifier} (v{w.version}.0)
                </span>
              </div>

              <h3 className="card-item-title">
                {w.title}
              </h3>
              <p className="card-item-meta" style={{ marginBottom: '1rem' }}>
                <strong className="meta-highlight">Area:</strong> {w.area_name} &nbsp;•&nbsp; <strong className="meta-highlight">Authority:</strong> {w.issuing_authority_name}
              </p>

              <div className="card-item-subtext" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1.25rem', marginTop: 'auto' }}>
                <Clock size={14} color="var(--color-terracotta)" />
                <span>Recorded on {new Date(w.created_at).toLocaleDateString()}</span>
              </div>

              <Link to={`/reports/${w.id}`} className="btn btn-outline btn-block">
                <span>View Full Report</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
