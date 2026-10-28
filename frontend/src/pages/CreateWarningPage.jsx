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

      {/* Dedicated Page Header: High-Contrast Dark Purple Banner */}
      <div
        className="card warning-banner-card"
        style={{
          marginBottom: '1.75rem',
          padding: '1.75rem 2rem',
          background: 'linear-gradient(135deg, #1b0e36 0%, #2a154a 100%)',
          borderColor: 'rgba(168, 85, 247, 0.45)',
          boxShadow: '0 8px 30px rgba(27, 14, 54, 0.3)',
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
                background: 'rgba(239, 68, 68, 0.22)',
                border: '1.5px solid rgba(248, 113, 113, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fca5a5',
                boxShadow: '0 0 24px rgba(239, 68, 68, 0.35)',
                flexShrink: 0
              }}
            >
              <AlertTriangle size={28} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                Create Official Disaster Warning
              </h1>
              <p style={{ fontSize: '0.92rem', color: '#e0d5f2', margin: '6px 0 0 0', lineHeight: 1.5, fontWeight: 500 }}>
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
                fontWeight: 800,
                padding: '0.4rem 0.85rem',
                borderRadius: '9999px',
                background: 'rgba(220, 38, 38, 0.28)',
                color: '#fecaca',
                border: '1px solid rgba(248, 113, 113, 0.6)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              <Radio size={14} style={{ display: 'inline', color: '#f87171' }} />
              Live Broadcasting Protocol
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                padding: '0.4rem 0.85rem',
                borderRadius: '9999px',
                background: 'rgba(22, 101, 52, 0.38)',
                color: '#bbf7d0',
                border: '1px solid rgba(74, 222, 128, 0.6)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              <ShieldCheck size={14} style={{ display: 'inline', color: '#4ade80' }} />
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
