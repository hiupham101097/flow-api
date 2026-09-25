import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import '../styles/global.css';
import { usePlatform } from '../context/PlatformContext';
import { useAuth } from '../context/AuthContext';

const MonitorIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3" /></svg>;
const UsersIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const SetupIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l-2.83 2.83A1.7 1.7 0 0 0 15 19.4 1.7 1.7 0 0 0 14 21h-4a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.34l-2.83-2.83A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14v-4a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.34-1.9L7.1 4.27A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.34l2.83 2.83A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z" /></svg>;

const SidebarToggleIcon = ({ collapsed }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
    {collapsed ? (
      <polyline points="13 10 15 12 13 14" />
    ) : (
      <polyline points="15 10 13 12 15 14" />
    )}
  </svg>
);

export default function AdminLayout() {
  const { platformScope, openPlatformModal } = usePlatform();
  const { user, logout } = useAuth();

  // Trạng thái thu gọn menu trái (mặc định thu gọn theo phản hồi người dùng để tiết kiệm diện tích)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('gden-flow:sidebar-collapsed');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {}
    return true;
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('gden-flow:sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="dashboard-shell app-frame">
      <aside className={`side-nav ${isCollapsed ? 'is-collapsed' : ''}`} aria-label="Điều hướng chính">
        <div className="side-brand-wrap">
          <NavLink to="/admin/monitor/logs" className="side-brand" title={isCollapsed ? "Gden Flow Telemetry Hub" : undefined}>
            <span className="side-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
            </span>
            {!isCollapsed && <span className="side-brand-name">Gden Flow</span>}
          </NavLink>
        </div>
        <nav className="side-links">
          <NavLink
            to="/admin/monitor/logs"
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
            title={isCollapsed ? "Giám sát" : undefined}
          >
            <span className="side-link-icon"><MonitorIcon /></span>
            {!isCollapsed && <span className="side-link-name">Giám sát</span>}
            {isCollapsed && <span className="side-tooltip">Giám sát</span>}
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
            title={isCollapsed ? "Người dùng" : undefined}
          >
            <span className="side-link-icon"><UsersIcon /></span>
            {!isCollapsed && <span className="side-link-name">Người dùng</span>}
            {isCollapsed && <span className="side-tooltip">Người dùng</span>}
          </NavLink>
          <NavLink
            to="/admin/setup"
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
            title={isCollapsed ? "Cài đặt SDK" : undefined}
          >
            <span className="side-link-icon"><SetupIcon /></span>
            {!isCollapsed && <span className="side-link-name">Cài đặt SDK</span>}
            {isCollapsed && <span className="side-tooltip">Cài đặt SDK</span>}
          </NavLink>
        </nav>
        <div className="side-footer">
          <button
            type="button"
            className="side-collapse-btn"
            onClick={toggleSidebar}
            title={isCollapsed ? "Mở rộng thanh menu (Ctrl+B)" : "Thu gọn thanh menu (Ctrl+B)"}
            aria-label={isCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
          >
            <span className="side-collapse-icon-wrap">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {isCollapsed ? (
                  <polyline points="9 18 15 12 9 6" />
                ) : (
                  <polyline points="15 18 9 12 15 6" />
                )}
              </svg>
            </span>
            {!isCollapsed && <span className="side-collapse-text">Thu gọn menu</span>}
            {isCollapsed && <span className="side-tooltip">Mở rộng (Ctrl+B)</span>}
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="brand-lockup">
            <button
              type="button"
              onClick={toggleSidebar}
              className={`sidebar-toggle-btn ${isCollapsed ? 'is-collapsed' : ''}`}
              title={isCollapsed ? "Mở rộng thanh menu bên trái (Ctrl+B)" : "Thu gọn thanh menu bên trái (Ctrl+B)"}
              aria-label="Thu gọn hoặc mở rộng menu trái"
            >
              <SidebarToggleIcon collapsed={isCollapsed} />
            </button>
            <span className="topbar-crumb">Gden Flow</span>
            <span className="topbar-crumb-sep">/</span>
            <span className="topbar-crumb-title">Telemetry Hub</span>
            <button
              type="button"
              onClick={openPlatformModal}
              className={`platform-switch platform-switch-${platformScope}`}
              title="Nhấn để đổi không gian quản lý App / Web"
            >
              <span className="platform-switch-dot" />
              <span>{platformScope === 'web' ? '🌐 Web App' : '📱 Mobile App'}</span>
              <span className="platform-switch-hint">⇄ Đổi</span>
            </button>
          </div>
          <div className="topbar-actions">
            {user && (
              <div className="account-chip">
                <span className="account-platform-mark" aria-hidden="true">{user.role === 'web' ? 'W' : 'A'}</span>
                <div className="account-copy">
                  <strong>{user.username}</strong>
                  <span className={`account-role account-role-${user.role}`}>{user.role === 'web' ? 'Web Role' : 'App Role'}</span>
                </div>
                <button type="button" onClick={logout} className="logout-btn" title="Đăng xuất khỏi hệ thống">
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: '0.2rem' }}>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Đăng xuất
                </button>
              </div>
            )}
            <span className="live-indicator"><span aria-hidden="true" /> Cloudflare D1 · Active</span>
          </div>
        </header>
        <main className="app-content"><Outlet /></main>
      </div>
    </div>
  );
}
