import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Modal — scrollable dialog with a fixed header and optional fixed action footer.
 * Rendered via createPortal to document.body to prevent layout clipping and
 * stacking context occlusion by parent containers or page footers.
 *
 * Props:
 *   isOpen            — whether the modal is visible
 *   onClose           — called when Escape is pressed or backdrop is clicked
 *   title             — heading text in the pinned header
 *   children          — scrollable body content
 *   actions           — optional node rendered in a pinned footer bar (Cancel / Save buttons)
 *   size              — 'md' (600px max-width) | 'lg' (760px max-width)
 *   hideClose         — suppress the × button
 *   overlayClassName  — additional class names for overlay backdrop
 *   contentClassName  — additional class names for modal content dialog
 *   headerClassName   — additional class names for header
 *   bodyClassName     — additional class names for body
 *   actionsClassName  — additional class names for actions bar
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  size = 'md',
  hideClose = false,
  overlayClassName = '',
  contentClassName = '',
  headerClassName = '',
  bodyClassName = '',
  actionsClassName = ''
}) {
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

  const modalNode = (
    <div
      className={`modal-overlay${overlayClassName ? ` ${overlayClassName}` : ''}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-content${size === 'lg' ? ' modal-content-lg' : ''}${contentClassName ? ` ${contentClassName}` : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Pinned header ─────────────────────────────────────────── */}
        <div
          className={`modal-header${headerClassName ? ` ${headerClassName}` : ''}`}
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
        <div className={`modal-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>

        {/* ── Pinned action footer (optional) ──────────────────────── */}
        {actions && (
          <div className={`modal-actions${actionsClassName ? ` ${actionsClassName}` : ''}`}>{actions}</div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}

