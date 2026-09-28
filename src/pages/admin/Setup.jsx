import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';

const WEB_STEPS = [
  {
    tag: 'Angular 15+',
    title: 'Angular HTTP Interceptor',
    detail: 'Gắn apiLoggerInterceptor vào provideHttpClient để tự động ghi nhận request, response, độ trễ và lỗi mạng tập trung.',
    code: "provideHttpClient(withInterceptors([apiLoggerInterceptor]))",
  },
  {
    tag: 'Axios / React / Vue',
    title: 'Axios Instance Monitor',
    detail: 'Khởi tạo monitor một lần ngay sau khi tạo Axios instance chung của ứng dụng.',
    code: "setupAxiosMonitor(axios, 'vn.myportal.web');",
  },
  {
    tag: 'Fetch API',
    title: 'Monitored Fetch Wrapper',
    detail: 'Dùng monitoredFetch thay cho window.fetch mặc định tại tầng gọi API của ứng dụng.',
    code: "const monitoredFetch = createMonitoredFetch('vn.myportal.web');",
  },
];

const APP_STEPS = [
  {
    tag: 'Flutter Crashlytics',
    title: 'AppTelemetry Crash & Error Logger',
    detail: 'Khởi tạo telemetry trước runApp() và gắn FlutterError.onError để tự động báo cáo unhandled exceptions.',
    code: "await AppTelemetry.initialize(appId: 'vn.fizahub.app');",
  },
  {
    tag: 'Dio HTTP Client',
    title: 'Dio Interceptor',
    detail: 'Gắn ApiLoggerInterceptor vào danh sách interceptors của Dio instance dùng chung.',
    code: "dio.interceptors.add(ApiLoggerInterceptor(appId: 'vn.fizahub.app'));",
  },
  {
    tag: 'Dart HTTP Package',
    title: 'LoggingClient Wrapper',
    detail: 'Bọc package http chuẩn bằng LoggingClient để theo dõi tự động toàn bộ API requests.',
    code: "final client = LoggingClient(http.Client(), appId: 'vn.fizahub.app');",
  },
];

export default function Setup() {
  const { platformScope, setPlatformScope } = usePlatform();
  const [activeTab, setActiveTab] = useState(platformScope || 'app');
  const [copied, setCopied] = useState('');

  const steps = useMemo(() => (activeTab === 'web' ? WEB_STEPS : APP_STEPS), [activeTab]);

  const copy = async (value, title) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(title);
      window.setTimeout(() => setCopied(''), 1600);
    } catch (_) {}
  };

  return (
    <div className="setup-page">
      {/* Header */}
      <header className="page-heading">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
            <h2>Cài đặt & Tích hợp SDK Telemetry</h2>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.18rem 0.55rem',
                borderRadius: '999px',
                background: activeTab === 'web' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                color: activeTab === 'web' ? '#38bdf8' : '#c084fc',
                border: `1px solid ${activeTab === 'web' ? 'rgba(6, 182, 212, 0.35)' : 'rgba(168, 85, 247, 0.35)'}`,
              }}
            >
              {activeTab === 'web' ? '🌐 Web SDK' : '📱 Mobile Flutter SDK'}
            </span>
          </div>
          <p>
            Chọn nền tảng và bộ adapter tương ứng để tích hợp ghi nhận API Logs, Crashlytics và Events lên Cloudflare Telemetry Hub.
          </p>
        </div>

        {/* Platform Selector Switcher */}
        <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--surface-muted)', padding: '3px', borderRadius: '10px', border: '1px solid var(--line)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('app')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '7px',
              border: 'none',
              background: activeTab === 'app' ? 'var(--surface-raised)' : 'transparent',
              color: activeTab === 'app' ? '#c084fc' : 'var(--text-muted)',
              fontWeight: 650,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: activeTab === 'app' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            }}
          >
            <span>📱</span> Mobile App (Flutter)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('web')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '7px',
              border: 'none',
              background: activeTab === 'web' ? 'var(--surface-raised)' : 'transparent',
              color: activeTab === 'web' ? '#38bdf8' : 'var(--text-muted)',
              fontWeight: 650,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: activeTab === 'web' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            }}
          >
            <span>🌐</span> Web App (Angular/React)
          </button>
        </div>
      </header>

      {/* Guide Cards */}
      <div className="setup-guide-list">
        {steps.map((step, index) => {
          const isCopied = copied === step.title;
          return (
            <section className="setup-guide" key={step.title}>
              <div className="setup-guide-index">{index + 1}</div>

              <div className="setup-guide-copy">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <h2>{step.title}</h2>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      background: 'var(--surface-raised)',
                      color: 'var(--text-dim)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    {step.tag}
                  </span>
                </div>
                <p>{step.detail}</p>
                <pre>
                  <code>{step.code}</code>
                </pre>
              </div>

              <button
                type="button"
                className={`secondary-btn ${isCopied ? 'btn-copied' : ''}`}
                onClick={() => copy(step.code, step.title)}
                style={{
                  alignSelf: 'center',
                  minWidth: '100px',
                  background: isCopied ? 'rgba(16, 185, 129, 0.15)' : undefined,
                  borderColor: isCopied ? 'rgba(16, 185, 129, 0.4)' : undefined,
                  color: isCopied ? '#34d399' : undefined,
                }}
              >
                {isCopied ? '✓ Đã chép' : 'Sao chép'}
              </button>
            </section>
          );
        })}
      </div>

      {/* Verification Notice */}
      <div
        className="state-block"
        style={{
          marginTop: '1.5rem',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          background: 'rgba(99, 102, 241, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '1.3rem' }}>💡</span>
          <div>
            <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '0.15rem' }}>
              Kiểm tra luồng Telemetry thời gian thực
            </strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Sau khi tích hợp SDK vào dự án, hãy kích hoạt 1 cuộc gọi API hoặc gửi test crash, sau đó mở màn hình Giám sát để xác nhận dữ liệu đã được ghi nhận.
            </span>
          </div>
        </div>

        <Link
          to="/admin/monitor/logs"
          className="primary-btn"
          style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '0.55rem 0.95rem' }}
        >
          Mở Giám sát Logs →
        </Link>
      </div>
    </div>
  );
}
