import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../constants/api';
import '../styles/global.css';

function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, login, authRequest, refreshSession } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/admin/monitor/logs', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/status`, { cache: 'no-store' })
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus({ unavailable: true }));
  }, []);

  const needsBootstrap = Boolean(status?.needs_bootstrap);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (needsBootstrap) {
        await authRequest('/auth/bootstrap', {
          method: 'POST',
          body: JSON.stringify({ bootstrap_token: bootstrapToken, email, name, password }),
        });
        await refreshSession();
        navigate('/admin/monitor/logs', { replace: true });
      } else {
        const result = await login(email, password);
        if (!result.success) throw new Error(result.error);
        navigate('/admin/monitor/logs', { replace: true });
      }
    } catch (requestError) {
      setError(requestError.message || 'Không thể đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-ambient-glow" aria-hidden="true" />
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className="auth-brand-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: 0, color: 'var(--text)', letterSpacing: '-0.025em' }}>
            Gden Flow Telemetry
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
            {needsBootstrap ? 'Khởi tạo tài khoản chủ hệ thống' : 'Đăng nhập vào không gian theo dõi của bạn'}
          </p>
        </div>

        {needsBootstrap && !status?.bootstrap_enabled && (
          <div className="auth-setup-notice" role="status">
            <strong>Chưa bật khởi tạo an toàn.</strong>
            <p>Chủ hệ thống cần đặt secret <code>DASHBOARD_BOOTSTRAP_TOKEN</code> cho Cloudflare Worker trước khi tạo tài khoản đầu tiên.</p>
          </div>
        )}
        {status?.unavailable && <div className="auth-setup-notice">Không kết nối được dịch vụ xác thực. Hãy tải lại trang sau.</div>}

        {error && (
          <div role="alert" style={{ padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.35)', color: '#fb7185', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.05rem' }}>
          {needsBootstrap && (
            <>
              <label className="auth-field-label" htmlFor="bootstrap-name">Tên chủ hệ thống</label>
              <input id="bootstrap-name" className="auth-input" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              <label className="auth-field-label" htmlFor="bootstrap-token">Mã khởi tạo một lần</label>
              <input id="bootstrap-token" className="auth-input" required autoComplete="off" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} />
            </>
          )}

          <label className="auth-field-label" htmlFor="login-email">
            {needsBootstrap ? 'Tên đăng nhập hoặc email quản trị' : 'Tên đăng nhập hoặc email'}
          </label>
          <input
            id="login-email"
            className="auth-input"
            type="text"
            required
            autoFocus={!needsBootstrap}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="adminesco hoặc name@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label className="auth-field-label" htmlFor="login-password">Mật khẩu {needsBootstrap && '(tối thiểu 12 ký tự)'}</label>
          <div className="auth-input-group">
            <input
              id="login-password"
              className="auth-input"
              style={{ paddingRight: '2.8rem' }}
              type={showPassword ? 'text' : 'password'}
              required
              minLength={needsBootstrap ? 12 : undefined}
              autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="auth-password-toggle" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
              {showPassword ? 'Ẩn' : 'Hiện'}
            </button>
          </div>

          <button type="submit" disabled={loading || (needsBootstrap && !status?.bootstrap_enabled) || !status} className="primary-btn" style={{ marginTop: '0.4rem', padding: '0.85rem', fontSize: '0.9rem', fontWeight: 700, justifyContent: 'center' }}>
            {loading ? 'Đang xử lý…' : needsBootstrap ? 'Tạo tài khoản chủ' : 'Đăng nhập an toàn'}
          </button>
        </form>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textAlign: 'center', marginTop: '1rem' }}>
          Phiên đăng nhập được lưu bằng cookie HttpOnly và tự hết hạn sau 14 ngày.
        </p>
      </div>
    </div>
  );
}

export default Login;
