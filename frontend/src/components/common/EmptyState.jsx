import React from 'react';
import { AlertTriangle, ShieldCheck, CheckCircle2, FileQuestion, HelpCircle, MapPin } from 'lucide-react';

export function EmptyState({ icon, title, description, actionText, onAction, actionLink }) {
  const renderIcon = () => {
    if (icon) return icon;
    if (title.toLowerCase().includes('warning')) return <ShieldCheck size={32} color="var(--color-terracotta)" />;
    if (title.toLowerCase().includes('zone')) return <MapPin size={32} color="var(--color-terracotta)" />;
    if (title.toLowerCase().includes('assistance') || title.toLowerCase().includes('help')) return <HelpCircle size={32} color="var(--color-terracotta)" />;
    if (title.toLowerCase().includes('gap')) return <CheckCircle2 size={32} color="var(--status-stable)" />;
    return <FileQuestion size={32} color="var(--color-terracotta)" />;
  };

  return (
    <div className="empty-state">
      <div className="empty-icon">{renderIcon()}</div>
      <h3 className="empty-title">{title}</h3>
      <p className="empty-desc">{description}</p>
      {actionText && (
        onAction ? (
          <button type="button" className="btn btn-primary" onClick={onAction}>
            {actionText}
          </button>
        ) : actionLink ? (
          <a href={actionLink} className="btn btn-primary">
            {actionText}
          </a>
        ) : null
      )}
    </div>
  );
}
