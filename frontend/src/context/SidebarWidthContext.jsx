/**
 * SidebarWidthContext.jsx
 *
 * Provides shared sidebar width state across the authenticated layout.
 * - Persists user preference to localStorage
 * - Validates restored width against MIN/MAX before applying
 * - Exposes width, collapsed state, and setter helpers
 * - Only active on >=1024px (desktop); mobile drawer ignores width
 */
import React, { createContext, useContext, useState, useCallback } from 'react';


export const SIDEBAR_DEFAULT   = 320;
export const SIDEBAR_COLLAPSED = 68;
export const SIDEBAR_MIN       = 220;
export const SIDEBAR_MAX       = 420;
const STORAGE_KEY = 'crisisbridge_sidebar_width';
const COLLAPSED_KEY = 'crisisbridge_sidebar_collapsed';

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function loadSavedWidth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return SIDEBAR_DEFAULT;
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT;
    return clamp(parsed, SIDEBAR_MIN, SIDEBAR_MAX);
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function loadSavedCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

const SidebarWidthContext = createContext(null);

export function SidebarWidthProvider({ children }) {
  const [width,     setWidthState]    = useState(loadSavedWidth);
  const [collapsed, setCollapsedState] = useState(loadSavedCollapsed);

  const setWidth = useCallback((newWidth) => {
    const w = clamp(newWidth, SIDEBAR_MIN, SIDEBAR_MAX);
    setWidthState(w);
    try { localStorage.setItem(STORAGE_KEY, String(w)); } catch { /* ignore */ }
  }, []);

  const setCollapsed = useCallback((val) => {
    setCollapsedState(val);
    try { localStorage.setItem(COLLAPSED_KEY, String(val)); } catch { /* ignore */ }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT);
    setCollapsed(false);
  }, [setWidth, setCollapsed]);

  const effectiveWidth = collapsed ? SIDEBAR_COLLAPSED : width;

  const value = {
    width,
    setWidth,
    collapsed,
    setCollapsed,
    toggleCollapsed,
    resetWidth,
    effectiveWidth,
    SIDEBAR_COLLAPSED
  };

  return (
    <SidebarWidthContext.Provider value={value}>
      {children}
    </SidebarWidthContext.Provider>
  );
}

export function useSidebarWidth() {
  const ctx = useContext(SidebarWidthContext);
  if (!ctx) throw new Error('useSidebarWidth must be used inside SidebarWidthProvider');
  return ctx;
}

