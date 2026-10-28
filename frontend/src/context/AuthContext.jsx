import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getSessionToken, setSessionToken, clearSessionToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getSessionToken();
    if (token) {
      api.getProfile()
        .then((userData) => setUser(userData))
        .catch(() => {
          clearSessionToken();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await api.login({ email, password });
    setSessionToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const register = async (userData) => {
    const data = await api.register(userData);
    setSessionToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    clearSessionToken();
    setUser(null);
  };

  // Re-fetches the authenticated user's profile from the backend and updates
  // the context. Call this after any profile update (location, language, etc.)
  // to avoid a hard page reload while still reflecting the persisted values.
  const refreshUser = async () => {
    try {
      const userData = await api.getProfile();
      setUser(userData);
      return userData;
    } catch (err) {
      console.warn('Failed to refresh user profile:', err);
      return null;
    }
  };

  const isAuthority = user?.role === 'authority' || user?.role === 'administrator';
  const isAdmin = user?.role === 'administrator';
  const isCitizen = user?.role === 'citizen';

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, isAuthority, isAdmin, isCitizen }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
