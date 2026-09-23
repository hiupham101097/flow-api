import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import '../styles/global.css';
import { usePlatform } from '../context/PlatformContext';
import { useAuth } from '../context/AuthContext';

const MonitorIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3" /></svg>;
const UsersIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const SetupIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l-2.83 2.83A1.7 1.7 0 0 0 15 19.4 1.7 1.7 0 0 0 14 21h-4a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.34l-2.83-2.83A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14v-4a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.34-1.9L7.1 4.27A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.34l2.83 2.83A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z" /></svg>;

export default function AdminLayout() {
  const { platformScope, openPlatformModal } = usePlatform();
  const { user, logout } = useAuth();

  return (
    <div className="dashboard-shell app-frame">
      <aside className="side-nav" aria-label="Điều hướng chính">
        <NavLink to="/admin/monitor/logs" className="side-brand">
          <span className="side-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg></span>
          <span className="side-brand-name">Gden Flow</span>
        </NavLink>
        <nav className="side-links">
          <NavLink to="/admin/monitor/logs" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><MonitorIcon />Giám sát</NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><UsersIcon />Người dùng</NavLink>
          <NavLink to="/admin/setup" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><SetupIcon />Cài đặt SDK</NavLink>
        </nav>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="brand-lockup"><span className="scope-caption">Phân hệ {platformScope === 'web' ? 'Web' : 'App'}</span></div>
          <div className="topbar-actions">
            <button type="button" onClick={openPlatformModal} className={`platform-switch platform-switch-${platformScope}`} title="Đổi phân hệ App/Web">
              <span>Phân hệ: {platformScope === 'web' ? 'Web' : 'App'}</span><span className="platform-switch-hint">Đổi</span>
            </button>
            {user && <div className="account-chip">
              <span className="account-platform-mark" aria-hidden="true">{user.role === 'web' ? 'W' : 'A'}</span>
              <div className="account-copy"><strong>{user.username}</strong><span className={`account-role account-role-${user.role}`}>{user.role === 'web' ? 'Web Role' : 'App Role'}</span></div>
              <button type="button" onClick={logout} className="logout-btn">Đăng xuất</button>
            </div>}
            <span className="live-indicator"><span aria-hidden="true" /> Cloudflare D1 · Active</span>
          </div>
        </header>
        <main className="app-content"><Outlet /></main>
      </div>
    </div>
  );
}
