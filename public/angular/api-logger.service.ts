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
   * Gửi Log API lên Cloudflare Dashboard (dùng fetch không đồng bộ, không chặn UI)
   */
  public static sendApiLog(params: {
    endpoint: string;
    method: string;
    statusCode: number;
    durationMs: number;
    requestPayload?: any;
    responsePayload?: any;
    errorMessage?: string;
  }): void {
    // Tránh vòng lặp vô tận: Không log các request gửi tới chính server telemetry
    if (params.endpoint.includes(ApiLoggerService._serverUrl)) {
      return;
    }

    try {
      const payload = {
        app_id: ApiLoggerService.appId,
        endpoint: params.endpoint,
        method: params.method.toUpperCase(),
        status_code: params.statusCode,
        duration_ms: params.durationMs,
        response_payload: typeof params.responsePayload === 'object'
          ? JSON.stringify(params.responsePayload).slice(0, 4000)
          : (params.responsePayload ? String(params.responsePayload).slice(0, 4000) : null),
        request_payload: typeof params.requestPayload === 'object'
          ? JSON.stringify(params.requestPayload).slice(0, 2000)
          : (params.requestPayload ? String(params.requestPayload).slice(0, 2000) : null),
        error_message: params.errorMessage || null,
        device_name: ApiLoggerService.deviceName,
        user_name: ApiLoggerService.userName || undefined,
      };

      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        // Ưu tiên sendBeacon khi có thể để an toàn khi đóng tab
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const ok = navigator.sendBeacon(`${ApiLoggerService.serverUrl}/logs`, blob);
        if (ok) return;
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
   * Gửi sự cố Crashlytics / JavaScript Runtime Exception về Dashboard
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
          url: typeof window !== 'undefined' ? window.location.href : '',
          ...(params.deviceInfo || {}),
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
   * Gửi Sự kiện nghiệp vụ hoặc Theo dõi hành vi (Analytics Event)
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
        parameters: parameters || {},
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
          });
        }
      },
    }),
    catchError((error: any) => {
      const duration = Date.now() - startTime;
      let statusCode = 500;
      let errorMsg = error?.message || 'Unknown Network Error';

      if (error instanceof HttpErrorResponse) {
        statusCode = error.status;
        errorMsg = typeof error.error === 'string'
          ? error.error
          : (error.error?.message || error.message || error.statusText);
      }

      ApiLoggerService.sendApiLog({
        endpoint: req.urlWithParams || req.url,
        method: req.method,
        statusCode: statusCode || 500,
        durationMs: duration,
        requestPayload: req.body,
        responsePayload: error?.error,
        errorMessage: errorMsg,
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
            });
          }
        },
      }),
      catchError((error: any) => {
        const duration = Date.now() - startTime;
        let statusCode = 500;
        let errorMsg = error?.message || 'Unknown Network Error';

        if (error instanceof HttpErrorResponse) {
          statusCode = error.status;
          errorMsg = typeof error.error === 'string'
            ? error.error
            : (error.error?.message || error.message || error.statusText);
        }

        ApiLoggerService.sendApiLog({
          endpoint: req.urlWithParams || req.url,
          method: req.method,
          statusCode: statusCode || 500,
          durationMs: duration,
          requestPayload: req.body,
          responsePayload: error?.error,
          errorMessage: errorMsg,
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
