import React from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ text = 'Loading...', fullPage = false }) {
  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', gap: '0.75rem' }}>
      <Loader2 size={32} color="#0284c7" className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>{text}</span>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  if (fullPage) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {content}
      </div>
    );
  }

  return content;
}
