import React from 'react';
import { AlertTriangle, HelpCircle, Radio, ArrowRight, Zap } from 'lucide-react';

export function GapDetectionAlerts({ alerts = [], onResolveGap }) {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  return (
    <div className="gap-alerts-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.75rem' }}>
      {alerts.map((alert, idx) => {
        let icon = <Radio size={18} color="#c2410c" />;
        let iconBg = '#ffedd5';
        if (alert.alert_type === 'UNDERSTANDING_GAP') {
          icon = <HelpCircle size={18} color="#7e22ce" />;
          iconBg = '#f3e8ff';
        } else if (alert.alert_type === 'ASSISTANCE_SURGE') {
          icon = <Zap size={18} color="#be185d" />;
          iconBg = '#fce7f3';
        } else if (alert.alert_type === 'COMMUNICATION_GAP') {
          icon = <Radio size={18} color="#c2410c" />;
          iconBg = '#ffedd5';
        }

        const isHighOrCritical = (alert.severity || '').toLowerCase().includes('high') || (alert.severity || '').toLowerCase().includes('critical') || (alert.severity || '').toLowerCase().includes('extreme');

        return (
          <div
            key={idx}
            className="gap-alert-card"
          >
            <div className="gap-alert-icon-circle" style={{ background: iconBg }}>
              {icon}
            </div>

            <div className="gap-alert-body">
              <div className="gap-alert-top-row">
                <strong className="gap-alert-title">
                  {alert.alert_type.replace(/_/g, ' ')}: {alert.zone_name}
                </strong>
                <span className={`gap-alert-badge ${isHighOrCritical ? 'gap-badge-high' : 'gap-badge-standard'}`}>
                  {alert.severity ? `${alert.severity.toUpperCase()} PRIORITY` : 'HIGH PRIORITY'}
                </span>
              </div>

              <p className="gap-alert-explanation">
                {alert.explanation}
              </p>

              {alert.recommended_action && (
                <div className="gap-alert-recommendation">
                  <span className="gap-recommendation-label">Recommended Action:</span>{' '}
                  <span className="gap-recommendation-text">{alert.recommended_action}</span>
                </div>
              )}
            </div>

            {onResolveGap && (
              <button
                type="button"
                className="gap-alert-action-btn"
                onClick={() => onResolveGap(alert)}
                aria-label={`Take action on ${alert.alert_type.replace('_', ' ')} in ${alert.zone_name}`}
              >
                <span>Take Action</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
