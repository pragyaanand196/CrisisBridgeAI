import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({ isOpen, onClose, title, children, size = 'md', hideClose = false }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !hideClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, hideClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`modal-content ${size === 'lg' ? 'modal-content-lg' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{title}</h3>
          {!hideClose && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
