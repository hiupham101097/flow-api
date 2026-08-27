import React from 'react';
import { Outlet } from 'react-router-dom';

function AdminLayout() {
  return (
    <div className="admin-layout" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 
        This is a layout component where you could add a sidebar, 
        top navigation, footer, etc., wrapping all admin pages.
      */}
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
