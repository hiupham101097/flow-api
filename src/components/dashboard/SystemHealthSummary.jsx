import React, { useState, useEffect } from 'react';

function SystemHealthSummary({ selectedApp = '', platformScope = 'app' }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchHealth();
  }, [selectedApp, platformScope]);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (platformScope) {
        queryParams.set('platform', platformScope);
      }
      if (selectedApp && selectedApp !== 'all') {
        queryParams.set('app_identifier', selectedApp);
      }
      const url = `/telemetry/health?${queryParams.toString()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error('Failed to fetch health stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!health) return null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.25rem',
      }}
    >
      {/* 1. Success Rate */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
        }}
      >
        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Tỷ lệ thành công (24h)</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          <strong style={{ fontSize: '1.35rem', color: health.success_rate >= 95 ? '#61e5bd' : '#ffb300' }}>
            {health.success_rate}%
          </strong>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
          {health.server_errors > 0 ? `${health.server_errors} lỗi máy chủ (5xx)` : 'Hoạt động hoàn hảo'}
        </span>
      </div>

      {/* 2. Avg Latency */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
        }}
      >
        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Độ trễ trung bình (24h)</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
          <strong style={{ fontSize: '1.35rem', color: 'var(--text)' }}>
            {health.avg_latency_ms}
          </strong>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>ms</span>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
          Thời gian máy chủ phản hồi
        </span>
      </div>

      {/* 3. Fatal Crashes / Runtime Errors */}
      <div
        style={{
          background: health.fatal_crashes > 0 ? 'rgba(255, 119, 133, 0.08)' : 'var(--surface)',
          border: `1px solid ${health.fatal_crashes > 0 ? 'rgba(255, 119, 133, 0.3)' : 'var(--line)'}`,
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
        }}
      >
        <span style={{ fontSize: '0.76rem', color: health.fatal_crashes > 0 ? '#ff7785' : 'var(--text-muted)' }}>
          {platformScope === 'web' ? 'Sự cố Runtime / JS (24h)' : 'Sự cố sập app (24h)'}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          <strong style={{ fontSize: '1.35rem', color: health.fatal_crashes > 0 ? '#ff4d61' : '#61e5bd' }}>
            {health.fatal_crashes}
          </strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>/ {health.total_crashes} sự cố</span>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
          {health.fatal_crashes > 0
            ? (platformScope === 'web' ? 'Lỗi JS sập trang / runtime' : 'Cần khắc phục ngay')
            : (platformScope === 'web' ? 'Không có lỗi JS runtime' : 'Không có fatal crash')}
        </span>
      </div>

      {/* 4. Total Calls */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
        }}
      >
        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          {platformScope === 'web' ? 'Lưu lượng Web API (24h)' : 'Lưu lượng API (24h)'}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          <strong style={{ fontSize: '1.35rem', color: 'var(--text)' }}>
            {health.total_logs}
          </strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>yêu cầu</span>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
          Ghi nhận trên Cloudflare
        </span>
      </div>

      {/* 5. Total Events */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
        }}
      >
        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          {platformScope === 'web' ? 'Sự kiện Web (24h)' : 'Sự kiện Analytics (24h)'}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          <strong style={{ fontSize: '1.35rem', color: 'var(--accent)' }}>
            {health.total_events}
          </strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>events</span>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
          {platformScope === 'web' ? 'Tương tác & Page Views' : 'Hành vi người dùng'}
        </span>
      </div>
    </div>
  );
}

export default SystemHealthSummary;
