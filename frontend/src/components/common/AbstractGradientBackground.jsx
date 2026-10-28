import React from 'react';

/**
 * AbstractGradientBackground
 *
 * Provides a shared, atmospheric, warm disaster-management background layer.
 * Warm cream, soft diffuse lighting, non-intrusive, fully pointer-events: none.
 */
export function AbstractGradientBackground() {
  return (
    <div className="abstract-gradient-bg" aria-hidden="true">
      {/* Warm ambient lighting canvas */}
      <div className="ambient-mesh-canvas" />
      <div className="ambient-glass-overlay" />
    </div>
  );
}

export default AbstractGradientBackground;
