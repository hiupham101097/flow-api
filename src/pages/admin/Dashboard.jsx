import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../../styles/global.css';

const API_MONITOR_URL = import.meta.env.VITE_WORKER_URL || 'https://flow-api.hieupham101097.workers.dev';

function CodeBlock({ label, value, copyKey, copiedItem, onCopy }) {
  return (
    <div className="code-block">
      <div className="code-caption">
        <span>{label}</span>
        <button type="button" onClick={() => onCopy(value, copyKey)}>
          {copiedItem === copyKey ? '✓ Đã chép' : 'Sao chép'}
        </button>
      </div>
      <pre><code>{value}</code></pre>
    </div>
  );
}

function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const userIdFromUrl = searchParams.get('user_id');
  const jobIdFromUrl = searchParams.get('job_id');

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all', '200', '400', '500'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [copiedItem, setCopiedItem] = useState(null);
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [setupTab, setSetupTab] = useState('client');

  // User & Job Filtering State
  const [usersList, setUsersList] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState(userIdFromUrl || 'all');

  const copyToClipboard = async (value, item) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedItem(item);
      window.setTimeout(() => {
        setCopiedItem((current) => current === item ? null : current);
      }, 1600);
    } catch {
      setCopiedItem(null);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_MONITOR_URL}/users`);
      if (response.ok) {
        const data = await response.json();
        setUsersList(Array.isArray(data) ? data : []);
      }
    } catch (_) {}
  };

  const fetchLogs = async (overrideFilter) => {
    try {
      const activeUser = overrideFilter !== undefined ? overrideFilter : selectedFilter;
      let url = `${API_MONITOR_URL}/logs`;
      const queryParts = [];

      if (activeUser && activeUser !== 'all') {
        queryParts.push(`user_id=${encodeURIComponent(activeUser)}`);
      }
      if (queryParts.length > 0) {
        url += `?${queryParts.join('&')}`;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Update when URL params change
  useEffect(() => {
    if (userIdFromUrl) {
      setSelectedFilter(userIdFromUrl);
      fetchLogs(userIdFromUrl);
    } else {
      fetchLogs(selectedFilter);
    }
  }, [userIdFromUrl]);

  // Polling every 5s
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchLogs();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selectedFilter]);

  // Escape to close modal
  useEffect(() => {
    if (!selectedLog) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedLog(null);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedLog]);

  const handleFilterChange = (val) => {
    setSelectedFilter(val);
    if (val === 'all') {
      setSearchParams({});
      fetchLogs('all');
    } else {
      setSearchParams({ user_id: val });
      fetchLogs(val);
    }
  };

  const activeUserJob = useMemo(() => {
    if (selectedFilter === 'all') return null;
    return usersList.find((u) => String(u.id) === String(selectedFilter)) || null;
  }, [selectedFilter, usersList]);

  const currentAppId = activeUserJob?.app_identifier || 'my_telemetry_id';

  // Integration Snippets
  const flutterClientSnippet = `import 'package:http/http.dart' as http;
import 'api_logger.dart';

// Tự động gửi telemetry với App ID của ${activeUserJob?.name || 'ứng dụng'}
final http.Client client = LoggingClient(
  http.Client(), 
  appId: '${currentAppId}',
);`;

  const flutterDioSnippet = `// Gán App ID vào Dio Interceptor
ApiLogger.record(
  endpoint: response.requestOptions.uri.toString(),
  method: response.requestOptions.method,
  statusCode: response.statusCode ?? 200,
  responsePayload: response.data,
  durationMs: 120,
  appId: '${currentAppId}',
);`;

  const webAxiosSnippet = `import { setupAxiosMonitor } from './utils/api-logger';
import axios from 'axios';

// Gắn telemetry cho toàn bộ Web App
setupAxiosMonitor(axios, '${currentAppId}');`;

  const webFetchSnippet = `import { createMonitoredFetch } from './utils/api-logger';

// Sử dụng monitoredFetch thay cho fetch mặc định
const monitoredFetch = createMonitoredFetch('${currentAppId}');
const res = await monitoredFetch('https://api.example.com/data');`;

  const formatDate = (dateString) => new Date(dateString).toLocaleString();

  const categorizeEndpoint = (url) => {
    const lowerUrl = (url || '').toLowerCase();
    if (lowerUrl.includes('viettelpost')) return { name: 'ViettelPost', color: '#fb923c' };
    if (lowerUrl.includes('ekyb')) return { name: 'eKYB', color: '#a78bfa' };
    if (lowerUrl.includes('esco')) return { name: 'Esco KYC', color: '#22d3ee' };
    if (lowerUrl.includes('traceability')) return { name: 'Traceability', color: '#a3e635' };
    if (lowerUrl.includes('sign')) return { name: 'Digital Sign', color: '#f472b6' };
    return { name: 'App API', color: '#94a3b8' };
  };

  const getStatusMeta = (statusCode) => {
    const code = Number(statusCode);
    if (code >= 200 && code < 300) {
      return { type: '200', badgeClass: 'status-200', pillClass: 'pill-success', label: 'OK' };
    }
    if (code >= 400 && code < 500) {
      return { type: '400', badgeClass: 'status-400', pillClass: 'pill-warning', label: 'Client Error' };
    }
    return { type: '500', badgeClass: 'status-500', pillClass: 'pill-danger', label: 'Server Error' };
  };

  const parseJsonSafe = (data) => {
    if (data === undefined || data === null) return null;
    if (typeof data !== 'string') return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  };

  const formatJsonPretty = (data) => {
    const parsed = parseJsonSafe(data);
    if (parsed === null) return 'null';
    if (typeof parsed === 'object') {
      return JSON.stringify(parsed, null, 2);
    }
    return String(parsed);
  };

  const getSummarySnippet = (log) => {
    const meta = getStatusMeta(log.status_code);
    if (meta.type === '200') {
      if (!log.response_payload) return '📦 Trả về 200 OK (Không có payload)';
      const parsed = parseJsonSafe(log.response_payload);
      if (Array.isArray(parsed)) {
        return `📦 Data: [Danh sách ${parsed.length} phần tử]`;
      }
      if (typeof parsed === 'object' && parsed !== null) {
        const keys = Object.keys(parsed).slice(0, 4).join(', ');
        return `📦 Data: { ${keys}${Object.keys(parsed).length > 4 ? ', …' : ''} }`;
      }
      return `📦 Data: ${String(parsed).substring(0, 45)}…`;
    }
    if (meta.type === '400') {
      return `⚠️ 4xx: ${log.error_message || 'Yêu cầu không hợp lệ'}`;
    }
    return `🚨 5xx: ${log.error_message || 'Lỗi hệ thống máy chủ'}`;
  };

  const generateCurlCommand = (log) => {
    let curl = `curl -X ${log.method || 'GET'} "${log.endpoint}"`;
    if (log.request_payload) {
      const dataStr = typeof log.request_payload === 'string' 
        ? log.request_payload 
        : JSON.stringify(log.request_payload);
      curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${dataStr.replace(/'/g, "'\\''")}'`;
    }
    return curl;
  };

  // Status counters
  const totalCalls = logs.length;
  const count200 = logs.filter((log) => log.status_code >= 200 && log.status_code < 300).length;
  const count400 = logs.filter((log) => log.status_code >= 400 && log.status_code < 500).length;
  const count500 = logs.filter((log) => log.status_code >= 500 || log.status_code < 200).length;
  const successRate = totalCalls > 0 ? Math.round((count200 / totalCalls) * 100) : null;
  const totalDuration = logs.reduce((acc, log) => acc + (Number(log.duration_ms) || 0), 0);
  const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

  // Filter and search
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesTab = (() => {
        if (activeTab === 'all') return true;
        if (activeTab === '200') return log.status_code >= 200 && log.status_code < 300;
        if (activeTab === '400') return log.status_code >= 400 && log.status_code < 500;
        if (activeTab === '500') return log.status_code >= 500 || log.status_code < 200;
        return true;
      })();

      if (!matchesTab) return false;

      if (!searchTerm) return true;
      const lowerSearch = searchTerm.toLowerCase();
      const endpointMatch = (log.endpoint || '').toLowerCase().includes(lowerSearch);
      const statusMatch = String(log.status_code || '').includes(lowerSearch);
      const errorMatch = (log.error_message || '').toLowerCase().includes(lowerSearch);
      const appMatch = (log.app_identifier || '').toLowerCase().includes(lowerSearch);
      const userMatch = (log.user_name || '').toLowerCase().includes(lowerSearch);
      const jobMatch = (log.job_name || '').toLowerCase().includes(lowerSearch);

      return endpointMatch || statusMatch || errorMatch || appMatch || userMatch || jobMatch;
    });
  }, [logs, activeTab, searchTerm]);

  return (
    <div style={{ paddingTop: '1.25rem' }}>
      {/* Page Title & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Giám sát Logs & Telemetry
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Thu thập và theo dõi các cuộc gọi API từ Mobile App và Website theo thời gian thực.
          </p>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setIntegrationOpen((prev) => !prev)}
          >
            🔌 Cấu hình SDK ({activeUserJob?.job_type === 'web' ? 'Web' : 'App'})
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={loading}
            onClick={() => { setLoading(true); fetchLogs(); }}
          >
            {loading ? 'Đang tải…' : '🔄 Làm mới'}
          </button>
        </div>
      </div>

      {/* User & Job Selector Dock */}
      <div className="user-filter-dock">
        <div className="user-filter-info">
          <span style={{ fontSize: '1.3rem' }}>🎯</span>
          <div>
            <strong>Mục tiêu giám sát:</strong>
            <span style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
              {activeUserJob ? (
                <>
                  <span className={`type-badge ${activeUserJob.job_type === 'app' ? 'type-badge-app' : 'type-badge-web'}`} style={{ marginRight: '0.45rem' }}>
                    {activeUserJob.job_type === 'app' ? '📱 App' : '🌐 Web'}
                  </span>
                  <b style={{ color: 'var(--text)' }}>{activeUserJob.job_name}</b>
                  <span style={{ color: 'var(--text-dim)' }}> — Người phụ trách: {activeUserJob.name} (<code>{activeUserJob.app_identifier}</code>)</span>
                </>
              ) : (
                'Toàn bộ hệ thống (Hiển thị tất cả Users & Jobs)'
              )}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            className="user-filter-select"
            value={selectedFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
          >
            <option value="all">🌐 Toàn bộ hệ thống (Tất cả logs)</option>
            {usersList.filter(u => u.job_name).map((u) => (
              <option key={u.id} value={u.id}>
                {u.job_type === 'app' ? '📱' : '🌐'} {u.name} — {u.job_name} ({u.app_identifier})
              </option>
            ))}
          </select>

          {selectedFilter !== 'all' && (
            <button
              type="button"
              className="view-btn"
              style={{ fontSize: '0.78rem', padding: '0.5rem 0.85rem' }}
              onClick={() => handleFilterChange('all')}
            >
              ✕ Xem tất cả
            </button>
          )}
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <section className="metrics-strip" aria-label="API telemetry summary">
        <div className="metric-item metric-lead">
          <span>Tổng số cuộc gọi</span>
          <strong>{totalCalls}</strong>
          <small>{selectedFilter === 'all' ? 'Toàn bộ hệ thống' : `Cho ${activeUserJob?.name}`}</small>
        </div>
        <div className="metric-item">
          <span>200 OK (Thành công)</span>
          <strong className="metric-success">{count200}</strong>
          <small>{successRate !== null ? `${successRate}% tỷ lệ thành công` : 'Chưa có log'}</small>
        </div>
        <div className="metric-item">
          <span>4xx Lỗi Client</span>
          <strong style={{ color: count400 ? 'var(--warning)' : 'inherit' }}>{count400}</strong>
          <small>{count400 ? 'Sai tham số / Xác thực' : 'Không có lỗi 4xx'}</small>
        </div>
        <div className="metric-item">
          <span>5xx Lỗi Server</span>
          <strong className={count500 ? 'metric-error' : ''}>{count500}</strong>
          <small>{count500 ? 'Ngoại lệ máy chủ' : 'Hệ thống ổn định'}</small>
        </div>
        <div className="metric-item">
          <span>Độ trễ trung bình</span>
          <strong>{avgDuration}<em>ms</em></strong>
          <small>Thời gian phản hồi</small>
        </div>
      </section>

      {/* Integration Setup Dock */}
      {integrationOpen && (
        <section
          id="integration-setup"
          className="integration-dock is-open"
          style={{ marginBottom: '1.75rem' }}
        >
          <div className="integration-bar">
            <div className="integration-title-group">
              <span className="platform-tag">
                {activeUserJob?.job_type === 'web' ? '🌐 Web App SDK' : '📱 Flutter & Web SDK'}
              </span>
              <div>
                <h2>Kết nối Telemetry tự động</h2>
                <p>
                  Mã App ID hiện tại: <code>{currentAppId}</code> · Server: <code>{API_MONITOR_URL}/logs</code>
                </p>
              </div>
            </div>
            <div className="integration-actions">
              <button type="button" className="text-btn" onClick={() => copyToClipboard(API_MONITOR_URL, 'url')}>
                {copiedItem === 'url' ? 'Đã sao chép' : 'Copy URL Server'}
              </button>
              <button
                type="button"
                className="collapse-btn"
                onClick={() => setIntegrationOpen(false)}
              >
                Đóng hướng dẫn
              </button>
            </div>
          </div>

          <div className="integration-content">
            <nav className="setup-tabs">
              <button
                type="button"
                className={setupTab === 'client' ? 'active' : ''}
                onClick={() => setSetupTab('client')}
              >
                <span>01</span><strong>Flutter HTTP</strong><small>LoggingClient</small>
              </button>
              <button
                type="button"
                className={setupTab === 'dio' ? 'active' : ''}
                onClick={() => setSetupTab('dio')}
              >
                <span>02</span><strong>Flutter Dio</strong><small>ApiLogger.record()</small>
              </button>
              <button
                type="button"
                className={setupTab === 'axios' ? 'active' : ''}
                onClick={() => setSetupTab('axios')}
              >
                <span>03</span><strong>Web Axios</strong><small>setupAxiosMonitor</small>
              </button>
              <button
                type="button"
                className={setupTab === 'fetch' ? 'active' : ''}
                onClick={() => setSetupTab('fetch')}
              >
                <span>04</span><strong>Web Fetch</strong><small>createMonitoredFetch</small>
              </button>
            </nav>

            <div className="setup-content">
              {setupTab === 'client' && (
                <div className="setup-pane setup-pane-split">
                  <div>
                    <div className="pane-heading">
                      <h3>1. Dùng LoggingClient cho package `http` (Flutter)</h3>
                      <p>Tự động ghi lại payload 200 và chẩn đoán lỗi 400/500 kèm mã định danh theo dõi.</p>
                    </div>
                  </div>
                  <CodeBlock
                    label="Flutter http Client"
                    value={flutterClientSnippet}
                    copyKey="client"
                    copiedItem={copiedItem}
                    onCopy={copyToClipboard}
                  />
                </div>
              )}

              {setupTab === 'dio' && (
                <div className="setup-pane">
                  <div className="pane-heading">
                    <h3>2. Tích hợp với package `Dio` (Flutter)</h3>
                    <p>Gắn <code>ApiLogger.record()</code> vào interceptor với <code>appId</code>:</p>
                  </div>
                  <CodeBlock
                    label="Dio Interceptor"
                    value={flutterDioSnippet}
                    copyKey="dio"
                    copiedItem={copiedItem}
                    onCopy={copyToClipboard}
                  />
                </div>
              )}

              {setupTab === 'axios' && (
                <div className="setup-pane">
                  <div className="pane-heading">
                    <h3>3. Tích hợp Axios Interceptor (Web App / React / Vue)</h3>
                    <p>Gắn vào instance Axios một lần duy nhất khi ứng dụng khởi chạy:</p>
                  </div>
                  <CodeBlock
                    label="Axios Monitor Setup"
                    value={webAxiosSnippet}
                    copyKey="axios"
                    copiedItem={copiedItem}
                    onCopy={copyToClipboard}
                  />
                </div>
              )}

              {setupTab === 'fetch' && (
                <div className="setup-pane">
                  <div className="pane-heading">
                    <h3>4. Tích hợp Monitored Fetch (Web Vanilla / Next.js)</h3>
                    <p>Sử dụng wrapper fetch để tự động đo latency và gửi telemetry:</p>
                  </div>
                  <CodeBlock
                    label="Monitored Fetch"
                    value={webFetchSnippet}
                    copyKey="fetch"
                    copiedItem={copiedItem}
                    onCopy={copyToClipboard}
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Main Logs Table Panel */}
      <section className="log-panel" aria-labelledby="telemetry-log-title">
        <div className="log-panel-header">
          <div className="log-title-group">
            <h2 id="telemetry-log-title">Nhật ký API Telemetry</h2>
            <span className="count-pill">{filteredLogs.length} yêu cầu</span>
          </div>

          <div className="log-controls">
            <div className="filter-tabs" role="tablist" aria-label="Lọc trạng thái HTTP">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'all'}
                className={`filter-tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                Tất cả <span className="tab-count">{totalCalls}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === '200'}
                className={`filter-tab tab-success ${activeTab === '200' ? 'active' : ''}`}
                onClick={() => setActiveTab('200')}
              >
                <span className="dot dot-success" /> 200 OK <span className="tab-count">{count200}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === '400'}
                className={`filter-tab tab-warning ${activeTab === '400' ? 'active' : ''}`}
                onClick={() => setActiveTab('400')}
              >
                <span className="dot dot-warning" /> 4xx Lỗi Client <span className="tab-count">{count400}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === '500'}
                className={`filter-tab tab-danger ${activeTab === '500' ? 'active' : ''}`}
                onClick={() => setActiveTab('500')}
              >
                <span className="dot dot-danger" /> 5xx Lỗi Server <span className="tab-count">{count500}</span>
              </button>
            </div>

            <label className="search-field">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6" />
                <path d="m16 16 4 4" />
              </svg>
              <span className="sr-only">Tìm kiếm logs</span>
              <input
                type="search"
                placeholder="Tìm endpoint, user, app ID, lỗi..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <span>Không thể kết nối lấy telemetry: {error}</span>
            <button type="button" onClick={() => fetchLogs()}>Thử lại</button>
          </div>
        )}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Mục tiêu (Job / User)</th>
                <th>Dịch vụ</th>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Trạng thái</th>
                <th>Dữ liệu / Lỗi tóm tắt</th>
                <th>Độ trễ</th>
                <th><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 && (
                <tr><td colSpan="9" className="table-message">Đang kết nối nhận telemetry…</td></tr>
              )}

              {filteredLogs.length === 0 && !loading && (
                <tr>
                  <td colSpan="9">
                    <div className="empty-state">
                      <h3>{logs.length === 0 ? 'Chưa có telemetry nào' : 'Không tìm thấy request phù hợp'}</h3>
                      <p>
                        {logs.length === 0
                          ? 'Kết nối client Mobile hoặc Web để theo dõi các lệnh gọi API theo thời gian thực.'
                          : 'Thử tìm kiếm với từ khóa khác hoặc chuyển tab lọc.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {filteredLogs.map((log) => {
                const service = categorizeEndpoint(log.endpoint);
                const statusMeta = getStatusMeta(log.status_code);
                const summaryText = getSummarySnippet(log);
                const isApp = log.job_type === 'app';

                return (
                  <tr
                    key={log.id}
                    className={statusMeta.type !== '200' ? 'row-error' : ''}
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="timestamp-cell">{formatDate(log.created_at)}</td>
                    <td>
                      {log.job_name ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span className={`type-badge ${isApp ? 'type-badge-app' : 'type-badge-web'}`} style={{ width: 'fit-content' }}>
                            {isApp ? '📱 App' : '🌐 Web'} {log.job_name}
                          </span>
                          <small style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                            {log.user_name ? `👤 ${log.user_name}` : `ID: ${log.app_identifier || '-'}`}
                          </small>
                        </div>
                      ) : log.app_identifier ? (
                        <span className="type-badge" style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' }}>
                          🏷️ {log.app_identifier}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Mặc định</span>
                      )}
                    </td>
                    <td>
                      <span className="service-badge" style={{ '--service-color': service.color }}>
                        {service.name}
                      </span>
                    </td>
                    <td>
                      <span className={`method-badge ${(log.method || '').toLowerCase()}`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="endpoint-cell" title={log.endpoint}>
                      {log.endpoint}
                    </td>
                    <td>
                      <span className={`status-badge ${statusMeta.badgeClass}`}>
                        {log.status_code || 0}
                      </span>
                    </td>
                    <td className="summary-cell" title={summaryText}>
                      <span className={`summary-pill ${statusMeta.pillClass}`}>
                        {summaryText}
                      </span>
                    </td>
                    <td className="duration-cell">{log.duration_ms || 0} ms</td>
                    <td className="action-cell">
                      <button
                        type="button"
                        className="view-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedLog(log);
                        }}
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detail Modal */}
      {selectedLog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="modal-container"
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-header-info">
                <span>Chi tiết lệnh gọi API</span>
                <h2 id="log-detail-title" title={selectedLog.endpoint}>
                  {selectedLog.endpoint}
                </h2>
              </div>
              <div className="modal-header-actions">
                <button
                  type="button"
                  className="btn-mini"
                  onClick={() => copyToClipboard(generateCurlCommand(selectedLog), 'curl')}
                >
                  {copiedItem === 'curl' ? '✓ Đã sao chép' : '📋 Copy cURL'}
                </button>
                <button
                  type="button"
                  className="close-btn"
                  aria-label="Đóng chi tiết"
                  onClick={() => setSelectedLog(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body">
              {/* Target App/Web Information */}
              <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--line)', padding: '0.9rem 1.1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Mục tiêu theo dõi (Job)
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                    <span className={`type-badge ${selectedLog.job_type === 'app' ? 'type-badge-app' : 'type-badge-web'}`}>
                      {selectedLog.job_type === 'app' ? '📱 App' : '🌐 Web'}
                    </span>
                    <strong style={{ fontSize: '0.92rem' }}>
                      {selectedLog.job_name || 'Chưa phân loại'}
                    </strong>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Người phụ trách & App ID
                  </span>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {selectedLog.user_name ? `👤 ${selectedLog.user_name}` : 'Không có'}{' '}
                    {selectedLog.app_identifier ? `(<code>${selectedLog.app_identifier}</code>)` : ''}
                  </div>
                </div>
              </div>

              {/* Status Alert Banner */}
              {(() => {
                const meta = getStatusMeta(selectedLog.status_code);
                if (meta.type === '200') {
                  return (
                    <div className="modal-status-banner banner-success">
                      <div>
                        <strong>✅ HTTP {selectedLog.status_code} OK — Yêu cầu thành công</strong>
                        <span>API phản hồi thành công và trả về dữ liệu đầy đủ.</span>
                      </div>
                    </div>
                  );
                }
                if (meta.type === '400') {
                  return (
                    <div className="modal-status-banner banner-warning">
                      <div>
                        <strong>⚠️ HTTP {selectedLog.status_code} — Lỗi từ Client (Bad Request / Validation)</strong>
                        <span>
                          {selectedLog.error_message
                            ? `Nguyên nhân lỗi: ${selectedLog.error_message}`
                            : 'Yêu cầu không hợp lệ hoặc thiếu tham số bắt buộc.'}
                        </span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="modal-status-banner banner-danger">
                    <div>
                      <strong>🚨 HTTP {selectedLog.status_code || 500} — Lỗi máy chủ (Server Error)</strong>
                      <span>
                        {selectedLog.error_message
                          ? `Lỗi: ${selectedLog.error_message}`
                          : 'Hệ thống máy chủ gặp sự cố không thể xử lý yêu cầu.'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Meta Grid */}
              <div className="modal-meta-grid">
                <div>
                  <span className="meta-label">Phương thức</span>
                  <strong className="meta-value">{selectedLog.method}</strong>
                </div>
                <div>
                  <span className="meta-label">Trạng thái HTTP</span>
                  <strong className="meta-value">{selectedLog.status_code || 'Không có'}</strong>
                </div>
                <div>
                  <span className="meta-label">Độ trễ phản hồi</span>
                  <strong className="meta-value">{selectedLog.duration_ms || 0} ms</strong>
                </div>
                <div>
                  <span className="meta-label">Thời điểm ghi nhận</span>
                  <strong className="meta-value">{formatDate(selectedLog.created_at)}</strong>
                </div>
              </div>

              {/* Response Payload */}
              <section className="log-section">
                <div className="section-head">
                  <h3>📦 Dữ liệu phản hồi (Response Payload)</h3>
                  {selectedLog.response_payload && (
                    <button
                      type="button"
                      className="btn-mini"
                      onClick={() => copyToClipboard(formatJsonPretty(selectedLog.response_payload), 'res')}
                    >
                      {copiedItem === 'res' ? '✓ Đã sao chép' : 'Sao chép JSON'}
                    </button>
                  )}
                </div>
                <pre className="log-code">
                  {selectedLog.response_payload
                    ? formatJsonPretty(selectedLog.response_payload)
                    : '// Không có response payload trả về'}
                </pre>
              </section>

              {/* Error Detail */}
              {selectedLog.error_message && (
                <section className="log-section">
                  <div className="section-head">
                    <h3 className="text-danger">⚠️ Chi tiết lỗi (Error Details)</h3>
                    <button
                      type="button"
                      className="btn-mini"
                      onClick={() => copyToClipboard(selectedLog.error_message, 'err')}
                    >
                      {copiedItem === 'err' ? '✓ Đã sao chép' : 'Sao chép'}
                    </button>
                  </div>
                  <div className="log-code error-highlight">
                    {selectedLog.error_message}
                  </div>
                </section>
              )}

              {/* Request Payload */}
              {selectedLog.request_payload && (
                <section className="log-section">
                  <div className="section-head">
                    <h3>📤 Dữ liệu gửi đi (Request Payload)</h3>
                    <button
                      type="button"
                      className="btn-mini"
                      onClick={() => copyToClipboard(formatJsonPretty(selectedLog.request_payload), 'req')}
                    >
                      {copiedItem === 'req' ? '✓ Đã sao chép' : 'Sao chép JSON'}
                    </button>
                  </div>
                  <pre className="log-code">
                    {formatJsonPretty(selectedLog.request_payload)}
                  </pre>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
