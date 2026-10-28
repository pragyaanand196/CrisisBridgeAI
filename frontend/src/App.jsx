import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { Shield } from 'lucide-react';
import { SidebarWidthProvider, useSidebarWidth } from './context/SidebarWidthContext';


// Components
import { Sidebar } from './components/common/Sidebar';
import { TopHeader } from './components/common/TopHeader';
import { Footer } from './components/common/Footer';
import { AbstractGradientBackground } from './components/common/AbstractGradientBackground';

// Pages
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { CitizenDashboard } from './pages/CitizenDashboard';
import { AuthorityDashboard } from './pages/AuthorityDashboard';
import { CreateWarningPage } from './pages/CreateWarningPage';
import { AuthorityWarningDetail } from './pages/AuthorityWarningDetail';
import { AssistanceRequestDetail } from './pages/AssistanceRequestDetail';
import { ResponseZoneDetail } from './pages/ResponseZoneDetail';
import { VerificationPortal } from './pages/VerificationPortal';
import { ResourcesPage } from './pages/ResourcesPage';
import { PostDisasterReports } from './pages/PostDisasterReports';
import { ReportDetail } from './pages/ReportDetail';
import { AdminDashboard } from './pages/AdminDashboard';
import { NotFoundPage } from './pages/NotFoundPage';

// Styles
import './styles/index.css';
import './styles/components.css';
import './styles/pages.css';

/**
 * Inner layout that consumes sidebar width from context to set the CSS variable.
 */
function AuthenticatedLayoutInner({ children }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const { effectiveWidth, collapsed } = useSidebarWidth();
  const location = useLocation();
  const isAuthorityDashboard = location.pathname === '/authority';
  const isCitizenDashboard = location.pathname === '/citizen';

  return (
    <div
      className={`app-layout has-sidebar${collapsed ? ' sidebar-is-collapsed' : ''}${isCitizenDashboard ? ' app-layout--citizen' : ''}`}
      style={{ '--sidebar-width': `${effectiveWidth}px` }}
    >
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main-wrapper">
        {!isAuthorityDashboard && !isCitizenDashboard && (
          <TopHeader onOpenSidebar={() => setSidebarOpen(true)} isSidebarOpen={sidebarOpen} />
        )}
        <main className={`main-content${isCitizenDashboard ? ' main-content--citizen' : ''}`}>
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}

/**
 * Authenticated Layout shell: wraps with SidebarWidthProvider so that
 * Sidebar and AuthenticatedLayoutInner share the same width state.
 */
function AuthenticatedLayout({ children }) {
  return (
    <SidebarWidthProvider>
      <AuthenticatedLayoutInner>{children}</AuthenticatedLayoutInner>
    </SidebarWidthProvider>
  );
}

/**
 * Protected Route guard enforcing session presence and role boundaries.
 */
function ProtectedRoute({ children, requireRole = null }) {
  const { user, loading, isAuthority, isCitizen, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#cbd5e1' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'var(--gradient-primary)', color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 0 24px rgba(79, 70, 229, 0.5)' }}>
            <Shield size={30} />
          </div>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>Verifying secure session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireRole === 'citizen' && !isCitizen) {
    return <Navigate to="/authority" replace state={{ roleNotice: 'This page is available for citizen accounts.' }} />;
  }

  if (requireRole === 'authority' && !isAuthority) {
    return <Navigate to="/citizen" replace state={{ roleNotice: 'This page is available for authority accounts.' }} />;
  }

  if (requireRole === 'admin' && !isAdmin) {
    return <Navigate to="/authority" replace state={{ roleNotice: 'This page is available for platform administrators.' }} />;
  }

  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}

/**
 * Authentication Entry Gate: Displays Login page if logged out, or routes to role dashboard if logged in.
 */
function AuthGate() {
  const { user, loading, isAuthority } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#cbd5e1' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'var(--gradient-primary)', color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 0 24px rgba(79, 70, 229, 0.5)' }}>
            <Shield size={30} />
          </div>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>Loading CrisisBridge AI...</p>
        </div>
      </div>
    );
  }

  if (user) {
    if (isAuthority) {
      return <Navigate to="/authority" replace />;
    }
    return <Navigate to="/citizen" replace />;
  }

  return <LoginPage />;
}

/**
 * Registration Entry Gate: Displays Register page if logged out, or routes to role dashboard if already logged in.
 */
function RegisterGate() {
  const { user, loading, isAuthority } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to={isAuthority ? '/authority' : '/citizen'} replace />;
  }

  return <RegisterPage />;
}

export function App() {
  return (
    <BrowserRouter>
      <NotificationProvider>
        <WebSocketProvider>
          <AuthProvider>
            {/* Global Abstract Floating-Gradient Background System */}
            <AbstractGradientBackground />

            <Routes>
              {/* Authentication-First Entry Routes (Unauthenticated Layout) */}
              <Route path="/" element={<AuthGate />} />
              <Route path="/login" element={<AuthGate />} />
              <Route path="/register" element={<RegisterGate />} />

              {/* Citizen Routes */}
              <Route
                path="/citizen"
                element={
                  <ProtectedRoute requireRole="citizen">
                    <CitizenDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Authority Routes */}
              <Route
                path="/authority"
                element={
                  <ProtectedRoute requireRole="authority">
                    <AuthorityDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/authority/warnings/create"
                element={
                  <ProtectedRoute requireRole="authority">
                    <CreateWarningPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/warnings/create"
                element={
                  <ProtectedRoute requireRole="authority">
                    <CreateWarningPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/warnings/:id"
                element={
                  <ProtectedRoute requireRole="authority">
                    <AuthorityWarningDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/zones/:id"
                element={
                  <ProtectedRoute requireRole="authority">
                    <ResponseZoneDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/authority/assistance/:requestId"
                element={
                  <ProtectedRoute requireRole="authority">
                    <AssistanceRequestDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/assistance/:requestId"
                element={
                  <ProtectedRoute requireRole="authority">
                    <AssistanceRequestDetail />
                  </ProtectedRoute>
                }
              />

              {/* Shared Authenticated Routes */}
              <Route
                path="/verification"
                element={
                  <ProtectedRoute>
                    <VerificationPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/resources"
                element={
                  <ProtectedRoute>
                    <ResourcesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <PostDisasterReports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports/:id"
                element={
                  <ProtectedRoute>
                    <ReportDetail />
                  </ProtectedRoute>
                }
              />

              {/* Admin Route */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireRole="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />

              {/* 404 Catch-All */}
              <Route
                path="*"
                element={
                  <ProtectedRoute>
                    <NotFoundPage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </WebSocketProvider>
      </NotificationProvider>
    </BrowserRouter>
  );
}

export default App;
