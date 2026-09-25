import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../../styles/global.css';
import TelegramSettingsModal from '../../components/dashboard/TelegramSettingsModal';
import UserJourneyTimeline from '../../components/dashboard/UserJourneyTimeline';
import SystemHealthSummary from '../../components/dashboard/SystemHealthSummary';
import IssueManagementPanel from '../../components/dashboard/IssueManagementPanel';
import ApiLogsPanel from '../../components/dashboard/ApiLogsPanel';
import CrashlyticsPanel from '../../components/dashboard/CrashlyticsPanel';
import EventsPanel from '../../components/dashboard/EventsPanel';
import EventFunnelsPanel from '../../components/dashboard/EventFunnelsPanel';
import SavedViews from '../../components/ui/SavedViews';
import TelemetryControlBar from '../../components/dashboard/TelemetryControlBar';
import CustomSelect from '../../components/ui/CustomSelect';
import PaginationDock from '../../components/ui/PaginationDock';
import { exportToCsv } from '../../utils/exportCsv';
import { usePlatform } from '../../context/PlatformContext';
import { API_MONITOR_URL } from '../../constants/api';
import {
  formatVietnamDate,
  formatVietnamTime,
  formatVietnamDateTime,
  formatMs,
  parseUtcDate,
  parseJsonSafe,
  formatJsonPretty,
  getStatusMeta,
  getSummarySnippet,
  getCrashPlatform,
  isItemWeb,
  isDeviceWeb,
  OUTCOME_COLORS,
  RANGE_OPTIONS,
} from '../../utils/format';

const TELEMETRY_CAP = 300;

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

// Kiểm tra 2 danh sách telemetry có thay đổi thực sự không trước khi re-render
function hasTelemetryArrayChanged(prev, next) {
  if (!Array.isArray(next)) return false;
  if (!Array.isArray(prev) || prev.length !== next.length) return true;
  if (next.length === 0) return false;
  return prev[0]?.id !== next[0]?.id || prev[0]?.created_at !== next[0]?.created_at;
}

// Chuẩn hoá mọi giá trị về chuỗi thường trước khi so khớp tìm kiếm
function toSearchText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.toLowerCase();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).toLowerCase();
    } catch {
      return '';
    }
  }
  return String(value).toLowerCase();
}

const MODE_TO_PATH = {
  issues: 'issues',
  logs: 'logs',
  crashes: 'crashes',
  analytics: 'events',
  funnels: 'funnels',
  timeline: 'timeline',
};

const PATH_TO_MODE = {
  issues: 'issues',
  logs: 'logs',
  crashes: 'crashes',
  events: 'analytics',
  funnels: 'funnels',
  timeline: 'timeline',
};

function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode: routeMode } = useParams();
  const navigate = useNavigate();
  const userIdFromUrl = searchParams.get('user_id');
  const telemetryMode = PATH_TO_MODE[routeMode] || 'logs';

  const goMode = (mode) => {
    const path = MODE_TO_PATH[mode] || 'logs';
    navigate({ pathname: `/admin/monitor/${path}`, search: searchParams.toString() });
  };

  useEffect(() => {
    if (!PATH_TO_MODE[routeMode]) {
      navigate({ pathname: '/admin/monitor/logs', search: searchParams.toString() }, { replace: true });
    }
  }, [routeMode, navigate, searchParams]);

  // Issue APM unresolved count
  const [unresolvedIssuesCount, setUnresolvedIssuesCount] = useState(0);

  // Data states
  const [logs, setLogs] = useState([]);
  const [crashes, setCrashes] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Sub-filter Tabs
  const [activeTab, setActiveTab] = useState(searchParams.get('status') || 'all'); // for logs: 'all', '200', '400', '500'
  const [crashTab, setCrashTab] = useState(searchParams.get('severity') || 'all');   // for crashes: 'all', 'fatal', 'non-fatal'
  const [eventTab, setEventTab] = useState(searchParams.get('type') || 'all');   // for analytics: 'all', 'custom', 'screen_view'

  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 280);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Pagination states (Mặc định 20 dòng để Mobile WebView mượt tuyệt đối)
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(Number(searchParams.get('size')) || 20);

  const [crashPage, setCrashPage] = useState(1);
  const [crashPageSize, setCrashPageSize] = useState(Number(searchParams.get('size')) || 20);

  const [eventPage, setEventPage] = useState(1);
  const [eventPageSize, setEventPageSize] = useState(Number(searchParams.get('size')) || 20);

  // Auto-refresh control (Mặc định 15s để không chiếm dụng CPU WebView)
  const [refreshInterval, setRefreshInterval] = useState(30000);

  // Modals
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedCrash, setSelectedCrash] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const { platformScope, openPlatformModal, selectPlatform } = usePlatform();
  const [copiedItem, setCopiedItem] = useState(null);
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [setupTab, setSetupTab] = useState(platformScope === 'web' ? 'angular' : 'crashlytics');

  useEffect(() => {
    setSetupTab(platformScope === 'web' ? 'angular' : 'crashlytics');
  }, [platformScope]);

  // User & Job Filtering State
  const [filterMeta, setFilterMeta] = useState({ apps: [], devices: [], users: [] });
  const [usersList, setUsersList] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState(userIdFromUrl || 'all');
  const [deviceFilter, setDeviceFilter] = useState(searchParams.get('device') || 'all');
  const [userFilter, setUserFilter] = useState(searchParams.get('user') || 'all');

  const isFetchingUsersRef = useRef(false);
  const isFetchingMetaRef = useRef(false);

  // Thống kê sự kiện (funnel): danh sách cấu hình, funnel đang xem và số liệu đã tổng hợp
  const [funnels, setFunnels] = useState([]);
  const [activeFunnel, setActiveFunnel] = useState('ekyb');
  const [statsRange, setStatsRange] = useState(7);
  const [funnelStats, setFunnelStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [funnelSetupOpen, setFunnelSetupOpen] = useState(false);
  const [eventCatalog, setEventCatalog] = useState({ events: [], suggestions: [] });
  const [funnelDraft, setFunnelDraft] = useState({ funnel_key: '', name: '', event_prefix: '', app_identifier: '' });
  const [savingFunnel, setSavingFunnel] = useState(false);

  // Telegram Alerting & User Journey Timeline states
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [timelineUser, setTimelineUser] = useState(searchParams.get('user') || '');
  const [timelineDevice, setTimelineDevice] = useState(searchParams.get('device') || '');
  const [timelineApp, setTimelineApp] = useState(searchParams.get('app') || '');

  const viewUserTimeline = ({ user = '', device = '', app = '' }) => {
    setTimelineUser(user);
    setTimelineDevice(device);
    setTimelineApp(app);
    const next = new URLSearchParams(searchParams);
    if (user) next.set('user', user); else next.delete('user');
    if (device) next.set('device', device); else next.delete('device');
    if (app) next.set('app', app); else next.delete('app');
    navigate({ pathname: '/admin/monitor/timeline', search: next.toString() });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setMonitorQuery = (updates, options = {}) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '' || value === 'all') next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next, { replace: options.replace !== false });
  };

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
    if (isFetchingUsersRef.current) return;
    isFetchingUsersRef.current = true;
    try {
      const response = await fetch(`${API_MONITOR_URL}/users`, {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setUsersList(data);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải /users, chuyển sang tự nhận diện từ telemetry:', err);
    } finally {
      isFetchingUsersRef.current = false;
    }
  };

  // Danh sách chỉ tải bản rút gọn (payload cắt 300 ký tự, không có request_payload
  // và stack trace đầy đủ) để giảm dữ liệu đọc. Bản đầy đủ chỉ lấy khi mở chi tiết.
  const openDetail = async (type, row, setter) => {
    setter(row);
    if (!row?.id) return;
    try {
      const response = await fetch(
        `${API_MONITOR_URL}/telemetry/detail?type=${type}&id=${encodeURIComponent(row.id)}`,
        { cache: 'no-store', headers: { Accept: 'application/json' } }
      );
      if (!response.ok) return;
      const full = await response.json();
      if (!full || !full.id) return;
      // Người dùng có thể đã đóng hoặc mở bản ghi khác trong lúc chờ
      setter((current) => (current && current.id === full.id ? { ...current, ...full } : current));
    } catch (err) {
      console.warn('Không tải được bản đầy đủ, giữ bản rút gọn:', err);
    }
  };

  const fetchFilterMetadata = async (scope = platformScope) => {
    if (isFetchingMetaRef.current) return;
    isFetchingMetaRef.current = true;
    try {
      const response = await fetch(`${API_MONITOR_URL}/telemetry/filters?platform=${encodeURIComponent(scope || 'all')}`, {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.quota_exceeded) {
          setQuotaExceeded(true);
        } else {
          setQuotaExceeded(false);
        }
        if (data && typeof data === 'object') {
          setFilterMeta({
            apps: Array.isArray(data.apps) ? data.apps : [],
            devices: Array.isArray(data.devices) ? data.devices : [],
            users: Array.isArray(data.users) ? data.users : [],
          });
        }
      } else {
        const errText = await response.text().catch(() => '');
        if (errText.includes('daily row read limit') || errText.includes('exceeded D1') || errText.includes('quota')) {
          setQuotaExceeded(true);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải /telemetry/filters:', err);
    } finally {
      isFetchingMetaRef.current = false;
    }
  };

  // Interval polling cần đọc danh sách hiện tại để biết id lớn nhất. Nếu đưa
  // logs/crashes/events vào dependency của useEffect thì timer bị dựng lại sau
  // mỗi lần dữ liệu đổi, nên giữ qua ref.
  const telemetryRef = useRef({ logs: [], crashes: [], events: [] });
  useEffect(() => {
    telemetryRef.current = { logs, crashes, events };
  }, [logs, crashes, events]);

  // Ghép các dòng mới lấy về vào đầu danh sách đang giữ, cắt bớt phần đuôi.
  // Dùng cho chế độ polling tăng dần: server chỉ trả về dòng mới hơn id đang có.
  const mergeIncoming = (previous, incoming, cap) => {
    if (!incoming.length) return previous;
    const seen = new Set(incoming.map((row) => row.id));
    return [...incoming, ...previous.filter((row) => !seen.has(row.id))].slice(0, cap);
  };

  const fetchAllTelemetry = async (overrideFilter, overrideDevice, overrideUser, options = {}) => {
    const incremental = options.incremental === true;
    try {
      // Đảm bảo usersList và filter metadata luôn được nạp lại nếu trước đó WebView kết nối trễ
      if (usersList.length === 0 && !isFetchingUsersRef.current) {
        fetchUsers();
      }
      if ((!filterMeta.apps || filterMeta.apps.length === 0) && !isFetchingMetaRef.current) {
        fetchFilterMetadata(platformScope);
      }

      const activeUser = overrideFilter !== undefined ? overrideFilter : selectedFilter;
      const activeDevice = overrideDevice !== undefined ? overrideDevice : deviceFilter;
      const activeUserName = overrideUser !== undefined ? overrideUser : userFilter;

      const queryParts = [];

      // Bắt buộc luôn truyền platform xuống API để server lọc từ gốc
      if (platformScope) {
        queryParts.push(`platform=${encodeURIComponent(platformScope)}`);
      }

      if (activeUser && activeUser !== 'all') {
        if (!isNaN(Number(activeUser))) {
          queryParts.push(`user_id=${encodeURIComponent(activeUser)}`);
        } else {
          queryParts.push(`app_identifier=${encodeURIComponent(activeUser)}`);
        }
      }
      if (activeDevice && activeDevice !== 'all') {
        queryParts.push(`device=${encodeURIComponent(activeDevice)}`);
      }
      if (activeUserName && activeUserName !== 'all') {
        queryParts.push(`user=${encodeURIComponent(activeUserName)}`);
      }

      // Polling tăng dần: chỉ hỏi những dòng mới hơn dòng đang giữ. Một dashboard
      // mở cả ngày mà app không sinh telemetry sẽ đọc 0 dòng thay vì kéo lại toàn
      // bộ danh sách sau mỗi chu kỳ — đây là nguồn đốt hạn mức đọc D1 lớn nhất.
      const withCursor = (base, rows) => {
        const parts = [...queryParts];
        if (incremental && rows.length > 0) {
          const maxId = rows.reduce((max, row) => (row.id > max ? row.id : max), 0);
          if (maxId > 0) parts.push(`after_id=${maxId}`);
        }
        return parts.length ? `${base}?${parts.join('&')}` : base;
      };

      const held = telemetryRef.current;
      // Không đặt cache:'no-store' nữa để header Cache-Control của worker còn tác dụng
      const fetchOptions = { headers: { Accept: 'application/json' } };
      const [logsRes, crashesRes, eventsRes] = await Promise.all([
        fetch(`${API_MONITOR_URL}${withCursor('/logs', held.logs)}`, fetchOptions),
        fetch(`${API_MONITOR_URL}${withCursor('/crashes', held.crashes)}`, fetchOptions),
        fetch(`${API_MONITOR_URL}${withCursor('/events', held.events)}`, fetchOptions),
      ]);

      const applyResult = async (response, setter, current) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          if (
            text.includes('daily row read limit') ||
            text.includes('exceeded D1') ||
            text.includes('quota')
          ) {
            setQuotaExceeded(true);
          }
          return;
        }
        const data = await response.json();
        if (data && data.quota_exceeded) {
          setQuotaExceeded(true);
          return;
        }
        setQuotaExceeded(false);
        if (!Array.isArray(data)) return;
        if (incremental && current.length > 0) {
          setter((prev) => mergeIncoming(prev, data, TELEMETRY_CAP));
        } else {
          setter((prev) => (hasTelemetryArrayChanged(prev, data) ? data : prev));
        }
      };

      await applyResult(logsRes, setLogs, held.logs);
      await applyResult(crashesRes, setCrashes, held.crashes);
      await applyResult(eventsRes, setEvents, held.events);

      // Cập nhật số lượng sự cố chưa giải quyết cho Tab badge
      try {
        const issueUrl = `${API_MONITOR_URL}/issues?limit=1&status=unresolved&platform=${encodeURIComponent(platformScope || 'all')}${
          activeUser && activeUser !== 'all' ? `&app_identifier=${encodeURIComponent(activeUser)}` : ''
        }`;
        const issueRes = await fetch(issueUrl, fetchOptions);
        if (issueRes.ok) {
          const issueData = await issueRes.json();
          if (issueData?.counts?.unresolved !== undefined) {
            setUnresolvedIssuesCount(issueData.counts.unresolved);
          }
        }
      } catch {
        // silent
      }

      setError(null);
    } catch (requestError) {
      if (requestError.message?.includes('daily row read limit') || requestError.message?.includes('exceeded D1')) {
        setQuotaExceeded(true);
      }
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchFilterMetadata();
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

  // Polling thông minh: Chỉ chạy khi tab/webview hiển thị, không bị vượt quota và người dùng bật auto-refresh
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || quotaExceeded) return undefined;

    const interval = window.setInterval(() => {
      // Nếu WebView bị ẩn nền (tab ẩn, khóa màn hình), không kéo dữ liệu thừa
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchAllTelemetry(undefined, undefined, undefined, { incremental: true });
      if (telemetryMode === 'funnels') fetchFunnelStats();
    }, refreshInterval);

    return () => window.clearInterval(interval);
  }, [selectedFilter, deviceFilter, userFilter, refreshInterval, telemetryMode]);

  const handleFilterChange = (val) => {
    setSelectedFilter(val);
    if (val === 'all') {
      setMonitorQuery({ user_id: null });
      fetchAllTelemetry('all', deviceFilter, userFilter);
    } else {
      setMonitorQuery({ user_id: val });
      fetchAllTelemetry(val, deviceFilter, userFilter);
    }
  };

  const handleDeviceChange = (val) => {
    setDeviceFilter(val);
    setMonitorQuery({ device: val });
    fetchAllTelemetry(selectedFilter, val, userFilter);
  };

  const handleUserChange = (val) => {
    setUserFilter(val);
    setMonitorQuery({ user: val });
    fetchAllTelemetry(selectedFilter, deviceFilter, val);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setMonitorQuery({ q: searchTerm }), 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // WinForms WebView2 Interop Bridge
  useEffect(() => {
    window.flowApi = {
      setFilter: (val) => handleFilterChange(val),
      setDevice: (d) => handleDeviceChange(d),
      setUser: (u) => handleUserChange(u),
      refresh: () => fetchAllTelemetry(),
      getFilterState: () => ({
        selectedFilter,
        deviceFilter,
        userFilter,
        telemetryMode,
      }),
    };

    const handleWebViewMessage = (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data || typeof data !== 'object') return;

        if (data.action === 'setFilter' && data.value !== undefined) {
          handleFilterChange(data.value);
        } else if (data.action === 'setDevice' && data.value !== undefined) {
          handleDeviceChange(data.value);
        } else if (data.action === 'setUser' && data.value !== undefined) {
          handleUserChange(data.value);
        } else if (data.action === 'refresh') {
          fetchAllTelemetry();
        }
      } catch (err) {
        console.warn('WinForms message parse error:', err);
      }
    };

    if (typeof window !== 'undefined' && window.chrome && window.chrome.webview) {
      window.chrome.webview.addEventListener('message', handleWebViewMessage);
      try {
        window.chrome.webview.postMessage({ type: 'FLOW_API_READY' });
      } catch (_) {}
    }

    return () => {
      if (typeof window !== 'undefined' && window.chrome && window.chrome.webview) {
        window.chrome.webview.removeEventListener('message', handleWebViewMessage);
      }
      delete window.flowApi;
    };
  }, [selectedFilter, deviceFilter, userFilter, telemetryMode]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.chrome && window.chrome.webview) {
      try {
        window.chrome.webview.postMessage({
          type: 'FILTER_CHANGED',
          selectedFilter,
          deviceFilter,
          userFilter,
          telemetryMode,
        });
      } catch (_) {}
    }
  }, [selectedFilter, deviceFilter, userFilter, telemetryMode]);

  // Reset trang về 1 khi đổi bộ lọc hoặc từ khóa tìm kiếm
  useEffect(() => {
    setLogsPage(1);
  }, [activeTab, debouncedSearch, selectedFilter, deviceFilter, userFilter]);

  useEffect(() => {
    setCrashPage(1);
  }, [crashTab, debouncedSearch, selectedFilter, deviceFilter, userFilter]);

  useEffect(() => {
    setEventPage(1);
  }, [eventTab, debouncedSearch, selectedFilter, deviceFilter, userFilter]);

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

  // Danh sách App / Job khả dụng để lọc - tự động kết hợp từ /telemetry/filters VÀ từ /users API VÀ telemetry
  // Giúp dropdown KHÔNG BAO GIỜ bị rỗng kể cả khi chạy webview WinForms bị nghẽn mạng ban đầu!
  const availableJobs = useMemo(() => {
    const list = [];
    const seen = new Set();

    // 1. Nạp từ metadata API /telemetry/filters
    if (Array.isArray(filterMeta.apps) && filterMeta.apps.length > 0) {
      filterMeta.apps.forEach((app) => {
        const key = app.app_identifier || app.id;
        if (key && !seen.has(key)) {
          seen.add(key);
          list.push({
            id: String(app.id),
            filterValue: String(app.filterValue || app.id),
            job_name: app.job_name || app.name,
            app_identifier: app.app_identifier || '',
            job_type: app.job_type || (isItemWeb(app) ? 'web' : 'app'),
            name: app.user_name || app.name || 'Hệ thống',
          });
        }
      });
    }

    // 2. Dự phòng thêm từ /users API
    if (Array.isArray(usersList)) {
      usersList.forEach((u) => {
        if (u && (u.job_name || u.app_identifier)) {
          const key = u.app_identifier || `user_${u.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              id: String(u.id),
              filterValue: String(u.id),
              job_name: u.job_name || u.name,
              app_identifier: u.app_identifier || '',
              job_type: u.job_type || 'app',
              name: u.name,
            });
          }
        }
      });
    }

    // 3. Dự phòng thêm khi usersList chưa tải xong hoặc mạng WebView bị nghẽn
    const scanItems = [...logs, ...crashes, ...events];
    scanItems.forEach((item) => {
      const appId = item.app_identifier;
      if (appId && !seen.has(appId)) {
        seen.add(appId);
        list.push({
          id: appId,
          filterValue: item.job_id ? String(item.job_id) : appId,
          job_name: item.job_name || appId,
          app_identifier: appId,
          job_type: item.job_type || (isItemWeb(item) ? 'web' : 'app'),
          name: item.user_name || 'Telemetry App',
        });
      }
    });

    if (platformScope === 'web') {
      return list.filter((item) => item.job_type === 'web');
    }
    if (platformScope === 'app') {
      return list.filter((item) => item.job_type === 'app');
    }
    return list;
  }, [filterMeta.apps, usersList, logs, crashes, events, platformScope]);

  const activeUserJob = useMemo(() => {
    if (!selectedFilter || selectedFilter === 'all') return null;
    return availableJobs.find(
      (u) => String(u.id) === String(selectedFilter) || 
             String(u.filterValue) === String(selectedFilter) ||
             String(u.app_identifier) === String(selectedFilter)
    ) || null;
  }, [selectedFilter, availableJobs]);

  const currentAppId = activeUserJob?.app_identifier || (platformScope === 'web' ? 'vn.myportal.web' : 'vn.fizahub.app');

  // Tự động chuyển bộ lọc về 'all' nếu job đang chọn không thuộc nền tảng hiện tại
  useEffect(() => {
    if (selectedFilter && selectedFilter !== 'all') {
      const exists = availableJobs.some(
        (u) => String(u.id) === String(selectedFilter) ||
               String(u.filterValue) === String(selectedFilter) ||
               String(u.app_identifier) === String(selectedFilter)
      );
      if (!exists) {
        setSelectedFilter('all');
      }
    }
  }, [platformScope, availableJobs]);

  // ---- Thống kê sự kiện (funnel) ----
  const fetchFunnels = async (scope = platformScope) => {
    try {
      const response = await fetch(`${API_MONITOR_URL}/funnels?platform=${encodeURIComponent(scope || 'all')}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data)) return;
      setFunnels(data);
      setActiveFunnel((current) => {
        if (current && data.some((item) => item.funnel_key === current)) return current;
        return data[0]?.funnel_key || '';
      });
    } catch (err) {
      console.warn('Không tải được danh sách funnel:', err);
    }
  };

  // Khi đổi phân hệ (Web <-> App), dọn sạch dữ liệu cũ và nạp lại toàn bộ telemetry mới
  useEffect(() => {
    setLogs([]);
    setCrashes([]);
    setEvents([]);
    telemetryRef.current = { logs: [], crashes: [], events: [] };
    setSelectedFilter('all');
    setDeviceFilter('all');
    setUserFilter('all');
    fetchFilterMetadata(platformScope);
    fetchAllTelemetry('all', 'all', 'all', { incremental: false });
    fetchFunnels(platformScope);
  }, [platformScope]);

  const fetchFunnelStats = async (overrides = {}) => {
    const funnelKey = overrides.funnel ?? activeFunnel;
    if (!funnelKey) {
      setFunnelStats(null);
      return;
    }

    try {
      setStatsLoading(true);
      const params = new URLSearchParams({
        funnel: funnelKey,
        days: String(overrides.days ?? statsRange),
      });

      // Thống kê bám theo đúng bộ lọc đang chọn ở đầu trang
      if (platformScope) params.set('platform', platformScope);
      const appId = activeUserJob?.app_identifier;
      if (appId) params.set('app_identifier', appId);
      if (deviceFilter && deviceFilter !== 'all') params.set('device', deviceFilter);
      if (userFilter && userFilter !== 'all') params.set('user', userFilter);

      const response = await fetch(`${API_MONITOR_URL}/events/stats?${params.toString()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setFunnelStats(data);
      setStatsError(null);
    } catch (err) {
      setFunnelStats(null);
      setStatsError(err.message);
    } finally {
      setStatsLoading(false);
    }
  };

  const openFunnelSetup = async (funnelKey = null) => {
    const existing = funnelKey ? funnels.find((item) => item.funnel_key === funnelKey) : null;
    setFunnelDraft(
      existing
        ? {
            funnel_key: existing.funnel_key,
            name: existing.name,
            event_prefix: existing.event_prefix || '',
            app_identifier: existing.app_identifier || '',
            isEdit: true,
          }
        : { funnel_key: '', name: '', event_prefix: '', app_identifier: '', isEdit: false }
    );
    setFunnelSetupOpen(true);

    try {
      const response = await fetch(`${API_MONITOR_URL}/events/catalog`, { cache: 'no-store' });
      if (response.ok) setEventCatalog(await response.json());
    } catch (err) {
      console.warn('Không tải được danh mục sự kiện:', err);
    }
  };

  const saveFunnel = async () => {
    if (!funnelDraft.funnel_key.trim() || !funnelDraft.name.trim()) return;
    try {
      setSavingFunnel(true);
      const response = await fetch(`${API_MONITOR_URL}/funnels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnel_key: funnelDraft.funnel_key.trim(),
          name: funnelDraft.name.trim(),
          event_prefix: funnelDraft.event_prefix.trim(),
          app_identifier: funnelDraft.app_identifier?.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);

      await fetchFunnels();
      setActiveFunnel(data.funnel.funnel_key);
      setFunnelSetupOpen(false);
      fetchFunnelStats({ funnel: data.funnel.funnel_key });
    } catch (err) {
      setStatsError(err.message);
    } finally {
      setSavingFunnel(false);
    }
  };

  const deleteFunnel = async (funnelKey) => {
    try {
      await fetch(`${API_MONITOR_URL}/funnels?funnel_key=${encodeURIComponent(funnelKey)}`, {
        method: 'DELETE',
      });
      setFunnelSetupOpen(false);
      await fetchFunnels();
    } catch (err) {
      setStatsError(err.message);
    }
  };

  useEffect(() => {
    fetchFunnels();
  }, []);

  // Chỉ gọi API thống kê khi thực sự đang xem tab đó, tránh tốn băng thông WebView
  useEffect(() => {
    if (telemetryMode !== 'funnels') return;
    fetchFunnelStats();
  }, [telemetryMode, activeFunnel, statsRange, selectedFilter, deviceFilter, userFilter]);


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

  const angularSnippet = `// 1. Cấu hình trong app.config.ts (Angular 15-19+ Standalone)
import { ApplicationConfig, ErrorHandler } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApiLoggerService, apiLoggerInterceptor, GlobalErrorHandler } from './core/services/api-logger.service';

ApiLoggerService.initialize({
  appId: '${currentAppId}',
  serverUrl: '${API_MONITOR_URL}',
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([apiLoggerInterceptor])),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};

// 2. Cập nhật Tên Người Dùng sau khi Login (trong AuthService/LoginComponent):
// ApiLoggerService.setUserName(user.fullName || user.username);`;

  const formatDate = (dateString) => formatVietnamDateTime(dateString);

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
      const payloadStr = typeof log.response_payload === 'string'
        ? log.response_payload
        : JSON.stringify(log.response_payload);
      const trimmed = payloadStr.trim();
      if (trimmed.startsWith('[')) {
        return '📦 Data: [Danh sách mảng dữ liệu]';
      }
      if (trimmed.startsWith('{')) {
        // Trích xuất key nhanh bằng regex, không parse JSON nặng làm đơ WebView
        const matches = trimmed.slice(0, 250).match(/"([^"]+)":/g);
        if (matches && matches.length > 0) {
          const keys = matches.slice(0, 3).map((k) => k.replace(/[" :]/g, '')).join(', ');
          return `📦 Data: { ${keys}${matches.length > 3 ? ', …' : ''} }`;
        }
        return '📦 Data: { JSON Object }';
      }
      return `📦 Data: ${trimmed.substring(0, 45)}…`;
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

  // Lọc tập dữ liệu theo Platform Scope (Quản lý Web thì chỉ hiển thị Web, Quản lý App thì chỉ hiển thị App)
  const scopedLogs = useMemo(() => {
    let list = logs;
    if (platformScope === 'web') {
      list = list.filter((l) => l.job_type === 'web' || isItemWeb(l));
    } else if (platformScope === 'app') {
      list = list.filter((l) => l.job_type === 'app' || (!isItemWeb(l) && l.job_type !== 'web'));
    }
    if (selectedFilter !== 'all') {
      list = list.filter(
        (l) =>
          String(l.job_id) === String(selectedFilter) ||
          String(l.app_identifier) === String(selectedFilter) ||
          String(l.user_id) === String(selectedFilter)
      );
    }
    return list;
  }, [logs, selectedFilter, platformScope]);

  const scopedCrashes = useMemo(() => {
    let list = crashes;
    if (platformScope === 'web') {
      list = list.filter((c) => c.job_type === 'web' || isItemWeb(c));
    } else if (platformScope === 'app') {
      list = list.filter((c) => c.job_type === 'app' || (!isItemWeb(c) && c.job_type !== 'web'));
    }
    if (selectedFilter !== 'all') {
      list = list.filter(
        (c) =>
          String(c.job_id) === String(selectedFilter) ||
          String(c.app_identifier) === String(selectedFilter)
      );
    }
    return list;
  }, [crashes, selectedFilter, platformScope]);

  const scopedEvents = useMemo(() => {
    let list = events;
    if (platformScope === 'web') {
      list = list.filter((e) => e.job_type === 'web' || isItemWeb(e));
    } else if (platformScope === 'app') {
      list = list.filter((e) => e.job_type === 'app' || (!isItemWeb(e) && e.job_type !== 'web'));
    }
    if (selectedFilter !== 'all') {
      list = list.filter(
        (e) =>
          String(e.job_id) === String(selectedFilter) ||
          String(e.app_identifier) === String(selectedFilter) ||
          String(e.user_id) === String(selectedFilter)
      );
    }
    return list;
  }, [events, selectedFilter, platformScope]);

  // Status counters for Logs
  const totalCalls = scopedLogs.length;
  const count200 = scopedLogs.filter((log) => log.status_code >= 200 && log.status_code < 300).length;
  const count400 = scopedLogs.filter((log) => log.status_code >= 400 && log.status_code < 500).length;
  const count500 = scopedLogs.filter((log) => log.status_code >= 500 || log.status_code < 200).length;
  const successRate = totalCalls > 0 ? Math.round((count200 / totalCalls) * 100) : null;
  const totalDuration = scopedLogs.reduce((acc, log) => acc + (Number(log.duration_ms) || 0), 0);
  const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

  // Status counters for Crashes
  const totalCrashes = scopedCrashes.length;
  const fatalCrashes = scopedCrashes.filter((c) => Number(c.is_fatal) === 1).length;
  const nonFatalCrashes = scopedCrashes.filter((c) => Number(c.is_fatal) !== 1).length;
  const androidCrashes = scopedCrashes.filter((c) => getCrashPlatform(c).key === 'android').length;
  const iosCrashes = scopedCrashes.filter((c) => getCrashPlatform(c).key === 'ios').length;
  const affectedAppsCount = new Set(scopedCrashes.map((c) => c.app_identifier).filter(Boolean)).size;

  // Status counters for Analytics
  const totalEvents = scopedEvents.length;
  const screenViewCount = scopedEvents.filter((e) => e.event_type === 'screen_view' || e.event_name === 'screen_view').length;
  const customEventCount = totalEvents - screenViewCount;
  const uniqueUsersCount = new Set(scopedEvents.map((e) => e.user_id).filter(Boolean)).size;

  // Danh sách Thiết bị / Trình duyệt duy nhất theo Platform Scope
  const uniqueDevices = useMemo(() => {
    const set = new Set();

    const addDevice = (d) => {
      if (!d) return;
      const str = String(d).trim();
      if (!str) return;

      if (platformScope === 'web') {
        if (isDeviceWeb(str)) set.add(str);
      } else if (platformScope === 'app') {
        if (!isDeviceWeb(str) || str.toLowerCase().includes('android') || str.toLowerCase().includes('ios') || str.toLowerCase().includes('iphone') || str.toLowerCase().includes('samsung')) {
          set.add(str);
        }
      } else {
        set.add(str);
      }
    };

    scopedLogs.forEach((l) => { if (l.device_name) addDevice(l.device_name); });
    scopedCrashes.forEach((c) => {
      if (c.device_info) {
        try {
          const parsed = JSON.parse(c.device_info);
          addDevice(parsed.browser || parsed.device || parsed.model || parsed.name);
        } catch {
          addDevice(c.device_info);
        }
      }
    });
    scopedEvents.forEach((e) => {
      if (e.device_info) {
        try {
          const parsed = JSON.parse(e.device_info);
          addDevice(parsed.browser || parsed.device || parsed.model || parsed.name);
        } catch {
          addDevice(e.device_info);
        }
      }
    });

    if (Array.isArray(filterMeta.devices)) {
      filterMeta.devices.forEach(addDevice);
    }

    return Array.from(set).filter(Boolean).sort();
  }, [scopedLogs, scopedCrashes, scopedEvents, filterMeta.devices, platformScope]);

  // Danh sách Người dùng duy nhất theo Platform Scope
  const uniqueUsers = useMemo(() => {
    const set = new Set();

    // Lấy user thuộc về các job của platform hiện tại
    availableJobs.forEach((job) => {
      if (job.name && job.name !== 'Hệ thống') set.add(String(job.name));
    });

    scopedLogs.forEach((l) => { if (l.user_name) set.add(String(l.user_name)); });
    scopedCrashes.forEach((c) => { if (c.user_name) set.add(String(c.user_name)); });
    scopedEvents.forEach((e) => {
      if (e.user_name) set.add(String(e.user_name));
      else if (e.user_id) set.add(String(e.user_id));
    });
    return Array.from(set).filter(Boolean).sort();
  }, [availableJobs, scopedLogs, scopedCrashes, scopedEvents]);

  // Tự động reset deviceFilter và userFilter nếu giá trị đang chọn không thuộc nền tảng hiện tại
  useEffect(() => {
    if (deviceFilter !== 'all' && !uniqueDevices.includes(deviceFilter)) {
      setDeviceFilter('all');
    }
  }, [uniqueDevices, deviceFilter]);

  useEffect(() => {
    if (userFilter !== 'all' && !uniqueUsers.includes(userFilter)) {
      setUserFilter('all');
    }
  }, [uniqueUsers, userFilter]);

  // Filter and search Logs
  const filteredLogs = useMemo(() => {
    return scopedLogs.filter((log) => {
      const matchesTab = (() => {
        if (activeTab === 'all') return true;
        if (activeTab === '200') return log.status_code >= 200 && log.status_code < 300;
        if (activeTab === '400') return log.status_code >= 400 && log.status_code < 500;
        if (activeTab === '500') return log.status_code >= 500 || log.status_code < 200;
        return true;
      })();

      if (!matchesTab) return false;
      if (deviceFilter !== 'all' && log.device_name !== deviceFilter) return false;
      if (userFilter !== 'all' && log.user_name !== userFilter) return false;

      if (!debouncedSearch) return true;
      const lowerSearch = debouncedSearch.toLowerCase();
      const endpointMatch = toSearchText(log.endpoint).includes(lowerSearch);
      const statusMatch = toSearchText(log.status_code).includes(lowerSearch);
      const errorMatch = toSearchText(log.error_message).includes(lowerSearch);
      const appMatch = toSearchText(log.app_identifier).includes(lowerSearch);
      const userMatch = toSearchText(log.user_name).includes(lowerSearch);
      const deviceMatch = toSearchText(log.device_name).includes(lowerSearch);
      const ipMatch = toSearchText(log.ip_address).includes(lowerSearch);
      const jobMatch = toSearchText(log.job_name).includes(lowerSearch);

      return endpointMatch || statusMatch || errorMatch || appMatch || userMatch || jobMatch || deviceMatch || ipMatch;
    });
  }, [scopedLogs, activeTab, debouncedSearch, deviceFilter, userFilter]);

  // Filter and search Crashes
  const filteredCrashes = useMemo(() => {
    return scopedCrashes.filter((crash) => {
      const osPlatform = getCrashPlatform(crash);
      if (crashTab === 'fatal' && Number(crash.is_fatal) !== 1) return false;
      if (crashTab === 'non-fatal' && Number(crash.is_fatal) === 1) return false;
      if (crashTab === 'android' && osPlatform.key !== 'android') return false;
      if (crashTab === 'ios' && osPlatform.key !== 'ios') return false;

      if (deviceFilter !== 'all') {
        const dLower = deviceFilter.toLowerCase();
        if (!toSearchText(crash.device_info).includes(dLower)) return false;
      }
      if (userFilter !== 'all' && crash.user_name !== userFilter) return false;

      if (!debouncedSearch) return true;
      const lower = debouncedSearch.toLowerCase();
      const msgMatch = toSearchText(crash.error_message).includes(lower);
      const stackMatch = toSearchText(crash.stack_trace).includes(lower);
      const appMatch = toSearchText(crash.app_identifier).includes(lower);
      const userMatch = toSearchText(crash.user_name).includes(lower);
      const jobMatch = toSearchText(crash.job_name).includes(lower);
      const deviceMatch = toSearchText(crash.device_info).includes(lower);
      const osMatch = toSearchText(osPlatform.name).includes(lower) || toSearchText(osPlatform.label).includes(lower);

      return msgMatch || stackMatch || appMatch || userMatch || jobMatch || deviceMatch || osMatch;
    });
  }, [scopedCrashes, crashTab, debouncedSearch, deviceFilter, userFilter]);

  // Filter and search Analytics
  const filteredEvents = useMemo(() => {
    return scopedEvents.filter((event) => {
      const isScreen = event.event_type === 'screen_view' || event.event_name === 'screen_view';
      if (eventTab === 'screen_view' && !isScreen) return false;
      if (eventTab === 'custom' && isScreen) return false;

      if (deviceFilter !== 'all') {
        const dLower = deviceFilter.toLowerCase();
        if (!toSearchText(event.device_info).includes(dLower)) return false;
      }
      if (userFilter !== 'all') {
        if (String(event.user_name ?? '') !== userFilter && String(event.user_id ?? '') !== userFilter) return false;
      }

      if (!debouncedSearch) return true;
      const lower = debouncedSearch.toLowerCase();
      const nameMatch = toSearchText(event.event_name).includes(lower);
      const screenMatch = toSearchText(event.screen_name).includes(lower);
      const userMatch = toSearchText(event.user_id).includes(lower) || toSearchText(event.user_name).includes(lower);
      const appMatch = toSearchText(event.app_identifier).includes(lower);
      const jobMatch = toSearchText(event.job_name).includes(lower);
      const paramMatch = toSearchText(event.parameters).includes(lower);

      return nameMatch || screenMatch || userMatch || appMatch || jobMatch || paramMatch;
    });
  }, [scopedEvents, eventTab, debouncedSearch, deviceFilter, userFilter]);

  // Sliced data cho phân trang (Cắt nhỏ danh sách hiển thị, tăng tốc 60 FPS cho WebView)
  const paginatedLogs = useMemo(() => {
    const start = (logsPage - 1) * logsPageSize;
    return filteredLogs.slice(start, start + logsPageSize);
  }, [filteredLogs, logsPage, logsPageSize]);

  const paginatedCrashes = useMemo(() => {
    const start = (crashPage - 1) * crashPageSize;
    return filteredCrashes.slice(start, start + crashPageSize);
  }, [filteredCrashes, crashPage, crashPageSize]);

  const paginatedEvents = useMemo(() => {
    const start = (eventPage - 1) * eventPageSize;
    return filteredEvents.slice(start, start + eventPageSize);
  }, [filteredEvents, eventPage, eventPageSize]);

  useEffect(() => {
    if (!['logs', 'crashes', 'analytics'].includes(telemetryMode)) return undefined;
    const onKeyDown = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
        target.matches('input, textarea, select') || target.isContentEditable
      );
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        document.querySelector('.log-panel input[type="search"]')?.focus();
        return;
      }
      if (isTyping || !['j', 'k', 'Enter'].includes(event.key)) return;
      const rows = Array.from(document.querySelectorAll('.log-panel tbody tr[data-monitor-row]'));
      if (!rows.length) return;
      const current = document.activeElement?.closest?.('tr[data-monitor-row]');
      let index = Math.max(0, rows.indexOf(current));
      if (event.key === 'j') index = Math.min(rows.length - 1, current ? index + 1 : 0);
      if (event.key === 'k') index = Math.max(0, current ? index - 1 : 0);
      if (event.key === 'Enter' && current) {
        event.preventDefault();
        current.click();
        return;
      }
      event.preventDefault();
      rows[index].focus();
      rows[index].scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [telemetryMode, paginatedLogs, paginatedCrashes, paginatedEvents]);

  return (
    <div className="monitor-page">
      {/* Page Title */}
      <div className="page-heading">
        <div className="heading-copy">
          <h2>
            Giám sát Logs & Telemetry
          </h2>
          <p>
            Theo dõi thời gian thực: API Calls, Firebase Crashlytics và Firebase Analytics từ {platformScope === 'web' ? 'Web Application' : 'Mobile App di động'}.
          </p>
        </div>
      </div>

      {/* Thông báo thân thiện khi Cloudflare D1 chạm hạn mức ngày */}
      {quotaExceeded && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 171, 0, 0.12), rgba(255, 87, 87, 0.08))',
          border: '1px solid rgba(255, 171, 0, 0.35)',
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.85rem',
        }}>
          <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>⚠️</span>
          <div style={{ fontSize: '0.85rem', lineHeight: 1.55 }}>
            <strong style={{ color: '#ffb300', display: 'block', fontSize: '0.92rem', marginBottom: '0.2rem' }}>
              Tài khoản Cloudflare D1 Free Tier đã chạm hạn mức đọc trong ngày (5.000.000 rows/ngày)
            </strong>
            <span style={{ color: 'var(--text-muted)' }}>
              Đã tối ưu hoàn tất <strong>Composite Indexes</strong> và <strong>Edge Memory Cache</strong> cho database <code>flow-api</code> mới (giảm 99% tải đọc). 
              Hệ thống đã tự động tạm dừng polling để tránh gửi request thừa. Cloudflare sẽ tự động mở lại hạn mức vào <strong>00:00 UTC (07:00 sáng mai)</strong>, hoặc bạn có thể nâng cấp lên Cloudflare Workers Paid ($5/tháng) để dùng ngay lập tức với 25 tỷ rows/tháng.
            </span>
          </div>
        </div>
      )}

      {/* 24-hour System Health Summary */}
      <SystemHealthSummary
        selectedApp={selectedFilter !== 'all' ? selectedFilter : ''}
        platformScope={platformScope}
      />

      {/* Thanh điều khiển tối ưu không gian: Menu ẩn chọn chế độ, mục tiêu và bộ lọc */}
      <TelemetryControlBar
        telemetryMode={telemetryMode}
        onSelectMode={(mode) => { goMode(mode); setSearchTerm(''); }}
        modeCounts={{
          issues: unresolvedIssuesCount,
          logs: scopedLogs.length,
          crashes: scopedCrashes.length,
          fatalCrashes: fatalCrashes,
          events: scopedEvents.length,
          funnels: funnels.length,
          timelineUser: timelineUser,
        }}
        platformScope={platformScope}
        onOpenPlatformModal={openPlatformModal}
        onSelectPlatform={selectPlatform}
        selectedFilter={selectedFilter}
        onFilterChange={handleFilterChange}
        availableJobs={availableJobs}
        activeUserJob={activeUserJob}
        refreshInterval={refreshInterval}
        onRefreshIntervalChange={(val) => setRefreshInterval(Number(val))}
        onOpenTelegramModal={() => setTelegramModalOpen(true)}
        onNavigateSetup={() => navigate('/admin/setup')}
        onRefresh={() => { setLoading(true); fetchAllTelemetry(); }}
        loading={loading}
        CustomSelect={CustomSelect}
      />

      {/* Dynamic Metrics Summary Strip depending on active Mode */}
      {telemetryMode === 'logs' && (
        <section className="metrics-strip" aria-label="API telemetry summary">
          <div className="metric-item metric-lead">
            <span>Tổng số cuộc gọi</span>
            <strong>{totalCalls}</strong>
            <small>{selectedFilter === 'all' ? (platformScope === 'web' ? 'Toàn bộ Web App' : 'Toàn bộ Mobile App') : `Cho ${activeUserJob?.name}`}</small>
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
          <button type="button" className="metric-item metric-action" onClick={() => { setActiveTab('500'); setMonitorQuery({ status: '500' }); }} aria-label={`Lọc ${count500} lỗi máy chủ 5xx`}>
            <span>5xx Lỗi Server</span>
            <strong className={count500 ? 'metric-error' : ''}>{count500}</strong>
            <small>{count500 ? 'Ngoại lệ máy chủ' : 'Hệ thống ổn định'}</small>
          </button>
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
            <small>{selectedFilter === 'all' ? (platformScope === 'web' ? 'Toàn bộ Web App' : 'Toàn bộ Mobile App') : `Cho ${activeUserJob?.name}`}</small>
          </div>
          <button type="button" className="metric-item metric-action" onClick={() => { setCrashTab('fatal'); setMonitorQuery({ severity: 'fatal' }); }} aria-label={`Lọc ${fatalCrashes} crash fatal`}>
            <span>{platformScope === 'web' ? 'Fatal Errors (Sập trang/Runtime)' : 'Fatal Crashes (Sập App)'}</span>
            <strong style={{ color: fatalCrashes > 0 ? '#ff7785' : 'var(--success)' }}>
              {fatalCrashes}
            </strong>
            <small>{fatalCrashes > 0 ? 'Cần xử lý khẩn cấp' : 'Không có crash fatal'}</small>
          </button>
          <div className="metric-item">
            <span>Non-Fatal (Ngoại lệ)</span>
            <strong style={{ color: nonFatalCrashes > 0 ? 'var(--warning)' : 'inherit' }}>
              {nonFatalCrashes}
            </strong>
            <small>{nonFatalCrashes > 0 ? 'Ngoại lệ đã bắt try/catch' : 'Hoàn hảo'}</small>
          </div>
          <div className="metric-item">
            <span>🤖 Android</span>
            <strong style={{ color: androidCrashes > 0 ? '#4ade80' : 'inherit' }}>
              {androidCrashes}
            </strong>
            <small>{androidCrashes > 0 ? 'Sự cố trên Android' : '0 sự cố'}</small>
          </div>
          <div className="metric-item">
            <span>🍎 iOS</span>
            <strong style={{ color: iosCrashes > 0 ? '#38bdf8' : 'inherit' }}>
              {iosCrashes}
            </strong>
            <small>{iosCrashes > 0 ? 'Sự cố trên iOS' : '0 sự cố'}</small>
          </div>
          <div className="metric-item">
            <span>{platformScope === 'web' ? 'Trạng thái Web App' : 'Trạng thái App'}</span>
            <strong className={fatalCrashes === 0 ? 'metric-success' : 'metric-error'}>
              {fatalCrashes === 0 ? '100% Ổn định' : 'Có lỗi nghiêm trọng'}
            </strong>
            <small>Độ tin cậy ứng dụng</small>
          </div>
          <div className="metric-item">
            <span>{platformScope === 'web' ? 'Số Trình duyệt ảnh hưởng' : 'Số Thiết bị ảnh hưởng'}</span>
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
            <small>{selectedFilter === 'all' ? (platformScope === 'web' ? 'Toàn bộ Web App' : 'Toàn bộ Mobile App') : `Cho ${activeUserJob?.name}`}</small>
          </div>
          <div className="metric-item">
            <span>{platformScope === 'web' ? 'Lượt xem trang (Page Views)' : 'Lượt xem màn hình (Screens)'}</span>
            <strong style={{ color: '#61e5bd' }}>{screenViewCount}</strong>
            <small>{platformScope === 'web' ? 'Chuyển route & page' : 'Chuyển trang & màn hình'}</small>
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

      {telemetryMode === 'funnels' && funnelStats && funnelStats.totals.attempts > 0 && (
        <section className="metrics-strip" aria-label="Tổng quan thống kê sự kiện">
          <div className="metric-item metric-lead">
            <span>Tổng lượt thử</span>
            <strong>{funnelStats.totals.attempts}</strong>
            <small>
              {funnelStats.range.day_from === funnelStats.range.day_to
                ? funnelStats.range.day_from
                : `${funnelStats.range.day_from} → ${funnelStats.range.day_to}`}
            </small>
          </div>
          <div className="metric-item">
            <span>Hoàn tất</span>
            <strong className="metric-success">
              {funnelStats.rates.completion}<em>%</em>
            </strong>
            <small>
              {funnelStats.totals.completed}/{funnelStats.totals.attempts} lượt thử
              {funnelStats.totals.open > 0 ? ` · ${funnelStats.totals.open} đang dở` : ''}
            </small>
          </div>
          <div className="metric-item">
            <span>Thành công</span>
            <strong>{funnelStats.rates.success}<em>%</em></strong>
            <small>{funnelStats.totals.succeeded}/{funnelStats.totals.attempts} lượt thử</small>
          </div>
          <div className="metric-item">
            <span>Tự động (không cần người duyệt)</span>
            <strong style={{ color: 'var(--success)' }}>
              {funnelStats.rates.auto}<em>%</em>
            </strong>
            <small>trên {funnelStats.totals.succeeded} lượt thành công</small>
          </div>
          <div className="metric-item">
            <span>Thất bại</span>
            <strong className={funnelStats.rates.failure > 0 ? 'metric-error' : ''}>
              {funnelStats.rates.failure}<em>%</em>
            </strong>
            <small>
              {funnelStats.rates.failure > 0 ? 'Có bước lỗi trước khi rời luồng' : 'Không có lượt lỗi'}
            </small>
          </div>
        </section>
      )}

      {/* MODAL DIALOG: CẤU HÌNH SDK TELEMETRY */}
      {false && integrationOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIntegrationOpen(false)}
          style={{ zIndex: 1100 }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(920px, 95%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-header">
              <div className="modal-header-info">
                <span className="platform-tag" style={{ display: 'inline-block', marginBottom: '0.25rem' }}>
                  {platformScope === 'web' ? '🌐 Web & Angular SDK' : '📱 Flutter Mobile SDK'}
                </span>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                  Cấu hình SDK & Kết nối Telemetry
                </h2>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  App ID: <code style={{ color: 'var(--accent)' }}>{currentAppId}</code> · Endpoint: <code>{API_MONITOR_URL}</code>
                </p>
              </div>
              <div className="modal-header-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => copyToClipboard(API_MONITOR_URL, 'url')}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                >
                  {copiedItem === 'url' ? '✓ Đã chép' : '📋 Copy URL Server'}
                </button>
                <button
                  type="button"
                  className="close-btn"
                  onClick={() => setIntegrationOpen(false)}
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto', padding: '1.25rem', flex: 1 }}>
              <div className="integration-content" style={{ margin: 0 }}>
                <nav className="setup-tabs">
                  <button
                    type="button"
                    className={setupTab === 'angular' ? 'active' : ''}
                    onClick={() => setSetupTab('angular')}
                  >
                    <span>{platformScope === 'web' ? '01' : '05'}</span>
                    <strong>Angular Telemetry</strong>
                    <small>HttpInterceptor & Errors</small>
                  </button>
                  <button
                    type="button"
                    className={setupTab === 'axios' ? 'active' : ''}
                    onClick={() => setSetupTab('axios')}
                  >
                    <span>{platformScope === 'web' ? '02' : '06'}</span>
                    <strong>Web Axios</strong>
                    <small>setupAxiosMonitor</small>
                  </button>
                  <button
                    type="button"
                    className={setupTab === 'fetch' ? 'active' : ''}
                    onClick={() => setSetupTab('fetch')}
                  >
                    <span>{platformScope === 'web' ? '03' : '07'}</span>
                    <strong>Web Fetch</strong>
                    <small>createMonitoredFetch</small>
                  </button>
                  <button
                    type="button"
                    className={setupTab === 'crashlytics' ? 'active' : ''}
                    onClick={() => setSetupTab('crashlytics')}
                  >
                    <span>{platformScope === 'web' ? '04' : '01'}</span>
                    <strong>Flutter Crashlytics</strong>
                    <small>Bắt Fatal & Non-fatal</small>
                  </button>
                  <button
                    type="button"
                    className={setupTab === 'analytics' ? 'active' : ''}
                    onClick={() => setSetupTab('analytics')}
                  >
                    <span>{platformScope === 'web' ? '05' : '02'}</span>
                    <strong>Flutter Analytics</strong>
                    <small>Events & Screen Views</small>
                  </button>
                  <button
                    type="button"
                    className={setupTab === 'client' ? 'active' : ''}
                    onClick={() => setSetupTab('client')}
                  >
                    <span>{platformScope === 'web' ? '06' : '03'}</span>
                    <strong>Flutter HTTP</strong>
                    <small>LoggingClient</small>
                  </button>
                  <button
                    type="button"
                    className={setupTab === 'dio' ? 'active' : ''}
                    onClick={() => setSetupTab('dio')}
                  >
                    <span>{platformScope === 'web' ? '07' : '04'}</span>
                    <strong>Flutter Dio</strong>
                    <small>ApiLogger.record()</small>
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

                  {setupTab === 'angular' && (
                    <div className="setup-pane">
                      <div className="pane-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.85rem' }}>
                        <div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.55rem', borderRadius: '12px', background: 'rgba(221, 0, 49, 0.12)', border: '1px solid rgba(221, 0, 49, 0.3)', marginBottom: '0.35rem', color: '#ff6b81', fontSize: '0.74rem', fontWeight: 600 }}>
                            <span>🅰️</span> Angular SDK (Standalone & NgModule)
                          </div>
                          <h3 style={{ margin: '0.2rem 0' }}>Tích hợp Angular HttpInterceptor & ErrorHandler</h3>
                          <p>Tự động ghi nhận mã lỗi 4xx/5xx, độ trễ và ngoại lệ JavaScript runtime gửi về Dashboard:</p>
                        </div>
                        <a
                          href="/angular/api-logger.service.ts"
                          download="api-logger.service.ts"
                          className="secondary-btn"
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                        >
                          <span>📥</span> Tải file api-logger.service.ts
                        </a>
                      </div>

                      <CodeBlock
                        label="Angular Configuration (app.config.ts / Standalone)"
                        value={angularSnippet}
                        copyKey="angular"
                        copiedItem={copiedItem}
                        onCopy={copyToClipboard}
                      />

                      <div style={{ marginTop: '1.15rem', padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(34, 211, 238, 0.07)', border: '1px solid rgba(34, 211, 238, 0.25)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        <strong style={{ color: '#67e8f9' }}>💡 Hướng dẫn chi tiết:</strong> Xem tài liệu <code style={{ color: '#fff' }}>HUONG_DAN_ANGULAR_APILOG.md</code> tại thư mục gốc của project để xem prompt copy gửi cho AI dev Angular và hướng dẫn chi tiết cho cả Angular NgModule cũ.
                      </div>
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
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.25rem', borderTop: '1px solid var(--line)', background: 'var(--surface-muted)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                💡 Tip: Sao chép đoạn code tương ứng và dán trực tiếp vào dự án của bạn
              </span>
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => copyToClipboard(API_MONITOR_URL, 'url')}
                >
                  {copiedItem === 'url' ? '✓ Đã sao chép' : '📋 Copy URL Server'}
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => setIntegrationOpen(false)}
                >
                  Đóng dialog
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE 1: LOGS PANEL */}
      {telemetryMode === 'logs' && (
        <ApiLogsPanel
          logs={logs}
          filteredLogs={filteredLogs}
          paginatedLogs={paginatedLogs}
          loading={loading}
          totalCalls={totalCalls}
          count200={count200}
          count400={count400}
          count500={count500}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setMonitorQuery={setMonitorQuery}
          deviceFilter={deviceFilter}
          handleDeviceChange={handleDeviceChange}
          uniqueDevices={uniqueDevices}
          userFilter={userFilter}
          handleUserChange={handleUserChange}
          uniqueUsers={uniqueUsers}
          platformScope={platformScope}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          logsPage={logsPage}
          setLogsPage={setLogsPage}
          logsPageSize={logsPageSize}
          setLogsPageSize={setLogsPageSize}
          onOpenDetail={openDetail}
          viewUserTimeline={viewUserTimeline}
        />
      )}

      {/* MODE 2: CRASHLYTICS PANEL */}
      {telemetryMode === 'crashes' && (
        <CrashlyticsPanel
          crashes={crashes}
          filteredCrashes={filteredCrashes}
          paginatedCrashes={paginatedCrashes}
          loading={loading}
          totalCrashes={totalCrashes}
          androidCrashes={androidCrashes}
          iosCrashes={iosCrashes}
          fatalCrashes={fatalCrashes}
          nonFatalCrashes={nonFatalCrashes}
          crashTab={crashTab}
          setCrashTab={setCrashTab}
          setMonitorQuery={setMonitorQuery}
          deviceFilter={deviceFilter}
          handleDeviceChange={handleDeviceChange}
          uniqueDevices={uniqueDevices}
          userFilter={userFilter}
          handleUserChange={handleUserChange}
          uniqueUsers={uniqueUsers}
          platformScope={platformScope}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          crashPage={crashPage}
          setCrashPage={setCrashPage}
          crashPageSize={crashPageSize}
          setCrashPageSize={setCrashPageSize}
          onOpenDetail={openDetail}
          viewUserTimeline={viewUserTimeline}
        />
      )}

      {/* MODE 3: ANALYTICS PANEL */}
      {telemetryMode === 'analytics' && (
        <EventsPanel
          events={events}
          filteredEvents={filteredEvents}
          paginatedEvents={paginatedEvents}
          loading={loading}
          totalEvents={totalEvents}
          customEventCount={customEventCount}
          screenViewCount={screenViewCount}
          eventTab={eventTab}
          setEventTab={setEventTab}
          setMonitorQuery={setMonitorQuery}
          deviceFilter={deviceFilter}
          handleDeviceChange={handleDeviceChange}
          uniqueDevices={uniqueDevices}
          userFilter={userFilter}
          handleUserChange={handleUserChange}
          uniqueUsers={uniqueUsers}
          platformScope={platformScope}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          eventPage={eventPage}
          setEventPage={setEventPage}
          eventPageSize={eventPageSize}
          setEventPageSize={setEventPageSize}
          onOpenDetail={openDetail}
          viewUserTimeline={viewUserTimeline}
        />
      )}

      {/* MODE 4: FUNNELS PANEL */}
      {telemetryMode === 'funnels' && (
        <EventFunnelsPanel
          funnelStats={funnelStats}
          statsLoading={statsLoading}
          statsError={statsError}
          activeFunnel={activeFunnel}
          setActiveFunnel={setActiveFunnel}
          funnels={funnels}
          statsRange={statsRange}
          setStatsRange={setStatsRange}
          openFunnelSetup={openFunnelSetup}
        />
      )}

      {/* 5. User Journey Timeline Panel */}
      {telemetryMode === 'timeline' && (
        <section className="log-panel" style={{ background: 'none', border: 'none', padding: 0 }}>
          <UserJourneyTimeline
            initialUser={timelineUser}
            initialDevice={timelineDevice}
            initialApp={timelineApp || (selectedFilter !== 'all' ? selectedFilter : '')}
            availableUsers={uniqueUsers}
            availableDevices={uniqueDevices}
            onOpenDetail={openDetail}
          />
        </section>
      )}

      {/* 6. Issues APM Management Panel */}
      {telemetryMode === 'issues' && (
        <IssueManagementPanel
          selectedApp={selectedFilter !== 'all' ? selectedFilter : ''}
          activeUserJob={activeUserJob}
          onViewUserTimeline={viewUserTimeline}
        />
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
                    Thiết bị & Người dùng
                  </span>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-end' }}>
                    <div>
                      <span>📱 {selectedLog.device_name || (selectedLog.job_type === 'web' ? 'Trình duyệt Web' : 'Thiết bị di động')}</span>{' '}
                      {selectedLog.app_identifier ? `(<code>${selectedLog.app_identifier}</code>)` : ''}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      {selectedLog.user_name ? <span>👤 {selectedLog.user_name} · </span> : ''}
                      {selectedLog.ip_address ? <span>🌐 IP: <code>{selectedLog.ip_address}</code></span> : ''}
                    </div>
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
                  <span className="meta-label">Địa chỉ IP máy</span>
                  <strong className="meta-value">{selectedLog.ip_address || 'Không xác định'}</strong>
                </div>
                <div>
                  <span className="meta-label">Người dùng (User)</span>
                  <strong className="meta-value">{selectedLog.user_name || 'Khách / Ẩn danh'}</strong>
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
                  <span className="meta-label">Hệ điều hành</span>
                  <strong className="meta-value" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span className={getCrashPlatform(selectedCrash).badgeClass} style={{ fontSize: '0.78rem' }}>
                      {getCrashPlatform(selectedCrash).label}
                    </span>
                  </strong>
                </div>
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
      {/* Cấu hình luồng sự kiện cần thống kê */}
      {funnelSetupOpen && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setFunnelSetupOpen(false);
          }}
        >
          <div className="modal-content" style={{ width: 'min(640px, 100%)' }}>
            <div className="modal-header">
              <div className="modal-header-info">
                <span>Thống kê sự kiện</span>
                <h2>{funnelDraft.isEdit ? 'Sửa luồng sự kiện' : 'Thêm luồng sự kiện mới'}</h2>
              </div>
              <div className="modal-header-actions">
                <button type="button" className="close-btn" onClick={() => setFunnelSetupOpen(false)}>
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-body funnel-setup">
              <p className="funnel-setup-hint">
                Chỉ cần tiền tố sự kiện. Hệ thống sẽ tự dò sự kiện bắt đầu, kết thúc, và các bước
                thành công / thất bại từ dữ liệu có thật trong kho, rồi tính % giúp bạn.
              </p>

              <label className="funnel-field">
                <span>Mã luồng (không dấu, không khoảng trắng)</span>
                <input
                  type="text"
                  value={funnelDraft.funnel_key}
                  disabled={funnelDraft.isEdit}
                  placeholder="ekyb"
                  onChange={(event) =>
                    setFunnelDraft((draft) => ({ ...draft, funnel_key: event.target.value }))
                  }
                />
              </label>

              <label className="funnel-field">
                <span>Tên hiển thị</span>
                <input
                  type="text"
                  value={funnelDraft.name}
                  placeholder="Định danh doanh nghiệp (eKYB)"
                  onChange={(event) =>
                    setFunnelDraft((draft) => ({ ...draft, name: event.target.value }))
                  }
                />
              </label>

              <label className="funnel-field">
                <span>Tiền tố sự kiện</span>
                <input
                  type="text"
                  value={funnelDraft.event_prefix}
                  placeholder="ekyb_"
                  onChange={(event) =>
                    setFunnelDraft((draft) => ({ ...draft, event_prefix: event.target.value }))
                  }
                />
              </label>

              {eventCatalog.suggestions?.length > 0 && (
                <div className="funnel-suggestions">
                  <span>Tiền tố đang có dữ liệu:</span>
                  <div>
                    {eventCatalog.suggestions.map((item) => (
                      <button
                        key={item.prefix}
                        type="button"
                        className="chip-btn"
                        onClick={() =>
                          setFunnelDraft((draft) => ({
                            ...draft,
                            event_prefix: item.prefix,
                            funnel_key: draft.funnel_key || item.prefix.replace(/_+$/, ''),
                            name: draft.name || item.prefix.replace(/_+$/, ''),
                          }))
                        }
                      >
                        {item.prefix} <em>{item.events}</em>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {funnelDraft.event_prefix && eventCatalog.events?.length > 0 && (
                <div className="funnel-preview">
                  <span>Sự kiện sẽ được gom vào luồng này:</span>
                  <div>
                    {eventCatalog.events
                      .filter((item) => item.event_name.startsWith(funnelDraft.event_prefix))
                      .slice(0, 12)
                      .map((item) => (
                        <code key={item.event_name}>
                          {item.event_name} <em>{item.total}</em>
                        </code>
                      ))}
                    {eventCatalog.events.filter((item) =>
                      item.event_name.startsWith(funnelDraft.event_prefix)
                    ).length === 0 && (
                      <span className="funnel-preview-empty">
                        Chưa có sự kiện nào khớp tiền tố này trong kho dữ liệu.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {funnelDraft.isEdit && (
                <button
                  type="button"
                  className="view-btn"
                  style={{ color: 'var(--danger)', marginRight: 'auto' }}
                  onClick={() => deleteFunnel(funnelDraft.funnel_key)}
                >
                  Xoá luồng
                </button>
              )}
              <button type="button" className="secondary-btn" onClick={() => setFunnelSetupOpen(false)}>
                Huỷ
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={savingFunnel || !funnelDraft.funnel_key.trim() || !funnelDraft.name.trim()}
                onClick={saveFunnel}
              >
                {savingFunnel ? 'Đang lưu…' : 'Lưu & xem thống kê'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TELEGRAM ALERT SETTINGS */}
      <TelegramSettingsModal
        isOpen={telegramModalOpen}
        onClose={() => setTelegramModalOpen(false)}
      />

    </div>
  );
}

export default Dashboard;
