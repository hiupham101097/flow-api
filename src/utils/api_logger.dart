import 'dart:convert';
import 'package:http/http.dart' as http;

/// API Monitor Logging Client for Gden (Flutter/Dart)
/// 
/// Instructions:
/// 1. Copy this file to `lib/app/data/services/api_logger.dart` inside Gden.
/// 2. Use `LoggingClient` instead of `http.Client()` in your repositories/services.
///    Example: `final http.Client _httpClient = LoggingClient(http.Client());`

class LoggingClient extends http.BaseClient {
  final http.Client _inner;
  final String appId;
  
  static const String _apiMonitorUrl = String.fromEnvironment(
    'API_MONITOR_URL',
    defaultValue: 'https://flow-api.hieupham101097.workers.dev',
  );
  final String _workerUrl = '$_apiMonitorUrl/logs';

  LoggingClient(this._inner, {this.appId = 'default_app'});

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final startTime = DateTime.now();
    
    try {
      final response = await _inner.send(request);
      final duration = DateTime.now().difference(startTime).inMilliseconds;

      _sendTelemetry(
        endpoint: request.url.toString(),
        method: request.method,
        statusCode: response.statusCode,
        errorMessage: response.statusCode >= 400 ? 'HTTP Error ${response.statusCode}' : null,
        durationMs: duration,
      );

      return response;
    } catch (e) {
      final duration = DateTime.now().difference(startTime).inMilliseconds;
      
      _sendTelemetry(
        endpoint: request.url.toString(),
        method: request.method,
        statusCode: 500,
        errorMessage: e.toString(),
        durationMs: duration,
      );
      
      rethrow;
    }
  }

  void _sendTelemetry({
    required String endpoint,
    required String method,
    required int statusCode,
    String? errorMessage,
    required int durationMs,
  }) {
    final payload = {
      'app_id': appId,
      'endpoint': endpoint,
      'method': method,
      'status_code': statusCode,
      'error_message': errorMessage,
      'duration_ms': durationMs,
    };

    // Send in background, do not await
    http.post(
      Uri.parse(_workerUrl),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    ).catchError((_) => http.Response('', 500)); // Ignore telemetry errors
  }
}
