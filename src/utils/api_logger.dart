import 'dart:convert';
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

  LoggingClient(this._inner, {this.appId = 'default_app'});

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

  static void record({
    required String endpoint,
    required String method,
    required int statusCode,
    String? errorMessage,
    dynamic requestPayload,
    dynamic responsePayload,
    required int durationMs,
    String appId = 'default_app',
    String? serverUrl,
  }) {
    // Avoid sending excessively large payloads (> 200 KB)
    dynamic safeRequest = _sanitizePayload(requestPayload);
    dynamic safeResponse = _sanitizePayload(responsePayload);

    final targetUrl = serverUrl ?? '$defaultEndpoint/logs';

    final payload = {
      'app_id': appId,
      'endpoint': endpoint,
      'method': method.toUpperCase(),
      'status_code': statusCode,
      'error_message': errorMessage,
      'request_payload': safeRequest,
      'response_payload': safeResponse,
      'duration_ms': durationMs,
    };

    http
        .post(
          Uri.parse(targetUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(payload),
        )
        .catchError((_) => http.Response('', 500));
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
