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

  // Multi-telemetry Mode: 'logs' | 'crashes' | 'analytics'
  const [telemetryMode, setTelemetryMode] = useState('logs');

  // Data states
  const [logs, setLogs] = useState([]);
  const [crashes, setCrashes] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sub-filter Tabs
  const [activeTab, setActiveTab] = useState('all'); // for logs: 'all', '200', '400', '500'
  const [crashTab, setCrashTab] = useState('all');   // for crashes: 'all', 'fatal', 'non-fatal'
  const [eventTab, setEventTab] = useState('all');   // for analytics: 'all', 'custom', 'screen_view'

  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedCrash, setSelectedCrash] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [copiedItem, setCopiedItem] = useState(null);
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [setupTab, setSetupTab] = useState('crashlytics');

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

  const fetchAllTelemetry = async (overrideFilter) => {
    try {
      const activeUser = overrideFilter !== undefined ? overrideFilter : selectedFilter;
      const queryParts = [];

      if (activeUser && activeUser !== 'all') {
        queryParts.push(`user_id=${encodeURIComponent(activeUser)}`);
      }
      const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

      const [logsRes, crashesRes, eventsRes] = await Promise.all([
        fetch(`${API_MONITOR_URL}/logs${queryString}`),
        fetch(`${API_MONITOR_URL}/crashes${queryString}`),
        fetch(`${API_MONITOR_URL}/events${queryString}`),
      ]);

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(Array.isArray(data) ? data : []);
      }
      if (crashesRes.ok) {
        const data = await crashesRes.json();
        setCrashes(Array.isArray(data) ? data : []);
      }
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(Array.isArray(data) ? data : []);
      }
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
      fetchAllTelemetry(userIdFromUrl);
    } else {
      fetchAllTelemetry(selectedFilter);
    }
  }, [userIdFromUrl]);

  // Polling every 5s for real-time telemetry
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchAllTelemetry();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [selectedFilter]);

  // Escape to close any open modal
  useEffect(() => {
    if (!selectedLog && !selectedCrash && !selectedEvent) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setSelectedLog(null);
        setSelectedCrash(null);
        setSelectedEvent(null);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedLog, selectedCrash, selectedEvent]);

  const handleFilterChange = (val) => {
    setSelectedFilter(val);
    if (val === 'all') {
      setSearchParams({});
      fetchAllTelemetry('all');
    } else {
      setSearchParams({ user_id: val });
      fetchAllTelemetry(val);
    }
  };

  const activeUserJob = useMemo(() => {
    if (selectedFilter === 'all') return null;
    return usersList.find((u) => String(u.id) === String(selectedFilter)) || null;
  }, [selectedFilter, usersList]);

  const currentAppId = activeUserJob?.app_identifier || 'vn.fizahub.app';

  // Integration Snippets
  const flutterCrashlyticsSnippet = `// 1. Tự động ghi nhận Crash trong main.dart của Flutter
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppTelemetry.initialize(appId: '${currentAppId}');

  // Bắt mọi lỗi Flutter Framework / Render
  FlutterError.onError = (FlutterErrorDetails details) {
    AppTelemetry.recordCrash(
      exception: details.exception,
      stack: details.stack,
      isFatal: true,
      deviceInfo: {'app': '${currentAppId}'},
    );
    // Vẫn ghi vào Firebase Crashlytics nếu dùng song song:
    // FirebaseCrashlytics.instance.recordFlutterFatalError(details);
  };

  // Bắt mọi lỗi bất đồng bộ (Uncaught Async Errors)
  PlatformDispatcher.instance.onError = (error, stack) {
    AppTelemetry.recordCrash(
      exception: error,
      stack: stack,
      isFatal: true,
    );
    return true;
  };

  runApp(const MyApp());
}

// 2. Ghi nhận lỗi có try/catch (Non-fatal)
try {
  // Thực hiện tác vụ...
} catch (e, stack) {
  AppTelemetry.recordCrash(
    exception: e,
    stack: stack,
    isFatal: false,
  );
}`;

  const flutterAnalyticsSnippet = `// 1. Ghi nhận sự kiện người dùng (Custom Event)
AppTelemetry.logEvent('login_success', parameters: {
  'role': 'user',
  'phone': '0394264400',
  'method': 'password',
});

// 2. Ghi nhận chuyển màn hình (Screen View)
AppTelemetry.logScreenView('HomeScreen', parameters: {
  'tab_index': 0,
});

// 3. Sử dụng song song với Firebase Analytics
// Gọi đồng thời cả FirebaseAnalytics.instance.logEvent(...) và AppTelemetry.logEvent(...)`;

  const flutterClientSnippet = `import 'package:http/http.dart' as http;
import 'api_logger.dart';

// Tự động gửi telemetry API với App ID của ${activeUserJob?.name || 'ứng dụng'}
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

  const formatDate = (dateString) => new Date(dateString).toLocaleString('vi-VN');

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

  // Status counters for Logs
  const totalCalls = logs.length;
  const count200 = logs.filter((log) => log.status_code >= 200 && log.status_code < 300).length;
  const count400 = logs.filter((log) => log.status_code >= 400 && log.status_code < 500).length;
  const count500 = logs.filter((log) => log.status_code >= 500 || log.status_code < 200).length;
  const successRate = totalCalls > 0 ? Math.round((count200 / totalCalls) * 100) : null;
  const totalDuration = logs.reduce((acc, log) => acc + (Number(log.duration_ms) || 0), 0);
  const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

  // Status counters for Crashes
  const totalCrashes = crashes.length;
  const fatalCrashes = crashes.filter((c) => Number(c.is_fatal) === 1).length;
  const nonFatalCrashes = crashes.filter((c) => Number(c.is_fatal) !== 1).length;
  const affectedAppsCount = new Set(crashes.map((c) => c.app_identifier).filter(Boolean)).size;

  // Status counters for Analytics
  const totalEvents = events.length;
  const screenViewCount = events.filter((e) => e.event_type === 'screen_view' || e.event_name === 'screen_view').length;
  const customEventCount = totalEvents - screenViewCount;
  const uniqueUsersCount = new Set(events.map((e) => e.user_id).filter(Boolean)).size;

  // Filter and search Logs
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

  // Filter and search Crashes
  const filteredCrashes = useMemo(() => {
    return crashes.filter((crash) => {
      if (crashTab === 'fatal' && Number(crash.is_fatal) !== 1) return false;
      if (crashTab === 'non-fatal' && Number(crash.is_fatal) === 1) return false;

      if (!searchTerm) return true;
      const lower = searchTerm.toLowerCase();
      const msgMatch = (crash.error_message || '').toLowerCase().includes(lower);
      const stackMatch = (crash.stack_trace || '').toLowerCase().includes(lower);
      const appMatch = (crash.app_identifier || '').toLowerCase().includes(lower);
      const userMatch = (crash.user_name || '').toLowerCase().includes(lower);
      const jobMatch = (crash.job_name || '').toLowerCase().includes(lower);
      const deviceMatch = (crash.device_info || '').toLowerCase().includes(lower);

      return msgMatch || stackMatch || appMatch || userMatch || jobMatch || deviceMatch;
    });
  }, [crashes, crashTab, searchTerm]);

  // Filter and search Analytics
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const isScreen = event.event_type === 'screen_view' || event.event_name === 'screen_view';
      if (eventTab === 'screen_view' && !isScreen) return false;
      if (eventTab === 'custom' && isScreen) return false;

      if (!searchTerm) return true;
      const lower = searchTerm.toLowerCase();
      const nameMatch = (event.event_name || '').toLowerCase().includes(lower);
      const screenMatch = (event.screen_name || '').toLowerCase().includes(lower);
      const userMatch = (event.user_id || '').toLowerCase().includes(lower) || (event.user_name || '').toLowerCase().includes(lower);
      const appMatch = (event.app_identifier || '').toLowerCase().includes(lower);
      const jobMatch = (event.job_name || '').toLowerCase().includes(lower);
      const paramMatch = (event.parameters || '').toLowerCase().includes(lower);

      return nameMatch || screenMatch || userMatch || appMatch || jobMatch || paramMatch;
    });
  }, [events, eventTab, searchTerm]);

  return (
    <div style={{ paddingTop: '1.25rem' }}>
      {/* Page Title & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Giám sát Logs & Telemetry
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Theo dõi thời gian thực: API Calls, Firebase Crashlytics và Firebase Analytics từ Mobile App & Web.
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
            onClick={() => { setLoading(true); fetchAllTelemetry(); }}
          >
            {loading ? 'Đang tải…' : '🔄 Làm mới'}
          </button>
        </div>
      </div>

      {/* Mode Switcher Dock: Logs | Crashlytics | Analytics */}
      <div className="telemetry-mode-dock">
        <button
          type="button"
          className={`mode-pill-btn ${telemetryMode === 'logs' ? 'active' : ''}`}
          onClick={() => { setTelemetryMode('logs'); setSearchTerm(''); }}
        >
          <span>📡 API Logs</span>
          <span className="mode-badge">{logs.length}</span>
        </button>
        <button
          type="button"
          className={`mode-pill-btn ${telemetryMode === 'crashes' ? 'active' : ''}`}
          onClick={() => { setTelemetryMode('crashes'); setSearchTerm(''); }}
        >
          <span>💥 Crashlytics</span>
          <span
            className="mode-badge"
            style={{
              backgroundColor: fatalCrashes > 0 && telemetryMode !== 'crashes' ? 'rgba(255, 119, 133, 0.25)' : undefined,
              color: fatalCrashes > 0 && telemetryMode !== 'crashes' ? '#ff7785' : undefined,
            }}
          >
            {crashes.length}
          </span>
        </button>
        <button
          type="button"
          className={`mode-pill-btn ${telemetryMode === 'analytics' ? 'active' : ''}`}
          onClick={() => { setTelemetryMode('analytics'); setSearchTerm(''); }}
        >
          <span>📈 Analytics & Sự kiện</span>
          <span className="mode-badge">{events.length}</span>
        </button>
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
            <option value="all">🌐 Toàn bộ hệ thống (Tất cả telemetry)</option>
            {usersList.filter((u) => u.job_name).map((u) => (
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

      {/* Dynamic Metrics Summary Strip depending on active Mode */}
      {telemetryMode === 'logs' && (
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
      )}

      {telemetryMode === 'crashes' && (
        <section className="metrics-strip" aria-label="Crashlytics summary">
          <div className="metric-item metric-lead">
            <span>Tổng sự cố ghi nhận</span>
            <strong>{totalCrashes}</strong>
            <small>{selectedFilter === 'all' ? 'Toàn bộ hệ thống' : `Cho ${activeUserJob?.name}`}</small>
          </div>
          <div className="metric-item">
            <span>Fatal Crashes (Sập App)</span>
            <strong style={{ color: fatalCrashes > 0 ? '#ff7785' : 'var(--success)' }}>
              {fatalCrashes}
            </strong>
            <small>{fatalCrashes > 0 ? 'Cần xử lý khẩn cấp' : 'Không có crash fatal'}</small>
          </div>
          <div className="metric-item">
            <span>Non-Fatal (Ngoại lệ)</span>
            <strong style={{ color: nonFatalCrashes > 0 ? 'var(--warning)' : 'inherit' }}>
              {nonFatalCrashes}
            </strong>
            <small>{nonFatalCrashes > 0 ? 'Ngoại lệ đã bắt try/catch' : 'Hoàn hảo'}</small>
          </div>
          <div className="metric-item">
            <span>Trạng thái App</span>
            <strong className={fatalCrashes === 0 ? 'metric-success' : 'metric-error'}>
              {fatalCrashes === 0 ? '100% Ổn định' : 'Có lỗi nghiêm trọng'}
            </strong>
            <small>Độ tin cậy ứng dụng</small>
          </div>
          <div className="metric-item">
            <span>Số App / Thiết bị ảnh hưởng</span>
            <strong>{affectedAppsCount}</strong>
            <small>Mã định danh báo cáo</small>
          </div>
        </section>
      )}

      {telemetryMode === 'analytics' && (
        <section className="metrics-strip" aria-label="Analytics summary">
          <div className="metric-item metric-lead">
            <span>Tổng lượt sự kiện</span>
            <strong>{totalEvents}</strong>
            <small>{selectedFilter === 'all' ? 'Toàn bộ hệ thống' : `Cho ${activeUserJob?.name}`}</small>
          </div>
          <div className="metric-item">
            <span>Lượt xem màn hình (Screens)</span>
            <strong style={{ color: '#61e5bd' }}>{screenViewCount}</strong>
            <small>Chuyển trang & màn hình</small>
          </div>
          <div className="metric-item">
            <span>Sự kiện tương tác (Custom)</span>
            <strong style={{ color: 'var(--accent)' }}>{customEventCount}</strong>
            <small>Click, login, giao dịch...</small>
          </div>
          <div className="metric-item">
            <span>Người dùng định danh</span>
            <strong style={{ color: '#c4b5fd' }}>{uniqueUsersCount}</strong>
            <small>User ID phân biệt</small>
          </div>
          <div className="metric-item">
            <span>Tần suất tương tác</span>
            <strong>{totalEvents > 0 ? `${totalEvents} logs` : '0'}</strong>
            <small>Thời gian thực</small>
          </div>
        </section>
      )}

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
                {activeUserJob?.job_type === 'web' ? '🌐 Web SDK' : '📱 Flutter & Web Telemetry'}
              </span>
              <div>
                <h2>Kết nối Telemetry tự động (Logs, Crashlytics & Analytics)</h2>
                <p>
                  Mã App ID hiện tại: <code>{currentAppId}</code> · Endpoint: <code>{API_MONITOR_URL}</code>
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
                className={setupTab === 'crashlytics' ? 'active' : ''}
                onClick={() => setSetupTab('crashlytics')}
              >
                <span>01</span><strong>Flutter Crashlytics</strong><small>Bắt Fatal & Non-fatal</small>
              </button>
              <button
                type="button"
                className={setupTab === 'analytics' ? 'active' : ''}
                onClick={() => setSetupTab('analytics')}
              >
                <span>02</span><strong>Flutter Analytics</strong><small>Events & Screen Views</small>
              </button>
              <button
                type="button"
                className={setupTab === 'client' ? 'active' : ''}
                onClick={() => setSetupTab('client')}
              >
                <span>03</span><strong>Flutter HTTP</strong><small>LoggingClient</small>
              </button>
              <button
                type="button"
                className={setupTab === 'dio' ? 'active' : ''}
                onClick={() => setSetupTab('dio')}
              >
                <span>04</span><strong>Flutter Dio</strong><small>ApiLogger.record()</small>
              </button>
              <button
                type="button"
                className={setupTab === 'axios' ? 'active' : ''}
                onClick={() => setSetupTab('axios')}
              >
                <span>05</span><strong>Web Axios</strong><small>setupAxiosMonitor</small>
              </button>
              <button
                type="button"
                className={setupTab === 'fetch' ? 'active' : ''}
                onClick={() => setSetupTab('fetch')}
              >
                <span>06</span><strong>Web Fetch</strong><small>createMonitoredFetch</small>
              </button>
            </nav>

            <div className="setup-content">
              {setupTab === 'crashlytics' && (
                <div className="setup-pane">
                  <div className="pane-heading">
                    <h3>1. Tích hợp Crashlytics (Bắt sập App & Ngoại lệ)</h3>
                    <p>Hook trực tiếp vào <code>FlutterError.onError</code> và <code>PlatformDispatcher.instance.onError</code>:</p>
                  </div>
                  <CodeBlock
                    label="Flutter Crashlytics Hook"
                    value={flutterCrashlyticsSnippet}
                    copyKey="crashlytics"
                    copiedItem={copiedItem}
                    onCopy={copyToClipboard}
                  />
                </div>
              )}

              {setupTab === 'analytics' && (
                <div className="setup-pane">
                  <div className="pane-heading">
                    <h3>2. Tích hợp Analytics (Sự kiện & Màn hình người dùng)</h3>
                    <p>Theo dõi luồng hành động người dùng, đăng nhập, click, xem màn hình song song với Firebase:</p>
                  </div>
                  <CodeBlock
                    label="Flutter Analytics Event & Screen"
                    value={flutterAnalyticsSnippet}
                    copyKey="analytics"
                    copiedItem={copiedItem}
                    onCopy={copyToClipboard}
                  />
                </div>
              )}

              {setupTab === 'client' && (
                <div className="setup-pane setup-pane-split">
                  <div>
                    <div className="pane-heading">
                      <h3>3. Dùng LoggingClient cho package `http` (Flutter)</h3>
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
                    <h3>4. Tích hợp với package `Dio` (Flutter)</h3>
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
                    <h3>5. Tích hợp Axios Interceptor (Web App / React / Vue)</h3>
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
                    <h3>6. Tích hợp Monitored Fetch (Web Vanilla / Next.js)</h3>
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

      {/* MODE 1: LOGS PANEL */}
      {telemetryMode === 'logs' && (
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
              <button type="button" onClick={() => fetchAllTelemetry()}>Thử lại</button>
            </div>
          )}

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Thời gian</th>
                  <th style={{ width: '22%' }}>Mục tiêu (Job / User)</th>
                  <th style={{ width: '8%' }}>Method</th>
                  <th>Endpoint</th>
                  <th style={{ width: '80px' }}>Trạng thái</th>
                  <th style={{ width: '22%' }}>Dữ liệu / Lỗi tóm tắt</th>
                  <th style={{ width: '75px' }}>Độ trễ</th>
                  <th style={{ width: '80px' }}><span className="sr-only">Thao tác</span></th>
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
                            ? 'Kết nối client Mobile hoặc Web để theo dõi các lệnh gọi API theo thời gian thực.'
                            : 'Thử tìm kiếm với từ khóa khác hoặc chuyển tab lọc.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {filteredLogs.map((log) => {
                  const statusMeta = getStatusMeta(log.status_code);
                  const summaryText = getSummarySnippet(log);
                  const isApp = log.job_type === 'app';

                  return (
                    <tr
                      key={log.id}
                      className={statusMeta.type !== '200' ? 'row-error' : ''}
                      onClick={() => setSelectedLog(log)}
                      style={{ cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết"
                    >
                      <td className="timestamp-cell" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', lineHeight: 1.4 }}>
                        <div>{new Date(log.created_at).toLocaleDateString('vi-VN')}</div>
                        <div style={{ color: 'var(--text-dim)' }}>{new Date(log.created_at).toLocaleTimeString('vi-VN')}</div>
                      </td>
                      <td>
                        {log.job_name ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span className={`type-badge ${isApp ? 'type-badge-app' : 'type-badge-web'}`} style={{ width: 'fit-content', fontSize: '0.72rem' }}>
                              {isApp ? '📱' : '🌐'} {log.job_name}
                            </span>
                            <small style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                              {log.user_name ? `👤 ${log.user_name}` : `ID: ${log.app_identifier || '-'}`}
                            </small>
                          </div>
                        ) : log.app_identifier ? (
                          <span className="type-badge" style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', fontSize: '0.72rem' }}>
                            🏷️ {log.app_identifier}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Mặc định</span>
                        )}
                      </td>
                      <td>
                        <span className={`method-badge ${(log.method || '').toLowerCase()}`}>
                          {log.method}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', wordBreak: 'break-all', maxWidth: '240px' }}>
                        {log.endpoint}
                      </td>
                      <td>
                        <span className={`status-badge ${statusMeta.badgeClass}`}>
                          {log.status_code || 0}
                        </span>
                      </td>
                      <td className="summary-cell" title={summaryText} style={{ fontSize: '0.78rem' }}>
                        <span className={`summary-pill ${statusMeta.pillClass}`}>
                          {summaryText}
                        </span>
                      </td>
                      <td className="duration-cell">{log.duration_ms || 0} ms</td>
                      <td className="action-cell">
                        <button
                          type="button"
                          className="view-btn"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
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
      )}

      {/* MODE 2: CRASHLYTICS PANEL */}
      {telemetryMode === 'crashes' && (
        <section className="log-panel" aria-labelledby="crashlytics-log-title">
          <div className="log-panel-header">
            <div className="log-title-group">
              <h2 id="crashlytics-log-title">Nhật ký sự cố & Crashlytics</h2>
              <span className="count-pill">{filteredCrashes.length} sự cố</span>
            </div>

            <div className="log-controls">
              <div className="filter-tabs" role="tablist" aria-label="Lọc mức độ crash">
                <button
                  type="button"
                  role="tab"
                  aria-selected={crashTab === 'all'}
                  className={`filter-tab ${crashTab === 'all' ? 'active' : ''}`}
                  onClick={() => setCrashTab('all')}
                >
                  Tất cả <span className="tab-count">{totalCrashes}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={crashTab === 'fatal'}
                  className={`filter-tab tab-danger ${crashTab === 'fatal' ? 'active' : ''}`}
                  onClick={() => setCrashTab('fatal')}
                >
                  <span className="dot dot-danger" /> Fatal (Sập App) <span className="tab-count">{fatalCrashes}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={crashTab === 'non-fatal'}
                  className={`filter-tab tab-warning ${crashTab === 'non-fatal' ? 'active' : ''}`}
                  onClick={() => setCrashTab('non-fatal')}
                >
                  <span className="dot dot-warning" /> Non-fatal (Ngoại lệ) <span className="tab-count">{nonFatalCrashes}</span>
                </button>
              </div>

              <label className="search-field">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6" />
                  <path d="m16 16 4 4" />
                </svg>
                <span className="sr-only">Tìm kiếm crash</span>
                <input
                  type="search"
                  placeholder="Tìm lỗi, stack trace, app ID..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Thời gian</th>
                  <th style={{ width: '22%' }}>Mục tiêu (Job / App ID)</th>
                  <th style={{ width: '110px' }}>Mức độ</th>
                  <th>Ngoại lệ & Tiêu đề lỗi</th>
                  <th style={{ width: '180px' }}>Thiết bị / OS</th>
                  <th style={{ width: '80px' }}><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody>
                {loading && crashes.length === 0 && (
                  <tr><td colSpan="6" className="table-message">Đang kết nối lấy dữ liệu crash…</td></tr>
                )}

                {filteredCrashes.length === 0 && !loading && (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-state">
                        <h3>{crashes.length === 0 ? 'Tuyệt vời! Không có sự cố crash nào' : 'Không tìm thấy crash phù hợp'}</h3>
                        <p>
                          {crashes.length === 0
                            ? 'Hệ thống ứng dụng hoạt động ổn định và chưa ghi nhận bất kỳ ngoại lệ nào.'
                            : 'Thử tìm kiếm với từ khóa khác hoặc chuyển tab lọc.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {filteredCrashes.map((crash) => {
                  const isFatal = Number(crash.is_fatal) === 1;
                  const deviceInfoParsed = parseJsonSafe(crash.device_info);

                  return (
                    <tr
                      key={crash.id}
                      className={isFatal ? 'row-error' : ''}
                      onClick={() => setSelectedCrash(crash)}
                      style={{ cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết & Stack Trace"
                    >
                      <td className="timestamp-cell" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', lineHeight: 1.4 }}>
                        <div>{new Date(crash.created_at).toLocaleDateString('vi-VN')}</div>
                        <div style={{ color: 'var(--text-dim)' }}>{new Date(crash.created_at).toLocaleTimeString('vi-VN')}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span className="type-badge type-badge-app" style={{ width: 'fit-content', fontSize: '0.72rem' }}>
                            📱 {crash.job_name || crash.app_identifier || 'Mobile App'}
                          </span>
                          <small style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                            {crash.app_identifier ? `<code>${crash.app_identifier}</code>` : '-'}
                          </small>
                        </div>
                      </td>
                      <td>
                        {isFatal ? (
                          <span className="badge-fatal">💥 FATAL</span>
                        ) : (
                          <span className="badge-non-fatal">⚠️ Non-fatal</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', fontWeight: 500, color: isFatal ? '#ff7785' : 'var(--text)', wordBreak: 'break-word', maxWidth: '340px' }}>
                        {crash.error_message}
                      </td>
                      <td>
                        {deviceInfoParsed && typeof deviceInfoParsed === 'object' ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {deviceInfoParsed.os && <span className="device-chip">{deviceInfoParsed.os}</span>}
                            {deviceInfoParsed.model && <span className="device-chip">{deviceInfoParsed.model}</span>}
                            {deviceInfoParsed.app && <span className="device-chip">{deviceInfoParsed.app}</span>}
                          </div>
                        ) : (
                          <span className="device-chip">📱 Mobile</span>
                        )}
                      </td>
                      <td className="action-cell">
                        <button
                          type="button"
                          className="view-btn"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCrash(crash);
                          }}
                        >
                          Stack Trace
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODE 3: ANALYTICS PANEL */}
      {telemetryMode === 'analytics' && (
        <section className="log-panel" aria-labelledby="analytics-log-title">
          <div className="log-panel-header">
            <div className="log-title-group">
              <h2 id="analytics-log-title">Nhật ký sự kiện Analytics & Luồng màn hình</h2>
              <span className="count-pill">{filteredEvents.length} sự kiện</span>
            </div>

            <div className="log-controls">
              <div className="filter-tabs" role="tablist" aria-label="Lọc loại sự kiện">
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventTab === 'all'}
                  className={`filter-tab ${eventTab === 'all' ? 'active' : ''}`}
                  onClick={() => setEventTab('all')}
                >
                  Tất cả <span className="tab-count">{totalEvents}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventTab === 'custom'}
                  className={`filter-tab tab-accent ${eventTab === 'custom' ? 'active' : ''}`}
                  onClick={() => setEventTab('custom')}
                >
                  ⚡ Custom Events <span className="tab-count">{customEventCount}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventTab === 'screen_view'}
                  className={`filter-tab tab-success ${eventTab === 'screen_view' ? 'active' : ''}`}
                  onClick={() => setEventTab('screen_view')}
                >
                  📱 Screen Views <span className="tab-count">{screenViewCount}</span>
                </button>
              </div>

              <label className="search-field">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6" />
                  <path d="m16 16 4 4" />
                </svg>
                <span className="sr-only">Tìm kiếm sự kiện</span>
                <input
                  type="search"
                  placeholder="Tìm tên sự kiện, màn hình, user ID..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Thời gian</th>
                  <th style={{ width: '20%' }}>Mục tiêu (Job / App)</th>
                  <th style={{ width: '20%' }}>Tên sự kiện (Event)</th>
                  <th style={{ width: '16%' }}>Màn hình (Screen)</th>
                  <th style={{ width: '14%' }}>Người dùng (User ID)</th>
                  <th>Tham số (Parameters)</th>
                  <th style={{ width: '80px' }}><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody>
                {loading && events.length === 0 && (
                  <tr><td colSpan="7" className="table-message">Đang kết nối lấy dữ liệu Analytics…</td></tr>
                )}

                {filteredEvents.length === 0 && !loading && (
                  <tr>
                    <td colSpan="7">
                      <div className="empty-state">
                        <h3>{events.length === 0 ? 'Chưa có sự kiện Analytics nào' : 'Không tìm thấy sự kiện phù hợp'}</h3>
                        <p>
                          {events.length === 0
                            ? 'Tích hợp AppTelemetry.logEvent() hoặc logScreenView() trong Flutter để ghi nhận hành vi người dùng.'
                            : 'Thử tìm kiếm với từ khóa khác hoặc chuyển tab lọc.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {filteredEvents.map((event) => {
                  const isScreen = event.event_type === 'screen_view' || event.event_name === 'screen_view';
                  const paramsParsed = parseJsonSafe(event.parameters);

                  return (
                    <tr
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      style={{ cursor: 'pointer' }}
                      title="Nhấn để xem chi tiết tham số"
                    >
                      <td className="timestamp-cell" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', lineHeight: 1.4 }}>
                        <div>{new Date(event.created_at).toLocaleDateString('vi-VN')}</div>
                        <div style={{ color: 'var(--text-dim)' }}>{new Date(event.created_at).toLocaleTimeString('vi-VN')}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span className="type-badge" style={{ background: 'rgba(125, 156, 255, 0.12)', color: 'var(--accent)', width: 'fit-content', fontSize: '0.72rem' }}>
                            {event.job_name || event.app_identifier || 'App/Web'}
                          </span>
                          <small style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                            <code>{event.app_identifier}</code>
                          </small>
                        </div>
                      </td>
                      <td>
                        {isScreen ? (
                          <span className="badge-screen-view">
                            📱 screen_view
                          </span>
                        ) : (
                          <span className="badge-event-name">
                            ⚡ {event.event_name}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: event.screen_name ? 'var(--text)' : 'var(--text-dim)' }}>
                        {event.screen_name ? <b>{event.screen_name}</b> : '—'}
                      </td>
                      <td>
                        {event.user_id ? (
                          <span className="user-tag">👤 {event.user_id}</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Ẩn danh</span>
                        )}
                      </td>
                      <td>
                        {paramsParsed && typeof paramsParsed === 'object' ? (
                          <div className="key-value-pill-list">
                            {Object.entries(paramsParsed).slice(0, 3).map(([k, v]) => (
                              <span key={k} className="key-value-chip">
                                <span>{k}:</span> <strong>{String(v)}</strong>
                              </span>
                            ))}
                            {Object.keys(paramsParsed).length > 3 && (
                              <span className="key-value-chip">+ {Object.keys(paramsParsed).length - 3} nữa</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Không có params</span>
                        )}
                      </td>
                      <td className="action-cell">
                        <button
                          type="button"
                          className="view-btn"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
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
      )}

      {/* MODAL: DETAIL FOR API LOG */}
      {selectedLog && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="modal-box"
            style={{ maxWidth: '720px' }}
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

      {/* MODAL: DETAIL FOR CRASH */}
      {selectedCrash && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setSelectedCrash(null)}
        >
          <div
            className="modal-box"
            style={{ maxWidth: '820px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="crash-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-header-info">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {Number(selectedCrash.is_fatal) === 1 ? (
                    <span className="badge-fatal">💥 FATAL CRASH (SẬP ỨNG DỤNG)</span>
                  ) : (
                    <span className="badge-non-fatal">⚠️ NON-FATAL EXCEPTION</span>
                  )}
                  <span>Mã sự cố #{selectedCrash.id}</span>
                </span>
                <h2 id="crash-detail-title" style={{ color: Number(selectedCrash.is_fatal) === 1 ? '#ff7785' : 'var(--text)' }}>
                  {selectedCrash.error_message}
                </h2>
              </div>
              <div className="modal-header-actions">
                <button
                  type="button"
                  className="btn-mini"
                  onClick={() => copyToClipboard(selectedCrash.stack_trace || selectedCrash.error_message, 'stack')}
                >
                  {copiedItem === 'stack' ? '✓ Đã sao chép' : '📋 Copy Stack Trace'}
                </button>
                <button
                  type="button"
                  className="close-btn"
                  aria-label="Đóng chi tiết"
                  onClick={() => setSelectedCrash(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body">
              {/* Target & App info */}
              <div className="modal-meta-grid" style={{ marginBottom: '1.2rem' }}>
                <div>
                  <span className="meta-label">Ứng dụng (App ID)</span>
                  <strong className="meta-value"><code>{selectedCrash.app_identifier || 'Không rõ'}</code></strong>
                </div>
                <div>
                  <span className="meta-label">Mục tiêu giám sát</span>
                  <strong className="meta-value">{selectedCrash.job_name || 'Fizahub Mobile App'}</strong>
                </div>
                <div>
                  <span className="meta-label">Mức độ nguy hiểm</span>
                  <strong className="meta-value" style={{ color: Number(selectedCrash.is_fatal) === 1 ? '#ff7785' : '#f2c36d' }}>
                    {Number(selectedCrash.is_fatal) === 1 ? 'Khẩn cấp (Crash Fatal)' : 'Cảnh báo (Non-Fatal)'}
                  </strong>
                </div>
                <div>
                  <span className="meta-label">Thời điểm xảy ra</span>
                  <strong className="meta-value">{formatDate(selectedCrash.created_at)}</strong>
                </div>
              </div>

              {/* Stack Trace Box */}
              <section className="log-section">
                <div className="section-head">
                  <h3 style={{ color: '#ff7785' }}>📜 Stack Trace chi tiết (Dòng lệnh gây lỗi)</h3>
                  {selectedCrash.stack_trace && (
                    <button
                      type="button"
                      className="btn-mini"
                      onClick={() => copyToClipboard(selectedCrash.stack_trace, 'raw_stack')}
                    >
                      {copiedItem === 'raw_stack' ? '✓ Đã chép' : 'Sao chép Trace'}
                    </button>
                  )}
                </div>
                <pre className="stack-trace-view">
                  {selectedCrash.stack_trace || '// Không có stack trace được đính kèm'}
                </pre>
              </section>

              {/* Device & Custom Attributes */}
              {selectedCrash.device_info && (
                <section className="log-section">
                  <div className="section-head">
                    <h3>📱 Thông tin thiết bị & Môi trường</h3>
                  </div>
                  <pre className="log-code">
                    {formatJsonPretty(selectedCrash.device_info)}
                  </pre>
                </section>
              )}

              {selectedCrash.custom_attributes && (
                <section className="log-section">
                  <div className="section-head">
                    <h3>🏷️ Thuộc tính tùy chỉnh (Custom Attributes)</h3>
                  </div>
                  <pre className="log-code">
                    {formatJsonPretty(selectedCrash.custom_attributes)}
                  </pre>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETAIL FOR ANALYTICS EVENT */}
      {selectedEvent && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="modal-box"
            style={{ maxWidth: '720px' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-header-info">
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedEvent.event_type === 'screen_view' ? (
                    <span className="badge-screen-view">📱 SCREEN VIEW</span>
                  ) : (
                    <span className="badge-event-name">⚡ CUSTOM EVENT</span>
                  )}
                  <span>Sự kiện #{selectedEvent.id}</span>
                </span>
                <h2 id="event-detail-title" style={{ color: 'var(--accent)' }}>
                  {selectedEvent.event_name}
                </h2>
              </div>
              <div className="modal-header-actions">
                <button
                  type="button"
                  className="close-btn"
                  aria-label="Đóng chi tiết"
                  onClick={() => setSelectedEvent(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="modal-meta-grid" style={{ marginBottom: '1.2rem' }}>
                <div>
                  <span className="meta-label">Màn hình ghi nhận</span>
                  <strong className="meta-value">{selectedEvent.screen_name || 'Không xác định'}</strong>
                </div>
                <div>
                  <span className="meta-label">Người dùng (User ID)</span>
                  <strong className="meta-value">{selectedEvent.user_id || 'Khách (Anonymous)'}</strong>
                </div>
                <div>
                  <span className="meta-label">Ứng dụng (App ID)</span>
                  <strong className="meta-value"><code>{selectedEvent.app_identifier || 'Không rõ'}</code></strong>
                </div>
                <div>
                  <span className="meta-label">Thời điểm ghi nhận</span>
                  <strong className="meta-value">{formatDate(selectedEvent.created_at)}</strong>
                </div>
              </div>

              {/* Parameters section */}
              <section className="log-section">
                <div className="section-head">
                  <h3>📊 Tham số sự kiện (Event Parameters)</h3>
                  {selectedEvent.parameters && (
                    <button
                      type="button"
                      className="btn-mini"
                      onClick={() => copyToClipboard(formatJsonPretty(selectedEvent.parameters), 'event_params')}
                    >
                      {copiedItem === 'event_params' ? '✓ Đã sao chép' : 'Sao chép JSON'}
                    </button>
                  )}
                </div>
                <pre className="log-code">
                  {selectedEvent.parameters
                    ? formatJsonPretty(selectedEvent.parameters)
                    : '// Sự kiện không có tham số đính kèm'}
                </pre>
              </section>

              {/* Device Info */}
              {selectedEvent.device_info && (
                <section className="log-section">
                  <div className="section-head">
                    <h3>📱 Thông tin thiết bị</h3>
                  </div>
                  <pre className="log-code">
                    {formatJsonPretty(selectedEvent.device_info)}
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
