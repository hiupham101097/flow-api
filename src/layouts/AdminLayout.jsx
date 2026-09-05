import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import '../styles/global.css';

function AdminLayout() {
  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup" style={{ gap: '1.8rem', alignItems: 'center' }}>
          <NavLink to="/admin/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #5e7eea 0%, #7d9cff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(94, 126, 234, 0.35)',
              flexShrink: 0
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
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
