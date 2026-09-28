import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import { PlatformProvider } from './context/PlatformContext';
import { AuthProvider, ProtectedRoute } from './context/AuthContext';
import PlatformSelectionModal from './components/dashboard/PlatformSelectionModal';
import PageLoading from './components/ui/PageLoading';

const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const UserManager = lazy(() => import('./pages/admin/UserManager'));
const Setup = lazy(() => import('./pages/admin/Setup'));
const Login = lazy(() => import('./pages/Login'));

function LegacyDashboardRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/admin/monitor/logs${search}`} replace />;
}

function App() {
  return (
    <PlatformProvider>
      <BrowserRouter>
        <AuthProvider>
          <PlatformSelectionModal />
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
              
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="dashboard" element={<LegacyDashboardRedirect />} />
                <Route path="monitor/:mode" element={<Dashboard />} />
                <Route path="users" element={<UserManager />} />
                <Route path="setup" element={<Setup />} />
              </Route>

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </PlatformProvider>
  );
}

export default App;
