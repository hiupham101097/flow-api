import React, { useEffect, useMemo, useState } from 'react';
import '../../styles/global.css';

const API_MONITOR_URL = 'https://flow-api.hieupham101097.workers.dev';
const FLUTTER_ENV = `API_MONITOR_URL=${API_MONITOR_URL}`;
const FLUTTER_RUN = `flutter run --dart-define=API_MONITOR_URL=${API_MONITOR_URL}`;
const FLUTTER_CONFIG = `class EnvConfig {
  static const apiMonitorUrl = String.fromEnvironment(
    'API_MONITOR_URL',
    defaultValue: '${API_MONITOR_URL}',
  );
}`;
const ANDROID_PERMISSION = '<uses-permission android:name="android.permission.INTERNET" />';
const FLUTTER_CLIENT = `import 'package:http/http.dart' as http;
import 'api_logger.dart';

// Tự động ghi lại Data khi 200, bóc tách lỗi khi 400 & 500
final http.Client client = LoggingClient(
  http.Client(), 
  appId: 'my_flutter_app',
);`;

const FLUTTER_DIO = `// Hoặc dùng Dio Interceptor với ApiLogger.record()
dio.interceptors.add(InterceptorsWrapper(
  onResponse: (response, handler) {
    ApiLogger.record(
      endpoint: response.requestOptions.uri.toString(),
      method: response.requestOptions.method,
      statusCode: response.statusCode ?? 200,
      responsePayload: response.data,
      durationMs: 120,
    );
    return handler.next(response);
  },
  onError: (DioException err, handler) {
    ApiLogger.record(
      endpoint: err.requestOptions.uri.toString(),
      method: err.requestOptions.method,
      statusCode: err.response?.statusCode ?? 500,
      errorMessage: err.message,
      responsePayload: err.response?.data,
      durationMs: 120,
    );
    return handler.next(err);
  },
));`;

function CodeBlock({ label, value, copyKey, copiedItem, onCopy }) {
  return (
    <div className="code-block">
      <div className="code-caption">
        <span>{label}</span>
        <button type="button" onClick={() => onCopy(value, copyKey)}>
          {copiedItem === copyKey ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{value}</code></pre>
    </div>
  );
}

function Dashboard() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all', '200', '400', '500'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [copiedItem, setCopiedItem] = useState(null);
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [setupTab, setSetupTab] = useState('client');

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

  const fetchLogs = async () => {
    try {
      const apiUrl = import.meta.env.VITE_WORKER_URL || 'http://127.0.0.1:8787';
      const response = await fetch(`${apiUrl}/logs`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      setLogs(data);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = window.setInterval(fetchLogs, 5000);
    return () => window.clearInterval(interval);
  }, []);

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

  const successRate = totalCalls ? Math.round((count200 / totalCalls) * 100) : null;
  const avgDuration = totalCalls
    ? Math.round(logs.reduce((sum, log) => sum + (log.duration_ms || 0), 0) / totalCalls)
    : 0;

  const filteredLogs = useMemo(() => logs.filter((log) => {
    const meta = getStatusMeta(log.status_code);
    if (activeTab === '200' && meta.type !== '200') return false;
    if (activeTab === '400' && meta.type !== '400') return false;
    if (activeTab === '500' && meta.type !== '500') return false;

    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      const endpointMatch = (log.endpoint || '').toLowerCase().includes(query);
      const serviceMatch = categorizeEndpoint(log.endpoint).name.toLowerCase().includes(query);
      const statusMatch = String(log.status_code || '').includes(query);
      const methodMatch = (log.method || '').toLowerCase().includes(query);
      const errorMatch = (log.error_message || '').toLowerCase().includes(query);
      if (!endpointMatch && !serviceMatch && !statusMatch && !methodMatch && !errorMatch) {
        return false;
      }
    }

    return true;
  }), [logs, activeTab, searchTerm]);

  const openIntegration = () => {
    setIntegrationOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById('flutter-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/logo.png" alt="Gden Monitor" style={{ height: '42px', width: 'auto' }} />
          <div>
            <h1>Gden Monitor</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="live-indicator"><span aria-hidden="true" /> Live · 5s</span>
          <button type="button" className="secondary-btn" onClick={openIntegration}>
            Flutter setup
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={loading}
            onClick={() => { setLoading(true); fetchLogs(); }}
          >
            {loading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
      </header>

      <main>
        <section className="metrics-strip" aria-label="API telemetry summary">
          <div className="metric-item metric-lead">
            <span>Total calls</span>
            <strong>{totalCalls}</strong>
            <small>Latest 100 requests</small>
          </div>
          <div className="metric-item">
            <span>200 OK (Data)</span>
            <strong className="metric-success">{count200}</strong>
            <small>{successRate !== null ? `${successRate}% success rate` : 'No logs yet'}</small>
          </div>
          <div className="metric-item">
            <span>4xx Client Errors</span>
            <strong style={{ color: count400 ? 'var(--warning)' : 'inherit' }}>{count400}</strong>
            <small>{count400 ? 'Bad Request / Auth' : 'No 4xx detected'}</small>
          </div>
          <div className="metric-item">
            <span>5xx Server Errors</span>
            <strong className={count500 ? 'metric-error' : ''}>{count500}</strong>
            <small>{count500 ? 'Crashes / Exceptions' : 'All systems healthy'}</small>
          </div>
          <div className="metric-item">
            <span>Avg Latency</span>
            <strong>{avgDuration}<em>ms</em></strong>
            <small>Across monitored calls</small>
          </div>
        </section>

        <section
          id="flutter-setup"
          className={`integration-dock ${integrationOpen ? 'is-open' : ''}`}
          aria-labelledby="integration-title"
        >
          <div className="integration-bar">
            <div className="integration-title-group">
              <span className="platform-tag">Flutter & Dart</span>
              <div>
                <h2 id="integration-title">Connect mobile telemetry</h2>
                <p>Ghi lại Response Data khi 200, bóc tách lỗi chi tiết khi 400 & 500 · <code>{API_MONITOR_URL}</code></p>
              </div>
            </div>
            <div className="integration-actions">
              <button type="button" className="text-btn" onClick={() => copyToClipboard(API_MONITOR_URL, 'url')}>
                {copiedItem === 'url' ? 'URL copied' : 'Copy endpoint'}
              </button>
              <button
                type="button"
                className="collapse-btn"
                aria-expanded={integrationOpen}
                aria-controls="integration-content"
                onClick={() => setIntegrationOpen((open) => !open)}
              >
                {integrationOpen ? 'Hide guide' : 'Show guide'}
              </button>
            </div>
          </div>

          {integrationOpen && (
            <div id="integration-content" className="integration-content">
              <nav className="setup-tabs" aria-label="Flutter integration steps">
                <button
                  type="button"
                  className={setupTab === 'client' ? 'active' : ''}
                  onClick={() => setSetupTab('client')}
                >
                  <span>01</span><strong>HTTP Client</strong><small>LoggingClient (http)</small>
                </button>
                <button
                  type="button"
                  className={setupTab === 'dio' ? 'active' : ''}
                  onClick={() => setSetupTab('dio')}
                >
                  <span>02</span><strong>Dio Interceptor</strong><small>ApiLogger.record()</small>
                </button>
                <button
                  type="button"
                  className={setupTab === 'environment' ? 'active' : ''}
                  onClick={() => setSetupTab('environment')}
                >
                  <span>03</span><strong>Environment</strong><small>Compile URL</small>
                </button>
                <button
                  type="button"
                  className={setupTab === 'config' ? 'active' : ''}
                  onClick={() => setSetupTab('config')}
                >
                  <span>04</span><strong>App Config</strong><small>env_config.dart</small>
                </button>
              </nav>

              <div className="setup-content">
                {setupTab === 'client' && (
                  <div className="setup-pane setup-pane-split">
                    <div>
                      <div className="pane-heading">
                        <h3>1. Dùng LoggingClient cho package `http`</h3>
                        <p>File logger đã được tối ưu bảo toàn stream, tự động gửi payload khi 200 và chẩn đoán lỗi khi 400/500.</p>
                      </div>
                      <div className="client-actions">
                        <a className="download-btn" href="/flutter/api_logger.dart" download>
                          Tải file api_logger.dart
                        </a>
                        <span>Thêm vào <code>lib/core/services/api_logger.dart</code></span>
                      </div>
                    </div>
                    <CodeBlock
                      label="Sử dụng LoggingClient"
                      value={FLUTTER_CLIENT}
                      copyKey="client"
                      copiedItem={copiedItem}
                      onCopy={copyToClipboard}
                    />
                  </div>
                )}

                {setupTab === 'dio' && (
                  <div className="setup-pane">
                    <div className="pane-heading">
                      <h3>2. Tích hợp với package `Dio`</h3>
                      <p>Nếu app sử dụng Dio, chỉ cần gắn <code>ApiLogger.record()</code> vào interceptor:</p>
                    </div>
                    <CodeBlock
                      label="Dio Interceptor"
                      value={FLUTTER_DIO}
                      copyKey="dio"
                      copiedItem={copiedItem}
                      onCopy={copyToClipboard}
                    />
                  </div>
                )}

                {setupTab === 'environment' && (
                  <div className="setup-pane">
                    <div className="pane-heading">
                      <h3>3. Thiết lập biến môi trường khi build/run</h3>
                      <p>Truyền URL server giám sát qua cờ `--dart-define`:</p>
                    </div>
                    <div className="code-grid">
                      <CodeBlock label="Environment value" value={FLUTTER_ENV} copyKey="env" copiedItem={copiedItem} onCopy={copyToClipboard} />
                      <CodeBlock label="Run locally" value={FLUTTER_RUN} copyKey="run" copiedItem={copiedItem} onCopy={copyToClipboard} />
                    </div>
                  </div>
                )}

                {setupTab === 'config' && (
                  <div className="setup-pane setup-pane-split">
                    <div>
                      <div className="pane-heading">
                        <h3>4. Cấu hình đọc URL trong mã nguồn</h3>
                        <p>Lưu file tại <code>lib/core/config/env_config.dart</code>.</p>
                      </div>
                      <CodeBlock label="env_config.dart" value={FLUTTER_CONFIG} copyKey="config" copiedItem={copiedItem} onCopy={copyToClipboard} />
                    </div>
                    <aside className="platform-note">
                      <span>Android release</span>
                      <h4>Cấp quyền truy cập mạng</h4>
                      <p>Thêm vào <code>android/app/src/main/AndroidManifest.xml</code>.</p>
                      <CodeBlock label="AndroidManifest.xml" value={ANDROID_PERMISSION} copyKey="android" copiedItem={copiedItem} onCopy={copyToClipboard} />
                    </aside>
                  </div>
                )}

                <div className="privacy-note">
                  🛡️ Dữ liệu giám sát được xử lý bất đồng bộ trong nền, không gây chậm ứng dụng di động.
                </div>
              </div>
            </div>
          )}
          <span className="sr-only" aria-live="polite">
            {copiedItem ? 'Configuration copied to clipboard.' : ''}
          </span>
        </section>

        <section className="log-panel" aria-labelledby="log-title">
          <div className="log-toolbar">
            <div className="log-title-group">
              <h2 id="log-title">Request Stream</h2>
              <span>{filteredLogs.length} hiển thị</span>
            </div>

            <div className="log-controls">
              <div className="filter-tabs" aria-label="Filter API logs">
                <button
                  type="button"
                  className={activeTab === 'all' ? 'active' : ''}
                  onClick={() => setActiveTab('all')}
                >
                  Tất cả <span className="tab-count">{totalCalls}</span>
                </button>
                <button
                  type="button"
                  className={`tab-success ${activeTab === '200' ? 'active' : ''}`}
                  onClick={() => setActiveTab('200')}
                >
                  <span className="dot dot-success" /> 200 OK <span className="tab-count">{count200}</span>
                </button>
                <button
                  type="button"
                  className={`tab-warning ${activeTab === '400' ? 'active' : ''}`}
                  onClick={() => setActiveTab('400')}
                >
                  <span className="dot dot-warning" /> 4xx Lỗi Client <span className="tab-count">{count400}</span>
                </button>
                <button
                  type="button"
                  className={`tab-danger ${activeTab === '500' ? 'active' : ''}`}
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
                  placeholder="Tìm endpoint, 200, 400, 500, lỗi..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
            </div>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span>Could not refresh telemetry: {error}</span>
              <button type="button" onClick={fetchLogs}>Try again</button>
            </div>
          )}

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Dịch vụ</th>
                  <th>Method</th>
                  <th>Endpoint</th>
                  <th>Trạng thái</th>
                  <th>Dữ liệu / Lỗi tóm tắt</th>
                  <th>Thời lượng</th>
                  <th><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody>
                {loading && logs.length === 0 && (
                  <tr><td colSpan="8" className="table-message">Đang kết nối nhận telemetry…</td></tr>
                )}

                {filteredLogs.length === 0 && !loading && (
                  <tr>
                    <td colSpan="8">
                      <div className="empty-state">
                        <h3>{logs.length === 0 ? 'Chưa có telemetry nào' : 'Không tìm thấy request phù hợp'}</h3>
                        <p>
                          {logs.length === 0
                            ? 'Kết nối client Flutter từ ứng dụng để xem các lệnh gọi 200 (data), 400 và 500 theo thời gian thực.'
                            : 'Thử tìm kiếm với từ khóa khác hoặc chuyển tab lọc.'}
                        </p>
                        {logs.length === 0 && (
                          <button type="button" onClick={openIntegration}>Mở hướng dẫn Flutter</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {filteredLogs.map((log) => {
                  const service = categorizeEndpoint(log.endpoint);
                  const statusMeta = getStatusMeta(log.status_code);
                  const summaryText = getSummarySnippet(log);

                  return (
                    <tr
                      key={log.id}
                      className={statusMeta.type !== '200' ? 'row-error' : ''}
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="timestamp-cell">{formatDate(log.created_at)}</td>
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
                        <span className={`preview-pill ${statusMeta.pillClass}`}>
                          {summaryText}
                        </span>
                      </td>
                      <td className="duration-cell">{log.duration_ms} ms</td>
                      <td>
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
      </main>

      {selectedLog && (
        <div
          className="modal-overlay"
          role="presentation"
          onMouseDown={() => setSelectedLog(null)}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
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
                  {copiedItem === 'curl' ? '✓ cURL copied' : '📋 Copy cURL'}
                </button>
                <button
                  type="button"
                  className="close-btn"
                  aria-label="Đóng chi tiết"
                  onClick={() => setSelectedLog(null)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="modal-body">
              {/* Status Alert Banner */}
              {(() => {
                const meta = getStatusMeta(selectedLog.status_code);
                if (meta.type === '200') {
                  return (
                    <div className="modal-status-banner banner-success">
                      <div>
                        <strong>✅ HTTP {selectedLog.status_code} OK — Yêu cầu thành công</strong>
                        <span>API phản hồi thành công và trả về dữ liệu (Response Data) đầy đủ.</span>
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
                      <strong>🚨 HTTP {selectedLog.status_code || 500} — Lỗi Hệ Thống Máy Chủ (Server Crash / Exception)</strong>
                      <span>
                        {selectedLog.error_message
                          ? `Nguyên nhân lỗi: ${selectedLog.error_message}`
                          : 'Máy chủ phản hồi mã lỗi 5xx hoặc xảy ra ngoại lệ kết nối mạng.'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Technical Meta Grid */}
              <div className="modal-meta-grid">
                <div className="modal-meta-item">
                  <span>Method</span>
                  <strong>{selectedLog.method}</strong>
                </div>
                <div className="modal-meta-item">
                  <span>Trạng thái</span>
                  <strong style={{
                    color: getStatusMeta(selectedLog.status_code).type === '200' 
                      ? 'var(--success)' 
                      : getStatusMeta(selectedLog.status_code).type === '400' 
                        ? 'var(--warning)' 
                        : 'var(--danger)'
                  }}>
                    {selectedLog.status_code} {getStatusMeta(selectedLog.status_code).label}
                  </strong>
                </div>
                <div className="modal-meta-item">
                  <span>Thời lượng</span>
                  <strong>{selectedLog.duration_ms} ms</strong>
                </div>
                <div className="modal-meta-item">
                  <span>Thời gian</span>
                  <strong>{formatDate(selectedLog.created_at)}</strong>
                </div>
              </div>

              {/* Response Section (Status 200 data or Server Error Response) */}
              <section className="log-section">
                <div className="section-head">
                  <h3>
                    {getStatusMeta(selectedLog.status_code).type === '200'
                      ? '📦 Dữ liệu trả về (Response Data)'
                      : '📄 Phản hồi từ Server (Error Response Body)'}
                  </h3>
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
                {selectedLog.response_payload ? (
                  <pre className="log-code">
                    {formatJsonPretty(selectedLog.response_payload)}
                  </pre>
                ) : (
                  <div className="log-code" style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    (Không có dữ liệu phản hồi)
                  </div>
                )}
              </section>

              {/* Error Detail Section if error_message is present */}
              {selectedLog.error_message && (
                <section className="log-section">
                  <div className="section-head">
                    <h3>⚠️ Thông báo lỗi chi tiết (Error Message)</h3>
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

              {/* Request Payload Section */}
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
