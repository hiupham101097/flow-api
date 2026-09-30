# 📋 HƯỚNG DẪN TÍCH HỢP APILOGGER & TELEMETRY VÀO DỰ ÁN FLUTTER (FIZAHUB)

> 🎯 **Mục đích:** Tự động ghi nhận toàn bộ lịch sử gọi API, bắt lỗi sập app (Crash) và sự kiện (Analytics) gửi về Cloudflare Server để theo dõi trên Web Dashboard.  
> 📊 **Dashboard xem log:** `https://flow-api.hieupham101097.workers.dev/admin/dashboard`  
> 🏷️ **Thông tin hiển thị:** Dashboard sẽ tự động hiển thị đầy đủ:
> - **Tên người dùng (`user_name`)**: Tên tài khoản sau khi login (ví dụ: `Phạm Minh Hiếu`).
> - **Tên thiết bị (`device_name`)**: Tên dòng máy thật (ví dụ: `iPhone 14 Pro`, `Samsung Galaxy S23`...).
> - **IP máy (`ip_address`)**: Server Cloudflare tự động phát hiện và ghi nhận (Flutter không cần lấy IP).

## Theo dõi Timeout và nguyên nhân lỗi

SDK mới gửi riêng `timeout`, `network_error`, lỗi HTTP, mã lỗi, stack trace và request ID. Trong Dashboard, mở tab **Timeout / Mạng** để lọc nhanh; mở một dòng lỗi để xem nguyên nhân, thời lượng và stack trace. Khi dùng `LoggingClient`, đặt `timeout` bằng đúng thời hạn app đang dùng (ví dụ 15 giây). Nếu app đã tích hợp SDK cũ, cần cập nhật interceptor/client trong app rồi phát hành app mới để các trường chẩn đoán bắt đầu được gửi; log cũ không thể tự suy ra chính xác là timeout hay mất mạng.

Với lỗi 500 phát sinh bên trong Worker `flow-api`, mở **Cloudflare Dashboard → Workers & Pages → flow-api → Observability**. Tìm theo `request_id` hiển thị trong chi tiết API; log `flow_api_exception` có message và stack trace, còn `flow_api_slow_request` đánh dấu request mất từ 5 giây trở lên. Lỗi runtime như Worker vượt CPU hoặc uncaught exception cũng xuất hiện trong mục Errors/Workers Logs của Cloudflare.

---

## 🚀 PROMPT COPY DÀNH CHO BÊN FLUTTER (HOẶC AI DEV)

> Copy toàn bộ đoạn dưới đây và gửi cho người phát triển Flutter hoặc AI Assistant của project Flutter:

```markdown
Bạn hãy tích hợp hệ thống ApiLogger và Telemetry vào dự án Flutter này theo các bước chuẩn sau:

### 1. Thư viện cần thiết (trong pubspec.yaml)
Đảm bảo project có:
- `http: ^1.2.0` (hoặc mới hơn)
- `device_info_plus: ^10.0.0` (tùy chọn: để lấy tên model máy chuẩn xác nhất)

### 2. Tạo file SDK tại: `lib/app/core/utils/api_logger.dart`
Nội dung file:

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'package:http/http.dart' as http;
import 'package:device_info_plus/device_info_plus.dart';

class AppTelemetry {
  static String _defaultAppId = 'vn.fizahub.app';
  static String? _deviceName;
  static String? _userName;
  static const String serverUrl = 'https://flow-api.hieupham101097.workers.dev';

  /// Khởi tạo Telemetry khi mở app (gọi trong main.dart)
  static Future<void> initialize({
    String appId = 'vn.fizahub.app',
    String? customDeviceName,
    String? userName,
  }) async {
    _defaultAppId = appId;
    _userName = userName;

    if (customDeviceName != null && customDeviceName.isNotEmpty) {
      _deviceName = customDeviceName;
    } else {
      _deviceName = await _detectDeviceName();
    }
  }

  /// Tự động lấy tên thiết bị thật (ví dụ: iPhone 14 Pro, Samsung SM-G998B...)
  static Future<String> _detectDeviceName() async {
    try {
      final deviceInfo = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final android = await deviceInfo.androidInfo;
        final brand = android.brand.isNotEmpty ? '${android.brand[0].toUpperCase()}${android.brand.substring(1)}' : '';
        return '$brand ${android.model}'.trim();
      } else if (Platform.isIOS) {
        final ios = await deviceInfo.iosInfo;
        return ios.utsname.machine.isNotEmpty ? ios.utsname.machine : 'Apple iPhone';
      } else if (Platform.isWindows) {
        return 'Windows PC';
      } else if (Platform.isMacOS) {
        return 'Apple Mac';
      }
    } catch (_) {}

    // Fallback cơ bản nếu không đọc được từ plugin
    try {
      final os = Platform.operatingSystem;
      return '${os[0].toUpperCase()}${os.substring(1)} Device';
    } catch (_) {
      return 'Mobile Device';
    }
  }

  /// Cập nhật tên người dùng (gọi ngay sau khi đăng nhập thành công)
  static void setUserName(String name) {
    _userName = name;
  }

  /// Cập nhật tên thiết bị nếu muốn đổi thủ công
  static void setDeviceName(String name) {
    _deviceName = name;
  }

  static String get appId => _defaultAppId;
  static String get deviceName => _deviceName ?? 'Mobile Device';
  static String? get userName => _userName;

  /// Bắt lỗi Crash / Exception gửi về Dashboard
  static Future<void> recordCrash({
    required dynamic exception,
    StackTrace? stack,
    bool isFatal = false,
    Map<String, dynamic>? deviceInfo,
  }) async {
    try {
      final osName = Platform.isAndroid ? 'Android' : (Platform.isIOS ? 'iOS' : Platform.operatingSystem);
      final mergedDevice = Map<String, dynamic>.from(deviceInfo ?? {});
      if (!mergedDevice.containsKey('os')) {
        mergedDevice['os'] = osName;
      }
      if (!mergedDevice.containsKey('device_name')) {
        mergedDevice['device_name'] = deviceName;
      }

      final payload = {
        'app_id': appId,
        'error_message': exception.toString(),
        'stack_trace': stack?.toString() ?? '',
        'is_fatal': isFatal ? 1 : 0,
        'device_info': mergedDevice,
        'os': osName,
        'user_name': userName,
      };

      http.post(
        Uri.parse('$serverUrl/crashes'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).catchError((_) => http.Response('', 500));
    } catch (_) {}
  }

  /// Ghi nhận sự kiện người dùng (Analytics Event)
  static Future<void> logEvent(
    String eventName, {
    Map<String, dynamic>? parameters,
    String? userId,
  }) async {
    try {
      final payload = {
        'app_id': appId,
        'event_name': eventName,
        'event_type': 'custom',
        'parameters': parameters ?? {},
        'user_id': userId,
        'device_name': deviceName,
        'user_name': userName,
      };

      http.post(
        Uri.parse('$serverUrl/events'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).catchError((_) => http.Response('', 500));
    } catch (_) {}
  }
}

/// HTTP Client tự động gửi log mỗi khi app gọi bất kỳ API nào
class LoggingClient extends http.BaseClient {
  final http.Client _inner;
  final String appId;
  final Duration? timeout;

  LoggingClient(this._inner, {this.appId = 'vn.fizahub.app', this.timeout});

  Future<T> _withTimeout<T>(Future<T> future, DateTime startTime) {
    if (timeout == null) return future;
    final remaining = timeout! - DateTime.now().difference(startTime);
    if (remaining <= Duration.zero) {
      return Future<T>.error(TimeoutException('API request exceeded ${timeout!.inMilliseconds}ms'));
    }
    return future.timeout(remaining);
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final startTime = DateTime.now();
    final requestId = DateTime.now().microsecondsSinceEpoch.toRadixString(16);
    http.StreamedResponse response;
    try {
      response = await _withTimeout(_inner.send(request), startTime);

      final bytes = await _withTimeout(response.stream.toBytes(), startTime);
      final duration = DateTime.now().difference(startTime).inMilliseconds;
      final responseBody = utf8.decode(bytes, allowMalformed: true);

      _sendLog(
        endpoint: request.url.toString(),
        method: request.method,
        statusCode: response.statusCode,
        durationMs: duration,
        responsePayload: responseBody,
        requestId: requestId,
        serverRequestId: response.headers['x-request-id'] ?? response.headers['cf-ray'],
      );

      return http.StreamedResponse(
        Stream.value(bytes),
        response.statusCode,
        contentLength: bytes.length,
        headers: response.headers,
        isRedirect: response.isRedirect,
        persistentConnection: response.persistentConnection,
        reasonPhrase: response.reasonPhrase,
        request: response.request,
      );
    } catch (e, stack) {
      final duration = DateTime.now().difference(startTime).inMilliseconds;
      _sendLog(
        endpoint: request.url.toString(),
        method: request.method,
        statusCode: e is TimeoutException ? 408 : 0,
        durationMs: duration,
        errorMessage: e.toString(),
        errorType: e is TimeoutException ? 'timeout' : 'network_error',
        errorCode: e.runtimeType.toString(),
        stackTrace: stack.toString(),
        requestId: requestId,
      );
      rethrow;
    }
  }

  void _sendLog({
    required String endpoint,
    required String method,
    required int statusCode,
    required int durationMs,
    String? responsePayload,
    String? errorMessage,
    String? errorType,
    String? errorCode,
    String? stackTrace,
    String? requestId,
    String? serverRequestId,
  }) {
    try {
      http.post(
        Uri.parse('${AppTelemetry.serverUrl}/logs'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'app_id': appId,
          'endpoint': endpoint,
          'method': method,
          'status_code': statusCode,
          'duration_ms': durationMs,
          'response_payload': responsePayload,
          'error_message': errorMessage,
          'error_type': errorType,
          'error_code': errorCode,
          'stack_trace': stackTrace,
          'request_id': requestId ?? DateTime.now().microsecondsSinceEpoch.toRadixString(16),
          'server_request_id': serverRequestId,
          'device_name': AppTelemetry.deviceName,
          if (AppTelemetry.userName != null && AppTelemetry.userName!.isNotEmpty)
            'user_name': AppTelemetry.userName,
        }),
      ).catchError((_) => http.Response('', 500));
    } catch (_) {}
  }
}
```

---

### 3. Cấu hình trong `lib/main.dart`
Trong hàm `main()`, hãy khởi tạo Telemetry và thiết lập bắt crash tự động:

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import 'app/core/utils/api_logger.dart'; // 👈 Đường dẫn file SDK

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Tự động nhận diện thiết bị và chuẩn bị Telemetry
  await AppTelemetry.initialize(appId: 'vn.fizahub.app');

  // 2. Bắt mọi lỗi render UI / Widget
  FlutterError.onError = (FlutterErrorDetails details) {
    AppTelemetry.recordCrash(
      exception: details.exception,
      stack: details.stack,
      isFatal: true,
    );
  };

  // 3. Bắt mọi lỗi Async / Future chưa try-catch
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
```

---

### 4. Gắn LoggingClient vào nơi gọi API (Service / Provider)
Bất kỳ service gọi HTTP nào trong app (ví dụ `AuthService`, `ApiService`...), hãy bọc `http.Client()` bằng `LoggingClient`:

```dart
import 'package:http/http.dart' as http;
import 'app/core/utils/api_logger.dart';

// Thay vì dùng http.Client() thông thường, hãy dùng LoggingClient:
final http.Client apiClient = LoggingClient(
  http.Client(),
  appId: 'vn.fizahub.app',
  timeout: const Duration(seconds: 15), // dùng đúng ngưỡng timeout của app
);

// Mọi lệnh gọi API qua apiClient này:
// final response = await apiClient.post(Uri.parse('...'), body: ...);
// -> Tự động gửi log kèm Tên thiết bị, Tên user, IP máy lên Dashboard!
```

---

### 5. Cập nhật Tên Người Dùng sau khi Đăng Nhập Thành Công
Khi người dùng đăng nhập thành công (trong Controller hoặc Service login), thêm đúng 1 dòng:

```dart
// Ví dụ sau khi parse UserModel thành công:
if (user != null) {
  // 👈 CẬP NHẬT TÊN USER VÀO TELEMETRY
  AppTelemetry.setUserName(user.ten); 
}
```
Kể từ thời điểm này trở đi, mọi API call sẽ tự động gắn tên người dùng (ví dụ: `Phạm Minh Hiếu`) cùng với Tên thiết bị (`iPhone 14 Pro`) và IP máy để bạn lọc dễ dàng trên Dashboard!
```
