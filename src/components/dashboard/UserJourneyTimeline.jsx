import React, { useState, useEffect } from 'react';
import { exportToCsv } from '../../utils/exportCsv';

function UserJourneyTimeline({
  initialUser = '',
  initialDevice = '',
  initialApp = '',
  availableUsers = [],
  availableDevices = [],
  onOpenDetail,
}) {
  const [user, setUser] = useState(initialUser || '');
  const [device, setDevice] = useState(initialDevice || '');
  const [app, setApp] = useState(initialApp || '');
  const [limit, setLimit] = useState(100);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (initialUser !== undefined) setUser(initialUser);
    if (initialDevice !== undefined) setDevice(initialDevice);
    if (initialApp !== undefined) setApp(initialApp);
  }, [initialUser, initialDevice, initialApp]);

  useEffect(() => {
    if (user || device || app) {
      fetchTimeline();
    }
  }, [user, device, app, limit]);

  const fetchTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (user) params.append('user', user);
      if (device) params.append('device', device);
      if (app) params.append('app_identifier', app);
      params.append('limit', limit);

      const res = await fetch(`/telemetry/timeline?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
      } else {
        setError(data.error || 'Không thể tải hành trình người dùng');
      }
    } catch (err) {
      setError(`Lỗi mạng: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryMeta = (cat) => {
    switch (cat) {
      case 'screen':
        return { icon: '📱', color: '#7d9cff', bg: 'rgba(125, 156, 255, 0.12)', label: 'Màn hình' };
      case 'event':
        return { icon: '⚡', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.12)', label: 'Sự kiện' };
      case 'api_success':
        return { icon: '✅', color: '#61e5bd', bg: 'rgba(97, 229, 189, 0.12)', label: 'API 200' };
      case 'api_warning':
        return { icon: '⚠️', color: '#f2c36d', bg: 'rgba(242, 195, 109, 0.12)', label: 'API 4xx' };
      case 'api_error':
        return { icon: '❌', color: '#ff7785', bg: 'rgba(255, 119, 133, 0.14)', label: 'API 5xx' };
      case 'crash':
        return { icon: '💥', color: '#ff4d61', bg: 'rgba(255, 77, 97, 0.22)', label: 'CRASH' };
      default:
        return { icon: '📌', color: '#93a4b8', bg: 'rgba(147, 164, 184, 0.12)', label: 'Bước' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Control Strip */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--surface)',
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>
              👤 Người dùng (User):
            </label>
            <input
              type="text"
              placeholder="Nhập tên / mã user..."
              value={user}
              onChange={(e) => setUser(e.target.value)}
              list="timeline-users-list"
              style={{
                padding: '0.45rem 0.75rem',
                background: 'var(--surface-raised)',
                border: '1px solid var(--line-strong)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '0.85rem',
                minWidth: '180px',
              }}
            />
            <datalist id="timeline-users-list">
              {availableUsers.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>
              📱 Thiết bị (Device):
            </label>
            <input
              type="text"
              placeholder="Nhập tên thiết bị..."
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              list="timeline-devices-list"
              style={{
                padding: '0.45rem 0.75rem',
                background: 'var(--surface-raised)',
                border: '1px solid var(--line-strong)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '0.85rem',
                minWidth: '180px',
              }}
            />
            <datalist id="timeline-devices-list">
              {availableDevices.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>

          {(user || device) && (
            <button
              type="button"
              className="view-btn"
              style={{ alignSelf: 'flex-end', padding: '0.45rem 0.75rem' }}
              onClick={() => { setUser(''); setDevice(''); setItems([]); }}
            >
              ✕ Xoá bộ lọc
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            className="secondary-btn"
            disabled={!items.length}
            onClick={() => exportToCsv('timeline', items)}
            style={{ fontSize: '0.82rem', padding: '0.5rem 0.85rem' }}
          >
            📥 Xuất Timeline (CSV)
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={loading}
            onClick={fetchTimeline}
            style={{ fontSize: '0.82rem', padding: '0.5rem 0.85rem' }}
          >
            {loading ? 'Đang tải…' : '🔄 Tải lại'}
          </button>
        </div>
      </div>

      {/* Target Active Info Banner */}
      {(user || device) && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(125, 156, 255, 0.08), rgba(94, 126, 234, 0.05))',
            border: '1px solid rgba(125, 156, 255, 0.25)',
            borderRadius: '10px',
            padding: '0.75rem 1.1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.86rem',
          }}
        >
          <div>
            🧭 Đang theo dõi hành trình của:{' '}
            {user && <strong>👤 {user} </strong>}
            {device && <span>({device})</span>}
          </div>
          <span className="count-pill">{items.length} bước ghi nhận</span>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={fetchTimeline}>Thử lại</button>
        </div>
      )}

      {/* Empty State when no filter chosen */}
      {!user && !device && (
        <div
          style={{
            textAlign: 'center',
            padding: '3.5rem 1.5rem',
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            border: '1px dashed var(--line-strong)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🧭</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.4rem' }}>
            Truy vết Chuỗi Hành vi Người dùng (User Journey Timeline)
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '560px', margin: '0 auto 1.25rem', lineHeight: 1.6 }}>
            Tính năng này xâu chuỗi toàn bộ các hành động: <strong>Chuyển màn hình 📱</strong> ➔ <strong>Gọi API 📡</strong> ➔ <strong>Sự kiện ⚡</strong> ➔ <strong>Sập ứng dụng 💥</strong> của cùng một Người dùng hoặc Thiết bị theo đúng thứ tự thời gian.
          </p>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>
            💡 <em>Mẹo: Bạn có thể nhấn nút <strong>"🐾 Hành trình"</strong> ở bất kỳ dòng nào trong bảng API Logs, Crashes hoặc Analytics để xem ngay.</em>
          </p>
        </div>
      )}

      {/* Timeline List */}
      {(user || device) && (
        <div
          style={{
            position: 'relative',
            paddingLeft: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Vertical continuous line */}
          <div
            style={{
              position: 'absolute',
              left: '26px',
              top: '15px',
              bottom: '15px',
              width: '2px',
              background: 'linear-gradient(to bottom, var(--accent), var(--line-strong))',
              zIndex: 1,
            }}
          />

          {items.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              Không tìm thấy sự kiện nào của đối tượng này trong 48 giờ qua.
            </div>
          )}

          {items.map((item, index) => {
            const meta = getCategoryMeta(item.category);
            const isExpanded = expandedId === item.id;
            const isCrash = item.category === 'crash';

            return (
              <div
                key={item.id}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  zIndex: 2,
                }}
              >
                {/* Node icon circle */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: meta.bg,
                    border: `2px solid ${meta.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.9rem',
                    flexShrink: 0,
                    boxShadow: isCrash ? '0 0 14px rgba(255, 77, 97, 0.45)' : undefined,
                  }}
                >
                  {meta.icon}
                </div>

                {/* Event Card Content */}
                <div
                  style={{
                    flex: 1,
                    background: isCrash ? 'rgba(255, 77, 97, 0.08)' : 'var(--surface)',
                    border: `1px solid ${isCrash ? 'rgba(255, 77, 97, 0.4)' : 'var(--line)'}`,
                    borderRadius: '10px',
                    padding: '0.85rem 1rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: meta.bg,
                          color: meta.color,
                          textTransform: 'uppercase',
                        }}
                      >
                        {meta.label}
                      </span>
                      <strong style={{ fontSize: '0.92rem', color: isCrash ? '#ff7785' : 'var(--text)' }}>
                        {item.title}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--accent)',
                          fontWeight: 600,
                          background: 'var(--surface-raised)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                        }}
                      >
                        {item.time_delta}
                      </span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        {item.created_at?.slice(11, 19)}
                      </span>
                    </div>
                  </div>

                  {item.subtitle && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      {item.subtitle}
                    </div>
                  )}

                  {/* Expandable details */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: '0.75rem',
                        paddingTop: '0.75rem',
                        borderTop: '1px solid var(--line)',
                        fontSize: '0.8rem',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.error_message && (
                        <div style={{ marginBottom: '0.5rem', color: '#ff7785' }}>
                          <strong>💥 Lỗi:</strong> {item.error_message}
                        </div>
                      )}

                      {item.stack_trace && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong>Stack Trace:</strong>
                          <pre style={{ maxHeight: '140px', overflowY: 'auto', background: 'var(--surface-muted)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {item.stack_trace}
                          </pre>
                        </div>
                      )}

                      {item.parameters && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong>Tham số (Parameters):</strong>
                          <pre style={{ maxHeight: '140px', overflowY: 'auto', background: 'var(--surface-muted)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {typeof item.parameters === 'object' ? JSON.stringify(item.parameters, null, 2) : item.parameters}
                          </pre>
                        </div>
                      )}

                      {item.response_payload && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong>Response Preview:</strong>
                          <pre style={{ maxHeight: '140px', overflowY: 'auto', background: 'var(--surface-muted)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {item.response_payload}
                          </pre>
                        </div>
                      )}

                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <span>Thiết bị: {item.device_name || 'N/A'}</span>
                        <span>User: {item.user_name || 'N/A'}</span>
                        <span>Thời gian: {item.created_at}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default UserJourneyTimeline;
