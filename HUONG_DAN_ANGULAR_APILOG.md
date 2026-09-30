# 📋 HƯỚNG DẪN TÍCH HỢP APILOGGER & TELEMETRY VÀO DỰ ÁN WEB ANGULAR

> 🎯 **Mục đích:** Tự động ghi nhận toàn bộ lịch sử gọi HTTP API, bắt lỗi sập web / ngoại lệ JavaScript runtime và sự kiện chuyển trang gửi về Cloudflare Server để theo dõi trên Web Dashboard.  
> 📊 **Dashboard xem log:** `https://flow-api.hieupham101097.workers.dev/admin/dashboard`  
> 🏷️ **Thông tin hiển thị:** Dashboard sẽ tự động hiển thị:
> - **Tên người dùng (`user_name`)**: Tên tài khoản sau khi đăng nhập (ví dụ: `Trần Thị Mai`).
> - **Tên trình duyệt & OS (`device_name`)**: Tự động nhận diện (ví dụ: `Chrome 128 (Windows 11)`, `Safari 17 (macOS)`...).
> - **IP máy (`ip_address`)**: Server Cloudflare tự động định danh (Angular không cần lấy IP).

## Theo dõi Timeout và nguyên nhân lỗi

SDK mới phân loại `timeout`, `network_error`, lỗi HTTP, gửi mã lỗi, stack trace và request ID. Trong Dashboard, mở tab **Timeout / Mạng** để lọc nhanh; mở một dòng lỗi để xem nguyên nhân và stack trace. Nếu ứng dụng đã tích hợp logger cũ, cập nhật hai interceptor ở dưới hoặc chép phiên bản mới từ `public/angular/api-logger.service.ts`, rồi phát hành lại ứng dụng. Các log cũ không thể tự phân biệt chính xác timeout với mất mạng.

Với lỗi 500 phát sinh bên trong Worker `flow-api`, mở **Cloudflare Dashboard → Workers & Pages → flow-api → Observability**. Tìm theo `request_id` trong chi tiết API; log `flow_api_exception` có message và stack trace, còn `flow_api_slow_request` đánh dấu request mất từ 5 giây trở lên. Lỗi runtime như Worker vượt CPU hoặc uncaught exception cũng xuất hiện trong mục Errors/Workers Logs của Cloudflare.

---

## 🚀 PROMPT COPY DÀNH CHO BÊN ANGULAR (HOẶC AI DEV)

> Copy toàn bộ đoạn dưới đây và gửi cho lập trình viên Angular hoặc AI Assistant của project Angular:

```markdown
Bạn hãy tích hợp hệ thống ApiLogger và Telemetry vào dự án Angular này theo các bước chuẩn sau:

### 1. Tạo file SDK tại: `src/app/core/services/api-logger.service.ts`

Tạo file mới với nội dung TypeScript bên dưới:

```typescript
import { Injectable, ErrorHandler } from '@angular/core';
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

const createRequestId = (): string => crypto.randomUUID();
const classifyRequestError = (error: any, statusCode: number): string => {
  if (statusCode === 408 || statusCode === 504) return 'timeout';
  if (statusCode >= 500) return 'server_error';
  if (statusCode >= 400) return 'http_error';
  const message = `${error?.name || ''} ${error?.error?.name || ''} ${error?.message || ''} ${error?.error?.message || ''}`.toLowerCase();
  if (/timeout|timed out|deadline exceeded/.test(message)) return 'timeout';
  return 'network_error';
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

  constructor() {
    if (!ApiLoggerService._deviceName) {
      ApiLoggerService._deviceName = ApiLoggerService.detectBrowserDevice();
    }
  }

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

  public static setUserName(userName: string): void {
    ApiLoggerService._userName = userName;
  }

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

  public static detectBrowserDevice(): string {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'Trình duyệt Web';
    }

    const ua = navigator.userAgent;
    let browser = 'Browser';
    let os = 'Web';

    if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

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

  public static sendApiLog(params: {
    endpoint: string;
    method: string;
    statusCode: number;
    durationMs: number;
    requestPayload?: any;
    responsePayload?: any;
    errorMessage?: string;
    errorType?: string;
    errorCode?: string;
    stackTrace?: string;
    requestId?: string;
    serverRequestId?: string;
  }): void {
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
}

// 1. Interceptor dạng Function (Angular 15+)
export const apiLoggerInterceptor: HttpInterceptorFn = (req, next) => {
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
            serverRequestId: event.headers.get('x-request-id') || event.headers.get('cf-ray') || undefined,
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
        errorCode: error?.code || error?.error?.name || error?.name,
        stackTrace: error?.stack,
        requestId,
        serverRequestId: error?.headers?.get?.('x-request-id') || error?.headers?.get?.('cf-ray'),
      });

      return throwError(() => error);
    })
  );
};

// 2. Interceptor dạng Class (Angular 4-14)
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
              serverRequestId: event.headers.get('x-request-id') || event.headers.get('cf-ray') || undefined,
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
          errorCode: error?.code || error?.error?.name || error?.name,
          stackTrace: error?.stack,
          requestId,
          serverRequestId: error?.headers?.get?.('x-request-id') || error?.headers?.get?.('cf-ray'),
        });

        return throwError(() => error);
      })
    );
  }
}

// 3. Global Error Handler bắt lỗi sập Web
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

    console.error('[Gden Flow Telemetry caught error]:', error);
  }
}
```

---

### 2. Cấu hình vào ứng dụng Angular

#### Cách A: Dự án Angular Standalone (Angular 15, 16, 17, 18, 19+)
Mở file `src/app/app.config.ts` (hoặc `main.ts`):

```typescript
import { ApplicationConfig, ErrorHandler, importProvidersFrom } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import {
  ApiLoggerService,
  apiLoggerInterceptor,
  GlobalErrorHandler
} from './core/services/api-logger.service';

// Khởi tạo App ID của trang Web (ví dụ: vn.myportal.web)
ApiLoggerService.initialize({
  appId: 'vn.myportal.web',
  serverUrl: 'https://flow-api.hieupham101097.workers.dev',
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    // Gắn Interceptor tự động ghi nhận mọi request HTTP
    provideHttpClient(withInterceptors([apiLoggerInterceptor])),
    // Bắt toàn bộ ngoại lệ JavaScript runtime
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
```

#### Cách B: Dự án Angular NgModule (Angular 4 đến 14/15)
Mở file `src/app/app.module.ts`:

```typescript
import { NgModule, ErrorHandler } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AppComponent } from './app.component';
import {
  ApiLoggerService,
  ApiLoggerInterceptor,
  GlobalErrorHandler
} from './core/services/api-logger.service';

// Khởi tạo App ID
ApiLoggerService.initialize({
  appId: 'vn.myportal.web',
  serverUrl: 'https://flow-api.hieupham101097.workers.dev',
});

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, HttpClientModule],
  providers: [
    // Gắn Interceptor vào luồng HTTP của Angular
    { provide: HTTP_INTERCEPTORS, useClass: ApiLoggerInterceptor, multi: true },
    // Gắn Global Error Handler
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

---

### 3. Gắn Tên Người Dùng sau khi Đăng Nhập Thành Công
Trong `AuthService` hoặc Login Component khi người dùng đăng nhập thành công:

```typescript
import { ApiLoggerService } from './core/services/api-logger.service';

// Ví dụ sau khi gọi API login và có thông tin user:
if (response && response.user) {
  // Cập nhật tên user vào Telemetry
  ApiLoggerService.setUserName(response.user.fullName || response.user.username);
}
```

Kể từ lúc này, mọi API gọi ra từ trình duyệt sẽ tự động kèm:
- **Tên người dùng**: Ví dụ `Trần Thị Mai`
- **Tên trình duyệt**: Ví dụ `Chrome 128 (Windows 11)`
- **IP truy cập**: Tự động do Cloudflare ghi nhận

---

### 4. Ghi nhận Sự kiện Nghiệp vụ (Analytics Event) & Chuyển Trang (Tùy chọn)
Tại bất kỳ Component nào:

```typescript
import { ApiLoggerService } from './core/services/api-logger.service';

// Bắn sự kiện người dùng click mua hàng / thao tác nghiệp vụ:
ApiLoggerService.logEvent('button_checkout_clicked', {
  cart_id: '12345',
  total_amount: 550000,
});
```
```

---

## 🎯 Kiểm Tra Trên Dashboard
1. Truy cập `https://flow-api.hieupham101097.workers.dev/admin/dashboard`
2. Tại hộp thoại mở đầu: Chọn **Quản lý Web App** (hoặc dùng nút chuyển đổi ở menu trên cùng).
3. Thực hiện vài thao tác gọi API hoặc chuyển trang trên ứng dụng Angular.
4. Dashboard sẽ hiển thị ngay lập tức các dòng log HTTP (Status 200, 4xx, 5xx), thời gian phản hồi (ms) và trình duyệt thực hiện.
