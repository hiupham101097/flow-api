import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';

const WEB_STEPS = [
  {
    tag: 'Angular 15+ (Standalone & Module)',
    title: 'Angular HTTP Interceptor & Global Telemetry',
    detail: 'Khởi tạo Telemetry trong app.config.ts và gắn apiLoggerInterceptor vào provideHttpClient để tự động gom nhóm batch log và che giấu PII.',
    code: `// app.config.ts
import { ApplicationConfig, provideHttpClient, withInterceptors } from '@angular/core';
import { apiLoggerInterceptor, ApiLoggerService } from './services/api-logger.service';

// Khởi tạo telemetry cấu hình
ApiLoggerService.initialize({
  appId: 'vn.myportal.web',
  serverUrl: 'https://flow-api.hieupham101097.workers.dev',
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([apiLoggerInterceptor])),
  ],
};`,
  },
  {
    tag: 'Axios / React / Vue / Next.js',
    title: 'Axios Instance Batch Monitor',
    detail: 'Gắn interceptor vào Axios instance dùng chung để tự động đo lường thời gian thực thi (latency) và ghi nhận toàn bộ mã lỗi HTTP.',
    code: `// api-client.js
import axios from 'axios';

export const apiClient = axios.create({ baseURL: 'https://api.yourdomain.com' });

apiClient.interceptors.request.use((config) => {
  config.metadata = { startTime: performance.now() };
  return config;
});

apiClient.interceptors.response.use(
  (res) => {
    const duration = Math.round(performance.now() - (res.config.metadata?.startTime || 0));
    fetch('https://flow-api.hieupham101097.workers.dev/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: 'vn.myportal.web',
        endpoint: res.config.url,
        method: res.config.method?.toUpperCase(),
        status_code: res.status,
        duration_ms: duration,
      }),
      keepalive: true,
    }).catch(() => {});
    return res;
  },
  (err) => {
    const duration = Math.round(performance.now() - (err.config?.metadata?.startTime || 0));
    fetch('https://flow-api.hieupham101097.workers.dev/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: 'vn.myportal.web',
        endpoint: err.config?.url || 'unknown',
        method: err.config?.method?.toUpperCase() || 'GET',
        status_code: err.response?.status || 500,
        error_message: err.message,
        duration_ms: duration,
      }),
      keepalive: true,
    }).catch(() => {});
    return Promise.reject(err);
  }
);`,
  },
  {
    tag: 'Fetch API / Vanilla JS',
    title: 'Monitored Fetch Wrapper',
    detail: 'Bọc hàm window.fetch mặc định để tự động đo đạc độ trễ và theo dõi log mạng không đồng bộ.',
    code: `// monitored-fetch.js
export async function monitoredFetch(url, options = {}) {
  const start = performance.now();
  try {
    const res = await window.fetch(url, options);
    const duration = Math.round(performance.now() - start);
    window.fetch('https://flow-api.hieupham101097.workers.dev/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: 'vn.myportal.web',
        endpoint: String(url),
        method: (options.method || 'GET').toUpperCase(),
        status_code: res.status,
        duration_ms: duration,
      }),
      keepalive: true,
    }).catch(() => {});
    return res;
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    window.fetch('https://flow-api.hieupham101097.workers.dev/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: 'vn.myportal.web',
        endpoint: String(url),
        method: (options.method || 'GET').toUpperCase(),
        status_code: 500,
        error_message: err.message,
        duration_ms: duration,
      }),
      keepalive: true,
    }).catch(() => {});
    throw err;
  }
}`,
  },
];

const APP_STEPS = [
  {
    tag: 'Flutter Crashlytics & Error Handler',
    title: 'AppTelemetry Initialization & Crash Logger',
    detail: 'Khởi tạo AppTelemetry trong main() và gắn FlutterError.onError để bắt và gửi unhandled exceptions kèm full stack trace.',
    code: `// main.dart
import 'package:flutter/material.dart';
import 'package:your_app/utils/api_logger.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppTelemetry.initialize(
    appId: 'vn.fizahub.app',
    userName: 'nguyen_van_a', // Cập nhật sau khi đăng nhập
  );

  // Bắt toàn bộ lỗi runtime chưa được try-catch
  FlutterError.onError = (details) {
    AppTelemetry.recordCrash(
      exception: details.exception,
      stack: details.stack,
      isFatal: true,
    );
  };

  runApp(const MyApp());
}`,
  },
  {
    tag: 'Dio HTTP Client (Recommended)',
    title: 'Dio Interceptor với Tự Động Gom Nhóm Batch',
    detail: 'Gắn Interceptor vào Dio client dùng chung để tự động đẩy logs vào hàng đợi batch và flush lên server.',
    code: `// dio_client.dart
import 'package:dio/dio.dart';
import 'package:your_app/utils/api_logger.dart';

final dio = Dio();

dio.interceptors.add(InterceptorsWrapper(
  onRequest: (options, handler) {
    options.extra['startTime'] = DateTime.now();
    return handler.next(options);
  },
  onResponse: (response, handler) {
    final start = response.requestOptions.extra['startTime'] as DateTime?;
    final duration = start != null ? DateTime.now().difference(start).inMilliseconds : 0;
    ApiLogger.record(
      appId: 'vn.fizahub.app',
      endpoint: response.requestOptions.uri.toString(),
      method: response.requestOptions.method,
      statusCode: response.statusCode ?? 200,
      requestPayload: response.requestOptions.data,
      responsePayload: response.data,
      durationMs: duration,
    );
    return handler.next(response);
  },
  onError: (DioException err, handler) {
    final start = err.requestOptions.extra['startTime'] as DateTime?;
    final duration = start != null ? DateTime.now().difference(start).inMilliseconds : 0;
    ApiLogger.record(
      appId: 'vn.fizahub.app',
      endpoint: err.requestOptions.uri.toString(),
      method: err.requestOptions.method,
      statusCode: err.response?.statusCode ?? 500,
      errorMessage: err.message ?? err.error?.toString(),
      requestPayload: err.requestOptions.data,
      responsePayload: err.response?.data,
      durationMs: duration,
    );
    return handler.next(err);
  },
));`,
  },
  {
    tag: 'Dart Standard HTTP Package',
    title: 'LoggingClient Wrapper cho package:http',
    detail: 'Bọc http.Client() bằng LoggingClient có sẵn trong SDK để theo dõi tự động toàn bộ API requests.',
    code: `// http_service.dart
import 'package:http/http.dart' as http;
import 'package:your_app/utils/api_logger.dart';

// Bọc client chuẩn
final client = LoggingClient(
  http.Client(),
  appId: 'vn.fizahub.app',
);

// Mọi request qua client này đều tự động log về Cloudflare
final response = await client.get(Uri.parse('https://api.yourdomain.com/items'));`,
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

      {/* SDK Download Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(6, 182, 212, 0.08))',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: 'var(--radius)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '1.2rem' }}>📦</span>
            <strong style={{ fontSize: '0.98rem', color: 'var(--text)' }}>
              {activeTab === 'web' ? 'Tệp SDK hoàn chỉnh: api-logger.service.ts' : 'Tệp SDK hoàn chỉnh: api_logger.dart'}
            </strong>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 650 }}>
              Real-time Direct + PII Redaction
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            {activeTab === 'web'
              ? 'Gửi trực tiếp theo thời gian thực lên API, không lưu cache/đệm trễ, tự động lọc che giấu Password & Bearer Token, hỗ trợ Angular 15+ & Standalone.'
              : 'Gửi trực tiếp theo thời gian thực lên API Cloudflare, không lưu cache/đệm trễ, tự động lọc che giấu PII nhạy cảm và báo cáo Fatal Crash tức thì.'}
          </p>
        </div>

        <a
          href={activeTab === 'web' ? '/angular/api-logger.service.ts' : '/flutter/api_logger.dart'}
          download={activeTab === 'web' ? 'api-logger.service.ts' : 'api_logger.dart'}
          className="primary-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            textDecoration: 'none',
            fontSize: '0.84rem',
            padding: '0.6rem 1.1rem',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <span>⬇️</span> Tải file SDK ({activeTab === 'web' ? 'TypeScript' : 'Dart'})
        </a>
      </div>

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
