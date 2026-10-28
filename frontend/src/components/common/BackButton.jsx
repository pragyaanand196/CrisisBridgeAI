import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function BackButton({ fallbackPath = '/', label = 'Back', hasUnsavedChanges = false, customAction = null }) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (hasUnsavedChanges) {
      const confirmLeave = window.confirm('You have unsaved changes in this form. Are you sure you want to go back?');
      if (!confirmLeave) return;
    }

    if (customAction) {
      customAction();
      return;
    }

    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  };

  return (
    <button
      type="button"
      className="back-btn"
      onClick={handleBack}
      aria-label={`Go back: ${label}`}
    >
      <ArrowLeft size={16} />
      <span>{label}</span>
    </button>
  );
}
