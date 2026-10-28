import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { ShieldCheck, Sparkles, AlertCircle, Edit3, Check, RefreshCw, XCircle } from 'lucide-react';

export function HumanApprovalModal({
  isOpen,
  onClose,
  warning,
  onApprove,
  onRegenerate,
  loading = false
}) {
  const [editedEn, setEditedEn] = useState(warning?.ai_simplified_en || '');
  const [editedHi, setEditedHi] = useState(warning?.ai_simplified_hi || '');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  React.useEffect(() => {
    if (warning) {
      setEditedEn(warning.ai_simplified_en || '');
      setEditedHi(warning.ai_simplified_hi || '');
    }
  }, [warning]);

  if (!warning) return null;

  const handleApprove = () => {
    onApprove({
      action: isEditing ? 'edit' : 'approve',
      ai_simplified_en: editedEn,
      ai_simplified_hi: editedHi
    });
  };

  const handleReject = () => {
    if (!feedbackNotes) {
      alert('Please specify rejection reason or feedback instructions for regeneration.');
      return;
    }
    onApprove({
      action: 'reject',
      feedback_notes: feedbackNotes
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Review & Approve Warning"
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="#16a34a" />
          <span>
            <strong>Authority Review:</strong> Verify official details, retrieved guidance, and citizen messages before distribution.
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          {/* AREA 1: Official Warning */}
          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>1. Official Warning</strong>
              <span className="badge badge-minor" style={{ fontSize: '0.7rem' }}>Authority Input</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div><strong>Event:</strong> {warning.disaster_type} ({warning.severity} • {warning.urgency})</div>
              <div><strong>Title:</strong> {warning.title}</div>
              <div><strong>Target Region:</strong> {warning.area_name}</div>
              <div style={{ marginTop: '0.4rem' }}>
                <strong>Safety Instructions:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.82rem', background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                  {warning.recommended_instructions}
                </pre>
              </div>
            </div>
          </div>

          {/* AREA 2: Retrieved Safety Guidance */}
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '1rem', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '4px' }}>
              <strong style={{ fontSize: '0.88rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} color="#0284c7" />
                <span>2. Retrieved Safety Guidance</span>
              </strong>
              {warning.rag_grounding_score && (
                <span className="badge badge-stable" style={{ fontSize: '0.7rem', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', fontWeight: 600 }} title="Source Grounding">
                  {warning.rag_grounding_score}
                </span>
              )}
            </div>

            {(() => {
              let sources = [];
              if (warning?.rag_sources_json) {
                try { sources = JSON.parse(warning.rag_sources_json); } catch (e) { sources = []; }
              }
              if (!sources || sources.length === 0) {
                return (
                  <div style={{ fontSize: '0.82rem', color: '#64748b', fontStyle: 'italic', padding: '0.5rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    No external SOP sources retrieved. Warning is based on direct authority input.
                  </div>
                );
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '280px', overflowY: 'auto' }}>
                  {sources.map((s, idx) => {
                    const relevancePct = s.score ? Math.round(s.score * 100) : null;
                    return (
                      <details key={idx} style={{ background: '#ffffff', border: '1px solid #e0f2fe', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.78rem' }}>
                        <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#0369a1', fontWeight: 600 }}>
                          <span>• {s.doc_title || s.source_agency}</span>
                          {relevancePct && (
                            <span style={{ fontSize: '0.68rem', color: '#0284c7', background: '#f0f9ff', padding: '1px 5px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                              {relevancePct}% Match
                            </span>
                          )}
                        </summary>
                        <div style={{ marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.75rem', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: 2 }}>
                            Topic: {s.topic}
                          </div>
                          {s.text?.trim()}
                        </div>
                      </details>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* AREA 3: AI Citizen Message */}
        <div style={{ background: '#ffffff', border: '1px solid var(--color-terracotta-border)', padding: '1rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(139, 58, 43, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={16} color="var(--color-terracotta)" />
              <strong style={{ fontSize: '0.9rem', color: 'var(--color-terracotta)' }}>3. Citizen Message (English & Hindi)</strong>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setIsEditing(!isEditing)}
              style={{ padding: '2px 8px', fontSize: '0.78rem' }}
            >
              <Edit3 size={13} />
              <span>{isEditing ? 'View Mode' : 'Edit Message'}</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.85rem' }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-terracotta)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>English</label>
              {isEditing ? (
                <textarea
                  className="form-textarea"
                  rows={5}
                  value={editedEn}
                  onChange={(e) => setEditedEn(e.target.value)}
                />
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.88rem', background: '#faf8f5', color: 'var(--color-espresso-dark)', padding: '0.75rem 0.9rem', borderRadius: '6px', border: '1px solid var(--border-medium)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                  {editedEn}
                </pre>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-terracotta)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>हिंदी (Hindi)</label>
              {isEditing ? (
                <textarea
                  className="form-textarea"
                  rows={5}
                  value={editedHi}
                  onChange={(e) => setEditedHi(e.target.value)}
                />
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.88rem', background: '#faf8f5', color: 'var(--color-espresso-dark)', padding: '0.75rem 0.9rem', borderRadius: '6px', border: '1px solid var(--border-medium)', margin: '6px 0 0 0', lineHeight: 1.5 }}>
                  {editedHi}
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* Feedback / Rejection option */}
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem' }}>
          <label style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-espresso-base)' }}>Authority Notes / Feedback (Optional):</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Add specific evacuation route notes..."
            value={feedbackNotes}
            onChange={(e) => setFeedbackNotes(e.target.value)}
            style={{ marginTop: '6px' }}
          />
        </div>

        {/* Modal Actions */}
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onRegenerate}
              disabled={loading}
            >
              <RefreshCw size={14} />
              <span>Regenerate</span>
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleReject}
              disabled={loading}
            >
              <XCircle size={14} />
              <span>Reject Draft</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={handleApprove}
              disabled={loading}
            >
              <Check size={16} />
              <span>{isEditing ? 'Save & Approve' : 'Approve for Distribution'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
