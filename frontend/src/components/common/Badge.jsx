import React from 'react';

export function Badge({ status, label, className = '' }) {
  const normalized = (status || label || '').toLowerCase();

  let badgeClass = 'badge-draft';
  if (normalized.includes('extreme') || normalized.includes('critical')) {
    badgeClass = 'badge-extreme';
  } else if (normalized.includes('severe') || normalized.includes('danger') || normalized.includes('failure')) {
    badgeClass = 'badge-severe';
  } else if (normalized.includes('moderate') || normalized.includes('attention') || normalized.includes('warning')) {
    badgeClass = 'badge-moderate';
  } else if (normalized.includes('minor') || normalized.includes('info') || normalized.includes('advisory')) {
    badgeClass = 'badge-minor';
  } else if (normalized.includes('stable') || normalized.includes('approved') || normalized.includes('active') || normalized.includes('safe') || normalized.includes('resolved') || normalized.includes('verified')) {
    badgeClass = 'badge-stable';
  } else if (normalized.includes('gap')) {
    badgeClass = 'badge-gap';
  } else if (normalized.includes('surge')) {
    badgeClass = 'badge-surge';
  }

  return (
    <span className={`badge ${badgeClass} ${className}`}>
      <span className="badge-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block', marginRight: 4 }}></span>
      {label || status}
    </span>
  );
}
