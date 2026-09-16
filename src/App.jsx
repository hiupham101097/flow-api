import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import UserManager from './pages/admin/UserManager';
import Login from './pages/Login';
import { PlatformProvider } from './context/PlatformContext';
import { AuthProvider, ProtectedRoute } from './context/AuthContext';
import PlatformSelectionModal from './components/dashboard/PlatformSelectionModal';

function App() {
  return (
    <PlatformProvider>
      <BrowserRouter>
        <AuthProvider>
          <PlatformSelectionModal />
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
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="users" element={<UserManager />} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </PlatformProvider>
  );
}

export default App;
