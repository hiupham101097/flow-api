import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';

const API_BASE_URL = import.meta.env.VITE_WORKER_URL || 'https://flow-api.hieupham101097.workers.dev';

function UserManager() {
  const navigate = useNavigate();
  const { platformScope, openPlatformModal } = usePlatform();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bộ lọc nền tảng hiển thị trên bảng (mặc định theo platformScope đã chọn)
  const [platformFilter, setPlatformFilter] = useState(platformScope || 'all');

  useEffect(() => {
    if (platformScope) {
      setPlatformFilter(platformScope);
    }
  }, [platformScope]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    job_type: platformScope === 'web' ? 'web' : 'app',
    job_name: '',
    app_identifier: '',
    target_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Code Snippet Modal
  const [snippetModalUser, setSnippetModalUser] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  // Detail Modal
  const [detailModalUser, setDetailModalUser] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/users`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setUsers(data || []);
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
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateUserAndJob = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setSubmitError('Vui lòng điền Họ tên và Email người dùng');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);

      const res = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          job_type: formData.job_type,
          job_name: formData.job_name.trim() || `${formData.name.trim()}'s ${formData.job_type === 'web' ? 'Web' : 'App'}`,
          app_identifier: (formData.app_identifier || `${formData.job_type}_${Date.now()}`).trim(),
          target_url: formData.target_url.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi khi tạo người dùng và job');
      }

      // Reset & Reload
      setIsModalOpen(false);
      setFormData({
        name: '',
        email: '',
        job_type: platformScope === 'web' ? 'web' : 'app',
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

  const displayedUsers = users.filter((u) => {
    if (platformFilter === 'all') return true;
    return u.job_type === platformFilter;
  });

  return (
    <div style={{ paddingTop: '1.5rem' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Quản lý Người dùng & Mục tiêu theo dõi
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.2rem 0.65rem',
                borderRadius: '20px',
                background: platformScope === 'web' ? 'rgba(34, 211, 238, 0.15)' : 'rgba(167, 139, 250, 0.15)',
                color: platformScope === 'web' ? '#67e8f9' : '#c4b5fd',
                border: `1px solid ${platformScope === 'web' ? 'rgba(34, 211, 238, 0.35)' : 'rgba(167, 139, 250, 0.35)'}`,
              }}
            >
              {platformScope === 'web' ? '🌐 Phạm vi: Web App' : '📱 Phạm vi: Mobile App'}
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
            Mỗi người dùng được chỉ định theo dõi 1 ứng dụng Mobile App hoặc 1 Website / Web App.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={openPlatformModal}
            title="Đổi giữa Web App và Mobile App"
            style={{ fontSize: '0.82rem' }}
          >
            ⚙️ Đổi nền tảng
          </button>
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
              setFormData({
                name: '',
                email: '',
                job_type: platformScope === 'web' ? 'web' : 'app',
                job_name: '',
                app_identifier: '',
                target_url: '',
              });
              setIsModalOpen(true);
            }}
          >
            + Thêm {platformScope === 'web' ? 'Web App' : 'Mobile App'} & User
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
        <div
          className="metric-item"
          style={{ cursor: 'pointer', outline: platformFilter === 'app' ? '2px solid #a78bfa' : 'none' }}
          onClick={() => setPlatformFilter('app')}
          title="Nhấp để chỉ xem Mobile Apps"
        >
          <span>📱 Mobile Apps</span>
          <strong style={{ color: '#c4b5fd' }}>{totalApps}</strong>
          <small>Ứng dụng Flutter / Mobile</small>
        </div>
        <div
          className="metric-item"
          style={{ cursor: 'pointer', outline: platformFilter === 'web' ? '2px solid #22d3ee' : 'none' }}
          onClick={() => setPlatformFilter('web')}
          title="Nhấp để chỉ xem Web Apps"
        >
          <span>🌐 Trang Web / Portal</span>
          <strong style={{ color: '#67e8f9' }}>{totalWebs}</strong>
          <small>Website & Web Angular/React</small>
        </div>
        <div
          className="metric-item"
          style={{ cursor: 'pointer', outline: platformFilter === 'all' ? '2px solid var(--accent)' : 'none' }}
          onClick={() => setPlatformFilter('all')}
          title="Nhấp để xem tất cả"
        >
          <span>Đang lọc hiển thị</span>
          <strong style={{ color: 'var(--accent)' }}>{displayedUsers.length}</strong>
          <small>{platformFilter === 'all' ? 'Tất cả nền tảng' : platformFilter === 'web' ? 'Chỉ Web App' : 'Chỉ Mobile App'}</small>
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
        <div className="log-panel-header" style={{ padding: '1.1rem 1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="log-title-group">
            <h3>Danh sách Người dùng & Job theo dõi</h3>
            <span className="count-pill">{displayedUsers.length} mục tiêu</span>
          </div>

          {/* Quick Filter Switcher */}
          <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--surface-muted)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <button
              type="button"
              className={`mode-pill-btn ${platformFilter === 'web' ? 'active' : ''}`}
              onClick={() => setPlatformFilter('web')}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
            >
              🌐 Chỉ Web ({totalWebs})
            </button>
            <button
              type="button"
              className={`mode-pill-btn ${platformFilter === 'app' ? 'active' : ''}`}
              onClick={() => setPlatformFilter('app')}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
            >
              📱 Chỉ App ({totalApps})
            </button>
            <button
              type="button"
              className={`mode-pill-btn ${platformFilter === 'all' ? 'active' : ''}`}
              onClick={() => setPlatformFilter('all')}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
            >
              👁️ Tất cả ({totalUsers})
            </button>
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
              ) : displayedUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                      {platformFilter === 'web' ? '🌐' : platformFilter === 'app' ? '📱' : '👥'}
                    </div>
                    <strong>Không có mục tiêu nào phù hợp với bộ lọc ({platformFilter})</strong>
                    <p style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>
                      Nhấn nút <b>"+ Thêm {platformFilter === 'web' ? 'Web App' : 'Mobile App'} & User"</b> phía trên để bắt đầu gán app hoặc web cần theo dõi.
                    </p>
                  </td>
                </tr>
              ) : (
                displayedUsers.map((u) => {
                  const isApp = u.job_type === 'app';
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setDetailModalUser(u)}
                      style={{ cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết"
                    >
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{u.email}</div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span
                            className={`type-badge ${isApp ? 'type-badge-app' : 'type-badge-web'}`}
                            style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              background: isApp ? 'rgba(167, 139, 250, 0.15)' : 'rgba(34, 211, 238, 0.15)',
                              color: isApp ? '#c4b5fd' : '#67e8f9',
                              border: `1px solid ${isApp ? 'rgba(167, 139, 250, 0.3)' : 'rgba(34, 211, 238, 0.3)'}`,
                            }}
                          >
                            {isApp ? '📱 App' : '🌐 Web'}
                          </span>
                          <strong style={{ color: 'var(--text)' }}>{u.job_name || '—'}</strong>
                        </div>
                      </td>

                      <td>
                        <span className="endpoint-code" style={{ color: 'var(--accent)' }}>
                          {u.app_identifier || '—'}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {u.target_url ? (
                            <a
                              href={u.target_url.startsWith('http') ? u.target_url : `https://${u.target_url}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: 'var(--accent)', textDecoration: 'none' }}
                            >
                              🔗 {u.target_url}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-dim)' }}>{isApp ? 'Flutter Mobile SDK' : 'Web SDK / Browser'}</span>
                          )}
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="secondary-btn"
                            style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
                            title="Lấy đoạn mã tích hợp cho Job này"
                            onClick={() => setSnippetModalUser(u)}
                          >
                            🔌 Mã SDK
                          </button>
                          <button
                            type="button"
                            className="primary-btn"
                            style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
                            title="Mở Dashboard và lọc theo mục tiêu này"
                            onClick={() => navigate(`/admin/dashboard?user_id=${u.id}`)}
                          >
                            📊 Xem Log
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            style={{ fontSize: '0.76rem', padding: '0.35rem 0.55rem', color: 'var(--danger)' }}
                            title="Xóa người dùng"
                            onClick={() => handleDeleteUser(u)}
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

      {/* MODAL: THÊM NGƯỜI DÙNG & JOB */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => !submitting && setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div className="modal-header-info">
                <span>Khởi tạo cấu hình</span>
                <h2>Thêm Người dùng & Mục tiêu theo dõi</h2>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => !submitting && setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUserAndJob}>
              <div className="modal-body">
                {submitError && (
                  <div className="error-banner" style={{ marginBottom: '1rem' }}>
                    <span>⚠️ {submitError}</span>
                  </div>
                )}

                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--accent)', borderBottom: '1px solid var(--line)', paddingBottom: '0.4rem' }}>
                  1. Thông tin Người dùng (User)
                </div>

                <div className="form-group" style={{ marginTop: '0.85rem' }}>
                  <label>Họ và tên <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Email liên hệ <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="email"
                    required
                    placeholder="Ví dụ: nguyenvana@company.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                </div>

                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--accent)', borderBottom: '1px solid var(--line)', paddingBottom: '0.4rem', marginTop: '1.25rem' }}>
                  2. Mục tiêu theo dõi (Mỗi user theo dõi 1 App hoặc 1 Web)
                </div>

                <div className="form-group" style={{ marginTop: '0.85rem' }}>
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
                      <span>🌐 <b>Trang Web</b> (Angular / React / Vue)</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Tên ứng dụng / Dự án theo dõi</label>
                  <input
                    type="text"
                    placeholder={formData.job_type === 'app' ? 'Ví dụ: Fizahub Mobile App' : 'Ví dụ: Cổng thông tin Khách hàng Angular'}
                    value={formData.job_name}
                    onChange={(e) => handleInputChange('job_name', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>
                    Mã định danh duy nhất (App ID / Package Name) <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={formData.job_type === 'app' ? 'Ví dụ: vn.fizahub.app' : 'Ví dụ: vn.myportal.web'}
                    value={formData.app_identifier}
                    onChange={(e) => handleInputChange('app_identifier', e.target.value)}
                  />
                  <small style={{ color: 'var(--text-dim)', marginTop: '0.3rem', display: 'block' }}>
                    Mã này dùng để nhận diện log gửi về từ SDK bên source code của ứng dụng.
                  </small>
                </div>

                <div className="form-group">
                  <label>Domain hoặc Package Name tham chiếu (Tùy chọn)</label>
                  <input
                    type="text"
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
                  disabled={submitting}
                  onClick={() => setIsModalOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button type="submit" className="primary-btn" disabled={submitting}>
                  {submitting ? 'Đang tạo…' : 'Xác nhận tạo Người dùng & Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CHI TIẾT NGƯỜI DÙNG & JOB */}
      {detailModalUser && (
        <div className="modal-overlay" onClick={() => setDetailModalUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <div className="modal-header-info">
                <span>Hồ sơ người dùng & Cấu hình</span>
                <h2>{detailModalUser.name}</h2>
              </div>
              <button type="button" className="close-btn" onClick={() => setDetailModalUser(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem', padding: '0.85rem 1rem', background: 'var(--surface-muted)', borderRadius: '10px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    background: detailModalUser.job_type === 'app' ? 'rgba(167,139,250,0.18)' : 'rgba(34,211,238,0.18)',
                    color: detailModalUser.job_type === 'app' ? '#c4b5fd' : '#67e8f9',
                    border: `1px solid ${detailModalUser.job_type === 'app' ? 'rgba(167,139,250,0.4)' : 'rgba(34,211,238,0.4)'}`,
                  }}
                >
                  {detailModalUser.job_type === 'app' ? '📱' : '🌐'}
                </div>
                <div>
                  <strong style={{ fontSize: '1.05rem', color: 'var(--text)' }}>
                    {detailModalUser.job_name || `${detailModalUser.name}'s Target`}
                  </strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {detailModalUser.job_type === 'app' ? 'Ứng dụng Di động (Flutter / Mobile)' : 'Ứng dụng Web / Cổng thông tin (Angular/Web)'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                {[
                  { label: 'Họ và tên', value: detailModalUser.name, mono: false },
                  { label: 'Email', value: detailModalUser.email, mono: false },
                  { label: 'Loại hình', value: detailModalUser.job_type === 'app' ? '📱 Mobile App' : '🌐 Web App', mono: false },
                  { label: 'Mã định danh App ID', value: detailModalUser.app_identifier || '—', mono: true },
                  { label: 'Target URL / Package', value: detailModalUser.target_url || '—', mono: true },
                  { label: 'Trạng thái Job', value: detailModalUser.status || 'active', mono: false },
                ].map((item, idx) => (
                  <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>{item.label}</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', fontFamily: item.mono ? 'var(--font-mono)' : 'inherit', wordBreak: 'break-all' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setDetailModalUser(null);
                  setSnippetModalUser(detailModalUser);
                }}
              >
                🔌 Xem mã SDK
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setDetailModalUser(null);
                  navigate(`/admin/dashboard?user_id=${detailModalUser.id}`);
                }}
              >
                📊 Xem Telemetry trên Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ĐOẠN MÃ TÍCH HỢP SDK (SNIPPET) */}
      {snippetModalUser && (
        <div className="modal-overlay" onClick={() => setSnippetModalUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <div className="modal-header-info">
                <span>Hướng dẫn tích hợp cho</span>
                <h2>{snippetModalUser.job_name} ({snippetModalUser.job_type === 'app' ? 'Mobile App' : 'Web App'})</h2>
              </div>
              <button type="button" className="close-btn" onClick={() => setSnippetModalUser(null)}>
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
                    <strong style={{ fontSize: '0.85rem', color: '#c4b5fd' }}>Flutter (http package LoggingClient):</strong>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Angular */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#ff6b81' }}>Angular (HttpInterceptor & Telemetry):</strong>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => copyToClipboard(`// app.config.ts (Angular 15+)\nApiLoggerService.initialize({\n  appId: '${snippetModalUser.app_identifier}',\n  serverUrl: '${API_BASE_URL}',\n});\n\nexport const appConfig: ApplicationConfig = {\n  providers: [\n    provideHttpClient(withInterceptors([apiLoggerInterceptor])),\n    { provide: ErrorHandler, useClass: GlobalErrorHandler },\n  ],\n};`, 'angular-snippet')}
                      >
                        {copiedKey === 'angular-snippet' ? 'Đã chép' : 'Sao chép'}
                      </button>
                    </div>
                    <pre className="code-block" style={{ margin: 0, padding: '0.75rem', background: 'var(--surface-muted)' }}>
                      <code>{`// Trong app.config.ts (Angular 15-19+)
ApiLoggerService.initialize({
  appId: '${snippetModalUser.app_identifier}',
  serverUrl: '${API_BASE_URL}',
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([apiLoggerInterceptor])),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};`}</code>
                    </pre>
                  </div>

                  {/* Axios */}
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
                      <code>{`setupAxiosMonitor(axiosInstance, '${snippetModalUser.app_identifier}');`}</code>
                    </pre>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '0.9rem', background: 'var(--surface-muted)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
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
                  setSnippetModalUser(null);
                  navigate(`/admin/dashboard?user_id=${snippetModalUser.id}`);
                }}
              >
                Tới xem Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManager;
