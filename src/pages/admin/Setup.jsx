import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';

const WEB_STEPS = [
  {
    tag: 'Angular 15+ (Standalone & Module)',
    title: 'Angular HTTP Interceptor & Global Telemetry',
    detail: 'Gắn HTTP interceptor và GlobalErrorHandler để ghi latency, mã lỗi, request ID, lỗi runtime và stack trace. Chỉ gắn user sau khi đăng nhập thành công.',
    code: `// app.config.ts
import { ApplicationConfig, ErrorHandler, provideHttpClient, withInterceptors } from '@angular/core';
import { apiLoggerInterceptor, ApiLoggerService, GlobalErrorHandler } from './services/api-logger.service';

// Dùng đúng app_identifier đã khai báo trong cấu hình ứng dụng
ApiLoggerService.initialize({
  appId: 'vn.myportal.web',
  serverUrl: 'https://flow-api.hieupham101097.workers.dev',
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([apiLoggerInterceptor])),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};

// Sau khi đăng nhập thành công:
// ApiLoggerService.setUserName(user.id || user.username);`,
  },
  {
    tag: 'Axios / React / Vue / Next.js',
    title: 'Axios Instance Monitor (Timeout, HTTP 500 & Request ID)',
    detail: 'Dùng helper SDK trên Axios instance dùng chung. SDK ghi thời gian, status, error type/code, request ID và server request ID; truyền user ID nội bộ sau đăng nhập để ghép breadcrumbs.',
    code: `// api-client.js
import axios from 'axios';
import { setupAxiosMonitor } from './utils/api-logger';

export const apiClient = axios.create({ baseURL: 'https://api.yourdomain.com' });

setupAxiosMonitor(apiClient, 'vn.myportal.web', () => ({
  // Trả về ID nội bộ, không dùng email/số điện thoại nếu không cần thiết
  userName: authStore.user?.id,
  deviceName: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : 'Web server',
}));

// SDK phân biệt timeout/mất mạng với HTTP 5xx và không tự gán status 500
// khi request không nhận được response.`,
  },
  {
    tag: 'Fetch API / Vanilla JS',
    title: 'Fetch Wrapper (Timeout, Mất mạng & HTTP 5xx)',
    detail: 'Dùng wrapper cho các request Fetch để ghi duration, status, loại lỗi, mã lỗi và request ID. Lỗi không có HTTP response được ghi status 0 thay vì giả thành 500.',
    code: `// monitored-fetch.js
import { createMonitoredFetch } from './utils/api-logger';

export const monitoredFetch = createMonitoredFetch(
  'vn.myportal.web',
  () => ({ userName: authStore.user?.id })
);

const response = await monitoredFetch('/v1/profile');`,
  },
  {
    tag: 'React / Vue / Next.js Runtime Errors',
    title: 'Bắt lỗi JavaScript chưa xử lý và gửi stack trace',
    detail: 'Đăng ký global handlers một lần lúc khởi động Web App để ghi nhận lỗi runtime và Promise rejection. Với lỗi đã bắt bằng try/catch, chủ động gửi non-fatal cùng màn hình và stack trace.',
    code: `// telemetry-errors.js
const APP_IDENTIFIER = 'vn.myportal.web'; // Trùng app_identifier đã đăng ký
const MONITOR_URL = 'https://flow-api.hieupham101097.workers.dev';

function reportRuntimeError(error, source) {
  const exception = error instanceof Error ? error : new Error(String(error));
  fetch(MONITOR_URL + '/crashes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      app_identifier: APP_IDENTIFIER,
      error_message: exception.message,
      stack_trace: exception.stack,
      is_fatal: false,
      device_info: { platform: navigator.platform, device_name: navigator.userAgent.slice(0, 120) },
      custom_attributes: {
        source,
        screen_name: location.pathname, // Không gửi query string có thể chứa dữ liệu nhạy cảm
        user_id: authStore.user?.id || null,
      },
    }),
  }).catch(() => {});
}

window.addEventListener('error', (event) => reportRuntimeError(event.error || event.message, 'window.error'));
window.addEventListener('unhandledrejection', (event) => reportRuntimeError(event.reason, 'unhandledrejection'));

// Với lỗi nghiệp vụ đã bắt: reportRuntimeError(error, 'checkout');`,
  },
];

const APP_STEPS = [
  {
    tag: 'Flutter Crashlytics & Error Handler',
    title: 'AppTelemetry Initialization & Crash Logger',
    detail: 'Gắn cả FlutterError.onError và PlatformDispatcher.onError để thu thập lỗi framework/lỗi bất đồng bộ với stack trace. Sau đăng nhập, cập nhật ID người dùng nội bộ để ghép log.',
    code: `// main.dart
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:your_app/utils/api_logger.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppTelemetry.initialize(
    appId: 'vn.fizahub.app',
  );

  // Bắt toàn bộ lỗi runtime chưa được try-catch
  FlutterError.onError = (details) {
    AppTelemetry.recordCrash(
      exception: details.exception,
      stack: details.stack,
      isFatal: true,
      customAttributes: {
        'user_id': AppTelemetry.userName,
        'screen_name': 'CurrentScreen',
      },
    );
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    AppTelemetry.recordCrash(
      exception: error,
      stack: stack,
      isFatal: true,
      customAttributes: {'user_id': AppTelemetry.userName},
    );
    return true;
  };

  runApp(const MyApp());
  // Sau khi đăng nhập thành công, gọi AppTelemetry.setUserName(user.id).
}`,
  },
  {
    tag: 'Dio HTTP Client (Recommended)',
    title: 'Dio Interceptor (Timeout, HTTP 500 & Server Request ID)',
    detail: 'Gắn interceptor vào Dio client dùng chung. Phân loại timeout/mạng/HTTP riêng biệt, ghi status thật, error code, stack trace và request ID từ server nếu có.',
    code: `// dio_client.dart
import 'package:dio/dio.dart';
import 'package:your_app/utils/api_logger.dart';

final dio = Dio();

dio.interceptors.add(InterceptorsWrapper(
  onRequest: (options, handler) {
    options.extra['startTime'] = DateTime.now();
    options.extra['telemetryRequestId'] = ApiLogger.createRequestId();
    return handler.next(options);
  },
  onResponse: (response, handler) {
    final start = response.requestOptions.extra['startTime'] as DateTime?;
    final duration = start != null ? DateTime.now().difference(start).inMilliseconds : 0;
    final requestId = response.requestOptions.extra['telemetryRequestId'] as String?;
    ApiLogger.record(
      appId: 'vn.fizahub.app',
      endpoint: response.requestOptions.uri.toString(),
      method: response.requestOptions.method,
      statusCode: response.statusCode ?? 200,
      requestPayload: response.requestOptions.data,
      responsePayload: response.data,
      durationMs: duration,
      requestId: requestId,
      serverRequestId: response.headers.value('x-request-id') ?? response.headers.value('cf-ray') ??
          (response.data is Map ? response.data['request_id']?.toString() : null),
      userName: AppTelemetry.userName,
      deviceName: AppTelemetry.deviceName,
    );
    return handler.next(response);
  },
  onError: (DioException err, handler) {
    final start = err.requestOptions.extra['startTime'] as DateTime?;
    final duration = start != null ? DateTime.now().difference(start).inMilliseconds : 0;
    final statusCode = err.response?.statusCode ?? 0;
    final isTimeout = err.type.name.toLowerCase().contains('timeout');
    ApiLogger.record(
      appId: 'vn.fizahub.app',
      endpoint: err.requestOptions.uri.toString(),
      method: err.requestOptions.method,
      statusCode: statusCode,
      errorMessage: err.message ?? err.error?.toString(),
      errorType: isTimeout ? 'timeout' : statusCode == 0 ? 'network_error' : statusCode >= 500 ? 'server_error' : 'http_error',
      errorCode: err.type.name,
      stackTrace: err.stackTrace.toString(),
      requestId: err.requestOptions.extra['telemetryRequestId'] as String?,
      serverRequestId: err.response?.headers.value('x-request-id') ?? err.response?.headers.value('cf-ray') ??
          (err.response?.data is Map ? err.response?.data['request_id']?.toString() : null),
      requestPayload: err.requestOptions.data,
      responsePayload: err.response?.data,
      durationMs: duration,
      userName: AppTelemetry.userName,
      deviceName: AppTelemetry.deviceName,
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
  userName: AppTelemetry.userName,
  deviceName: AppTelemetry.deviceName,
);

// Mọi request qua client này đều tự động log về Cloudflare
final response = await client.get(Uri.parse('https://api.yourdomain.com/items'));`,
  },
];

const REST_API_STEPS = [
  {
    tag: 'POST /telemetry/batch (Mới & Tối ưu)',
    title: 'Gom nhóm Batch Ingestion (Logs, Crashes, Events)',
    detail: 'Gửi đồng thời nhiều API Logs, Crashlytics và Events trong cùng 1 request HTTP duy nhất. Tiết kiệm băng thông, pin và hỗ trợ gửi tức thời khi người dùng tắt tab (sendBeacon).',
    code: `// Endpoint: POST https://flow-api.hieupham101097.workers.dev/telemetry/batch
// Headers: Content-Type: application/json

curl -X POST https://flow-api.hieupham101097.workers.dev/telemetry/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "app_identifier": "vn.fizahub.app",
    "device_name": "iPhone 15 Pro",
    "user_name": "nguyen_van_a",
    "logs": [
      {
        "endpoint": "https://api.domain.com/v1/user/profile",
        "method": "GET",
        "status_code": 200,
        "duration_ms": 145,
        "request_payload": null,
        "response_payload": "{\\"id\\": 12, \\"name\\": \\"Nguyen Van A\\"}"
      }
    ],
    "crashes": [
      {
        "error_message": "Uncaught TypeError: Cannot read properties of undefined",
        "stack_trace": "TypeError: Cannot read properties of undefined (reading 'token')\\n at auth.service.ts:42",
        "is_fatal": 1,
        "device_info": { "os": "iOS 17.5", "model": "iPhone 15 Pro" },
        "custom_attributes": { "screen": "ProfileScreen" }
      }
    ],
    "events": [
      {
        "event_name": "ekyc_step_1_id_card",
        "event_type": "funnel",
        "screen_name": "EkycScanScreen",
        "parameters": { "side": "front", "attempt": 1 }
      }
    ]
  }'`,
  },
  {
    tag: 'POST /logs (Đầy đủ tham số)',
    title: 'Gửi 1 API Log Đơn Lẻ (Tự Động Tạo APM Issue khi lỗi >= 500)',
    detail: 'Gửi log của 1 cuộc gọi HTTP API. Khi status_code >= 500, Cloudflare Hub tự động gom nhóm lỗi (Fingerprint), tạo Issue và lưu mẫu failed request.',
    code: `// Endpoint: POST https://flow-api.hieupham101097.workers.dev/logs
// Headers: Content-Type: application/json

curl -X POST https://flow-api.hieupham101097.workers.dev/logs \\
  -H "Content-Type: application/json" \\
  -d '{
    "app_identifier": "vn.fizahub.app",
    "endpoint": "https://api.domain.com/v1/payment/checkout",
    "method": "POST",
    "status_code": 500,
    "error_type": "server_error",
    "error_code": "ERR_DB_DEADLOCK",
    "request_id": "client-generated-id-456",
    "server_request_id": "backend-request-id-789",
    "stack_trace": "Error: deadlock\\n at createCheckout (checkout.service.ts:88)",
    "duration_ms": 680,
    "error_message": "Internal Server Error: Database deadlock detected",
    "request_payload": "{\\"cart_item_count\\": 2}",
    "response_payload": "{\\"code\\": \\"ERR_DB_DEADLOCK\\", \\"message\\": \\"Deadlock occurred\\"}",
    "user_name": "nguyen_van_a",
    "device_name": "Samsung Galaxy S24",
    "ip_address": "113.161.45.22"
  }'`,
  },
  {
    tag: 'POST /crashes (Crashlytics & Exceptions)',
    title: 'Ghi nhận Sự cố Crash & Ngoại lệ Runtime Unhandled',
    detail: 'Gửi thông tin crash từ Flutter hoặc Web. Hệ thống tự động phân loại nền tảng (Android vs iOS), nhận diện điểm lỗi (culprit) từ stack trace và tạo Issue APM.',
    code: `// Endpoint: POST https://flow-api.hieupham101097.workers.dev/crashes
// Headers: Content-Type: application/json

curl -X POST https://flow-api.hieupham101097.workers.dev/crashes \\
  -H "Content-Type: application/json" \\
  -d '{
    "app_identifier": "vn.fizahub.app",
    "error_message": "RangeError (index): Invalid value: Valid value range is empty: 0",
    "stack_trace": "package:flutter/src/widgets/framework.dart:456:12\\npackage:fizahub/views/home.dart:88:5",
    "is_fatal": 1,
    "device_info": {
      "os": "Android 14",
      "model": "Samsung Galaxy S24 Ultra",
      "device_name": "SM-S928B"
    },
    "custom_attributes": {
      "user_id": "user-123",
      "screen_name": "HomeDashboardScreen"
    }
  }'`,
  },
  {
    tag: 'POST /events (Phễu Chuyển Đổi & Hành Trình)',
    title: 'Ghi nhận Sự kiện Người Dùng (Events & Funnels)',
    detail: 'Gửi các sự kiện nghiệp vụ (ví dụ các bước trong luồng EKYC, Đăng ký, Thanh toán) để tính toán tỷ lệ chuyển đổi (Conversion Rate) và vẽ Timeline.',
    code: `// Endpoint: POST https://flow-api.hieupham101097.workers.dev/events
// Headers: Content-Type: application/json

curl -X POST https://flow-api.hieupham101097.workers.dev/events \\
  -H "Content-Type: application/json" \\
  -d '{
    "app_identifier": "vn.fizahub.app",
    "event_name": "ekyc_step_2_face_match",
    "event_type": "funnel",
    "screen_name": "EkycLivenessScreen",
    "user_id": "user-123",
    "device_name": "iPhone 15 Pro",
    "parameters": {
      "confidence_score": 0.98,
      "liveness_passed": true,
      "step_order": 2
    }
  }'`,
  },
];

export default function Setup() {
  const { platformScope, setPlatformScope } = usePlatform();
  const [activeTab, setActiveTab] = useState(platformScope || 'app');
  const [copied, setCopied] = useState('');

  const steps = useMemo(() => {
    if (activeTab === 'api') return REST_API_STEPS;
    if (activeTab === 'web') return WEB_STEPS;
    return APP_STEPS;
  }, [activeTab]);

  const copy = async (value, title) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(title);
      window.setTimeout(() => setCopied(''), 1600);
    } catch (_) {}
  };

  const getBadgeStyle = () => {
    if (activeTab === 'api') {
      return {
        background: 'rgba(234, 179, 8, 0.15)',
        color: '#facc15',
        border: '1px solid rgba(234, 179, 8, 0.35)',
      };
    }
    if (activeTab === 'web') {
      return {
        background: 'rgba(6, 182, 212, 0.15)',
        color: '#38bdf8',
        border: '1px solid rgba(6, 182, 212, 0.35)',
      };
    }
    return {
      background: 'rgba(168, 85, 247, 0.15)',
      color: '#c084fc',
      border: '1px solid rgba(168, 85, 247, 0.35)',
    };
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
                ...getBadgeStyle(),
              }}
            >
              {activeTab === 'api'
                ? '⚡ REST API & Batch Specs'
                : activeTab === 'web'
                ? '🌐 Web SDK (Angular / React)'
                : '📱 Mobile SDK (Flutter)'}
            </span>
          </div>
          <p>
            Chọn nền tảng và phương thức kết nối để ghi nhận API Logs, Crashlytics, Events và Breadcrumbs lên Cloudflare Telemetry Hub.
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
          <button
            type="button"
            onClick={() => setActiveTab('api')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '7px',
              border: 'none',
              background: activeTab === 'api' ? 'var(--surface-raised)' : 'transparent',
              color: activeTab === 'api' ? '#facc15' : 'var(--text-muted)',
              fontWeight: 650,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: activeTab === 'api' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
            }}
          >
            <span>⚡</span> REST API & Batch (Specs)
          </button>
        </div>
      </header>

      {/* SDK Download or Base URL Card */}
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
            <span style={{ fontSize: '1.2rem' }}>{activeTab === 'api' ? '🌐' : '📦'}</span>
            <strong style={{ fontSize: '0.98rem', color: 'var(--text)' }}>
              {activeTab === 'api'
                ? 'Base Server Endpoint: https://flow-api.hieupham101097.workers.dev'
                : activeTab === 'web'
                ? 'Tệp SDK hoàn chỉnh: api-logger.service.ts'
                : 'Tệp SDK hoàn chỉnh: api_logger.dart'}
            </strong>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 650 }}>
              {activeTab === 'api' ? 'Direct Edge API' : 'Real-time Direct + PII Redaction'}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            {activeTab === 'api'
              ? 'Hỗ trợ gọi từ bất kỳ nền tảng nào (cURL, Python, Go, Node.js, PHP, Postman). Hỗ trợ cả log đơn lẻ lẫn gom nhóm Batch /telemetry/batch.'
              : activeTab === 'web'
              ? 'Gửi trực tiếp theo thời gian thực lên API, không lưu cache/đệm trễ, tự động lọc che giấu Password & Bearer Token, hỗ trợ Angular 15+ & Standalone.'
              : 'Gửi trực tiếp theo thời gian thực lên API Cloudflare, không lưu cache/đệm trễ, tự động lọc che giấu PII nhạy cảm và báo cáo Fatal Crash tức thì.'}
          </p>
        </div>

        {activeTab === 'api' ? (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => copy('https://flow-api.hieupham101097.workers.dev', 'base_url')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.84rem',
              padding: '0.6rem 1.1rem',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <span>{copied === 'base_url' ? '✓' : '📋'}</span> {copied === 'base_url' ? 'Đã sao chép Base URL' : 'Sao chép Base URL'}
          </button>
        ) : (
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
        )}
      </div>

      {activeTab !== 'api' && (
        <section
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid rgba(99, 102, 241, 0.32)',
            borderRadius: 'var(--radius)',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: 'var(--text)' }}>
            Web và App cần gửi thêm gì để tìm nguyên nhân lỗi?
          </h3>
          <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.55 }}>
            Thêm các trường dưới đây vào HTTP interceptor, Fetch wrapper và global crash handler. SDK có thể tự gửi chúng; nếu tích hợp thủ công, dùng cùng tên trường.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.7rem' }}>
            <div style={{ padding: '0.85rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#c084fc', fontSize: '0.82rem' }}>1. App và tenant</strong>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                Gửi <code>app_identifier</code> đúng mã đã đăng ký trong cấu hình ứng dụng. Worker tự tìm tenant theo mã này; dữ liệu ứng dụng hiện tại vào tenant 1. Không gửi <code>tenant_id</code> từ client.
              </p>
            </div>
            <div style={{ padding: '0.85rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#fbbf24', fontSize: '0.82rem' }}>2. Thông tin mỗi API request</strong>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                Ghi <code>duration_ms</code>, status HTTP thật, <code>error_message</code>, <code>error_type</code> (timeout, network_error, server_error), <code>error_code</code> và response body lỗi đã lọc dữ liệu nhạy cảm. Không có response thì dùng status 0/null, đừng gán 500.
              </p>
            </div>
            <div style={{ padding: '0.85rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#38bdf8', fontSize: '0.82rem' }}>3. Dấu vết để đối chiếu</strong>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                Tạo <code>request_id</code> riêng cho mỗi lần gọi; lấy <code>server_request_id</code> từ header <code>x-request-id</code> hoặc JSON response. Gửi thêm <code>user_name</code> (ID nội bộ sau đăng nhập), <code>device_name</code> và stack trace khi có.
              </p>
            </div>
            <div style={{ padding: '0.85rem', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
              <strong style={{ color: '#f87171', fontSize: '0.82rem' }}>4. Crash và lỗi runtime</strong>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.5 }}>
                Web đăng ký <code>error</code>/<code>unhandledrejection</code>; Flutter đăng ký <code>FlutterError.onError</code>/<code>PlatformDispatcher.onError</code>. Gửi <code>error_message</code>, <code>stack_trace</code>, <code>is_fatal</code>, OS/thiết bị và màn hình.
              </p>
            </div>
          </div>
          <p style={{ margin: '0.85rem 0 0', color: 'var(--text-dim)', fontSize: '0.76rem', lineHeight: 1.5 }}>
            Trước khi gửi payload, loại bỏ password, token, OTP, thông tin định danh/thanh toán và query string nhạy cảm. Chỉ gửi payload đã rút gọn cần thiết để điều tra.
          </p>
        </section>
      )}

      {/* New Configuration Parameters Table */}
      <div
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <span style={{ fontSize: '1.1rem' }}>⚙️</span>
          <h3 style={{ fontSize: '0.98rem', margin: 0, fontWeight: 700, color: 'var(--text)' }}>
            Bảng Tham Số Cấu Hình & Định Danh Mới (Full Schema Reference)
          </h3>
          <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', fontWeight: 650 }}>
            Hỗ trợ APM & Breadcrumbs
          </span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
          Để hệ thống tự động liên kết lỗi vào bảng <strong>Issues APM</strong>, vẽ <strong>User Journey</strong> và tìm nguyên nhân timeout/500/crash, hãy gửi đúng các trường dưới đây. Với log batch, endpoint là <code>/telemetry/batch</code>:
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                <th style={{ padding: '0.55rem 0.75rem', fontWeight: 600 }}>Tên trường</th>
                <th style={{ padding: '0.55rem 0.75rem', fontWeight: 600 }}>Kiểu</th>
                <th style={{ padding: '0.55rem 0.75rem', fontWeight: 600 }}>Endpoints</th>
                <th style={{ padding: '0.55rem 0.75rem', fontWeight: 600 }}>Mô tả & Ý nghĩa</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#c084fc', fontWeight: 600 }}>app_identifier</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>string</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch, /crashes, /events</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>Mã ứng dụng đã đăng ký. Worker dùng mã này để tìm tenant của app; hiện tại app đang theo dõi thuộc tenant 1. Client không gửi tenant_id.</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 600 }}>
                  user_name
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>string</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch, /crashes, /events</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>
                  ID nội bộ hoặc username sau khi đăng nhập. Dùng để ghép log API và hành trình của cùng người dùng; tránh gửi email/số điện thoại nếu không cần.
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#c084fc', fontWeight: 600 }}>
                  device_name
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>string</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch, /crashes, /events</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>
                  Tên dòng máy thật (ví dụ: <code>iPhone 15 Pro</code>, <code>Samsung S24</code>, <code>Chrome 128 (Windows 11)</code>). Dùng để phân loại thiết bị và tìm vết khi user ẩn danh.
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#34d399', fontWeight: 600 }}>
                  request_payload
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>string | object</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>
                  Body hoặc params cần thiết để điều tra. SDK chính thức che một số key nhạy cảm; tích hợp thủ công phải tự lọc password, token, OTP và dữ liệu định danh trước khi gửi.
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#f87171', fontWeight: 600 }}>
                  response_payload
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>string | object</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>
                  Nội dung kết quả server trả về (tối đa 4000 ký tự). Rất hữu ích khi API lỗi 4xx/5xx để xem ngay mã lỗi backend trả về mà không cần tra log máy chủ.
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#fbbf24', fontWeight: 600 }}>
                  duration_ms
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>number (int)</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>
                  Thời gian thực thi API (latency) tính bằng mili-giây. Dùng để tính toán độ trễ trung bình P95/P99 và cảnh báo API chậm.
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#f87171', fontWeight: 600 }}>error_type</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>string</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>Loại lỗi: <code>timeout</code>, <code>network_error</code>, <code>server_error</code>, <code>http_error</code>. Dùng status 0/null khi không có HTTP response.</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#f87171', fontWeight: 600 }}>error_message / error_code</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>string</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>Thông báo lỗi và mã từ HTTP client/server (ví dụ <code>ECONNABORTED</code> hoặc mã lỗi backend).</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#f87171', fontWeight: 600 }}>stack_trace</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>string</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch, /crashes</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>Stack trace của lỗi API hoặc crash để xác định file/dòng gây lỗi.</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 600 }}>request_id / server_request_id</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>string</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/logs, /telemetry/batch</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>ID do client tạo cho mỗi lần gọi và ID server trả ở header <code>x-request-id</code> hoặc body <code>request_id</code>; dùng để đối chiếu log hai phía.</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#e879f9', fontWeight: 600 }}>
                  custom_attributes
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>object</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/crashes, /telemetry/batch</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>
                  Object chứa metadata tùy ý đính kèm với Crashlytics (ví dụ: phiên bản app <code>app_version</code>, màn hình đang đứng <code>screen_name</code>, user ID...).
                </td>
              </tr>
              <tr>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', color: '#60a5fa', fontWeight: 600 }}>
                  parameters
                </td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>object</td>
                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>/events, /telemetry/batch</td>
                <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text)' }}>
                  Object tham số của sự kiện nghiệp vụ (ví dụ: bước trong phễu EKYC <code>step_order: 1</code>, trạng thái <code>success: true</code>).
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
