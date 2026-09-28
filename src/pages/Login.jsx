import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/global.css';

function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Nếu đã đăng nhập trước đó thì chuyển thẳng vào Dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Vui lòng nhập tên đăng nhập');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu');
      return;
    }

    setLoading(true);
    setError(null);

    const result = login(username, password);
    setLoading(false);

    if (result.success) {
      navigate('/admin/dashboard', { replace: true });
    } else {
      setError(result.error);
    }
  };

  const handleQuickFill = (userType) => {
    if (userType === 'web') {
      setUsername('web-dev');
      setPassword('123qwe');
    } else if (userType === 'app') {
      setUsername('app-dev');
      setPassword('123qwe');
    }
    setError(null);
  };

  const isWebDev = username === 'web-dev';
  const isAppDev = username === 'app-dev';

  return (
    <div className="auth-page">
      {/* Background ambient lighting */}
      <div className="auth-ambient-glow" aria-hidden="true" />

      <div className="auth-card">
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className="auth-brand-icon">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>

          <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: 0, color: 'var(--text)', letterSpacing: '-0.025em' }}>
            Gden Flow Telemetry
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
            Bảng điều khiển giám sát API Logs, Crashlytics & Observability
          </p>
        </div>

        {/* Quick Role Selection Cards */}
        <div style={{ marginBottom: '1.4rem' }}>
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--text-dim)',
              marginBottom: '0.55rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>⚡ Chọn nhanh phân hệ:</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-dim)' }}>Mật khẩu: 123qwe</span>
          </div>

          <div className="auth-role-grid">
            <button
              type="button"
              onClick={() => handleQuickFill('web')}
              className={`auth-role-card ${isWebDev ? 'active-web' : ''}`}
              title="Điền tự động tài khoản Web Developer"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.86rem', color: isWebDev ? '#38bdf8' : 'var(--text)' }}>
                <span>🌐</span>
                <span>web-dev</span>
                {isWebDev && <span style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>✓</span>}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Quản lý Web App & Portal</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('app')}
              className={`auth-role-card ${isAppDev ? 'active-app' : ''}`}
              title="Điền tự động tài khoản Mobile Developer"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.86rem', color: isAppDev ? '#c084fc' : 'var(--text)' }}>
                <span>📱</span>
                <span>app-dev</span>
                {isAppDev && <span style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>✓</span>}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Quản lý Flutter App</span>
            </button>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              color: '#fb7185',
              fontSize: '0.82rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              animation: 'authCardEntrance 200ms ease',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div>
            <label
              htmlFor="login-username"
              style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.45rem' }}
            >
              Tên đăng nhập (Username)
            </label>
            <div className="auth-input-group">
              <input
                id="login-username"
                className="auth-input"
                type="text"
                required
                autoFocus
                autoComplete="username"
                placeholder="web-dev hoặc app-dev"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
              />
              <span className="auth-input-icon">👤</span>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <label
                htmlFor="login-password"
                style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}
              >
                Mật khẩu (Password)
              </label>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                Mặc định: <code style={{ fontFamily: 'var(--font-mono)' }}>123qwe</code>
              </span>
            </div>

            <div className="auth-input-group">
              <input
                id="login-password"
                className="auth-input"
                style={{ paddingRight: '2.8rem' }}
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
              />
              <span className="auth-input-icon">🔒</span>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  padding: '0.25rem',
                }}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? '👁️‍🗨️' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="primary-btn"
            style={{
              marginTop: '0.4rem',
              padding: '0.85rem',
              borderRadius: '10px',
              fontSize: '0.92rem',
              fontWeight: 700,
              gap: '0.5rem',
            }}
          >
            {loading ? 'Đang xác thực…' : 'Đăng nhập vào Hệ thống →'}
          </button>
        </form>

        {/* Footer info */}
        <div
          style={{
            marginTop: '1.65rem',
            paddingTop: '1.15rem',
            borderTop: '1px solid var(--line)',
            fontSize: '0.75rem',
            color: 'var(--text-dim)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          <div>Tài khoản <strong>web-dev</strong> → Quản lý Web Telemetry</div>
          <div style={{ marginTop: '0.15rem' }}>Tài khoản <strong>app-dev</strong> → Quản lý Flutter App Telemetry</div>
        </div>
      </div>
    </div>
  );
}

export default Login;
