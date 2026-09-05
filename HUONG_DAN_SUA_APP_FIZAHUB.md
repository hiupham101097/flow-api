# 🚀 Hướng Dẫn Sửa Lỗi Login, Tích Hợp Telemetry & Cấu Hình WebView 60 FPS Cho App Fizahub

> 🎯 **Mục tiêu:** Tài liệu này được thiết kế theo dạng **"Cầm tay chỉ việc"** cho dự án Flutter **Fizahub** (`F:\job\fizahub`). 
> Bất kỳ ai, dù mới làm quen với Flutter, chỉ cần làm đúng **5 bước tuần tự** bên dưới là app sẽ chạy mượt mà, không bao giờ bị crash khi login, có telemetry theo dõi lỗi và WebView cuộn 60 FPS không giựt lag.

---

## 📋 BẢNG TỔNG HỢP CÔNG VIỆC CẦN LÀM (LÀM TRONG 5 PHÚT)

| Bước | File cần thao tác trong App Fizahub | Thao tác cần làm | Kết quả đạt được |
| :--- | :--- | :--- | :--- |
| **Bước 1** | `lib/core/api_logger.dart` | Tạo file và dán code SDK | Có sẵn bộ ghi log, crash & sự kiện |
| **Bước 2** | `lib/models/user_model.dart` | Thay thế toàn bộ bằng code model chuẩn | Hết 100% lỗi crash TypeError khi login |
| **Bước 3** | File chứa hàm Login (`auth_service.dart`) | Thay hàm `login()` bằng hàm chuẩn | Đăng nhập thành công, tự đẩy log lên Web |
| **Bước 4** | `lib/main.dart` | Thêm hook trong hàm `main()` | Bắt lỗi sập app (Crashlytics) tự động |
| **Bước 5** | Màn hình WebView (nếu có dùng) | Cấu hình WebView chuẩn 60 FPS | Vuốt lướt mượt, không giựt lag |

---

## 🛠️ CHI TIẾT TỪNG BƯỚC THỰC HIỆN

### BƯỚC 1: Tạo File SDK Telemetry Dùng Chung

* 📂 **Vị trí file:** Tạo file mới tại `lib/core/api_logger.dart` (Nếu chưa có thư mục `core` trong `lib/`, hãy tạo thư mục `core`).
* 🎯 **Thao tác:** Copy toàn bộ file có sẵn từ dự án `flow-api` tại đường dẫn:
  👉 `F:\job\flow-api\public\flutter\api_logger.dart`
  và dán vào file `lib/core/api_logger.dart` của bạn.

> 💡 *Nếu muốn copy nhanh, code file này như sau:*

```dart
// lib/core/api_logger.dart
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

class AppTelemetry {
  static String? _appId;
  static String _serverUrl = 'https://flow-api.hieupham101097.workers.dev';

  static void initialize({required String appId, String? serverUrl}) {
    _appId = appId;
    if (serverUrl != null && serverUrl.isNotEmpty) {
      _serverUrl = serverUrl;
    }
  }

  static String get appId => _appId ?? 'vn.fizahub.app';
  static String get serverUrl => _serverUrl;

  // Ghi nhận lỗi Crash / Exception (Thay thế hoặc chạy song song Firebase Crashlytics)
  static Future<void> recordCrash({
    required dynamic exception,
    StackTrace? stack,
    bool isFatal = false,
    Map<String, dynamic>? deviceInfo,
  }) async {
    try {
      final payload = {
        'app_id': appId,
        'error_message': exception.toString(),
        'stack_trace': stack?.toString() ?? '',
        'is_fatal': isFatal ? 1 : 0,
        'device_info': deviceInfo ?? {},
      };

      http.post(
        Uri.parse('$serverUrl/crashes'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).catchError((_) => http.Response('', 500));
    } catch (_) {}
  }

  // Ghi nhận sự kiện người dùng (Thay thế hoặc chạy song song Firebase Analytics)
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
      };

      http.post(
        Uri.parse('$serverUrl/events'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).catchError((_) => http.Response('', 500));
    } catch (_) {}
  }

  // Ghi nhận chuyển màn hình (Screen View)
  static Future<void> logScreenView(
    String screenName, {
    Map<String, dynamic>? parameters,
    String? userId,
  }) async {
    try {
      final payload = {
        'app_id': appId,
        'event_name': 'screen_view',
        'event_type': 'screen_view',
        'screen_name': screenName,
        'parameters': parameters ?? {},
        'user_id': userId,
      };

      http.post(
        Uri.parse('$serverUrl/events'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).catchError((_) => http.Response('', 500));
    } catch (_) {}
  }
}

// Client HTTP tự động gửi log mỗi khi app gọi API
class LoggingClient extends http.BaseClient {
  final http.Client _inner;
  final String appId;
  final String serverUrl;

  LoggingClient(
    this._inner, {
    this.appId = 'vn.fizahub.app',
    this.serverUrl = 'https://flow-api.hieupham101097.workers.dev',
  });

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final startTime = DateTime.now();
    http.StreamedResponse response;
    try {
      response = await _inner.send(request);
      final duration = DateTime.now().difference(startTime).inMilliseconds;

      final bytes = await response.stream.toBytes();
      final responseBody = utf8.decode(bytes, allowMalformed: true);

      // Gửi log bất đồng bộ lên Cloudflare, không làm chậm app
      _sendLog(
        endpoint: request.url.toString(),
        method: request.method,
        statusCode: response.statusCode,
        durationMs: duration,
        responsePayload: responseBody,
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
        statusCode: 500,
        durationMs: duration,
        errorMessage: e.toString(),
      );
      AppTelemetry.recordCrash(exception: e, stack: stack, isFatal: false);
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
  }) {
    try {
      http.post(
        Uri.parse('$serverUrl/logs'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'app_id': appId,
          'endpoint': endpoint,
          'method': method,
          'status_code': statusCode,
          'duration_ms': durationMs,
          'response_payload': responsePayload,
          'error_message': errorMessage,
        }),
      ).catchError((_) => http.Response('', 500));
    } catch (_) {}
  }
}
```

---

### BƯỚC 2: Cập Nhật File Model `user_model.dart` (Chống Crash 100%)

* 📂 **Vị trí file:** Mở file `lib/models/user_model.dart` trong project Fizahub.
* 🎯 **Thao tác:** Xóa sạch toàn bộ nội dung cũ trong file đó và dán toàn bộ đoạn code dưới đây vào.
* ❓ **Tại sao phải làm vậy?** 
  Backend trả về `id: "266"` (chuỗi String) chứ không phải số `int`, và object `ATM` chứa các giá trị `null`. Model cũ của bạn ép kiểu số nguyên hoặc không cho phép null nên app bị văng (TypeError crash) ngay khi vừa nhận phản hồi thành công từ server!

```dart
// lib/models/user_model.dart

class UserModel {
  final String id;
  final String? idkey;
  final String? reflink;
  final String? qrReflink;
  final String? maGioiThieu;
  final String? ten;
  final String? hinh;
  final String? chuKy;
  final String? diaChi;
  final String? email;
  final String? cccd;
  final String? gioiTinh;
  final String? ngaySinh;
  final String? dienThoai;
  final bool ekyc;
  final bool ekyb;
  final bool ekyd;
  final DataCccdModel? dataCccd;
  final AtmModel? atm;
  final bool noKho;
  final String? role;
  final String? idToChucBhxh;
  final String? idTransactionBhxh;
  final String? dangKyMaSoMaVach;
  final String? listIdShop; // Chuỗi dạng "252,297"
  final String? linkExcelImportMatHang;

  UserModel({
    required this.id,
    this.idkey,
    this.reflink,
    this.qrReflink,
    this.maGioiThieu,
    this.ten,
    this.hinh,
    this.chuKy,
    this.diaChi,
    this.email,
    this.cccd,
    this.gioiTinh,
    this.ngaySinh,
    this.dienThoai,
    this.ekyc = false,
    this.ekyb = false,
    this.ekyd = false,
    this.dataCccd,
    this.atm,
    this.noKho = false,
    this.role,
    this.idToChucBhxh,
    this.idTransactionBhxh,
    this.dangKyMaSoMaVach,
    this.listIdShop,
    this.linkExcelImportMatHang,
  });

  // Chuyển chuỗi "252,297" thành danh sách List<String> an toàn
  List<String> get shopIds =>
      listIdShop?.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList() ?? [];

  factory UserModel.fromJson(Map<String, dynamic>? json) {
    if (json == null) return UserModel(id: '');

    return UserModel(
      // An toàn tuyệt đối: Dù server trả về int 266 hay chuỗi "266" đều không bị crash
      id: json['id']?.toString() ?? '',
      idkey: json['idkey']?.toString(),
      reflink: json['reflink']?.toString(),
      qrReflink: json['QRreflink']?.toString(),
      maGioiThieu: json['maGioiThieu']?.toString(),
      ten: json['ten']?.toString(),
      hinh: json['hinh']?.toString(),
      chuKy: json['chuKy']?.toString(),
      diaChi: json['diaChi']?.toString(),
      email: json['email']?.toString(),
      cccd: json['CCCD']?.toString(),
      gioiTinh: json['gioiTinh']?.toString(),
      ngaySinh: json['ngaySinh']?.toString(),
      dienThoai: json['dienThoai']?.toString(),
      ekyc: json['EKYC'] == true || json['EKYC'] == 1 || json['EKYC'] == 'true',
      ekyb: json['EKYB'] == true || json['EKYB'] == 1 || json['EKYB'] == 'true',
      ekyd: json['EKYD'] == true || json['EKYD'] == 1 || json['EKYD'] == 'true',
      dataCccd: json['data_cccd'] != null ? DataCccdModel.fromJson(json['data_cccd']) : null,
      atm: json['ATM'] != null ? AtmModel.fromJson(json['ATM']) : null,
      noKho: json['noKho'] == true || json['noKho'] == 1 || json['noKho'] == 'true',
      role: json['role']?.toString(),
      idToChucBhxh: json['idToChucBHXH']?.toString(),
      idTransactionBhxh: json['idTransactionBHXH']?.toString(),
      dangKyMaSoMaVach: json['dangKyMaSoMaVach']?.toString(),
      listIdShop: json['listIdShop']?.toString(),
      linkExcelImportMatHang: json['linkExcelImportMatHang']?.toString(),
    );
  }
}

class DataCccdModel {
  final String? cccd;
  final String? noiCap;
  final String? ngayCap;
  final String? ngayKt;
  final int ekyc;
  final String? ekycPhanHoi;
  final String? ekycNgay;
  final String? eid;
  final String? eidNgay;
  final String? hinhChinh;
  final String? cccdTruoc;
  final String? cccdSau;

  DataCccdModel({
    this.cccd,
    this.noiCap,
    this.ngayCap,
    this.ngayKt,
    this.ekyc = 0,
    this.ekycPhanHoi,
    this.ekycNgay,
    this.eid,
    this.eidNgay,
    this.hinhChinh,
    this.cccdTruoc,
    this.cccdSau,
  });

  factory DataCccdModel.fromJson(Map<String, dynamic>? json) {
    if (json == null) return DataCccdModel();

    return DataCccdModel(
      cccd: json['cccd']?.toString(),
      noiCap: json['noicap']?.toString(),
      ngayCap: json['ngaycap']?.toString(),
      ngayKt: json['ngaykt']?.toString(),
      ekyc: int.tryParse(json['ekyc']?.toString() ?? '') ?? 0,
      ekycPhanHoi: json['ekyc_phanhoi']?.toString(),
      ekycNgay: json['ekyc_ngay']?.toString(),
      eid: json['eid']?.toString(),
      eidNgay: json['eid_ngay']?.toString(),
      hinhChinh: json['hinhChinh']?.toString(),
      cccdTruoc: json['CCCDTruoc']?.toString(),
      cccdSau: json['CCCDSau']?.toString(),
    );
  }
}

class AtmModel {
  final String? tenTaiKhoan;
  final String? soTaiKhoan;
  final String? maBank;
  final String? qrBank;

  AtmModel({
    this.tenTaiKhoan,
    this.soTaiKhoan,
    this.maBank,
    this.qrBank,
  });

  factory AtmModel.fromJson(Map<String, dynamic>? json) {
    if (json == null) return AtmModel();

    return AtmModel(
      tenTaiKhoan: json['tenTaiKhoan']?.toString(),
      soTaiKhoan: json['soTaiKhoan']?.toString(),
      maBank: json['maBank']?.toString(),
      qrBank: json['qrBank']?.toString(),
    );
  }
}
```

---

### BƯỚC 3: Sửa Hàm Gọi API Đăng Nhập Trong App

* 📂 **Vị trí file:** Mở file bạn đang gọi API Login trong App (ví dụ: `lib/services/auth_service.dart` hoặc `lib/controllers/login_controller.dart`).
* 🎯 **Thao tác:** Thay thế hàm `login` cũ của bạn bằng đoạn code chuẩn sau:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/api_logger.dart'; // File vừa tạo ở Bước 1
import '../models/user_model.dart'; // File vừa sửa ở Bước 2

// Khởi tạo LoggingClient với appId của Fizahub
final http.Client apiClient = LoggingClient(
  http.Client(),
  appId: 'vn.fizahub.app', // Tự động đẩy log về Web Flow API cho bạn
);

Future<UserModel?> login({
  required String phone,
  required String password,
}) async {
  try {
    final url = Uri.parse('https://fizahub.vn/api/users/login'); // Đúng URL login của bạn

    final response = await apiClient.post(
      url,
      // Lưu ý: Nếu server đọc $_POST (form-data), dùng Map thông thường:
      body: {
        'dienThoai': phone,
        'matKhau': password,
      },
      // Nếu server đọc JSON thô thì mới dùng dòng dưới:
      // headers: {'Content-Type': 'application/json'},
      // body: jsonEncode({'dienThoai': phone, 'matKhau': password}),
    );

    print('👉 HTTP Status: ${response.statusCode}');

    if (response.statusCode == 200) {
      final Map<String, dynamic> jsonResponse = jsonDecode(response.body);

      // Kiểm tra thành công
      if (jsonResponse['status'] == 'success' || jsonResponse['code'] == 200) {
        // ⚠️ ĐIỂM QUAN TRỌNG NHẤT: Dữ liệu user nằm trong trường 'data'
        final userDataMap = jsonResponse['data'] as Map<String, dynamic>;
        final user = UserModel.fromJson(userDataMap);

        print('✅ Đăng nhập thành công: ${user.ten} (ID: ${user.id})');

        // Ghi nhận sự kiện đăng nhập thành công vào Analytics
        AppTelemetry.logEvent('login_success', userId: user.id, parameters: {
          'phone': phone,
          'user_name': user.ten,
        });

        return user;
      } else {
        print('❌ Server từ chối: ${jsonResponse['message']}');
        return null;
      }
    } else {
      print('❌ HTTP Error: ${response.statusCode}');
      return null;
    }
  } catch (e, stackTrace) {
    print('🔥 Exception khi login: $e');
    // Tự động đẩy lỗi về tab Crashlytics trên Web để bạn xem
    AppTelemetry.recordCrash(
      exception: e,
      stack: stackTrace,
      isFatal: false,
    );
    return null;
  }
}
```

---

### BƯỚC 4: Bật Tự Động Bắt Sập App (Crashlytics) Trong `main.dart`

* 📂 **Vị trí file:** Mở file `lib/main.dart`.
* 🎯 **Thao tác:** 
  1. Thêm import: `import 'core/api_logger.dart';` ở đầu file `main.dart`.
  2. Tại hàm `void main() async`, thêm 3 hook bắt lỗi ngay trước dòng `runApp(...)`.

```dart
// lib/main.dart
import 'dart:ui';
import 'package:flutter/material.dart';
import 'core/api_logger.dart'; // 👈 Import file Bước 1

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Khởi tạo Telemetry cho Fizahub
  AppTelemetry.initialize(appId: 'vn.fizahub.app');

  // 2. Tự động bắt mọi lỗi Flutter Render / Widget
  FlutterError.onError = (FlutterErrorDetails details) {
    AppTelemetry.recordCrash(
      exception: details.exception,
      stack: details.stack,
      isFatal: true,
      deviceInfo: {'app': 'vn.fizahub.app', 'type': 'flutter_error'},
    );
  };

  // 3. Tự động bắt mọi lỗi Bất đồng bộ (Async Error)
  PlatformDispatcher.instance.onError = (error, stack) {
    AppTelemetry.recordCrash(
      exception: error,
      stack: stack,
      isFatal: true,
      deviceInfo: {'app': 'vn.fizahub.app', 'type': 'async_error'},
    );
    return true;
  };

  runApp(const MyApp());
}
```

> 🎯 **Kết quả:** Từ bây giờ, bất kỳ khi nào app bị văng hay gặp exception, toàn bộ **Stack Trace** (dòng code bị lỗi) sẽ lập tức xuất hiện tại tab **💥 Crashlytics** trên Web:
> 👉 `https://flow-api.hieupham101097.workers.dev/admin/dashboard`

---

### BƯỚC 5: Cấu Hình Màn Hình WebView Mượt 60 FPS (Không Giựt Lag)

Nếu trong App Fizahub bạn có mở trang Web Dashboard hoặc bất kỳ trang Web nào qua WebView:

#### 1. Bật Tăng Tốc Phần Cứng trong Android (Bắt buộc):
Mở file `android/app/src/main/AndroidManifest.xml`, thêm `android:hardwareAccelerated="true"` vào thẻ `<application>` và `<activity>`:
```xml
<application
    android:label="Fizahub"
    android:hardwareAccelerated="true"> <!-- 👈 Thêm dòng này -->
    
    <activity
        android:name=".MainActivity"
        android:hardwareAccelerated="true" <!-- 👈 Thêm dòng này -->
        ...>
```

#### 2. Tạo File Màn Hình WebView Mượt Mà 60 FPS:
* 📂 Tạo file: `lib/screens/monitor_webview_screen.dart`
* 🎯 Dán nguyên đoạn code hoàn chỉnh bên dưới:

```dart
// lib/screens/monitor_webview_screen.dart
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

class MonitorWebViewScreen extends StatefulWidget {
  final String url;
  final String title;

  const MonitorWebViewScreen({
    super.key,
    this.url = 'https://flow-api.hieupham101097.workers.dev/admin/dashboard',
    this.title = 'Giám sát Telemetry',
  });

  @override
  State<MonitorWebViewScreen> createState() => _MonitorWebViewScreenState();
}

class _MonitorWebViewScreenState extends State<MonitorWebViewScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();

    final WebViewController controller = WebViewController();

    controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF070C12)) // Màu nền tối tránh chớp sáng
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            if (mounted) setState(() => _isLoading = false);
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));

    // Tối ưu riêng cho thiết bị Android
    if (controller.platform is AndroidWebViewController) {
      final androidController = controller.platform as AndroidWebViewController;
      androidController.setMediaPlaybackRequiresUserGesture(false);
    }

    _controller = controller;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF070C12),
      appBar: AppBar(
        title: Text(widget.title, style: const TextStyle(fontSize: 16, color: Colors.white)),
        backgroundColor: const Color(0xFF0D151F),
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => _controller.reload(),
            tooltip: 'Tải lại trang',
          ),
        ],
      ),
      body: Stack(
        children: [
          WebViewWidget(
            controller: _controller,
            // ⚠️ MẤU CHỐT 60 FPS: EagerGestureRecognizer giúp WebView chiếm trọn cử chỉ vuốt,
            // triệt tiêu xung đột với cuộn của Flutter, giúp cuộn bảng mượt như native.
            gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
              Factory<OneSequenceGestureRecognizer>(
                () => EagerGestureRecognizer(),
              ),
            },
          ),
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(color: Color(0xFF7D9CFF)),
            ),
        ],
      ),
    );
  }
}
```

#### 3. Cách mở màn hình này từ bất kỳ đâu trong app:
```dart
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (context) => const MonitorWebViewScreen(),
  ),
);
```

---

## 🎯 KIỂM TRA KẾT QUẢ TRÊN WEB DASHBOARD

Sau khi hoàn thành các bước trên và chạy app:
1. Mở trình duyệt vào: 👉 **https://flow-api.hieupham101097.workers.dev/admin/dashboard**
2. Quan sát 3 mục:
   * **📡 API Logs**: Thấy cuộc gọi login mã **200 OK**, thời gian chạy (ms) và dữ liệu trả về.
   * **💥 Crashlytics**: Nếu app gặp lỗi, bạn bấm vào nút **"Stack Trace"** để xem ngay lỗi ở file nào, dòng bao nhiêu.
   * **📈 Analytics & Sự kiện**: Thấy sự kiện `login_success` cùng thông tin người dùng vừa đăng nhập.
