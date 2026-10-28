import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import {
  HelpCircle,
  Check,
  Truck,
  CheckCircle2,
  Phone,
  MapPin,
  Users,
  Clock,
  AlertTriangle,
  FileCheck,
  Info,
  ShieldCheck,
  XCircle,
  Eye
} from 'lucide-react';

export function AssistanceTriageTable({
  requests = [],
  onUpdateStatus,
  onAcknowledge,
  onDispatch,
  onResolve
}) {
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Dispatch modal state
  const [dispatchModalReq, setDispatchModalReq] = useState(null);
  const [dispatchUnit, setDispatchUnit] = useState('NDRF Quick Response Team 2');

  // Resolve evidence review modal state
  const [resolveModalReq, setResolveModalReq] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('Rescue operation verified and completed.');
  const [actionLoading, setActionLoading] = useState(false);

  const filtered = requests.filter((r) => {
    if (filterCategory !== 'ALL' && r.category !== filterCategory) return false;
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    return true;
  });

  const handleAcknowledgeClick = async (reqId) => {
    if (onAcknowledge) {
      onAcknowledge(reqId);
    } else if (onUpdateStatus) {
      onUpdateStatus(reqId, 'Acknowledged');
    }
  };

  const handleDispatchSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!dispatchModalReq) return;
    const reqId = dispatchModalReq.id;
    const unit = dispatchUnit.trim() || 'Disaster Quick Response Team';

    setDispatchModalReq(null);
    if (onDispatch) {
      onDispatch(reqId, { dispatched_unit_notes: unit });
    } else if (onUpdateStatus) {
      onUpdateStatus(reqId, 'Dispatched', unit);
    }
  };

  const handleResolveSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!resolveModalReq) return;
    const reqId = resolveModalReq.id;
    const notes = resolutionNotes.trim() || 'Assistance request resolved.';

    setResolveModalReq(null);
    if (onResolve) {
      onResolve(reqId, { resolution_notes: notes });
    } else if (onUpdateStatus) {
      onUpdateStatus(reqId, 'Resolved', notes);
    }
  };

  if (requests.length === 0) {
    return (
      <div className="card">
        <p style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>
          No active assistance requests currently logged.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div className="card-header" style={{ flexWrap: 'wrap' }}>
        <div>
          <h3 className="card-title">
            <HelpCircle size={18} color="var(--color-terracotta, #8b3a2b)" />
            <span>Emergency Assistance Requests</span>
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #6b5a52)' }}>
            Review citizen requests, dispatch response teams, and confirm resolution
          </span>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            style={{ width: 'auto', padding: '4px 8px', fontSize: '0.82rem' }}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            <option value="evacuation">Evacuation</option>
            <option value="medical">Medical Aid</option>
            <option value="shelter">Shelter Info</option>
            <option value="food_water">Food / Water</option>
            <option value="special_needs">Special Needs</option>
            <option value="other">Other</option>
          </select>

          <select
            className="form-select"
            style={{ width: 'auto', padding: '4px 8px', fontSize: '0.82rem' }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Acknowledged">Acknowledged</option>
            <option value="Dispatched">Dispatched</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Urgency</th>
              <th>Headcount</th>
              <th>Location & Details</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Citizen Confirmation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((req) => {
              const isArrivalConfirmed = req.citizen_verification_status === 'Assistance Arrived';
              const isArrivalNotReceived = req.citizen_verification_status === 'Assistance Not Arrived';
              const isPendingVerification = req.status === 'Dispatched' && !req.citizen_verified_at;

              return (
                <tr key={req.id}>
                  <td>
                    <strong style={{ textTransform: 'capitalize' }}>
                      {req.category.replace('_', ' ')}
                    </strong>
                    <Link
                      to={`/authority/assistance/${req.id}`}
                      style={{ fontSize: '0.72rem', color: '#38bdf8', textDecoration: 'none', display: 'inline-block' }}
                      title="View full request details"
                    >
                      Req #{req.id}
                    </Link>
                  </td>
                  <td>
                    <Badge status={req.urgency_level} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Users size={14} color="#64748b" />
                      <span>{req.headcount} {req.headcount === 1 ? 'person' : 'people'}</span>
                    </div>
                  </td>
                  <td style={{ maxWidth: '240px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                      <MapPin size={14} color="#0284c7" style={{ flexShrink: 0, marginTop: 3 }} />
                      <span style={{ fontSize: '0.85rem' }}>{req.location_description}</span>
                    </div>
                    {req.special_notes && (
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                        Note: {req.special_notes}
                      </div>
                    )}
                    {req.dispatched_unit_notes && (
                      <div style={{ fontSize: '0.78rem', color: '#0284c7', marginTop: 2, fontWeight: 600 }}>
                        Unit: {req.dispatched_unit_notes}
                      </div>
                    )}
                  </td>
                  <td>
                    {req.contact_phone ? (
                      <a
                        href={`tel:${req.contact_phone}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}
                      >
                        <Phone size={13} />
                        <span>{req.contact_phone}</span>
                      </a>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Not provided</span>
                    )}
                    {req.user_full_name && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {req.user_full_name}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge status={req.status} />
                    {req.acknowledged_at && req.status === 'Acknowledged' && (
                      <div style={{ fontSize: '0.7rem', color: '#0369a1', marginTop: 2 }}>
                        Ack: {new Date(req.acknowledged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {req.dispatched_at && (
                      <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 2 }}>
                        Dispatched: {new Date(req.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </td>

                  {/* Citizen Verification Evidence */}
                  <td>
                    {isArrivalConfirmed && (
                      <div>
                        <span
                          className="badge badge-stable"
                          style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <CheckCircle2 size={12} />
                          <span>Assistance Arrived</span>
                        </span>
                        {req.citizen_verified_at && (
                          <div style={{ fontSize: '0.7rem', color: '#166534', marginTop: 2 }}>
                            Verified: {new Date(req.citizen_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        {req.citizen_verification_notes && (
                          <div style={{ fontSize: '0.72rem', color: '#14532d', marginTop: 2, fontStyle: 'italic' }}>
                            "{req.citizen_verification_notes}"
                          </div>
                        )}
                      </div>
                    )}

                    {isArrivalNotReceived && (
                      <div>
                        <span
                          className="badge badge-extreme"
                          style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <AlertTriangle size={12} />
                          <span>Assistance Not Arrived</span>
                        </span>
                        <div style={{ fontSize: '0.7rem', color: '#991b1b', marginTop: 2, fontWeight: 600 }}>
                          Citizen reports assistance has not arrived
                        </div>
                        {req.citizen_verification_notes && (
                          <div style={{ fontSize: '0.72rem', color: '#7f1d1d', marginTop: 2, fontStyle: 'italic' }}>
                            "{req.citizen_verification_notes}"
                          </div>
                        )}
                      </div>
                    )}

                    {isPendingVerification && (
                      <div>
                        <span
                          className="badge"
                          style={{
                            background: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fde68a',
                            fontSize: '0.72rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Clock size={12} />
                          <span>Awaiting Citizen Confirmation</span>
                        </span>
                        <div style={{ fontSize: '0.7rem', color: '#78350f', marginTop: 2 }}>
                          Prompt sent to citizen
                        </div>
                      </div>
                    )}

                    {req.status === 'Resolved' && !isArrivalConfirmed && !isArrivalNotReceived && (
                      <span className="badge badge-stable" style={{ fontSize: '0.72rem' }}>
                        Resolved
                      </span>
                    )}

                    {(req.status === 'Pending' || req.status === 'Acknowledged') && (
                      <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                        Not dispatched yet
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {req.status === 'Pending' && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                          onClick={() => handleAcknowledgeClick(req.id)}
                          title="Acknowledge Request and notify citizen"
                          aria-label="Acknowledge Request"
                        >
                          <Check size={12} />
                          <span>Acknowledge</span>
                        </button>
                      )}

                      {(req.status === 'Pending' || req.status === 'Acknowledged') && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                          onClick={() => {
                            setDispatchModalReq(req);
                            setDispatchUnit('NDRF Quick Response Team 2');
                          }}
                          title="Dispatch Response Team"
                          aria-label="Dispatch Response Team"
                        >
                          <Truck size={12} />
                          <span>Dispatch</span>
                        </button>
                      )}

                      {req.status === 'Dispatched' && (
                        <button
                          type="button"
                          className={`btn ${isArrivalConfirmed ? 'btn-success' : 'btn-outline'} btn-sm`}
                          style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                          onClick={() => {
                            setResolveModalReq(req);
                            setResolutionNotes(
                              isArrivalConfirmed
                                ? 'Rescue unit arrival confirmed by citizen. Assistance operation concluded successfully.'
                                : isArrivalNotReceived
                                ? 'Additional operational response deployed and situation resolved.'
                                : 'Assistance operation completed by dispatched unit.'
                            );
                          }}
                          title="Review and resolve request"
                          aria-label="Review and resolve request"
                        >
                          <CheckCircle2 size={12} />
                          <span>Resolve</span>
                        </button>
                      )}

                      {req.status === 'Resolved' && (
                        <span style={{ fontSize: '0.75rem', color: '#166534', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CheckCircle2 size={13} color="#16a34a" />
                          <span>Closed</span>
                        </span>
                      )}
                      <Link
                        to={`/authority/assistance/${req.id}`}
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                        title="View Full Assistance Request Details"
                        aria-label={`View Details for Request #${req.id}`}
                      >
                        <Eye size={12} />
                        <span>Details</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* DISPATCH MODAL */}
      <Modal
        isOpen={!!dispatchModalReq}
        onClose={() => setDispatchModalReq(null)}
        title="Dispatch Team"
      >
        {dispatchModalReq && (
          <form onSubmit={handleDispatchSubmit}>
            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ fontSize: '0.92rem', textTransform: 'capitalize' }}>
                  {dispatchModalReq.category.replace('_', ' ')} Assistance (Headcount: {dispatchModalReq.headcount})
                </strong>
                <Badge status={dispatchModalReq.urgency_level} />
              </div>
              <div style={{ fontSize: '0.84rem', color: '#475569' }}>
                <MapPin size={13} style={{ display: 'inline', marginRight: 4 }} />
                {dispatchModalReq.location_description}
              </div>
              {dispatchModalReq.contact_phone && (
                <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 3 }}>
                  <Phone size={13} style={{ display: 'inline', marginRight: 4 }} />
                  {dispatchModalReq.contact_phone}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Response Unit or Team Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. NDRF Quick Response Team 2 / Fire & Rescue Unit 4"
                value={dispatchUnit}
                onChange={(e) => setDispatchUnit(e.target.value)}
                required
              />
              <span className="form-hint">
                Status will change to Dispatched and the citizen will be prompted to confirm when help arrives.
              </span>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setDispatchModalReq(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!dispatchUnit.trim()}
              >
                <Truck size={14} />
                <span>Dispatch Team</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* RESOLVE EVIDENCE REVIEW MODAL */}
      <Modal
        isOpen={!!resolveModalReq}
        onClose={() => setResolveModalReq(null)}
        title="Resolve Assistance Request"
      >
        {resolveModalReq && (
          <form onSubmit={handleResolveSubmit}>
            {/* Citizen Verification Evidence Summary */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.92rem', color: '#ffffff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <FileCheck size={16} color="#38bdf8" />
                <span>Citizen Verification Status</span>
              </h4>

              {resolveModalReq.citizen_verification_status === 'Assistance Arrived' ? (
                <div style={{ background: 'rgba(10, 35, 20, 0.85)', border: '1px solid rgba(34, 197, 94, 0.35)', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80', fontWeight: 700, fontSize: '0.88rem' }}>
                    <CheckCircle2 size={16} color="#4ade80" />
                    <span>Citizen Confirmed: Assistance Arrived</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#bbf7d0', margin: '4px 0 0 0' }}>
                    Verified on {new Date(resolveModalReq.citizen_verified_at || Date.now()).toLocaleString()}
                    {resolveModalReq.citizen_verification_notes ? ` • Note: "${resolveModalReq.citizen_verification_notes}"` : ''}
                  </p>
                </div>
              ) : resolveModalReq.citizen_verification_status === 'Assistance Not Arrived' ? (
                <div style={{ background: 'rgba(45, 15, 20, 0.85)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fca5a5', fontWeight: 700, fontSize: '0.88rem' }}>
                    <AlertTriangle size={16} color="#f87171" />
                    <span>Citizen Feedback: Assistance Has NOT Reached Location</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#fecaca', margin: '4px 0 0 0' }}>
                    Reported on {new Date(resolveModalReq.citizen_verified_at || Date.now()).toLocaleString()}
                    {resolveModalReq.citizen_verification_notes ? ` • Feedback: "${resolveModalReq.citizen_verification_notes}"` : ''}
                  </p>
                  <span style={{ fontSize: '0.78rem', color: '#f87171', display: 'block', marginTop: 4 }}>
                    ⚠️ Only resolve if alternative operational measures have successfully reached the citizen.
                  </span>
                </div>
              ) : (
                <div style={{ background: 'rgba(45, 25, 10, 0.85)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fbbf24', fontWeight: 600, fontSize: '0.85rem' }}>
                    <Clock size={15} color="#fbbf24" />
                    <span>Citizen Confirmation Pending</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#fde68a', margin: '3px 0 0 0' }}>
                    Dispatched unit: <strong style={{ color: '#ffffff' }}>{resolveModalReq.dispatched_unit_notes || 'Response Team'}</strong>
                  </p>
                </div>
              )}
            </div>

            {/* Request Summary */}
            <div style={{ background: 'rgba(20, 11, 42, 0.78)', padding: '0.75rem 0.85rem', borderRadius: '6px', border: '1px solid rgba(168, 85, 247, 0.3)', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              <div><strong style={{ color: '#38bdf8' }}>Location:</strong> {resolveModalReq.location_description}</div>
              <div><strong style={{ color: '#38bdf8' }}>Category / Headcount:</strong> {resolveModalReq.category} ({resolveModalReq.headcount} people)</div>
              {resolveModalReq.contact_phone && <div><strong style={{ color: '#38bdf8' }}>Contact Phone:</strong> {resolveModalReq.contact_phone}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Resolution Notes</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Add any notes about how this request was resolved..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setResolveModalReq(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success"
              >
                <CheckCircle2 size={14} />
                <span>Mark Resolved</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
