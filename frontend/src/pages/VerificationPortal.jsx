import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useWebSocket } from '../context/WebSocketContext';
import { BackButton } from '../components/common/BackButton';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import {
  CheckCircle, AlertTriangle, PlusCircle, Shield, ShieldCheck,
  ShieldAlert, Clock, Eye, MessageSquare, Send, Check, Sparkles
} from 'lucide-react';

export function VerificationPortal() {
  const { user, isAuthority } = useAuth();
  const { addToast } = useNotification();
  const { subscribe } = useWebSocket();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Submit Modal
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitForm, setSubmitForm] = useState({
    source_platform: 'Social Media',
    claim_title: '',
    claim_content: '',
    reported_location: ''
  });

  // Review / Clarification Modal (Authority)
  const [reviewingReport, setReviewingReport] = useState(null);
  const [clarificationHeadline, setClarificationHeadline] = useState('');
  const [clarificationText, setClarificationText] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  // Evidence / RAG Analysis Modal
  const [evidenceReport, setEvidenceReport] = useState(null);
  const [ragAnalysis, setRagAnalysis] = useState(null);
  const [ragLoading, setRagLoading] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      const data = await api.getVerificationReports();
      setReports(data || []);
    } catch (err) {
      console.error('Failed to load verification feed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
    const unsubSub = subscribe('VERIFICATION_REPORT_SUBMITTED', () => loadReports());
    const unsubUpd = subscribe('VERIFICATION_REPORT_UPDATED', () => loadReports());
    const unsubClar = subscribe('OFFICIAL_CLARIFICATION_PUBLISHED', () => loadReports());
    return () => {
      unsubSub();
      unsubUpd();
      unsubClar();
    };
  }, [loadReports, subscribe]);

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!submitForm.claim_title || !submitForm.claim_content) {
      addToast('Please provide claim title and details.', 'warning');
      return;
    }

    setModalLoading(true);
    try {
      await api.submitVerificationReport(submitForm);
      setIsSubmitModalOpen(false);
      setSubmitForm({ source_platform: 'Social Media', claim_title: '', claim_content: '', reported_location: '' });
      addToast('Information report submitted for authorized fact-checking.', 'success');
      loadReports();
    } catch (err) {
      addToast(err.message || 'Submission failed.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  const handleQuickStatusChange = async (reportId, newStatus) => {
    try {
      await api.reviewVerificationReport(reportId, { status: newStatus });
      addToast(`Report marked as "${newStatus}".`, 'success');
      loadReports();
    } catch (err) {
      addToast(err.message || 'Failed to update status.', 'danger');
    }
  };

  const handleOpenEvidence = async (report) => {
    setEvidenceReport(report);
    setRagLoading(true);
    setRagAnalysis(null);
    try {
      const data = await api.getReportRagAnalysis(report.id);
      setRagAnalysis(data?.rag_analysis || data);
    } catch (err) {
      console.warn('RAG analysis retrieval failed:', err);
      setRagAnalysis({ error: 'Ground truth RAG service unavailable or no active warnings.' });
    } finally {
      setRagLoading(false);
    }
  };

  const handlePublishClarification = async (e) => {
    e.preventDefault();
    if (!clarificationHeadline.trim() || !clarificationText.trim()) {
      addToast('Please provide clarification headline and explanation.', 'warning');
      return;
    }

    setModalLoading(true);
    try {
      await api.publishClarification({
        report_id: reviewingReport.id,
        clarification_headline: clarificationHeadline,
        official_clarification_text: clarificationText,
        notify_affected_zones: true
      });
      setReviewingReport(null);
      addToast('Official clarification published to public feed!', 'success');
      loadReports();
    } catch (err) {
      addToast(err.message || 'Publishing failed.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading verification feed..." fullPage />;
  }

  return (
    <div className="verification-portal">
      <BackButton fallbackPath="/" label="Back to Home" />

      {/* Header */}
      <div className="page-header-block" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Fact-Checking & Rumor Verification</h1>
          <p className="page-subtitle">
            Verify unconfirmed rumors, check official updates, and prevent disaster misinformation
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsSubmitModalOpen(true)}
        >
          <PlusCircle size={16} />
          <span>Report a Rumor</span>
        </button>
      </div>

      {/* Reports Feed */}
      {reports.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={36} color="var(--status-stable)" />}
          title="No Reports Logged"
          description="There are currently no reported rumors or unverified claims in the verification registry."
          actionText="Report a Rumor"
          onAction={() => setIsSubmitModalOpen(true)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {reports.map((rep) => (
            <div
              key={rep.id}
              className="card"
              style={{
                borderLeft: rep.status === 'Verified by Authority'
                  ? '4px solid var(--status-stable)'
                  : rep.status === 'Conflicting with Official Information'
                  ? '4px solid var(--status-extreme)'
                  : '4px solid var(--status-moderate)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Badge status={rep.status} />
                  <span className="card-item-subtext" style={{ fontWeight: 600 }}>
                    Source: {rep.source_platform} • {new Date(rep.created_at).toLocaleDateString()}
                  </span>
                  {rep.reported_location && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-espresso-dark)', background: '#ede5da', border: '1px solid #dcd3c8', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                      📍 {rep.reported_location}
                    </span>
                  )}
                </div>

                {/* Separate Authority Actions */}
                {isAuthority && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      title="View ground truth evidence and RAG knowledge match"
                      onClick={() => handleOpenEvidence(rep)}
                      style={{ fontSize: '0.78rem' }}
                    >
                      <Eye size={13} color="var(--color-terracotta)" />
                      <span>View Evidence</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm"
                      title="Mark report as officially verified"
                      onClick={() => handleQuickStatusChange(rep.id, 'Verified by Authority')}
                      style={{
                        background: rep.status === 'Verified by Authority' ? '#dcfce7' : '#f0fdf4',
                        color: '#15803d',
                        borderColor: '#86efac',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}
                    >
                      <ShieldCheck size={13} />
                      <span>Mark Verified</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm"
                      title="Flag report as conflicting with official alerts"
                      onClick={() => handleQuickStatusChange(rep.id, 'Conflicting with Official Information')}
                      style={{
                        background: rep.status === 'Conflicting with Official Information' ? '#fee2e2' : '#fef2f2',
                        color: '#b91c1c',
                        borderColor: '#fca5a5',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}
                    >
                      <ShieldAlert size={13} />
                      <span>Mark Conflicting</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm"
                      title="Keep report under active investigation"
                      onClick={() => handleQuickStatusChange(rep.id, 'Under Review')}
                      style={{
                        background: rep.status === 'Under Review' ? '#fef3c7' : '#fffbeb',
                        color: '#b45309',
                        borderColor: '#fcd34d',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}
                    >
                      <Clock size={13} />
                      <span>Keep Under Review</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      title="Publish official public clarification note"
                      onClick={() => {
                        setReviewingReport(rep);
                        setClarificationHeadline(`Official Clarification: ${rep.claim_title}`);
                        setClarificationText(rep.official_clarification || '');
                      }}
                      style={{ fontSize: '0.78rem' }}
                    >
                      <MessageSquare size={13} />
                      <span>Add Review Note</span>
                    </button>
                  </div>
                )}
              </div>

              <h3 className="card-item-title">
                {rep.claim_title}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
                {rep.claim_content}
              </p>

              {/* Official Clarification Box if published */}
              {rep.official_clarification && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.85rem 1rem', borderRadius: '8px', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>
                    <CheckCircle size={15} color="#16a34a" />
                    <span>Official Clarification:</span>
                  </div>
                  <p style={{ fontSize: '0.88rem', color: '#15803d', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {rep.official_clarification}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Submit Report Modal */}
      <Modal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        title="Report Unverified Information"
      >
        <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            Report rumors or unverified claims circulating on social media, messaging apps, or word-of-mouth.
          </p>

          <div className="form-group">
            <label className="form-label">Platform / Source</label>
            <select
              className="form-select"
              value={submitForm.source_platform}
              onChange={(e) => setSubmitForm({ ...submitForm, source_platform: e.target.value })}
            >
              <option value="WhatsApp Forward">WhatsApp Forward</option>
              <option value="Social Media (X/Facebook/Instagram)">Social Media (X/Facebook/Instagram)</option>
              <option value="Word of Mouth">Word of Mouth</option>
              <option value="Unofficial SMS Alert">Unofficial SMS Alert</option>
              <option value="News Media">News Media</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Claim Headline *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Rumor claiming water supply in East Sector is contaminated"
              value={submitForm.claim_title}
              onChange={(e) => setSubmitForm({ ...submitForm, claim_title: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Reported Location / Locality</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Sector 4, Riverside Road"
              value={submitForm.reported_location}
              onChange={(e) => setSubmitForm({ ...submitForm, reported_location: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Details / Message Content *</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Paste or describe the rumor message..."
              value={submitForm.claim_content}
              onChange={(e) => setSubmitForm({ ...submitForm, claim_content: e.target.value })}
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setIsSubmitModalOpen(false)} disabled={modalLoading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={modalLoading}>
              {modalLoading ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Evidence / RAG Analysis Modal */}
      <Modal
        isOpen={!!evidenceReport}
        onClose={() => setEvidenceReport(null)}
        title="Claim Evidence & Knowledge Base Analysis"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#fdfbf7', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ede5da' }}>
            <h4 style={{ fontSize: '0.95rem', color: 'var(--color-espresso-dark)', marginBottom: '0.25rem', fontWeight: 700 }}>{evidenceReport?.claim_title}</h4>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>{evidenceReport?.claim_content}</p>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Source: <strong style={{ color: 'var(--color-terracotta)' }}>{evidenceReport?.source_platform}</strong> &nbsp;•&nbsp; Location: <strong style={{ color: 'var(--color-terracotta)' }}>{evidenceReport?.reported_location || 'Not specified'}</strong>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #ede5da', paddingTop: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
              <Sparkles size={16} color="var(--color-terracotta)" />
              <strong style={{ fontSize: '0.9rem', color: 'var(--color-terracotta)' }}>Ground Truth RAG Analysis</strong>
            </div>

            {ragLoading ? (
              <LoadingSpinner text="Querying active warnings & SOP knowledge base..." />
            ) : ragAnalysis ? (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', fontSize: '0.86rem', color: '#0f172a', lineHeight: 1.6 }}>
                {typeof ragAnalysis === 'string' ? (
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{ragAnalysis}</p>
                ) : (
                  <div>
                    {ragAnalysis.summary && <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: '#0369a1' }}>Summary:</strong> {ragAnalysis.summary}</p>}
                    {ragAnalysis.conflict_assessment && (
                      <p style={{ marginBottom: '0.5rem' }}>
                        <strong style={{ color: '#0369a1' }}>Assessment:</strong> {ragAnalysis.conflict_assessment}
                      </p>
                    )}
                    {ragAnalysis.matched_sources && Array.isArray(ragAnalysis.matched_sources) && ragAnalysis.matched_sources.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <strong style={{ color: '#0369a1' }}>Authoritative References:</strong>
                        <ul style={{ paddingLeft: '1.25rem', marginTop: '0.25rem' }}>
                          {ragAnalysis.matched_sources.map((src, idx) => (
                            <li key={idx}>{src}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!ragAnalysis.summary && !ragAnalysis.conflict_assessment && (
                      <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(ragAnalysis, null, 2)}</pre>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No automated analysis available.</p>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setEvidenceReport(null)}>
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Authority Clarification Publisher / Note Modal */}
      <Modal
        isOpen={!!reviewingReport}
        onClose={() => setReviewingReport(null)}
        title="Add Review Note / Publish Official Clarification"
      >
        <form onSubmit={handlePublishClarification} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#fdfbf7', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ede5da' }}>
            <strong style={{ fontSize: '0.85rem', color: 'var(--color-terracotta)' }}>Claim Under Review:</strong>
            <p style={{ fontSize: '0.88rem', color: 'var(--color-espresso-dark)', marginTop: 2, marginBottom: 0, fontWeight: 600 }}>{reviewingReport?.claim_title}</p>
          </div>

          <div className="form-group">
            <label className="form-label">Clarification Headline *</label>
            <input
              type="text"
              className="form-input"
              value={clarificationHeadline}
              onChange={(e) => setClarificationHeadline(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Official Clarification Text *</label>
            <textarea
              className="form-textarea"
              rows={4}
              placeholder="State the verified facts clearly..."
              value={clarificationText}
              onChange={(e) => setClarificationText(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => setReviewingReport(null)} disabled={modalLoading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-success" disabled={modalLoading}>
              <Check size={16} />
              <span>Publish Clarification</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
