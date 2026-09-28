import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:typed_data';
import 'package:http/http.dart' as http;

/// API Monitor Client for Flutter / Dart
///
/// Features:
/// 1. Transparently wraps `http.Client` without interrupting the response stream.
/// 2. Records Status 200 Response Data (JSON or text).
/// 3. Intelligently extracts error details for Status 400 (Client Errors / Validation)
///    and Status 500 (Server Crashes / Network Exceptions).
/// 4. Provides a standalone `ApiLogger.record()` method for use with Dio, Chopper,
///    or manual calls.
///
/// Usage with http:
/// ```dart
/// final http.Client client = LoggingClient(
///   http.Client(),
///   appId: 'gden_flutter_app',
/// );
/// final res = await client.get(Uri.parse('https://api.example.com/data'));
/// ```
///
/// Usage with Dio (Interceptor):
/// ```dart
/// dio.interceptors.add(InterceptorsWrapper(
///   onRequest: (options, handler) {
///     options.extra['startTime'] = DateTime.now();
///     return handler.next(options);
///   },
///   onResponse: (response, handler) {
///     final startTime = response.requestOptions.extra['startTime'] as DateTime?;
///     final duration = startTime != null
///         ? DateTime.now().difference(startTime).inMilliseconds
///         : 0;
///     ApiLogger.record(
///       endpoint: response.requestOptions.uri.toString(),
///       method: response.requestOptions.method,
///       statusCode: response.statusCode ?? 200,
///       requestPayload: response.requestOptions.data,
///       responsePayload: response.data,
///       durationMs: duration,
///     );
///     return handler.next(response);
///   },
///   onError: (DioException err, handler) {
///     final startTime = err.requestOptions.extra['startTime'] as DateTime?;
///     final duration = startTime != null
///         ? DateTime.now().difference(startTime).inMilliseconds
///         : 0;
///     ApiLogger.record(
///       endpoint: err.requestOptions.uri.toString(),
///       method: err.requestOptions.method,
///       statusCode: err.response?.statusCode ?? 500,
///       errorMessage: err.message ?? err.error?.toString(),
///       requestPayload: err.requestOptions.data,
///       responsePayload: err.response?.data,
///       durationMs: duration,
///     );
///     return handler.next(err);
///   },
/// ));
/// ```
class LoggingClient extends http.BaseClient {
  final http.Client _inner;
  final String appId;

  static const String _apiMonitorUrl = String.fromEnvironment(
    'API_MONITOR_URL',
    defaultValue: 'https://flow-api.hieupham101097.workers.dev',
  );

  final String? deviceName;
  final String? userName;

  LoggingClient(
    this._inner, {
    this.appId = 'default_app',
    this.deviceName,
    this.userName,
  });

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final startTime = DateTime.now();

    // Extract request payload if available
    dynamic requestPayload;
    if (request is http.Request && request.body.isNotEmpty) {
      try {
        requestPayload = jsonDecode(request.body);
      } catch (_) {
        requestPayload = request.body;
      }
    }

    try {
      final response = await _inner.send(request);
      final duration = DateTime.now().difference(startTime).inMilliseconds;

      // Read response stream without blocking the caller
      final Uint8List bytes = await response.stream.toBytes();

      // Decode response body string safely
      String? responseString;
      try {
        responseString = utf8.decode(bytes, allowMalformed: true);
      } catch (_) {
        responseString = '[Binary data: ${bytes.length} bytes]';
      }

      // Re-create the StreamedResponse so the original caller can still read it
      final clonedResponse = http.StreamedResponse(
        Stream<List<int>>.value(bytes),
        response.statusCode,
        contentLength: response.contentLength,
        request: response.request,
        headers: response.headers,
        isRedirect: response.isRedirect,
        persistentConnection: response.persistentConnection,
        reasonPhrase: response.reasonPhrase,
      );

      // Analyze response payload and errors
      dynamic parsedResponse;
      String? errorMessage;

      if (responseString.isNotEmpty) {
        try {
          parsedResponse = jsonDecode(responseString);
        } catch (_) {
          parsedResponse = responseString;
        }
      }

      if (response.statusCode >= 400) {
        errorMessage = _extractErrorMessage(
          statusCode: response.statusCode,
          reasonPhrase: response.reasonPhrase,
          parsedBody: parsedResponse,
          rawBody: responseString,
        );
      }

      // Dispatch telemetry asynchronously
      ApiLogger.record(
        endpoint: request.url.toString(),
        method: request.method,
        statusCode: response.statusCode,
        errorMessage: errorMessage,
        requestPayload: requestPayload,
        responsePayload: parsedResponse ?? responseString,
        durationMs: duration,
        appId: appId,
        deviceName: deviceName,
        userName: userName,
        serverUrl: '$_apiMonitorUrl/logs',
      );

      return clonedResponse;
    } catch (error) {
      final duration = DateTime.now().difference(startTime).inMilliseconds;

      ApiLogger.record(
        endpoint: request.url.toString(),
        method: request.method,
        statusCode: 500,
        errorMessage: error.toString(),
        requestPayload: requestPayload,
        responsePayload: null,
        durationMs: duration,
        appId: appId,
        deviceName: deviceName,
        userName: userName,
        serverUrl: '$_apiMonitorUrl/logs',
      );

      rethrow;
    }
  }

  static String _extractErrorMessage({
    required int statusCode,
    String? reasonPhrase,
    dynamic parsedBody,
    String? rawBody,
  }) {
    if (parsedBody is Map) {
      for (final key in [
        'message',
        'error',
        'msg',
        'detail',
        'description',
        'errorMessage',
        'title',
      ]) {
        if (parsedBody.containsKey(key) && parsedBody[key] != null) {
          final val = parsedBody[key];
          if (val is String && val.trim().isNotEmpty) {
            return val.trim();
          } else if (val is Map || val is List) {
            return jsonEncode(val);
          }
        }
      }
    }

    if (rawBody != null && rawBody.trim().isNotEmpty && rawBody.length < 300) {
      return rawBody.trim();
    }

    return 'HTTP Error $statusCode: ${reasonPhrase ?? (statusCode >= 500 ? 'Server Error' : 'Bad Request')}';
  }
}

/// Standalone logger helper for manual calls, Dio interceptors, or background jobs
class ApiLogger {
  static const String defaultEndpoint = String.fromEnvironment(
    'API_MONITOR_URL',
    defaultValue: 'https://flow-api.hieupham101097.workers.dev',
  );

  static final List<String> _piiKeys = [
    'password', 'pass', 'pwd', 'token', 'access_token', 'refresh_token',
    'authorization', 'bearer', 'secret', 'credit_card', 'card_number', 'cvv', 'pin', 'otp'
  ];

  /// Tự động lọc bỏ các trường nhạy cảm (PII / token / password / OTP)
  static dynamic maskPII(dynamic data) {
    if (data == null) return null;
    if (data is Map) {
      final sanitized = <String, dynamic>{};
      for (final entry in data.entries) {
        final keyStr = entry.key.toString().toLowerCase();
        if (_piiKeys.any((pii) => keyStr.contains(pii))) {
          sanitized[entry.key.toString()] = '[REDACTED]';
        } else {
          sanitized[entry.key.toString()] = maskPII(entry.value);
        }
      }
      return sanitized;
    }
    if (data is List) {
      return data.map((item) => maskPII(item)).toList();
    }
    if (data is String) {
      try {
        final decoded = jsonDecode(data);
        return jsonEncode(maskPII(decoded));
      } catch (_) {
        return data;
      }
    }
    return data;
  }

  // Batch buffer queue
  static final List<Map<String, dynamic>> _logBuffer = [];
  static final List<Map<String, dynamic>> _crashBuffer = [];
  static final List<Map<String, dynamic>> _eventBuffer = [];
  static Timer? _flushTimer;

  static void _scheduleFlush() {
    if (_flushTimer != null) return;
    _flushTimer = Timer(const Duration(milliseconds: 3500), () {
      flushBatch();
    });
  }

  /// Gom nhóm và gửi toàn bộ telemetry lên endpoint /telemetry/batch
  static Future<void> flushBatch([String? serverUrl]) async {
    _flushTimer?.cancel();
    _flushTimer = null;

    if (_logBuffer.isEmpty && _crashBuffer.isEmpty && _eventBuffer.isEmpty) {
      return;
    }

    final targetUrl = serverUrl ?? '$defaultEndpoint/telemetry/batch';
    final logsToSend = List<Map<String, dynamic>>.from(_logBuffer);
    final crashesToSend = List<Map<String, dynamic>>.from(_crashBuffer);
    final eventsToSend = List<Map<String, dynamic>>.from(_eventBuffer);

    _logBuffer.clear();
    _crashBuffer.clear();
    _eventBuffer.clear();

    final payload = {
      'app_identifier': AppTelemetry.appId,
      'device_name': AppTelemetry.deviceName,
      'user_name': AppTelemetry.userName,
      'logs': logsToSend,
      'crashes': crashesToSend,
      'events': eventsToSend,
    };

    try {
      await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      );
    } catch (_) {
      // Khi mất mạng hoặc timeout, giữ lại trong hàng đợi để flush lần sau
      if (_logBuffer.length < 100) _logBuffer.addAll(logsToSend);
      if (_crashBuffer.length < 50) _crashBuffer.addAll(crashesToSend);
      if (_eventBuffer.length < 100) _eventBuffer.addAll(eventsToSend);
    }
  }

  static void record({
    required String endpoint,
    required String method,
    required int statusCode,
    String? errorMessage,
    dynamic requestPayload,
    dynamic responsePayload,
    required int durationMs,
    String appId = 'default_app',
    String? deviceName,
    String? userName,
    String? serverUrl,
  }) {
    // Avoid sending excessively large payloads (> 200 KB) and mask PII
    dynamic safeRequest = maskPII(_sanitizePayload(requestPayload));
    dynamic safeResponse = maskPII(_sanitizePayload(responsePayload));

    final effectiveDevice = (deviceName != null && deviceName.isNotEmpty) ? deviceName : AppTelemetry.deviceName;
    final effectiveUser = (userName != null && userName.isNotEmpty) ? userName : AppTelemetry.userName;

    final logItem = {
      'app_identifier': appId,
      'endpoint': endpoint,
      'method': method.toUpperCase(),
      'status_code': statusCode,
      'error_message': errorMessage,
      'request_payload': safeRequest,
      'response_payload': safeResponse,
      'duration_ms': durationMs,
      if (effectiveDevice.isNotEmpty) 'device_name': effectiveDevice,
      if (effectiveUser != null && effectiveUser.isNotEmpty) 'user_name': effectiveUser,
    };

    _logBuffer.add(logItem);

    if (_logBuffer.length >= 10) {
      flushBatch(serverUrl);
    } else {
      _scheduleFlush();
    }
  }

  static dynamic _sanitizePayload(dynamic payload) {
    if (payload == null) return null;
    if (payload is String) {
      if (payload.length > 200000) {
        return '${payload.substring(0, 200000)}... [truncated]';
      }
      return payload;
    }
    try {
      final encoded = jsonEncode(payload);
      if (encoded.length > 200000) {
        return {'_warning': 'Payload exceeds 200KB limit and was truncated'};
      }
      return payload;
    } catch (_) {
      return payload.toString();
    }
  }
}

/// Telemetry helper for Firebase Crashlytics & Analytics dual-reporting
class AppTelemetry {
  static String _defaultAppId = 'default_app';
  static String? _deviceName;
  static String? _userName;
  static String get appId => _defaultAppId;
  static const String defaultEndpoint = String.fromEnvironment(
    'API_MONITOR_URL',
    defaultValue: 'https://flow-api.hieupham101097.workers.dev',
  );

  /// Khởi tạo mã App ID, Tên thiết bị và Tên người dùng cho toàn bộ telemetry
  static void initialize({
    required String appId,
    String? deviceName,
    String? userName,
  }) {
    _defaultAppId = appId;
    if (deviceName != null && deviceName.isNotEmpty) {
      _deviceName = deviceName;
    }
    if (userName != null && userName.isNotEmpty) {
      _userName = userName;
    }
  }

  /// Cập nhật tên thiết bị (ví dụ: 'iPhone 15 Pro', 'Samsung S24', 'Pixel 7'...)
  static void setDeviceName(String name) {
    _deviceName = name;
  }

  /// Cập nhật tên người dùng / tài khoản đăng nhập (ví dụ: 'Phạm Minh Hiếu', 'nguyen_van_a'...)
  static void setUserName(String name) {
    _userName = name;
  }

  static String? get userName => _userName;

  /// Lấy tên thiết bị (tự động nhận diện nếu chưa cấu hình thủ công)
  static String get deviceName {
    if (_deviceName != null && _deviceName!.isNotEmpty) {
      return _deviceName!;
    }
    return _resolveDeviceName();
  }

  static String _resolveDeviceName() {
    try {
      final os = Platform.operatingSystem;
      if (os.isNotEmpty) {
        final cap = '${os[0].toUpperCase()}${os.substring(1)}';
        return '$cap Device';
      }
    } catch (_) {}
    return 'Mobile Device';
  }

  /// Lấy tên hệ điều hành (Android / iOS / macOS / Windows / Linux)
  static String get osName {
    try {
      if (Platform.isAndroid) return 'Android';
      if (Platform.isIOS) return 'iOS';
      if (Platform.isWindows) return 'Windows';
      if (Platform.isMacOS) return 'macOS';
      if (Platform.isLinux) return 'Linux';
      return Platform.operatingSystem;
    } catch (_) {
      return 'Mobile';
    }
  }

  /// Lấy mã nền tảng (android / ios / windows...)
  static String get platformId {
    try {
      if (Platform.isAndroid) return 'android';
      if (Platform.isIOS) return 'ios';
      if (Platform.isWindows) return 'windows';
      if (Platform.isMacOS) return 'macos';
      if (Platform.isLinux) return 'linux';
      return Platform.operatingSystem.toLowerCase();
    } catch (_) {
      return 'mobile';
    }
  }

  /// Ghi nhận sự cố Crashlytics (Fatal Crash hoặc Non-fatal Exception)
  static void recordCrash({
    required dynamic exception,
    dynamic stack,
    bool isFatal = false,
    Map<String, dynamic>? deviceInfo,
    Map<String, dynamic>? customAttributes,
    String? appId,
    String? deviceName,
    String? serverUrl,
  }) {
    final targetUrl = serverUrl ?? '$defaultEndpoint/crashes';
    final effectiveAppId = appId ?? _defaultAppId;
    final effectiveDevice = deviceName ?? AppTelemetry.deviceName;

    final Map<String, dynamic> mergedDeviceInfo = Map.from(deviceInfo ?? {});
    if (!mergedDeviceInfo.containsKey('os')) {
      mergedDeviceInfo['os'] = osName;
    }
    if (!mergedDeviceInfo.containsKey('platform')) {
      mergedDeviceInfo['platform'] = platformId;
    }
    if (!mergedDeviceInfo.containsKey('device_name')) {
      mergedDeviceInfo['device_name'] = effectiveDevice;
    }

    final crashItem = {
      'app_identifier': effectiveAppId,
      'error_message': exception.toString(),
      'stack_trace': stack?.toString(),
      'is_fatal': isFatal ? 1 : 0,
      'device_info': ApiLogger.maskPII(mergedDeviceInfo),
      'os': osName,
      'platform': platformId,
      'custom_attributes': ApiLogger.maskPII(customAttributes),
    };

    ApiLogger._crashBuffer.add(crashItem);

    if (isFatal) {
      ApiLogger.flushBatch(serverUrl);
    } else if (ApiLogger._crashBuffer.length >= 5) {
      ApiLogger.flushBatch(serverUrl);
    } else {
      ApiLogger._scheduleFlush();
    }
  }

  /// Ghi nhận Sự kiện Analytics (Event tracking song song với Firebase Analytics)
  static void logEvent(
    String name, {
    Map<String, dynamic>? parameters,
    String? screenName,
    String? userId,
    Map<String, dynamic>? deviceInfo,
    String? deviceName,
    String? appId,
    String? serverUrl,
  }) {
    final effectiveAppId = appId ?? _defaultAppId;
    final effectiveDevice = deviceName ?? AppTelemetry.deviceName;

    final Map<String, dynamic> mergedDeviceInfo = Map.from(deviceInfo ?? {});
    if (!mergedDeviceInfo.containsKey('device_name')) {
      mergedDeviceInfo['device_name'] = effectiveDevice;
    }

    final eventItem = {
      'app_identifier': effectiveAppId,
      'event_name': name,
      'event_type': 'event',
      'screen_name': screenName,
      'user_id': userId,
      'parameters': ApiLogger.maskPII(parameters),
      'device_info': mergedDeviceInfo,
    };

    ApiLogger._eventBuffer.add(eventItem);

    if (ApiLogger._eventBuffer.length >= 10) {
      ApiLogger.flushBatch(serverUrl);
    } else {
      ApiLogger._scheduleFlush();
    }
  }

  /// Ghi nhận chuyển màn hình (Screen View)
  static void logScreenView(
    String screenName, {
    Map<String, dynamic>? parameters,
    String? userId,
    Map<String, dynamic>? deviceInfo,
    String? deviceName,
    String? appId,
    String? serverUrl,
  }) {
    final targetUrl = serverUrl ?? '$defaultEndpoint/events';
    final effectiveAppId = appId ?? _defaultAppId;
    final effectiveDevice = deviceName ?? AppTelemetry.deviceName;

    final Map<String, dynamic> mergedDeviceInfo = Map.from(deviceInfo ?? {});
    if (!mergedDeviceInfo.containsKey('device_name')) {
      mergedDeviceInfo['device_name'] = effectiveDevice;
    }

    final payload = {
      'app_id': effectiveAppId,
      'event_name': 'screen_view',
      'event_type': 'screen_view',
      'screen_name': screenName,
      'user_id': userId,
      'parameters': parameters,
      'device_info': mergedDeviceInfo,
    };

    http
        .post(
          Uri.parse(targetUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(payload),
        )
        .catchError((_) => http.Response('', 500));
  }

  /// Gửi gói Telemetry hàng loạt (Batch Ingestion) tới server để giảm 90% HTTP requests
  static Future<bool> sendBatch({
    List<Map<String, dynamic>> logs = const [],
    List<Map<String, dynamic>> crashes = const [],
    List<Map<String, dynamic>> events = const [],
    String? appId,
    String? serverUrl,
  }) async {
    final targetUrl = serverUrl ?? '$defaultEndpoint/telemetry/batch';
    final effectiveAppId = appId ?? _defaultAppId;
    try {
      final res = await http.post(
        Uri.parse(targetUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'app_id': effectiveAppId,
          'device_name': AppTelemetry.deviceName,
          'user_name': AppTelemetry.userName,
          'logs': logs,
          'crashes': crashes,
          'events': events,
        }),
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}

