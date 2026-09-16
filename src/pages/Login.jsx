import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Login() {
  const navigate = useNavigate();
  const { user, isAuthenticated, login } = useAuth();

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

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 20%, #111d2e 0%, #070c12 70%)',
        padding: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background ambient glow */}
      <div
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(94, 126, 234, 0.15) 0%, transparent 70%)',
          top: '-150px',
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: 'min(460px, 100%)',
          background: 'rgba(13, 21, 31, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(125, 156, 255, 0.2)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 35px rgba(94, 126, 234, 0.12)',
          padding: '2.5rem 2.25rem',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #5e7eea 0%, #7d9cff 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(94, 126, 234, 0.4)',
              marginBottom: '1rem',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>

          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#fff', letterSpacing: '-0.02em' }}>
            Gden Flow Telemetry
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.45rem', lineHeight: 1.5 }}>
            Đăng nhập để vào bảng điều khiển giám sát API Logs & Telemetry
          </p>
        </div>

        {/* Quick Role Selection Buttons */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ⚡ Chọn nhanh tài khoản phân hệ:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => handleQuickFill('web')}
              style={{
                padding: '0.65rem 0.75rem',
                borderRadius: '10px',
                border: username === 'web-dev' ? '1px solid #22d3ee' : '1px solid var(--line)',
                background: username === 'web-dev' ? 'rgba(34, 211, 238, 0.12)' : 'var(--surface)',
                color: username === 'web-dev' ? '#67e8f9' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '0.15rem',
                transition: 'all 0.18s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, fontSize: '0.84rem' }}>
                <span>🌐</span> <span>web-dev</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Quản lý Web</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('app')}
              style={{
                padding: '0.65rem 0.75rem',
                borderRadius: '10px',
                border: username === 'app-dev' ? '1px solid #a78bfa' : '1px solid var(--line)',
                background: username === 'app-dev' ? 'rgba(167, 139, 250, 0.12)' : 'var(--surface)',
                color: username === 'app-dev' ? '#c4b5fd' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '0.15rem',
                transition: 'all 0.18s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, fontSize: '0.84rem' }}>
                <span>📱</span> <span>app-dev</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Quản lý Flutter App</span>
            </button>
          </div>
        </div>

        {/* Error notice */}
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              background: 'rgba(255, 119, 133, 0.12)',
              border: '1px solid rgba(255, 119, 133, 0.35)',
              color: '#ff7785',
              fontSize: '0.84rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div>
            <label
              htmlFor="login-username"
              style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.45rem' }}
            >
              Tên đăng nhập (Username)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-username"
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
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.5rem',
                  borderRadius: '10px',
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  fontSize: '0.92rem',
                  outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}>
                👤
              </span>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <label
                htmlFor="login-password"
                style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}
              >
                Mật khẩu (Password)
              </label>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                Mặc định: <code>123qwe</code>
              </span>
            </div>

            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem 2.8rem 0.75rem 2.5rem',
                  borderRadius: '10px',
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  fontSize: '0.92rem',
                  outline: 'none',
                }}
              />
              <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}>
                🔒
              </span>
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
                  fontSize: '0.85rem',
                  padding: '0.2rem',
                }}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
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
              marginTop: '0.5rem',
              padding: '0.82rem',
              borderRadius: '10px',
              fontSize: '0.95rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #5e7eea 0%, #7d9cff 100%)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(94, 126, 234, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            {loading ? 'Đang xác thực…' : 'Đăng nhập vào Hệ thống →'}
          </button>
        </form>

        {/* Footer info */}
        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--line)', fontSize: '0.78rem', color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5 }}>
          <div>Tài khoản <b>web-dev</b> → Vào thẳng Quản lý Web</div>
          <div style={{ marginTop: '0.2rem' }}>Tài khoản <b>app-dev</b> → Vào thẳng Quản lý Flutter App</div>
        </div>
      </div>
    </div>
  );
}

export default Login;
