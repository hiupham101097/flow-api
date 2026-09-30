/**
 * ==============================================================================
 * GDEN FLOW - TELEMETRY & API LOGGER SDK CHO ANGULAR
 * ==============================================================================
 * Tự động ghi nhận:
 * 1. Toàn bộ HTTP Request (Status, Duration, Payload, Error) qua HttpInterceptor
 * 2. Lỗi sập web / ngoại lệ JavaScript runtime qua Global ErrorHandler
 * 3. Sự kiện người dùng & Chuyển trang (Screen View / Route Navigation)
 * 4. Tự động nhận diện Tên trình duyệt (Chrome, Firefox, Safari...) & Hệ điều hành
 * ==============================================================================
 */

import {
  Injectable,
  ErrorHandler,
  inject
} from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpResponse,
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

const createRequestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const classifyRequestError = (error: any, statusCode: number): string | null => {
  if (statusCode === 408 || statusCode === 504) return 'timeout';
  if (statusCode >= 500) return 'server_error';
  if (statusCode >= 400) return 'http_error';
  const message = `${error?.name || ''} ${error?.error?.name || ''} ${error?.message || ''} ${error?.error?.message || ''}`.toLowerCase();
  if (/timeout|timed out|deadline exceeded/.test(message)) return 'timeout';
  if (statusCode === 0) return 'network_error';
  return null;
};

export interface TelemetryConfig {
  appId: string;
  serverUrl?: string;
  userName?: string;
  customDeviceName?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiLoggerService {
  private static _appId = 'vn.myportal.web';
  private static _serverUrl = 'https://flow-api.hieupham101097.workers.dev';
  private static _userName: string | null = null;
  private static _deviceName: string | null = null;

  // Batch Ingestion & Buffer Queue
  private static _logQueue: any[] = [];
  private static _crashQueue: any[] = [];
  private static _eventQueue: any[] = [];
  private static _flushTimer: any = null;
  private static _isUnloadHooked = false;

  private static readonly PII_KEYS = [
    'password', 'pass', 'pwd', 'token', 'access_token', 'refresh_token',
    'authorization', 'bearer', 'secret', 'credit_card', 'card_number', 'cvv', 'pin', 'otp'
  ];

  constructor() {
    if (!ApiLoggerService._deviceName) {
      ApiLoggerService._deviceName = ApiLoggerService.detectBrowserDevice();
    }
  }

  /**
   * Khởi tạo cấu hình Telemetry cho Web Angular
   */
  public static initialize(config: TelemetryConfig): void {
    if (config.appId) ApiLoggerService._appId = config.appId;
    if (config.serverUrl) ApiLoggerService._serverUrl = config.serverUrl.replace(/\/+$/, '');
    if (config.userName) ApiLoggerService._userName = config.userName;
    if (config.customDeviceName) {
      ApiLoggerService._deviceName = config.customDeviceName;
    } else {
      ApiLoggerService._deviceName = ApiLoggerService.detectBrowserDevice();
    }

    if (typeof window !== 'undefined' && !ApiLoggerService._isUnloadHooked) {
      ApiLoggerService._isUnloadHooked = true;
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          ApiLoggerService.flushBatch();
        }
      });
      window.addEventListener('beforeunload', () => {
        ApiLoggerService.flushBatch();
      });
    }
  }

  /**
   * Tự động che dấu dữ liệu nhạy cảm (PII / Passwords / Bearer Tokens / OTP)
   */
  public static maskPII(data: any): any {
    if (!data) return data;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(ApiLoggerService.maskPII(parsed));
      } catch {
        return data;
      }
    }
    if (typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map(item => ApiLoggerService.maskPII(item));

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (ApiLoggerService.PII_KEYS.some(pii => lowerKey.includes(pii))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = ApiLoggerService.maskPII(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  public static scheduleFlush(): void {
    if (ApiLoggerService._flushTimer) return;
    ApiLoggerService._flushTimer = setTimeout(() => {
      ApiLoggerService.flushBatch();
    }, 3500);
  }

  /**
   * Gom nhóm và gửi toàn bộ logs, crashes, events tồn đọng lên /telemetry/batch
   */
  public static flushBatch(): void {
    if (ApiLoggerService._flushTimer) {
      clearTimeout(ApiLoggerService._flushTimer);
      ApiLoggerService._flushTimer = null;
    }

    if (
      ApiLoggerService._logQueue.length === 0 &&
      ApiLoggerService._crashQueue.length === 0 &&
      ApiLoggerService._eventQueue.length === 0
    ) {
      return;
    }

    const payload = {
      app_identifier: ApiLoggerService.appId,
      device_name: ApiLoggerService.deviceName,
      user_name: ApiLoggerService.userName || undefined,
      logs: ApiLoggerService._logQueue.splice(0, 50),
      crashes: ApiLoggerService._crashQueue.splice(0, 20),
      events: ApiLoggerService._eventQueue.splice(0, 50),
    };

    const endpoint = `${ApiLoggerService.serverUrl}/telemetry/batch`;
    const jsonStr = JSON.stringify(payload);

    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Cập nhật Tên Người Dùng sau khi Login thành công
   */
  public static setUserName(userName: string): void {
    ApiLoggerService._userName = userName;
  }

  /**
   * Cập nhật App ID nếu dự án có nhiều module hoặc portal
   */
  public static setAppId(appId: string): void {
    ApiLoggerService._appId = appId;
  }

  public static get appId(): string {
    return ApiLoggerService._appId;
  }

  public static get serverUrl(): string {
    return ApiLoggerService._serverUrl;
  }

  public static get userName(): string | null {
    return ApiLoggerService._userName;
  }

  public static get deviceName(): string {
    return ApiLoggerService._deviceName || ApiLoggerService.detectBrowserDevice();
  }

  /**
   * Tự động nhận diện Tên trình duyệt và Hệ điều hành (ví dụ: "Chrome 128 (Windows 11)")
   */
  public static detectBrowserDevice(): string {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'Trình duyệt Web';
    }

    const ua = navigator.userAgent;
    let browser = 'Browser';
    let os = 'Web';

    // Nhận diện OS
    if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    // Nhận diện Browser
    if (/Edg\/([0-9.]+)/i.test(ua)) {
      const match = ua.match(/Edg\/([0-9.]+)/i);
      browser = `Edge ${match ? match[1].split('.')[0] : ''}`;
    } else if (/Chrome\/([0-9.]+)/i.test(ua)) {
      const match = ua.match(/Chrome\/([0-9.]+)/i);
      browser = `Chrome ${match ? match[1].split('.')[0] : ''}`;
    } else if (/Firefox\/([0-9.]+)/i.test(ua)) {
      const match = ua.match(/Firefox\/([0-9.]+)/i);
      browser = `Firefox ${match ? match[1].split('.')[0] : ''}`;
    } else if (/Safari\/([0-9.]+)/i.test(ua) && !/Chrome/i.test(ua)) {
      const match = ua.match(/Version\/([0-9.]+)/i);
      browser = `Safari ${match ? match[1].split('.')[0] : ''}`;
    }

    return `${browser} (${os})`.trim();
  }

  /**
   * Gửi Log API lên Cloudflare Dashboard (Gửi ngay lập tức, không lưu đệm)
   */
  public static sendApiLog(params: {
    endpoint: string;
    method: string;
    statusCode: number;
    durationMs: number;
    requestPayload?: any;
    responsePayload?: any;
    errorMessage?: string;
    errorType?: string | null;
    errorCode?: string | null;
    stackTrace?: string | null;
    requestId?: string;
    serverRequestId?: string | null;
  }): void {
    // Tránh vòng lặp vô tận: Không log các request gửi tới chính server telemetry
    if (params.endpoint.includes(ApiLoggerService._serverUrl)) {
      return;
    }

    try {
      const safeReq = ApiLoggerService.maskPII(params.requestPayload);
      const safeRes = ApiLoggerService.maskPII(params.responsePayload);

      const payload = {
        app_id: ApiLoggerService.appId,
        endpoint: params.endpoint,
        method: params.method.toUpperCase(),
        status_code: params.statusCode,
        duration_ms: params.durationMs,
        response_payload: typeof safeRes === 'object'
          ? JSON.stringify(safeRes).slice(0, 4000)
          : (safeRes ? String(safeRes).slice(0, 4000) : null),
        request_payload: typeof safeReq === 'object'
          ? JSON.stringify(safeReq).slice(0, 2000)
          : (safeReq ? String(safeReq).slice(0, 2000) : null),
        error_message: params.errorMessage || null,
        error_type: params.errorType || null,
        error_code: params.errorCode || null,
        stack_trace: params.stackTrace || null,
        request_id: params.requestId || null,
        server_request_id: params.serverRequestId || null,
        device_name: ApiLoggerService.deviceName,
        user_name: ApiLoggerService.userName || undefined,
      };

      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        if (navigator.sendBeacon(`${ApiLoggerService.serverUrl}/logs`, blob)) return;
      }

      fetch(`${ApiLoggerService.serverUrl}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Gửi sự cố Crashlytics / JavaScript Runtime Exception về Dashboard ngay lập tức
   */
  public static recordCrash(params: {
    exception: any;
    stackTrace?: string;
    isFatal?: boolean;
    deviceInfo?: Record<string, any>;
  }): void {
    try {
      const payload = {
        app_id: ApiLoggerService.appId,
        error_message: params.exception?.message || String(params.exception),
        stack_trace: params.stackTrace || params.exception?.stack || '',
        is_fatal: params.isFatal ? 1 : 0,
        device_info: {
          browser: ApiLoggerService.deviceName,
          url: typeof window !== 'undefined' ? window.location.pathname : '',
          ...ApiLoggerService.maskPII(params.deviceInfo || {}),
        },
        user_name: ApiLoggerService.userName || undefined,
      };

      fetch(`${ApiLoggerService.serverUrl}/crashes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Gửi Sự kiện nghiệp vụ hoặc Theo dõi hành vi (Analytics Event) ngay lập tức
   */
  public static logEvent(
    eventName: string,
    parameters?: Record<string, any>,
    options?: { screenName?: string; userId?: string }
  ): void {
    try {
      const payload = {
        app_id: ApiLoggerService.appId,
        event_name: eventName,
        event_type: options?.screenName ? 'screen_view' : 'custom',
        screen_name: options?.screenName,
        parameters: ApiLoggerService.maskPII(parameters || {}),
        user_id: options?.userId || ApiLoggerService.userName || undefined,
        device_name: ApiLoggerService.deviceName,
        user_name: ApiLoggerService.userName || undefined,
      };

      fetch(`${ApiLoggerService.serverUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Theo dõi tự động chuyển màn hình trong Router Angular
   */
  public trackRouter(router: Router): void {
    try {
      router.events.subscribe((event) => {
        if (event instanceof NavigationEnd) {
          ApiLoggerService.logEvent('screen_view', {
            url: event.urlAfterRedirects || event.url,
          }, {
            screenName: event.urlAfterRedirects || event.url,
          });
        }
      });
    } catch (_) {}
  }
}

/**
 * ==============================================================================
 * 1. STANDALONE HTTP INTERCEPTOR (Dành cho Angular 15, 16, 17, 18, 19+)
 * Cách dùng trong app.config.ts:
 * provideHttpClient(withInterceptors([apiLoggerInterceptor]))
 * ==============================================================================
 */
export const apiLoggerInterceptor: HttpInterceptorFn = (req, next) => {
  // Tránh vòng lặp: không log request gửi tới server telemetry
  if (req.url.includes(ApiLoggerService.serverUrl)) {
    return next(req);
  }

  const startTime = Date.now();
  const requestId = createRequestId();

  return next(req).pipe(
    tap({
      next: (event: HttpEvent<any>) => {
        if (event instanceof HttpResponse) {
          const duration = Date.now() - startTime;
          ApiLoggerService.sendApiLog({
            endpoint: req.urlWithParams || req.url,
            method: req.method,
            statusCode: event.status,
            durationMs: duration,
            requestPayload: req.body,
            responsePayload: event.body,
            requestId,
            serverRequestId: event.headers.get('x-request-id') || event.headers.get('cf-ray') || event.body?.request_id || null,
          });
        }
      },
    }),
    catchError((error: any) => {
      const duration = Date.now() - startTime;
      let statusCode = 0;
      let errorMsg = error?.message || 'Unknown Network Error';

      if (error instanceof HttpErrorResponse) {
        statusCode = error.status;
        errorMsg = typeof error.error === 'string'
          ? error.error
          : (error.error?.message || error.error?.error || error.error?.detail || error.error?.msg || error.message || error.statusText);
      }

      ApiLoggerService.sendApiLog({
        endpoint: req.urlWithParams || req.url,
        method: req.method,
        statusCode,
        durationMs: duration,
        requestPayload: req.body,
        responsePayload: error?.error,
        errorMessage: errorMsg,
        errorType: classifyRequestError(error, statusCode),
        errorCode: error?.code || error?.error?.name || error?.name || null,
        stackTrace: error?.stack || null,
        requestId,
        serverRequestId: error?.headers?.get?.('x-request-id') || error?.headers?.get?.('cf-ray') || error?.error?.request_id || null,
      });

      return throwError(() => error);
    })
  );
};

/**
 * ==============================================================================
 * 2. CLASS-BASED HTTP INTERCEPTOR (Dành cho Angular 4 đến 14/15 NgModule)
 * Cách dùng trong app.module.ts providers:
 * { provide: HTTP_INTERCEPTORS, useClass: ApiLoggerInterceptor, multi: true }
 * ==============================================================================
 */
@Injectable()
export class ApiLoggerInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (req.url.includes(ApiLoggerService.serverUrl)) {
      return next.handle(req);
    }

    const startTime = Date.now();
    const requestId = createRequestId();

    return next.handle(req).pipe(
      tap({
        next: (event: HttpEvent<any>) => {
          if (event instanceof HttpResponse) {
            const duration = Date.now() - startTime;
            ApiLoggerService.sendApiLog({
              endpoint: req.urlWithParams || req.url,
              method: req.method,
              statusCode: event.status,
              durationMs: duration,
              requestPayload: req.body,
              responsePayload: event.body,
              requestId,
              serverRequestId: event.headers.get('x-request-id') || event.headers.get('cf-ray') || event.body?.request_id || null,
            });
          }
        },
      }),
      catchError((error: any) => {
        const duration = Date.now() - startTime;
        let statusCode = 0;
        let errorMsg = error?.message || 'Unknown Network Error';

        if (error instanceof HttpErrorResponse) {
          statusCode = error.status;
          errorMsg = typeof error.error === 'string'
            ? error.error
            : (error.error?.message || error.error?.error || error.error?.detail || error.error?.msg || error.message || error.statusText);
        }

        ApiLoggerService.sendApiLog({
          endpoint: req.urlWithParams || req.url,
          method: req.method,
          statusCode,
          durationMs: duration,
          requestPayload: req.body,
          responsePayload: error?.error,
          errorMessage: errorMsg,
          errorType: classifyRequestError(error, statusCode),
          errorCode: error?.code || error?.error?.name || error?.name || null,
          stackTrace: error?.stack || null,
          requestId,
          serverRequestId: error?.headers?.get?.('x-request-id') || error?.headers?.get?.('cf-ray') || error?.error?.request_id || null,
        });

        return throwError(() => error);
      })
    );
  }
}

/**
 * ==============================================================================
 * 3. GLOBAL ERROR HANDLER CHO ANGULAR
 * Tự động bắt mọi lỗi JavaScript runtime chưa bắt được (Uncaught Exceptions)
 * và báo cáo về mục "Sự cố sập app / Crashlytics" trên Dashboard.
 * ==============================================================================
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    try {
      ApiLoggerService.recordCrash({
        exception: error,
        stackTrace: error?.stack,
        isFatal: true,
      });
    } catch (_) {}

    // Vẫn in ra console thông thường để lập trình viên debug
    console.error('[Gden Flow Telemetry caught error]:', error);
  }
}
