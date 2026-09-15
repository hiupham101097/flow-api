/// Bộ đo luồng định danh (eKYC / eID / eKYB) cho app Flutter.
///
/// **Copy nguyên file này vào app** (ví dụ `lib/core/telemetry/kyc_funnel.dart`)
/// là chạy được ngay, không cần thêm thư viện nào ngoài `http`.
///
/// Vì sao phải có file này thay vì tự bắn event: dashboard flow-api gom số liệu
/// theo một giao kèo rất cụ thể - sáu tên sự kiện và bốn tên tham số. Gõ sai
/// một chữ là thống kê về 0 trong khi app vẫn chạy bình thường, không ai phát
/// hiện ra. File này giữ giao kèo đó ở một chỗ.
///
/// ---
///
/// ## Dùng trong 3 bước
///
/// ```dart
/// // 1. Khai báo một lần lúc mở app
/// KycFunnelReporter.configure(
///   baseUrl: 'https://flow-api.hieupham101097.workers.dev',
///   appId: 'com.cong.ty.app',       // khớp app_identifier trên dashboard
/// );
/// // Sau khi đăng nhập:
/// KycFunnelReporter.setUser(name: user.fullName, id: user.id);
///
/// // 2. Mỗi màn hình định danh giữ một funnel, sống đúng bằng vòng đời màn hình
/// final funnel = KycFunnel(key: KycFunnelKeys.ekyc, screenName: 'verify_flow');
///
/// @override
/// void initState() {
///   super.initState();
///   funnel.start(parameters: {'mode': 'eid'});
///   funnel.stepStarted(KycSteps.captureFront);
/// }
///
/// @override
/// void dispose() {
///   funnel.abandonIfOpen(reason: 'closed_flow'); // rời màn khi chưa xong = bỏ dở
///   super.dispose();
/// }
///
/// // 3. Đánh dấu từng bước
/// funnel.stepSucceeded(KycSteps.captureFront);
/// funnel.stepFailed(KycSteps.nfcRead, reason: 'tag_lost');
/// funnel.complete(KycOutcome.auto);   // xác thực xong
/// ```
///
/// ## Quy tắc phải nhớ
///
/// * Mỗi bước **bắt đầu một lần, chốt một lần**. Gọi `stepStarted` khi bước
///   đang dở sẽ bị bỏ qua (chống đếm trùng), nhưng sau khi bước đã chốt thì gọi
///   lại được - đúng với ca người dùng chụp lại ảnh.
/// * Chỉ gọi `complete` khi luồng thật sự kết thúc. Nộp hồ sơ hỏng mà người
///   dùng vẫn ở lại màn hình để sửa thì **đừng** đóng lượt thử: cứ để `dispose`
///   đóng bằng `abandoned`, server có cờ `infer_failed_from_steps` sẽ tự xếp
///   lượt "bỏ dở nhưng đã có bước lỗi" vào nhóm Thất bại.
/// * Tên bước nên lấy trong [KycSteps] để số liệu giữa các app so sánh được.
///   Bước riêng của app vẫn hiện trên dashboard, chỉ là xếp sau và mang nhãn
///   bằng chính tên khoá.
library;

import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

/// Tên các funnel định danh đã được seed sẵn trên server.
abstract final class KycFunnelKeys {
  /// Định danh cá nhân qua ảnh chụp giấy tờ (OCR + Face Matching)
  static const String ekyc = 'ekyc';

  /// Định danh cá nhân qua căn cước công dân gắn chip NFC (MRZ + NFC Chip)
  static const String eid = 'eid';

  /// Định danh doanh nghiệp.
  static const String ekyb = 'ekyb';
}

/// Từ vựng bước chuẩn, khớp `IDENTITY_STEP_LABELS` trong `src/worker.js`.
abstract final class KycSteps {
  // Chụp / thu thập ảnh
  static const String captureFront = 'capture_front';
  static const String captureBack = 'capture_back';
  static const String captureLicense = 'capture_license';
  static const String capturePortrait = 'capture_portrait';

  // Bóc tách dữ liệu
  static const String idOcr = 'id_ocr';
  static const String businessOcr = 'business_ocr';
  static const String mrzRead = 'mrz_read';
  static const String nfcRead = 'nfc_read';

  // Đối chiếu và gửi hồ sơ
  static const String faceMatch = 'face_match';
  static const String formReview = 'form_review';
  static const String kycSubmit = 'kyc_submit';
  static const String kybSubmit = 'kyb_submit';
}

/// Kết quả cuối của một lượt thử. Server chỉ phân loại đúng bốn giá trị này.
enum KycOutcome {
  /// Hệ thống duyệt tự động, người dùng không phải làm gì thêm.
  auto('auto'),

  /// Hồ sơ chuyển sang duyệt tay (OCR không đọc được, người dùng tự nhập).
  manual('manual'),

  /// Thất bại và người dùng dừng lại ở đó.
  failed('failed'),

  /// Người dùng bỏ dở giữa chừng.
  abandoned('abandoned');

  const KycOutcome(this.value);

  final String value;
}

/// Nơi nhận sự kiện. Mặc định là [KycFunnelReporter]; truyền hàm khác vào
/// [KycFunnel] khi viết test để kiểm tra đúng tên sự kiện và tham số.
typedef KycFunnelEmitter = void Function(
  String eventName,
  Map<String, Object?> parameters,
  String? screenName,
);

/// Cấu hình và gửi sự kiện lên `POST <baseUrl>/events`.
///
/// App nào đã có sẵn lớp telemetry riêng thì bỏ qua lớp này và truyền
/// `emitter` của mình vào [KycFunnel].
abstract final class KycFunnelReporter {
  static String _baseUrl = '';
  static String _appId = '';
  static String? _userName;
  static String? _userId;
  static String? _deviceName;

  /// Gọi một lần lúc mở app. Để [baseUrl] rỗng là tắt hẳn, không request nào
  /// rời máy - tiện cho build nội bộ hoặc môi trường test.
  static void configure({
    required String baseUrl,
    required String appId,
    String? deviceName,
  }) {
    _baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), '');
    _appId = appId;
    _deviceName = deviceName;
  }

  /// Gắn danh tính người dùng vào mọi sự kiện sau thời điểm đăng nhập.
  static void setUser({String? name, String? id}) {
    if (name != null && name.trim().isNotEmpty) _userName = name.trim();
    if (id != null && id.trim().isNotEmpty) _userId = id.trim();
  }

  static void clearUser() {
    _userName = null;
    _userId = null;
  }

  static void setDeviceName(String name) => _deviceName = name;

  static bool get isEnabled => _baseUrl.isNotEmpty && _appId.isNotEmpty;

  /// Gửi rồi quên. Telemetry hỏng không được phép làm hỏng luồng nghiệp vụ,
  /// nên mọi lỗi mạng ở đây đều bị nuốt có chủ đích.
  static void send(
    String eventName,
    Map<String, Object?> parameters,
    String? screenName,
  ) {
    if (!isEnabled) return;

    final payload = <String, Object?>{
      'app_id': _appId,
      'event_name': eventName,
      'event_type': 'funnel',
      'screen_name': screenName,
      'user_id': _userId,
      'parameters': parameters,
      if (_userName != null) 'user_name': _userName,
      if (_deviceName != null) 'device_name': _deviceName,
    };

    http
        .post(
          Uri.parse('$_baseUrl/events'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode(payload),
        )
        .timeout(const Duration(seconds: 10))
        .then((_) {}, onError: (Object _) {});
  }
}

/// Bộ đếm một lượt thử định danh.
///
/// Sáu sự kiện được sinh ra, `<key>` là [key]:
///
/// | Sự kiện | Tham số |
/// | --- | --- |
/// | `<key>_attempt_started`   | `attempt_id` |
/// | `<key>_step_started`      | `attempt_id`, `step` |
/// | `<key>_step_succeeded`    | `attempt_id`, `step`, `duration_ms` |
/// | `<key>_step_failed`       | `attempt_id`, `step`, `duration_ms`, `reason` |
/// | `<key>_fallback_manual`   | `attempt_id`, `reason` |
/// | `<key>_attempt_completed` | `attempt_id`, `outcome`, `duration_ms` |
///
/// Một lượt thử = một lần người dùng mở luồng cho tới khi nó kết thúc. Mọi sự
/// kiện trong cùng lượt mang chung `attempt_id` để server gom nhóm.
class KycFunnel {
  KycFunnel({
    required this.key,
    this.screenName,
    KycFunnelEmitter? emitter,
  }) : _emitter = emitter ?? KycFunnelReporter.send;

  /// Tiền tố sự kiện, xem [KycFunnelKeys].
  final String key;

  /// Màn hình gắn với luồng, hiện trên dashboard để lọc nhanh.
  final String? screenName;

  final KycFunnelEmitter _emitter;

  static final Random _random = Random();

  String? _attemptId;
  DateTime? _attemptStartedAt;
  final Map<String, DateTime> _stepStartedAt = {};

  /// Có lượt thử nào đang mở không.
  bool get isOpen => _attemptId != null;

  String? get attemptId => _attemptId;

  /// Mở một lượt thử mới. Lượt cũ còn dở thì đóng lại bằng `abandoned` để số
  /// liệu không treo vĩnh viễn ở trạng thái "đang dở".
  void start({Map<String, Object?>? parameters}) {
    if (isOpen) complete(KycOutcome.abandoned, reason: 'restarted');

    _attemptId = '$key-${DateTime.now().microsecondsSinceEpoch}-'
        '${_random.nextInt(0xFFFFFF).toRadixString(16)}';
    _attemptStartedAt = DateTime.now();
    _stepStartedAt.clear();

    _emit('attempt_started', parameters);
  }

  /// Bắt đầu một bước. Bước đang dở mà gọi lại thì bỏ qua: dashboard đếm
  /// `step_started` theo số sự kiện thô, bắn trùng sẽ thổi phồng tỷ lệ rơi.
  void stepStarted(String step, {Map<String, Object?>? parameters}) {
    if (!isOpen || _stepStartedAt.containsKey(step)) return;
    _stepStartedAt[step] = DateTime.now();
    _emit('step_started', {...?parameters, 'step': step});
  }

  void stepSucceeded(String step, {Map<String, Object?>? parameters}) {
    if (!isOpen) return;
    _emit('step_succeeded', {
      ...?parameters,
      'step': step,
      'duration_ms': _takeStepDuration(step),
    });
  }

  void stepFailed(
    String step, {
    String? reason,
    Object? errorCode,
    Map<String, Object?>? parameters,
  }) {
    if (!isOpen) return;
    _emit('step_failed', {
      ...?parameters,
      'step': step,
      'duration_ms': _takeStepDuration(step),
      if (reason != null) 'reason': _shortReason(reason),
      if (errorCode != null) 'error_code': errorCode,
    });
  }

  /// Luồng vẫn đi tiếp nhưng phải nhờ tới thao tác tay (ví dụ OCR không đọc
  /// được nên người dùng tự nhập). Đây là tín hiệu để tách nhóm "duyệt tay"
  /// khỏi nhóm "tự động" trên dashboard.
  void fallbackManual({String? reason, Map<String, Object?>? parameters}) {
    if (!isOpen) return;
    _emit('fallback_manual', {
      ...?parameters,
      if (reason != null) 'reason': _shortReason(reason),
    });
  }

  /// Đóng lượt thử. Gọi hai lần liên tiếp không sinh sự kiện trùng.
  void complete(
    KycOutcome outcome, {
    String? reason,
    Map<String, Object?>? parameters,
  }) {
    if (!isOpen) return;

    final startedAt = _attemptStartedAt;
    _emit('attempt_completed', {
      ...?parameters,
      'outcome': outcome.value,
      if (startedAt != null)
        'duration_ms': DateTime.now().difference(startedAt).inMilliseconds,
      if (reason != null) 'reason': _shortReason(reason),
    });

    _attemptId = null;
    _attemptStartedAt = null;
    _stepStartedAt.clear();
  }

  /// Dùng ở `dispose` / `onClose`: chỉ đóng khi lượt thử còn treo.
  void abandonIfOpen({String? reason}) {
    if (!isOpen) return;
    complete(KycOutcome.abandoned, reason: reason);
  }

  /// Sự kiện phụ không mang `step` nên không ảnh hưởng số liệu từng bước.
  void logStage(String suffix, {Map<String, Object?>? parameters}) {
    if (!isOpen) return;
    _emit(suffix, parameters);
  }

  int? _takeStepDuration(String step) {
    final startedAt = _stepStartedAt.remove(step);
    if (startedAt == null) return null;
    return DateTime.now().difference(startedAt).inMilliseconds;
  }

  /// Lý do lỗi đi vào cột "nguyên nhân" của dashboard nên phải ngắn và ổn
  /// định; thông báo lỗi dài nguyên bản làm vỡ bảng thống kê.
  static String _shortReason(String reason) {
    final cleaned = reason.replaceAll(RegExp(r'\s+'), ' ').trim();
    return cleaned.length <= 120 ? cleaned : '${cleaned.substring(0, 120)}...';
  }

  void _emit(String suffix, Map<String, Object?>? parameters) {
    final id = _attemptId;
    if (id == null) return;

    final payload = <String, Object?>{'attempt_id': id};
    parameters?.forEach((key, value) {
      if (value != null) payload[key] = value;
    });

    _emitter('${key}_$suffix', payload, screenName);
  }
}
