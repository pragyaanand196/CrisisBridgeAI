import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { BackButton } from '../components/common/BackButton';
import { Badge } from '../components/common/Badge';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import {
  FileText,
  Printer,
  Shield,
  AlertTriangle,
  Users,
  Activity,
  CheckCircle,
  HelpCircle,
  Clock,
  MapPin
} from 'lucide-react';

export function ReportDetail() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    try {
      const data = await api.getPostDisasterReport(id);
      setReport(data);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (loading) {
    return <LoadingSpinner text="Loading report..." fullPage />;
  }

  if (!report) {
    return (
      <div>
        <BackButton fallbackPath="/reports" label="Back to Reports" />
        <div className="card">
          <p style={{ textAlign: 'center', color: '#64748b' }}>Post-disaster report not found.</p>
        </div>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="report-detail-page">
      <div className="no-print">
        <BackButton fallbackPath="/reports" label="Back to Reports" />
      </div>

      {/* Report Header */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 4, flexWrap: 'wrap' }}>
              <Badge status={report.final_status} />
              <Badge status={report.severity} />
              <span className="card-item-subtext" style={{ fontWeight: 600 }}>
                Incident ID: {report.identifier}
              </span>
            </div>
            <h1 style={{ fontSize: '1.85rem', color: 'var(--color-espresso-dark)', marginBottom: '0.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Post-Disaster Incident Report
            </h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
              {report.title} ({report.disaster_type})
            </p>
          </div>

          <button
            type="button"
            className="btn btn-outline no-print"
            onClick={handlePrint}
          >
            <Printer size={16} color="var(--color-terracotta)" />
            <span>Print Report</span>
          </button>
        </div>

        {/* Executive Metrics Strip */}
        <div className="report-meta-grid">
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Issuing Authority</span>
            <strong style={{ display: 'block', fontSize: '0.92rem', color: 'var(--color-espresso-dark)' }}>{report.issuing_authority}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Monitored Zones</span>
            <strong style={{ display: 'block', fontSize: '0.92rem', color: 'var(--color-espresso-dark)' }}>{report.total_zones_affected} Response Zones</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Pop. at Risk</span>
            <strong style={{ display: 'block', fontSize: '0.92rem', color: 'var(--color-espresso-dark)' }}>{(report.total_population_at_risk || 0).toLocaleString()}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Citizen Feedback</span>
            <strong style={{ display: 'block', fontSize: '0.92rem', color: 'var(--color-espresso-dark)' }}>{report.total_citizens_acknowledged} Responses</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Avg WTA Score</span>
            <strong style={{ display: 'block', fontSize: '1.05rem', color: report.overall_wta_score >= 70 ? '#15803d' : '#b45309' }}>
              {report.overall_wta_score} / 100
            </strong>
          </div>
        </div>
      </div>

      {/* Identified Bottlenecks */}
      <div className="card" style={{ marginBottom: '1.75rem', borderLeft: '4px solid #c2410c' }}>
        <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
          <AlertTriangle size={18} color="#c2410c" />
          <span>Operational Bottlenecks & Communication Gaps</span>
        </h3>
        <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {report.detected_bottlenecks?.map((b, idx) => (
            <li key={idx}><strong style={{ color: 'var(--color-espresso-dark)' }}>{b}</strong></li>
          ))}
        </ul>
      </div>

      {/* Zone-by-Zone Communication Breakdown */}
      <section className="card" style={{ marginBottom: '1.75rem' }}>
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <MapPin size={18} color="var(--color-terracotta)" />
          <span>Response Zone Breakdown</span>
        </h3>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Zone Code / Name</th>
                <th>WTA Score</th>
                <th>Comprehension Rate</th>
                <th>Gaps Reported</th>
                <th>Assistance Requests</th>
                <th>No-Response Silent</th>
                <th>Final Operational Status</th>
              </tr>
            </thead>
            <tbody>
              {report.communication_health_summary?.zones_breakdown?.map((z) => (
                <tr key={z.zone_id}>
                  <td><strong style={{ color: 'var(--color-espresso-dark)' }}>{z.zone_name}</strong> ({z.zone_code})</td>
                  <td><strong style={{ color: z.wta_score >= 70 ? '#15803d' : '#b45309' }}>{z.wta_score} / 100</strong></td>
                  <td>{z.understanding_rate}%</td>
                  <td>{z.dont_understand_count || 0}</td>
                  <td>{z.active_help_count || 0}</td>
                  <td>{z.no_response_rate}%</td>
                  <td><Badge status={z.situation_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Assistance Needs Triaged Breakdown */}
      <section className="card" style={{ marginBottom: '1.75rem' }}>
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <Users size={18} color="var(--color-terracotta)" />
          <span>Assistance Operations Summary</span>
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ background: '#fdfbf7', padding: '1rem', borderRadius: '8px', border: '1px solid #ede5da' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Requests</span>
            <h4 style={{ fontSize: '1.5rem', color: 'var(--color-espresso-dark)', fontWeight: 700, margin: '4px 0 0 0' }}>
              {report.assistance_triaged_summary?.total_requests || 0}
            </h4>
          </div>

          <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>Resolved / Rescued</span>
            <h4 style={{ fontSize: '1.5rem', color: '#15803d', fontWeight: 700, margin: '4px 0 0 0' }}>
              {report.assistance_triaged_summary?.resolved_count || 0}
            </h4>
          </div>

          <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
            <span style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>Units Dispatched</span>
            <h4 style={{ fontSize: '1.5rem', color: '#b45309', fontWeight: 700, margin: '4px 0 0 0' }}>
              {report.assistance_triaged_summary?.dispatched_count || 0}
            </h4>
          </div>
        </div>
      </section>

      {/* Complete Immutable Audit Log Timeline */}
      <section className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <Clock size={18} color="var(--color-terracotta)" />
          <span>Incident Timeline ({report.timeline_events?.length || 0} events)</span>
        </h3>

        {(!report.timeline_events || report.timeline_events.length === 0) ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No audit trail records logged for this incident.</p>
        ) : (
          <div className="audit-timeline">
            {report.timeline_events.map((ev) => (
              <div key={ev.id} className="timeline-item">
                <div className="timeline-dot"></div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                  {new Date(ev.timestamp).toLocaleString()} • User: <strong style={{ color: 'var(--color-terracotta)' }}>{ev.user_email || 'System'}</strong> ({ev.user_role || 'automated'})
                </div>
                <strong style={{ fontSize: '0.92rem', color: 'var(--color-espresso-dark)' }}>{ev.summary}</strong>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Event Code: {ev.event_type}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
