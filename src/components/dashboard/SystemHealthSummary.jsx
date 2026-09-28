import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../../constants/api';

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
      const url = getApiUrl(`/telemetry/health?${queryParams.toString()}`);
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
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

  const isFatalAlert = (health.fatal_crashes || 0) > 0;
  const isHighSuccess = (health.success_rate || 0) >= 98;
  const isModerateSuccess = (health.success_rate || 0) >= 90;

  return (
    <div className="telemetry-health-grid" aria-label="Tóm tắt sức khỏe hệ thống">
      {/* 1. Tỷ lệ thành công */}
      <div className="health-card health-card-success">
        <div className="health-card-header">
          <span className="health-card-title">Tỷ lệ thành công (24h)</span>
          <span className="health-card-icon" aria-hidden="true">🎯</span>
        </div>
        <div className="health-card-value-row">
          <span
            className="health-card-value"
            style={{
              color: isHighSuccess ? 'var(--success)' : isModerateSuccess ? 'var(--warning)' : 'var(--danger)',
            }}
          >
            {health.success_rate}%
          </span>
        </div>
        <div className="health-card-footer">
          <span className={`health-card-chip ${health.server_errors > 0 ? 'chip-danger' : 'chip-success'}`}>
            {health.server_errors > 0 ? `${health.server_errors} lỗi 5xx` : 'Hoạt động tối ưu'}
          </span>
          <span>trên tổng cuộc gọi</span>
        </div>
      </div>

      {/* 2. Độ trễ trung bình */}
      <div className="health-card health-card-latency">
        <div className="health-card-header">
          <span className="health-card-title">Độ trễ trung bình (24h)</span>
          <span className="health-card-icon" aria-hidden="true">⚡</span>
        </div>
        <div className="health-card-value-row">
          <span className="health-card-value">{health.avg_latency_ms}</span>
          <span className="health-card-unit">ms</span>
        </div>
        <div className="health-card-footer">
          <span
            className={`health-card-chip ${
              health.avg_latency_ms < 300
                ? 'chip-success'
                : health.avg_latency_ms < 1000
                ? 'chip-info'
                : 'chip-danger'
            }`}
          >
            {health.avg_latency_ms < 300 ? 'Cực nhanh' : health.avg_latency_ms < 1000 ? 'Bình thường' : 'Chậm'}
          </span>
          <span>Phản hồi máy chủ</span>
        </div>
      </div>

      {/* 3. Sự cố Fatal / Runtime */}
      <div className={`health-card health-card-crashes ${isFatalAlert ? 'is-alert' : ''}`}>
        <div className="health-card-header">
          <span className="health-card-title">
            {platformScope === 'web' ? 'Sự cố Runtime / JS (24h)' : 'Sự cố sập app (24h)'}
          </span>
          <span className="health-card-icon" aria-hidden="true">🔥</span>
        </div>
        <div className="health-card-value-row">
          <span className="health-card-value" style={{ color: isFatalAlert ? 'var(--danger)' : 'var(--success)' }}>
            {health.fatal_crashes}
          </span>
          <span className="health-card-unit">/ {health.total_crashes} sự cố</span>
        </div>
        <div className="health-card-footer">
          <span className={`health-card-chip ${isFatalAlert ? 'chip-danger' : 'chip-success'}`}>
            {isFatalAlert ? 'Cần xử lý ngay' : 'Không có fatal crash'}
          </span>
          <span>{platformScope === 'web' ? 'Ngoại lệ JS runtime' : 'Crashlytics'}</span>
        </div>
      </div>

      {/* 4. Tổng lưu lượng API */}
      <div className="health-card health-card-logs">
        <div className="health-card-header">
          <span className="health-card-title">
            {platformScope === 'web' ? 'Lưu lượng Web API (24h)' : 'Lưu lượng API (24h)'}
          </span>
          <span className="health-card-icon" aria-hidden="true">📡</span>
        </div>
        <div className="health-card-value-row">
          <span className="health-card-value">{health.total_logs?.toLocaleString() || 0}</span>
          <span className="health-card-unit">requests</span>
        </div>
        <div className="health-card-footer">
          <span className="health-card-chip chip-info">Cloudflare Edge</span>
          <span>Được log đầy đủ</span>
        </div>
      </div>

      {/* 5. Tổng sự kiện Analytics */}
      <div className="health-card health-card-events">
        <div className="health-card-header">
          <span className="health-card-title">
            {platformScope === 'web' ? 'Tương tác Web (24h)' : 'Sự kiện Analytics (24h)'}
          </span>
          <span className="health-card-icon" aria-hidden="true">📊</span>
        </div>
        <div className="health-card-value-row">
          <span className="health-card-value" style={{ color: 'var(--purple)' }}>
            {health.total_events?.toLocaleString() || 0}
          </span>
          <span className="health-card-unit">events</span>
        </div>
        <div className="health-card-footer">
          <span className="health-card-chip chip-info">User Tracking</span>
          <span>{platformScope === 'web' ? 'Page Views & Clicks' : 'Hành vi & Phễu'}</span>
        </div>
      </div>
    </div>
  );
}

export default SystemHealthSummary;
