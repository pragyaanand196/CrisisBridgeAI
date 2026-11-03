import React from 'react';
import { Check, Clock, AlertTriangle, XCircle, HelpCircle, ShieldCheck } from 'lucide-react';

/**
 * 5-Stage Government Workflow Progress Tracker for Incident Reports
 *
 * 1. Report Submitted
 * 2. Under Review
 * 3. Verified
 * 4. Action Initiated
 * 5. Resolved
 */

export const INCIDENT_WORKFLOW_STAGES = [
  { id: 1, key: 'submitted', label: 'Report Submitted', shortLabel: 'Submitted' },
  { id: 2, key: 'review', label: 'Under Review', shortLabel: 'Under Review' },
  { id: 3, key: 'verified', label: 'Verified', shortLabel: 'Verified' },
  { id: 4, key: 'action', label: 'Action Initiated', shortLabel: 'Action Initiated' },
  { id: 5, key: 'resolved', label: 'Resolved', shortLabel: 'Resolved' }
];

/**
 * Calculates the state of each stage from the report's current status and recorded history.
 */
export function getIncidentWorkflowProgress(report) {
  if (!report) {
    return {
      stages: INCIDENT_WORKFLOW_STAGES.map((s, idx) => ({
        ...s,
        state: idx === 0 ? 'completed' : 'upcoming',
        subLabel: idx === 0 ? 'Completed' : 'Pending'
      })),
      lineSegments: [false, false, false, false],
      exceptional: null
    };
  }

  const rawStatus = (report.status || 'Submitted').trim();
  const statusLower = rawStatus.toLowerCase();

  // Find events for dates if available
  const events = report.events || report.status_history || [];
  const findEventDate = (keywords) => {
    const ev = events.find((e) => {
      const text = `${e.event_type || ''} ${e.status || ''} ${e.note || ''}`.toLowerCase();
      return keywords.some((k) => text.includes(k));
    });
    return ev?.timestamp ? new Date(ev.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
  };

  const formatDate = (dateVal) => {
    if (!dateVal) return null;
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return null;
    }
  };

  const submittedDate = formatDate(report.created_at || report.submitted_at);
  const reviewDate = findEventDate(['review', 'triage', 'under review']);
  const verifiedDate = formatDate(report.verified_at) || findEventDate(['verif']);
  const assignedDate = formatDate(report.assigned_at) || findEventDate(['assign', 'dispatch', 'action initiated']);
  const resolvedDate = formatDate(report.resolved_at) || findEventDate(['resolv']);

  // Handle exceptional / divergent statuses
  let exceptional = null;

  if (statusLower.includes('clarification')) {
    // Clarification Requested / Required
    const reqEvent = events.find((e) => `${e.event_type || ''} ${e.note || ''}`.toLowerCase().includes('clarification'));
    exceptional = {
      type: 'clarification',
      badge: 'Clarification Required',
      message:
        report.clarification_question ||
        (reqEvent?.note ? reqEvent.note.replace(/^.*?:\s*"/, '').replace(/"$/, '') : null) ||
        'Disaster authority requested additional information or evidence from the reporting citizen.',
      date: reqEvent?.timestamp ? new Date(reqEvent.timestamp).toLocaleString() : null
    };

    return {
      stages: [
        { id: 1, ...INCIDENT_WORKFLOW_STAGES[0], state: 'completed', subLabel: submittedDate || 'Completed' },
        { id: 2, ...INCIDENT_WORKFLOW_STAGES[1], state: 'paused', subLabel: 'Action Needed' },
        { id: 3, ...INCIDENT_WORKFLOW_STAGES[2], state: 'upcoming', subLabel: 'Pending' },
        { id: 4, ...INCIDENT_WORKFLOW_STAGES[3], state: 'upcoming', subLabel: 'Pending' },
        { id: 5, ...INCIDENT_WORKFLOW_STAGES[4], state: 'upcoming', subLabel: 'Pending' }
      ],
      lineSegments: [false, false, false, false],
      exceptional
    };
  }

  if (statusLower.includes('not verified') || statusLower === 'rejected') {
    exceptional = {
      type: 'not_verified',
      badge: statusLower.includes('not verified') ? 'Not Verified' : 'Report Rejected',
      message:
        report.rejection_reason ||
        report.remarks ||
        'Field inspection or credibility assessment could not verify this report as an active disaster hazard.',
      date: report.updated_at ? new Date(report.updated_at).toLocaleString() : null
    };

    return {
      stages: [
        { id: 1, ...INCIDENT_WORKFLOW_STAGES[0], state: 'completed', subLabel: submittedDate || 'Completed' },
        { id: 2, ...INCIDENT_WORKFLOW_STAGES[1], state: 'completed', subLabel: reviewDate || 'Reviewed' },
        { id: 3, ...INCIDENT_WORKFLOW_STAGES[2], state: 'rejected', subLabel: 'Not Verified' },
        { id: 4, ...INCIDENT_WORKFLOW_STAGES[3], state: 'upcoming', subLabel: 'Pending' },
        { id: 5, ...INCIDENT_WORKFLOW_STAGES[4], state: 'upcoming', subLabel: 'Pending' }
      ],
      lineSegments: [true, false, false, false],
      exceptional
    };
  }

  if (statusLower.includes('duplicate')) {
    exceptional = {
      type: 'duplicate',
      badge: 'Duplicate Report',
      message:
        report.duplicate_reason ||
        (report.duplicate_of_id ? `Duplicate of incident report #${report.duplicate_of_id}` : 'Marked as duplicate of an existing verified incident.'),
      date: report.updated_at ? new Date(report.updated_at).toLocaleString() : null
    };

    return {
      stages: [
        { id: 1, ...INCIDENT_WORKFLOW_STAGES[0], state: 'completed', subLabel: submittedDate || 'Completed' },
        { id: 2, ...INCIDENT_WORKFLOW_STAGES[1], state: 'completed', subLabel: reviewDate || 'Reviewed' },
        { id: 3, ...INCIDENT_WORKFLOW_STAGES[2], state: 'rejected', subLabel: 'Duplicate' },
        { id: 4, ...INCIDENT_WORKFLOW_STAGES[3], state: 'upcoming', subLabel: 'Pending' },
        { id: 5, ...INCIDENT_WORKFLOW_STAGES[4], state: 'upcoming', subLabel: 'Pending' }
      ],
      lineSegments: [true, false, false, false],
      exceptional
    };
  }

  // Standard Lifecycle:
  // 1. Submitted: Only stage 1 completed, stages 2-5 Pending
  if (statusLower === 'submitted') {
    return {
      stages: [
        { id: 1, ...INCIDENT_WORKFLOW_STAGES[0], state: 'completed', subLabel: submittedDate || 'Completed' },
        { id: 2, ...INCIDENT_WORKFLOW_STAGES[1], state: 'upcoming', subLabel: 'Pending' },
        { id: 3, ...INCIDENT_WORKFLOW_STAGES[2], state: 'upcoming', subLabel: 'Pending' },
        { id: 4, ...INCIDENT_WORKFLOW_STAGES[3], state: 'upcoming', subLabel: 'Pending' },
        { id: 5, ...INCIDENT_WORKFLOW_STAGES[4], state: 'upcoming', subLabel: 'Pending' }
      ],
      lineSegments: [false, false, false, false],
      exceptional: null
    };
  }

  // 2. Under Review: Stage 1 completed, Stage 2 active, stages 3-5 Pending
  if (statusLower === 'under review') {
    return {
      stages: [
        { id: 1, ...INCIDENT_WORKFLOW_STAGES[0], state: 'completed', subLabel: submittedDate || 'Completed' },
        { id: 2, ...INCIDENT_WORKFLOW_STAGES[1], state: 'active', subLabel: reviewDate ? `Active (${reviewDate})` : 'In Progress' },
        { id: 3, ...INCIDENT_WORKFLOW_STAGES[2], state: 'upcoming', subLabel: 'Pending' },
        { id: 4, ...INCIDENT_WORKFLOW_STAGES[3], state: 'upcoming', subLabel: 'Pending' },
        { id: 5, ...INCIDENT_WORKFLOW_STAGES[4], state: 'upcoming', subLabel: 'Pending' }
      ],
      lineSegments: [true, false, false, false],
      exceptional: null
    };
  }

  // 3. Verified: Stages 1, 2, 3 completed with green ticks. Stages 4, 5 Pending.
  if (statusLower === 'verified') {
    return {
      stages: [
        { id: 1, ...INCIDENT_WORKFLOW_STAGES[0], state: 'completed', subLabel: submittedDate || 'Completed' },
        { id: 2, ...INCIDENT_WORKFLOW_STAGES[1], state: 'completed', subLabel: reviewDate || 'Completed' },
        { id: 3, ...INCIDENT_WORKFLOW_STAGES[2], state: 'completed', subLabel: verifiedDate || 'Verified' },
        { id: 4, ...INCIDENT_WORKFLOW_STAGES[3], state: 'upcoming', subLabel: 'Pending' },
        { id: 5, ...INCIDENT_WORKFLOW_STAGES[4], state: 'upcoming', subLabel: 'Pending' }
      ],
      lineSegments: [true, true, false, false],
      exceptional: null
    };
  }

  // 4. Action Initiated (or Assigned / Action in Progress):
  // Stages 1, 2, 3 completed. Stage 4 active! Stage 5 Pending.
  if (
    statusLower === 'action initiated' ||
    statusLower === 'assigned' ||
    statusLower === 'action in progress' ||
    statusLower.includes('action') ||
    statusLower.includes('assigned')
  ) {
    return {
      stages: [
        { id: 1, ...INCIDENT_WORKFLOW_STAGES[0], state: 'completed', subLabel: submittedDate || 'Completed' },
        { id: 2, ...INCIDENT_WORKFLOW_STAGES[1], state: 'completed', subLabel: reviewDate || 'Completed' },
        { id: 3, ...INCIDENT_WORKFLOW_STAGES[2], state: 'completed', subLabel: verifiedDate || 'Verified' },
        { id: 4, ...INCIDENT_WORKFLOW_STAGES[3], state: 'active', subLabel: assignedDate ? `Initiated (${assignedDate})` : 'Dispatched' },
        { id: 5, ...INCIDENT_WORKFLOW_STAGES[4], state: 'upcoming', subLabel: 'Pending' }
      ],
      lineSegments: [true, true, true, false],
      exceptional: null
    };
  }

  // 5. Resolved: All 5 stages completed with green ticks. All 4 line segments green.
  if (statusLower === 'resolved') {
    return {
      stages: [
        { id: 1, ...INCIDENT_WORKFLOW_STAGES[0], state: 'completed', subLabel: submittedDate || 'Completed' },
        { id: 2, ...INCIDENT_WORKFLOW_STAGES[1], state: 'completed', subLabel: reviewDate || 'Completed' },
        { id: 3, ...INCIDENT_WORKFLOW_STAGES[2], state: 'completed', subLabel: verifiedDate || 'Verified' },
        { id: 4, ...INCIDENT_WORKFLOW_STAGES[3], state: 'completed', subLabel: assignedDate || 'Initiated' },
        { id: 5, ...INCIDENT_WORKFLOW_STAGES[4], state: 'completed', subLabel: resolvedDate || 'Resolved' }
      ],
      lineSegments: [true, true, true, true],
      exceptional: null
    };
  }

  // Default fallback (treat as submitted)
  return {
    stages: INCIDENT_WORKFLOW_STAGES.map((s, idx) => ({
      ...s,
      state: idx === 0 ? 'completed' : 'upcoming',
      subLabel: idx === 0 ? 'Completed' : 'Pending'
    })),
    lineSegments: [false, false, false, false],
    exceptional: null
  };
}

/**
 * Main IncidentProgressTracker Component
 */
export function IncidentProgressTracker({ report, compact = false, className = '' }) {
  const { stages, lineSegments, exceptional } = getIncidentWorkflowProgress(report);

  const circleSize = compact ? 26 : 30;
  const nodeWidth = compact ? '68px' : '90px';
  const labelFontSize = compact ? '0.70rem' : '0.76rem';
  const subLabelFontSize = compact ? '0.64rem' : '0.68rem';
  const lineMarginTop = compact ? '12px' : '14px';
  const minContainerWidth = compact ? '340px' : '480px';

  return (
    <div
      className={`incident-progress-tracker-container ${className}`}
      style={{
        background: 'var(--bg-surface-subtle, #fcfaf7)',
        border: '1px solid var(--border-light, #ede7e0)',
        borderRadius: '9px',
        padding: compact ? '8px 10px' : '12px 14px',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Horizontal Scroll wrapper for responsive mobile/tablet handling */}
      <div
        className="incident-progress-scroll-area"
        style={{
          width: '100%',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin'
        }}
      >
        <div
          role="list"
          aria-label="Incident Report 5-Stage Workflow Progress"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            position: 'relative',
            minWidth: minContainerWidth,
            padding: '2px 4px',
            boxSizing: 'border-box'
          }}
        >
          {stages.map((stage, index) => {
            const isCompleted = stage.state === 'completed';
            const isActive = stage.state === 'active';
            const isPaused = stage.state === 'paused';
            const isRejected = stage.state === 'rejected';
            const isUpcoming = stage.state === 'upcoming';

            const nextSegmentGreen = lineSegments[index] === true;

            return (
              <React.Fragment key={stage.id}>
                {/* Stage Node */}
                <div
                  role="listitem"
                  aria-current={isActive ? 'step' : undefined}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: '0 0 auto',
                    width: nodeWidth,
                    textAlign: 'center',
                    zIndex: 2,
                    position: 'relative'
                  }}
                >
                  {/* Circular Indicator */}
                  <div
                    style={{
                      width: circleSize,
                      height: circleSize,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: compact ? '0.74rem' : '0.80rem',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                      ...(isCompleted && {
                        background: '#15803d',
                        border: '2px solid #15803d',
                        color: '#ffffff',
                        boxShadow: '0 2px 4px rgba(21, 128, 61, 0.22)'
                      }),
                      ...(isActive && {
                        background: '#ffffff',
                        border: '2.5px solid var(--color-terracotta, #8b3a2b)',
                        color: 'var(--color-terracotta, #8b3a2b)',
                        boxShadow: '0 0 0 3.5px rgba(139, 58, 43, 0.16)'
                      }),
                      ...(isPaused && {
                        background: '#fffbeb',
                        border: '2.5px solid #d97706',
                        color: '#b45309',
                        boxShadow: '0 0 0 3.5px rgba(217, 119, 6, 0.15)'
                      }),
                      ...(isRejected && {
                        background: '#fef2f2',
                        border: '2.5px solid #dc2626',
                        color: '#dc2626',
                        boxShadow: '0 0 0 3px rgba(220, 38, 38, 0.12)'
                      }),
                      ...(isUpcoming && {
                        background: '#fcfaf7',
                        border: '1.5px solid var(--border-medium, #e2d9cf)',
                        color: 'var(--text-muted, #78716c)'
                      })
                    }}
                    title={`${stage.label}: ${isCompleted ? 'Completed' : isActive ? 'Current Stage' : isPaused ? 'Action Needed' : isRejected ? 'Rejected' : 'Pending'}`}
                  >
                    {isCompleted ? (
                      <Check size={compact ? 13 : 15} strokeWidth={3} color="#ffffff" />
                    ) : isPaused ? (
                      <HelpCircle size={compact ? 13 : 15} strokeWidth={2.5} color="#d97706" />
                    ) : isRejected ? (
                      <XCircle size={compact ? 13 : 15} strokeWidth={2.5} color="#dc2626" />
                    ) : (
                      <span>{stage.id}</span>
                    )}
                  </div>

                  {/* Stage Name */}
                  <span
                    style={{
                      marginTop: '5px',
                      fontSize: labelFontSize,
                      fontWeight: isActive ? 800 : isCompleted ? 700 : 600,
                      color: isActive
                        ? 'var(--color-terracotta, #8b3a2b)'
                        : isCompleted
                        ? 'var(--color-espresso-dark, #2b221b)'
                        : isPaused
                        ? '#b45309'
                        : isRejected
                        ? '#b91c1c'
                        : 'var(--text-muted, #78716c)',
                      lineHeight: 1.2,
                      maxWidth: nodeWidth,
                      display: 'block'
                    }}
                  >
                    {stage.label}
                  </span>

                  {/* Status description or date */}
                  <span
                    style={{
                      marginTop: '2px',
                      fontSize: subLabelFontSize,
                      fontWeight: isActive || isCompleted ? 700 : 500,
                      color: isCompleted
                        ? '#15803d'
                        : isActive
                        ? 'var(--color-terracotta, #8b3a2b)'
                        : isPaused
                        ? '#d97706'
                        : isRejected
                        ? '#dc2626'
                        : 'var(--text-muted, #a8a29e)',
                      letterSpacing: '0.01em'
                    }}
                  >
                    {isCompleted && '✓ '}
                    {stage.subLabel}
                  </span>
                </div>

                {/* Connecting Line (between circles) */}
                {index < stages.length - 1 && (
                  <div
                    aria-hidden="true"
                    style={{
                      flex: 1,
                      height: '2px',
                      marginTop: lineMarginTop,
                      marginLeft: '-2px',
                      marginRight: '-2px',
                      background: nextSegmentGreen ? '#15803d' : 'var(--border-medium, #e2d9cf)',
                      transition: 'background 0.25s ease',
                      zIndex: 1,
                      position: 'relative'
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Exceptional Status Banner (Clarification / Not Verified / Duplicate) */}
      {exceptional && (
        <div
          style={{
            marginTop: '8px',
            padding: '7px 10px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            fontSize: '0.78rem',
            lineHeight: 1.4,
            ...(exceptional.type === 'clarification' && {
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e'
            }),
            ...(exceptional.type === 'not_verified' && {
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b'
            }),
            ...(exceptional.type === 'duplicate' && {
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1e40af'
            })
          }}
        >
          {exceptional.type === 'clarification' ? (
            <HelpCircle size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
          ) : exceptional.type === 'not_verified' ? (
            <XCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          ) : (
            <AlertTriangle size={15} color="#2563eb" style={{ flexShrink: 0, marginTop: 1 }} />
          )}

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <strong>{exceptional.badge}:</strong>
              {exceptional.date && (
                <span style={{ fontSize: '0.70rem', opacity: 0.85 }}>{exceptional.date}</span>
              )}
            </div>
            <div style={{ marginTop: '2px' }}>{exceptional.message}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IncidentProgressTracker;
