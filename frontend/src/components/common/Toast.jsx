import React from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export function Toast({ id, message, type = 'info', onClose }) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={18} color="#10b981" />;
      case 'danger':
        return <AlertCircle size={18} color="#ef4444" />;
      case 'warning':
        return <AlertCircle size={18} color="#f59e0b" />;
      default:
        return <Info size={18} color="#38bdf8" />;
    }
  };

  return (
    <div className={`toast toast-${type}`} role="alert">
      <div style={{ flexShrink: 0, marginTop: 2 }}>{getIcon()}</div>
      <div style={{ flex: 1, fontSize: '0.88rem', lineHeight: 1.4 }}>{message}</div>
      <button
        onClick={onClose}
        style={{ color: '#94a3b8', padding: 2, display: 'flex', alignItems: 'center' }}
        aria-label="Close notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
