import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Modal — scrollable dialog with a fixed header and optional fixed action footer.
 *
 * Props:
 *   isOpen    — whether the modal is visible
 *   onClose   — called when Escape is pressed or backdrop is clicked
 *   title     — heading text in the pinned header
 *   children  — scrollable body content
 *   actions   — optional node rendered in a pinned footer bar (Cancel / Save buttons)
 *   size      — 'md' (600px max-width) | 'lg' (760px max-width)
 *   hideClose — suppress the × button
 */
export function Modal({ isOpen, onClose, title, children, actions, size = 'md', hideClose = false }) {
  // Lock page scroll while modal is visible
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);

  // Keyboard dismiss
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
        className={`modal-content${size === 'lg' ? ' modal-content-lg' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Pinned header ─────────────────────────────────────────── */}
        <div
          className="modal-header"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <h3 className="modal-title" style={{ margin: 0 }}>{title}</h3>
          {!hideClose && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── Scrollable body ───────────────────────────────────────── */}
        <div className="modal-body">{children}</div>

        {/* ── Pinned action footer (optional) ──────────────────────── */}
        {actions && (
          <div className="modal-actions">{actions}</div>
        )}
      </div>
    </div>
  );
}
