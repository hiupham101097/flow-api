import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_WORKER_URL || 'https://flow-api.hieupham101097.workers.dev';

function UserManager() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    job_type: 'app', // 'app' | 'web'
    job_name: '',
    app_identifier: '',
    target_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Code Snippet Modal
  const [snippetModalUser, setSnippetModalUser] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/users`);
      if (!res.ok) throw new Error(`Lỗi tải danh sách users: ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInputChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // Tự động gợi ý app_identifier khi nhập job_name nếu chưa có
      if (field === 'job_name' && !prev.app_identifier) {
        updated.app_identifier = value
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        job_type: formData.job_type,
        job_name: formData.job_name.trim() || `${formData.name.trim()}'s ${formData.job_type === 'web' ? 'Web' : 'App'}`,
        app_identifier: (formData.app_identifier || `${formData.job_type}_${Date.now()}`).trim(),
        target_url: formData.target_url.trim() || null,
      };

      const res = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Lỗi tạo user: ${res.status}`);
      }

      // Reset & Reload
      setIsModalOpen(false);
      setFormData({
        name: '',
        email: '',
        job_type: 'app',
        job_name: '',
        app_identifier: '',
        target_url: '',
      });
      await fetchUsers();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (user) => {
    const confirmText = `Bạn có chắc muốn xóa người dùng "${user.name}" và toàn bộ cấu hình theo dõi của họ?`;
    if (!window.confirm(confirmText)) return;

    try {
      const res = await fetch(`${API_BASE_URL}/users/${user.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Không thể xóa người dùng');
      await fetchUsers();
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    }
  };

  const copyToClipboard = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch (_) {}
  };

  // Metrics
  const totalUsers = users.length;
  const totalApps = users.filter((u) => u.job_type === 'app').length;
  const totalWebs = users.filter((u) => u.job_type === 'web').length;

  return (
    <div style={{ paddingTop: '1.5rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Quản lý Người dùng & Mục tiêu theo dõi
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '0.3rem' }}>
            Mỗi người dùng được chỉ định theo dõi 1 ứng dụng Mobile App hoặc 1 Website / Web App.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={fetchUsers}
            disabled={loading}
          >
            {loading ? 'Đang tải…' : '🔄 Làm mới'}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              setSubmitError(null);
              setIsModalOpen(true);
            }}
          >
            + Thêm Người dùng & Job
          </button>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <section className="metrics-strip" style={{ marginBottom: '1.75rem' }}>
        <div className="metric-item metric-lead">
          <span>Tổng người dùng</span>
          <strong>{totalUsers}</strong>
          <small>Thành viên theo dõi</small>
        </div>
        <div className="metric-item">
          <span>📱 Mobile Apps</span>
          <strong style={{ color: '#c4b5fd' }}>{totalApps}</strong>
          <small>Ứng dụng Flutter / Mobile</small>
        </div>
        <div className="metric-item">
          <span>🌐 Trang Web / Portal</span>
          <strong style={{ color: '#67e8f9' }}>{totalWebs}</strong>
          <small>Website & Web Portal</small>
        </div>
        <div className="metric-item">
          <span>Tỷ lệ phân bổ</span>
          <strong>{totalUsers > 0 ? `${Math.round((totalApps / totalUsers) * 100)}% App` : '0%'}</strong>
          <small>{totalWebs} Web · {totalApps} App</small>
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div className="error-banner" style={{ marginBottom: '1.5rem' }}>
          <span>⚠️ {error}</span>
          <button type="button" onClick={fetchUsers}>Thử lại</button>
        </div>
      )}

      {/* Users Table */}
      <section className="log-panel" style={{ overflow: 'hidden' }}>
        <div className="log-panel-header" style={{ padding: '1.1rem 1.4rem' }}>
          <div className="log-title-group">
            <h3>Danh sách Người dùng & Job theo dõi</h3>
            <span className="count-pill">{users.length} người dùng</span>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="log-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Người dùng</th>
                <th style={{ width: '26%' }}>Mục tiêu theo dõi (Job)</th>
                <th style={{ width: '18%' }}>Mã định danh (App ID)</th>
                <th style={{ width: '16%' }}>Target URL / Platform</th>
                <th style={{ width: '18%', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Đang tải danh sách người dùng...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
                    <strong>Chưa có người dùng nào được tạo</strong>
                    <p style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>
                      Nhấn nút <b>"+ Thêm Người dùng & Job"</b> phía trên để bắt đầu gán app hoặc web cần theo dõi.
                    </p>
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isApp = u.job_type === 'app';
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: isApp ? 'rgba(167, 139, 250, 0.2)' : 'rgba(34, 211, 238, 0.2)',
                              color: isApp ? '#c4b5fd' : '#67e8f9',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              border: `1px solid ${isApp ? 'rgba(167, 139, 250, 0.4)' : 'rgba(34, 211, 238, 0.4)'}`,
                            }}
                          >
                            {u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <strong style={{ display: 'block', color: 'var(--text)', fontSize: '0.92rem' }}>
                              {u.name}
                            </strong>
                            <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{u.email}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        {u.job_name ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                              <span className={`type-badge ${isApp ? 'type-badge-app' : 'type-badge-web'}`}>
                                {isApp ? '📱 App' : '🌐 Web'}
                              </span>
                              <strong style={{ fontSize: '0.88rem', color: 'var(--text)' }}>
                                {u.job_name}
                              </strong>
                            </div>
                            <small style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                              Trạng thái: <span style={{ color: 'var(--success)' }}>● Đang hoạt động</span>
                            </small>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '0.82rem' }}>
                            Chưa gán mục tiêu
                          </span>
                        )}
                      </td>

                      <td>
                        {u.app_identifier ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <code
                              style={{
                                background: 'var(--surface-muted)',
                                border: '1px solid var(--line)',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                color: 'var(--accent)',
                              }}
                            >
                              {u.app_identifier}
                            </code>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(u.app_identifier, `id-${u.id}`)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                color: copiedKey === `id-${u.id}` ? 'var(--success)' : 'var(--text-muted)',
                              }}
                              title="Sao chép App ID"
                            >
                              {copiedKey === `id-${u.id}` ? '✓' : '📋'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>-</span>
                        )}
                      </td>

                      <td>
                        {u.target_url ? (
                          <a
                            href={u.target_url.startsWith('http') ? u.target_url : `https://${u.target_url}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: 'var(--accent)',
                              textDecoration: 'none',
                              fontSize: '0.82rem',
                              maxWidth: '180px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'inline-block',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            🔗 {u.target_url}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                            {isApp ? 'Flutter / Mobile App' : 'Web Application'}
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="view-btn"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                            onClick={() => {
                              navigate(`/admin/dashboard?user_id=${u.id}&job_id=${u.job_id || ''}`);
                            }}
                            title="Lọc logs theo người dùng này"
                          >
                            📊 Xem Logs
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                            onClick={() => setSnippetModalUser(u)}
                            title="Xem code tích hợp cho User này"
                          >
                            🔌 Code
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(255, 119, 133, 0.3)',
                              color: 'var(--danger)',
                              padding: '0.35rem 0.55rem',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                            }}
                            title="Xóa người dùng này"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal: Thêm Người Dùng & Job Mới */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Thêm Người dùng & Mục tiêu theo dõi mới</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {submitError && (
                  <div style={{ background: 'var(--danger-soft)', color: 'var(--danger)', padding: '0.6rem 0.9rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                    ⚠️ {submitError}
                  </div>
                )}

                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--accent)', borderBottom: '1px solid var(--line)', paddingBottom: '0.4rem' }}>
                  1. Thông tin Người dùng
                </div>

                <div className="form-group">
                  <label htmlFor="user-name">Họ và tên *</label>
                  <input
                    id="user-name"
                    type="text"
                    required
                    className="form-control"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="user-email">Email định danh *</label>
                  <input
                    id="user-email"
                    type="email"
                    required
                    className="form-control"
                    placeholder="Ví dụ: a.nguyen@viettelpost.com.vn"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                </div>

                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--accent)', borderBottom: '1px solid var(--line)', paddingBottom: '0.4rem', marginTop: '0.5rem' }}>
                  2. Mục tiêu theo dõi (Mỗi user theo dõi 1 App hoặc 1 Web)
                </div>

                <div className="form-group">
                  <label>Loại hình theo dõi</label>
                  <div className="form-radio-group">
                    <label className={`form-radio-item ${formData.job_type === 'app' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="job_type"
                        value="app"
                        checked={formData.job_type === 'app'}
                        onChange={() => handleInputChange('job_type', 'app')}
                      />
                      <span>📱 <b>Mobile App</b> (Flutter / Android / iOS)</span>
                    </label>

                    <label className={`form-radio-item ${formData.job_type === 'web' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="job_type"
                        value="web"
                        checked={formData.job_type === 'web'}
                        onChange={() => handleInputChange('job_type', 'web')}
                      />
                      <span>🌐 <b>Trang Web</b> (Web App / Website)</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="job-name">Tên ứng dụng / Dự án theo dõi *</label>
                  <input
                    id="job-name"
                    type="text"
                    required
                    className="form-control"
                    placeholder={formData.job_type === 'app' ? 'Ví dụ: ViettelPost Driver App' : 'Ví dụ: Cổng thông tin Quản lý Khách hàng'}
                    value={formData.job_name}
                    onChange={(e) => handleInputChange('job_name', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="app-identifier">
                    Mã định danh Telemetry (App ID) *
                  </label>
                  <input
                    id="app-identifier"
                    type="text"
                    required
                    className="form-control"
                    placeholder="Ví dụ: vtp_driver_app"
                    value={formData.app_identifier}
                    onChange={(e) => handleInputChange('app_identifier', e.target.value)}
                  />
                  <small style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                    Mã duy nhất này được truyền vào SDK Flutter hoặc Axios/Fetch để hệ thống phân loại log đúng User này.
                  </small>
                </div>

                <div className="form-group">
                  <label htmlFor="target-url">URL trang web hoặc Bundle ID (Không bắt buộc)</label>
                  <input
                    id="target-url"
                    type="text"
                    className="form-control"
                    placeholder={formData.job_type === 'app' ? 'Ví dụ: vn.viettelpost.app' : 'Ví dụ: https://myportal.com'}
                    value={formData.target_url}
                    onChange={(e) => handleInputChange('target_url', e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setIsModalOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={submitting}
                >
                  {submitting ? 'Đang lưu…' : 'Xác nhận tạo User & Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Xem mã tích hợp theo User */}
      {snippetModalUser && (
        <div className="modal-overlay" onClick={() => setSnippetModalUser(null)}>
          <div className="modal-box" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Mã tích hợp cho: {snippetModalUser.name}</h2>
              <button
                type="button"
                onClick={() => setSnippetModalUser(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Sử dụng đoạn mã dưới đây trong source code của <b>{snippetModalUser.job_name}</b> để gửi dữ liệu log trực tiếp về luồng theo dõi của <b>{snippetModalUser.name}</b>.
              </p>

              {snippetModalUser.job_type === 'app' ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#c4b5fd' }}>Flutter (http package):</strong>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => copyToClipboard(`final http.Client client = LoggingClient(\n  http.Client(), \n  appId: '${snippetModalUser.app_identifier}',\n);`, 'flutter-snippet')}
                    >
                      {copiedKey === 'flutter-snippet' ? 'Đã chép' : 'Sao chép'}
                    </button>
                  </div>
                  <pre className="code-block" style={{ margin: 0, padding: '0.75rem', background: 'var(--surface-muted)' }}>
                    <code>{`final http.Client client = LoggingClient(
  http.Client(), 
  appId: '${snippetModalUser.app_identifier}',
);`}</code>
                  </pre>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#67e8f9' }}>Web (Axios Interceptor):</strong>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => copyToClipboard(`setupAxiosMonitor(axiosInstance, '${snippetModalUser.app_identifier}');`, 'axios-snippet')}
                    >
                      {copiedKey === 'axios-snippet' ? 'Đã chép' : 'Sao chép'}
                    </button>
                  </div>
                  <pre className="code-block" style={{ margin: 0, padding: '0.75rem', background: 'var(--surface-muted)' }}>
                    <code>{`// Tích hợp Axios cho Web App
setupAxiosMonitor(axiosInstance, '${snippetModalUser.app_identifier}');`}</code>
                  </pre>
                </div>
              )}

              <div style={{ marginTop: '0.75rem', background: 'var(--surface-muted)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  Mã định danh App ID: <code style={{ color: 'var(--accent)' }}>{snippetModalUser.app_identifier}</code> · URL Server: <code style={{ color: 'var(--text-muted)' }}>{API_BASE_URL}/logs</code>
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setSnippetModalUser(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  const targetUser = snippetModalUser;
                  setSnippetModalUser(null);
                  navigate(`/admin/dashboard?user_id=${targetUser.id}&job_id=${targetUser.job_id || ''}`);
                }}
              >
                Chuyển tới xem Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManager;
