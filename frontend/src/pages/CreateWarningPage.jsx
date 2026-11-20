import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WarningCreator } from '../components/authority/WarningCreator';
import { HumanApprovalModal } from '../components/authority/HumanApprovalModal';
import { BackButton } from '../components/common/BackButton';
import { useNotification } from '../context/NotificationContext';
import { api } from '../services/api';

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
    <div className="create-warning-container">
      {/* Top Back Navigation */}
      <div className="create-warning-back-nav">
        <BackButton fallbackPath="/authority" label="Back to Authority Dashboard" />
      </div>

      {/* Compact Header Section matching required design */}
      <div className="create-warning-header-section">
        <div className="create-warning-header-inner">
          <div className="create-warning-accent-bar" aria-hidden="true" />
          <div className="create-warning-title-block">
            <h1 className="create-warning-heading">
              Create Official Disaster Warning
            </h1>
            <p className="create-warning-description">
              Define disaster parameters, establish targeted response boundaries, and generate verified emergency broadcasts.
            </p>
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
