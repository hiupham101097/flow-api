import 'dart:convert';
import 'package:http/http.dart' as http;

/// API Monitor client for Flutter.
///
/// Set the endpoint at build time:
/// flutter run --dart-define=API_MONITOR_URL=https://flow-api.hieupham101097.workers.dev
class LoggingClient extends http.BaseClient {
  final http.Client _inner;

  static const String _apiMonitorUrl = String.fromEnvironment(
    'API_MONITOR_URL',
    defaultValue: 'https://flow-api.hieupham101097.workers.dev',
  );

  final String _workerUrl = '$_apiMonitorUrl/logs';

  LoggingClient(this._inner);

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
        errorMessage: response.statusCode >= 400
            ? 'HTTP Error ${response.statusCode}'
            : null,
        durationMs: duration,
      );

      return response;
    } catch (error) {
      final duration = DateTime.now().difference(startTime).inMilliseconds;

      _sendTelemetry(
        endpoint: request.url.toString(),
        method: request.method,
        statusCode: 500,
        errorMessage: error.toString(),
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
      'endpoint': endpoint,
      'method': method,
      'status_code': statusCode,
      'error_message': errorMessage,
      'duration_ms': durationMs,
    };

    http
        .post(
          Uri.parse(_workerUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode(payload),
        )
        .catchError((_) => http.Response('', 500));
  }
}
