import React from 'react';
import { Badge } from '../common/Badge';
import { Shield, ArrowRight, AlertOctagon, HelpCircle } from 'lucide-react';

export function SituationMatrix({ zones = [], onSelectZone }) {
  if (!zones || zones.length === 0) {
    return (
      <div className="card">
        <p style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>
          No Response Zones currently monitored. Create or distribute an official warning to establish zones.
        </p>
      </div>
    );
  }

  const getWTAGaugeClass = (score) => {
    if (score >= 75) return 'wta-high';
    if (score >= 45) return 'wta-med';
    return 'wta-low';
  };

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div className="card-header">
        <h3 className="card-title">
          <Shield size={18} color="var(--color-terracotta, #8b3a2b)" />
          <span>Response Zones Status</span>
        </h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #6b5a52)' }}>
          Live operational situation and warning-to-action scores
        </span>
      </div>

      <div className="table-container" tabIndex={0} role="region" aria-label="Response Zones status table">
        <table className="table situation-matrix-table">
          <thead>
            <tr>
              <th className="col-zone">Zone</th>
              <th className="col-status">Status</th>
              <th className="col-wta">WTA Score</th>
              <th className="col-understanding">Understanding</th>
              <th className="col-assistance">Assistance</th>
              <th className="col-citizens">No. of Citizens</th>
              <th className="col-no-response">No-Response</th>
              <th className="col-action">Recommended Action</th>
              <th className="col-details">Details</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => {
              const hasEligibleData = z.has_warning !== false &&
                z.situation_status !== 'Insufficient Data' &&
                ((z.delivery_count || 0) > 0 || (z.targeted_count || 0) > 0 || (z.understanding_count || 0) > 0 || (z.acknowledgement_count || 0) > 0);

              return (
                <tr key={z.id || z.zone_id}>
                  <td className="col-zone">
                    <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '2px', wordBreak: 'break-word', lineHeight: 1.35 }}>
                      {z.name || z.zone_name}
                    </strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {z.code || z.zone_code} • {(z.estimated_population || 0).toLocaleString()} residents
                    </div>
                  </td>
                  <td className="col-status">
                    <Badge status={z.situation_status} />
                  </td>
                  <td className="col-wta">
                    {hasEligibleData ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`wta-circle ${getWTAGaugeClass(z.wta_score ?? 0)}`} style={{ width: 34, height: 34, fontSize: '0.85rem' }}>
                          {Math.round(z.wta_score ?? 0)}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/100</span>
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>N/A</span>
                    )}
                  </td>
                  <td className="col-understanding">
                    {(() => {
                      // Missing or failed API data state: do not present missing data as a valid zero
                      if (z.eligible_citizens_count === undefined || z.eligible_citizens_count === null) {
                        return (
                          <>
                            <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>N/A</span>
                            <div style={{ fontSize: '0.75rem', color: '#f43f5e' }}>Data unavailable</div>
                          </>
                        );
                      }

                      const denom = z.eligible_citizens_count;
                      const num = z.understanding_confirmed_count ?? 0;

                      // Zero eligible registered citizens state
                      if (denom === 0) {
                        return (
                          <>
                            <strong style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>0/0</strong>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No eligible citizens</div>
                          </>
                        );
                      }

                      // Positive population: fraction and confirmed percentage
                      const pct = (num / denom) * 100;
                      const pctFormatted = pct === 0 ? '0%' : `${pct.toFixed(1)}%`;

                      return (
                        <>
                          <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>{num}/{denom}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {pctFormatted} confirmed
                          </div>
                        </>
                      );
                    })()}
                  </td>
                  <td className="col-assistance">
                    {hasEligibleData ? (
                      z.help_request_count > 0 ? (
                        <span style={{ color: 'var(--status-extreme)', fontWeight: 700 }}>{z.help_request_count} Active</span>
                      ) : (
                        <span style={{ color: 'var(--status-stable)', fontWeight: 600 }}>0</span>
                      )
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>N/A</span>
                    )}
                  </td>
                  <td className="col-citizens">
                    <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: 700 }}>
                      {z.targeted_count ?? z.eligible_citizens_count ?? 0}
                    </strong>
                  </td>
                  <td className="col-no-response">
                    {hasEligibleData ? (
                      <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{z.no_response_rate ?? 0}%</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>N/A</span>
                    )}
                  </td>
                  <td className="col-action" style={{ fontSize: '0.84rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                    {z.operational_recommendation || (hasEligibleData ? 'Continuous monitoring active.' : 'Awaiting official warning distribution.')}
                  </td>
                  <td className="col-details">
                    {onSelectZone && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => onSelectZone(z)}
                        aria-label={`Inspect ${z.name || z.zone_name}`}
                      >
                        <span>View</span>
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
