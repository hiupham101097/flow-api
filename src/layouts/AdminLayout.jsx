import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import '../styles/global.css';

function AdminLayout() {
  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup" style={{ gap: '1.8rem', alignItems: 'center' }}>
          <NavLink to="/admin/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', textDecoration: 'none', color: 'inherit' }}>
            <img src="/logo.png" alt="Gden Monitor" style={{ height: '38px', width: 'auto' }} />
            <div>
              <h1 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>Gden Flow</h1>
            </div>
          </NavLink>

          <nav className="nav-tabs-group" aria-label="Main Navigation">
            <NavLink
              to="/admin/dashboard"
              className={({ isActive }) => `nav-tab-link ${isActive ? 'active' : ''}`}
            >
              <span>📊</span>
              <span>Giám sát & Telemetry</span>
            </NavLink>
            <NavLink
              to="/admin/users"
              className={({ isActive }) => `nav-tab-link ${isActive ? 'active' : ''}`}
            >
              <span>👥</span>
              <span>Người dùng & Job (App/Web)</span>
            </NavLink>
          </nav>
        </div>

        <div className="topbar-actions">
          <span className="live-indicator"><span aria-hidden="true" /> Cloudflare D1 · Active</span>
        </div>
      </header>

      <main style={{ paddingBottom: '3rem' }}>
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
