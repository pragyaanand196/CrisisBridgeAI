import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WarningCreator } from '../components/authority/WarningCreator';
import { HumanApprovalModal } from '../components/authority/HumanApprovalModal';
import { BackButton } from '../components/common/BackButton';
import { useNotification } from '../context/NotificationContext';
import { api } from '../services/api';
import { AlertTriangle, ShieldCheck, Radio } from 'lucide-react';

export function CreateWarningPage() {
  const navigate = useNavigate();
  const { addToast } = useNotification();
  const [createdWarning, setCreatedWarning] = useState(null);
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const handleWarningCreated = (newWarning) => {
    setCreatedWarning(newWarning);
    setIsApprovalOpen(true);
  };

  const handleApproveAIMessage = async (actionData) => {
    if (!createdWarning) return;
    setModalLoading(true);
    try {
      const approved = await api.approveAIMessage(createdWarning.id, actionData);
      setIsApprovalOpen(false);
      addToast(
        `AI Citizen Communication officially approved for Warning #${approved.identifier}. Ready for distribution.`,
        'success'
      );
      navigate(`/warnings/${approved.id}`);
    } catch (err) {
      addToast(err.message || 'Approval failed.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  const handleRegenerateAI = async () => {
    if (!createdWarning) return;
    setModalLoading(true);
    try {
      const updated = await api.regenerateAIMessage(createdWarning.id);
      setCreatedWarning(updated);
      addToast('Safety guidance regenerated and grounded with knowledge base.', 'success');
    } catch (err) {
      addToast(err.message || 'Regeneration failed.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  const handleModalClose = () => {
    setIsApprovalOpen(false);
    addToast('Warning draft created with "Under Review" status.', 'info');
    navigate('/authority');
  };

  return (
    <div className="create-warning-container" style={{ maxWidth: '1080px', width: '100%', margin: '0 auto', paddingBottom: '3.5rem' }}>
      {/* Top Back Navigation */}
      <div style={{ marginBottom: '1.25rem' }}>
        <BackButton fallbackPath="/authority" label="Back to Authority Dashboard" />
      </div>

      {/* Dedicated Page Header: Unified Warm Surface Banner with Restrained Terracotta Accent */}
      <div
        className="card warning-banner-card"
        style={{
          marginBottom: '1.75rem',
          padding: '1.75rem 2rem',
          background: '#ffffff',
          border: '1px solid var(--border-light, #ece3d8)',
          borderLeft: '4px solid var(--color-terracotta, #8b3a2b)',
          boxShadow: 'var(--shadow-card, 0 2px 10px rgba(44, 26, 20, 0.04))',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem', flex: '1 1 520px', minWidth: 0 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '14px',
                background: 'var(--color-terracotta-light, #faf0eb)',
                border: '1px solid var(--color-terracotta-border, #ead5cb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-terracotta, #8b3a2b)',
                boxShadow: '0 2px 8px rgba(139, 58, 43, 0.12)',
                flexShrink: 0
              }}
            >
              <AlertTriangle size={28} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--color-espresso-dark, #22120c)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                Create Official Disaster Warning
              </h1>
              <p style={{ fontSize: '0.92rem', color: 'var(--color-warm-brown, #5c4a42)', margin: '6px 0 0 0', lineHeight: 1.5, fontWeight: 500 }}>
                Define disaster parameters, establish targeted response boundaries, and generate verified emergency broadcasts.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '0.4rem 0.85rem',
                borderRadius: '9999px',
                background: 'var(--status-extreme-bg, #fee2e2)',
                color: 'var(--status-extreme, #b91c1c)',
                border: '1px solid var(--status-extreme-border, #fca5a5)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <Radio size={14} style={{ display: 'inline', color: 'var(--status-extreme, #b91c1c)' }} />
              Live Broadcasting Protocol
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '0.4rem 0.85rem',
                borderRadius: '9999px',
                background: 'var(--status-stable-bg, #dcfce7)',
                color: 'var(--status-stable, #15803d)',
                border: '1px solid var(--status-stable-border, #86efac)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <ShieldCheck size={14} style={{ display: 'inline', color: 'var(--status-stable, #15803d)' }} />
              Authorized Access
            </span>
          </div>
        </div>
      </div>

      {/* Standalone Warning Creator Form Component */}
      <WarningCreator
        onWarningCreated={handleWarningCreated}
        onCancel={() => navigate('/authority')}
      />

      {/* Human Authority Review & AI Approval Modal */}
      {createdWarning && (
        <HumanApprovalModal
          isOpen={isApprovalOpen}
          onClose={handleModalClose}
          warning={createdWarning}
          onApprove={handleApproveAIMessage}
          onRegenerate={handleRegenerateAI}
          loading={modalLoading}
        />
      )}
    </div>
  );
}
export default CreateWarningPage;
