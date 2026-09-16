import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import '../styles/global.css';
import { usePlatform } from '../context/PlatformContext';
import { useAuth } from '../context/AuthContext';

function AdminLayout() {
  const { platformScope, openPlatformModal } = usePlatform();
  const { user, logout } = useAuth();

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
              <span>Người dùng & Job ({platformScope === 'web' ? 'Web' : 'App'})</span>
            </NavLink>
          </nav>
        </div>

        <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Nút chuyển đổi nhanh Platform Scope (App / Web) */}
          <button
            type="button"
            onClick={openPlatformModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.42rem 0.85rem',
              borderRadius: '20px',
              border: `1px solid ${platformScope === 'web' ? 'rgba(34, 211, 238, 0.45)' : 'rgba(167, 139, 250, 0.45)'}`,
              background: platformScope === 'web' ? 'rgba(34, 211, 238, 0.12)' : 'rgba(167, 139, 250, 0.12)',
              color: platformScope === 'web' ? '#67e8f9' : '#c4b5fd',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
            title="Bấm để đổi chế độ xem giữa Web App và Mobile App"
          >
            <span>{platformScope === 'web' ? '🌐 Phân hệ: Web' : '📱 Phân hệ: App'}</span>
            <span style={{ fontSize: '0.72rem', opacity: 0.8, marginLeft: '0.2rem', padding: '0.1rem 0.4rem', borderRadius: '10px', background: 'rgba(255,255,255,0.08)' }}>
              ⇄ Đổi
            </span>
          </button>

          {/* Thông tin tài khoản đăng nhập & Nút Đăng xuất */}
          {user && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.55rem',
                background: 'var(--surface-muted)',
                padding: '0.32rem 0.75rem',
                borderRadius: '16px',
                border: '1px solid var(--line)',
              }}
            >
              <span style={{ fontSize: '0.9rem' }}>{user.role === 'web' ? '🌐' : '📱'}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: '0.78rem', color: 'var(--text)', lineHeight: 1.1 }}>{user.username}</strong>
                <span style={{ fontSize: '0.64rem', color: user.role === 'web' ? '#67e8f9' : '#c4b5fd', fontWeight: 500 }}>
                  {user.role === 'web' ? 'Web Role' : 'App Role'}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                style={{
                  background: 'rgba(255, 119, 133, 0.12)',
                  border: '1px solid rgba(255, 119, 133, 0.3)',
                  color: '#ff7785',
                  cursor: 'pointer',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  padding: '0.22rem 0.55rem',
                  borderRadius: '8px',
                  marginLeft: '0.35rem',
                  transition: 'all 0.15s ease',
                }}
                title="Đăng xuất khỏi hệ thống"
              >
                Đăng xuất
              </button>
            </div>
          )}

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
