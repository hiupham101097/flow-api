import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import UserManager from './pages/admin/UserManager';
import { PlatformProvider } from './context/PlatformContext';
import PlatformSelectionModal from './components/dashboard/PlatformSelectionModal';

function App() {
  return (
    <PlatformProvider>
      <BrowserRouter>
        <PlatformSelectionModal />
        <Routes>
          <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
          
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="users" element={<UserManager />} />
          </Route>

          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </PlatformProvider>
  );
}

export default App;
