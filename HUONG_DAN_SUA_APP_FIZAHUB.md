# 🚀 Hướng dẫn sửa lỗi Login & Tích hợp Telemetry cho App Fizahub

Tài liệu này được tạo để bạn áp dụng trực tiếp vào dự án Flutter **Fizahub** (`F:\job\fizahub`).

---

## PHẦN 1: TẠI SAO POSTMAN ĐĂNG NHẬP ĐƯỢC MÀ APP LẠI BỊ LỖI?

Dựa vào JSON thực tế bạn đăng nhập trên Postman:
```json
{
  "status": "success",
  "code": 200,
  "message": "Đăng nhập thành công",
  "data": {
    "id": "266",               <-- ⚠️ Chuỗi String, không phải int
    "ATM": {
      "tenTaiKhoan": null,     <-- ⚠️ Bị null, nếu model không để String? sẽ crash
      "soTaiKhoan": null,      <-- ⚠️ Bị null
      "maBank": null,          <-- ⚠️ Bị null
      "qrBank": "https://..."
    },
    "listIdShop": "252,297",   <-- ⚠️ Chuỗi String, không phải List<int>
    "EKYC": true,              <-- boolean
    "data_cccd": {
      "ekyc": 4                <-- ⚠️ Ở đây lại là số int 4
    }
  }
}
```

👉 **Nguyên nhân:** Model hiện tại trong App của bạn bị **Crash Exception (TypeError)** khi parse JSON vì:
1. Trường `id` trả về là chuỗi `"266"` nhưng trong model khai báo `int id`.
2. Object `ATM` trả về các giá trị `null` nhưng model khai báo non-nullable.
3. Lấy trực tiếp `response.body` thay vì lấy từ `json['data']`.

---

## PHẦN 2: FILE MODEL DART CHUẨN (CRASH-PROOF 100%)

Bạn tạo hoặc thay thế file model trong project Flutter của bạn (ví dụ: `lib/models/user_model.dart`):

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

  // Hàm chuyển listIdShop thành danh sách List<String> an toàn khi cần dùng
  List<String> get shopIds =>
      listIdShop?.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList() ?? [];

  factory UserModel.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return UserModel(id: '');
    }

    return UserModel(
      // An toàn tuyệt đối: Dù backend trả về int 266 hay String "266" đều không bị crash
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
      // Cho phép null an toàn tuyệt đối
      tenTaiKhoan: json['tenTaiKhoan']?.toString(),
      soTaiKhoan: json['soTaiKhoan']?.toString(),
      maBank: json['maBank']?.toString(),
      qrBank: json['qrBank']?.toString(),
    );
  }
}
```

---

## PHẦN 3: SỬA HÀM GỌI API LOGIN TRONG APP

Trong file xử lý Login của bạn (ví dụ: `auth_service.dart` hoặc `login_controller.dart`):

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'user_model.dart';

Future<UserModel?> login({
  required String phone,
  required String password,
  required http.Client client,
}) async {
  try {
    final url = Uri.parse('https://fizahub.vn/api/users/login'); // Thay đúng URL login của bạn

    final response = await client.post(
      url,
      // ⚠️ Lưu ý: Nếu server đọc $_POST, dùng body dạng Map thông thường:
      body: {
        'dienThoai': phone,
        'matKhau': password,
      },
      // Nếu server đọc JSON raw thì mới dùng jsonEncode:
      // headers: {'Content-Type': 'application/json'},
      // body: jsonEncode({'dienThoai': phone, 'matKhau': password}),
    );

    print('👉 HTTP Status: ${response.statusCode}');
    print('👉 Response Body: ${response.body}');

    if (response.statusCode == 200) {
      final Map<String, dynamic> jsonResponse = jsonDecode(response.body);

      // Kiểm tra status từ backend
      if (jsonResponse['status'] == 'success' || jsonResponse['code'] == 200) {
        // ⚠️ QUAN TRỌNG NHẤT: Phải lấy từ field ['data']
        final userDataMap = jsonResponse['data'] as Map<String, dynamic>;
        final user = UserModel.fromJson(userDataMap);

        print('✅ Đăng nhập thành công: ${user.ten} (ID: ${user.id})');
        return user;
      } else {
        print('❌ Lỗi từ server: ${jsonResponse['message']}');
        return null;
      }
    } else {
      print('❌ HTTP Error: ${response.statusCode}');
      return null;
    }
  } catch (e, stackTrace) {
    print('🔥 Exception khi login: $e');
    print('📍 StackTrace: $stackTrace');
    return null;
  }
}
```

---

## PHẦN 4: TÍCH HỢP FLOW API TELEMETRY (ĐÃ CẤU HÌNH SẴN `vn.fizahub.app`)

Hệ thống Flow API trên Cloudflare của bạn đã được cấu hình sẵn:
* **Tài khoản**: Phạm Minh Hiếu
* **Mục tiêu**: Fizahub Mobile App
* **App ID**: `vn.fizahub.app`

### Cách gắn vào App Fizahub:

1. Copy file `public/flutter/api_logger.dart` từ project `flow-api` sang `lib/core/api_logger.dart` của app Fizahub.
2. Khởi tạo `LoggingClient` với `appId: 'vn.fizahub.app'`:

```dart
import 'package:http/http.dart' as http;
import 'core/api_logger.dart';

// Khởi tạo client dùng chung cho toàn bộ app
final http.Client apiClient = LoggingClient(
  http.Client(),
  appId: 'vn.fizahub.app', // 👈 Tự động map về tài khoản Phạm Minh Hiếu
);

// Khi gọi API đăng nhập:
final user = await login(
  phone: '0394264400',
  password: '***',
  client: apiClient, // 👈 Truyền client này vào
);
```

### Kết quả trên Dashboard:
Toàn bộ log gọi API login, mã 200 OK, thời gian phản hồi (ms) và dữ liệu sẽ lập tức xuất hiện theo thời gian thực tại:
👉 **https://flow-api.hieupham101097.workers.dev/admin/dashboard** (mục theo dõi: `Fizahub Mobile App`).

---

## PHẦN 5: CƠ CHẾ LƯU THEO APPLICATION ID & TỰ ĐỘNG HÓA KHI CÓ NHIỀU APP

### 1. Cơ chế lưu của Flow API:
* Khi app gửi log lên Flow API, trường `appId` (ví dụ: `vn.fizahub.app`) sẽ được lưu vào cột **`app_identifier`** trong database.
* Flow API tự động so khớp `app_identifier` với bảng **Jobs** để phân loại log về đúng User và đúng App/Web đó.
* Log của các app khác nhau hoàn toàn độc lập, không bị lẫn lộn dữ liệu.

### 2. Tự động lấy `applicationId` trong App (Không cần gõ tay cứng chuỗi):
Để code dùng chung cho nhiều app mà không sợ gõ nhầm ID, bạn dùng package `package_info_plus`:

1. Thêm vào `pubspec.yaml` của App:
```yaml
dependencies:
  package_info_plus: ^8.0.0
```

2. Tự động đọc Package Name / Application ID từ hệ điều hành (Android `build.gradle` / iOS `Bundle ID`):
```dart
import 'package:package_info_plus/package_info_plus.dart';
import 'package:http/http.dart' as http;
import 'core/api_logger.dart';

// Hàm khởi tạo Logging Client tự động nhận diện App ID
Future<http.Client> createAutoMonitoredClient() async {
  final packageInfo = await PackageInfo.fromPlatform();
  
  // Tự động lấy "vn.fizahub.app" (hoặc bất kỳ applicationId nào của app hiện tại)
  final String autoAppId = packageInfo.packageName; 

  return LoggingClient(
    http.Client(),
    appId: autoAppId,
  );
}
```

### 3. Quy trình khi bạn tạo thêm App thứ 2, thứ 3...:
* **Bên App mới (ví dụ App Tài Xế / Shop)**: Chỉ cần copy nguyên đoạn code trên (nó sẽ tự đọc ra `vn.fizahub.driver` hoặc `vn.fizahub.shop`).
* **Bên Web Flow API**: 
  1. Vào [https://flow-api.hieupham101097.workers.dev/admin/users](https://flow-api.hieupham101097.workers.dev/admin/users)
  2. Bấm **"+ Thêm Người dùng & Job"**
  3. Điền mã App ID là `vn.fizahub.driver`
* **Xong!** Bạn không cần sửa thêm 1 dòng code nào ở Backend Flow API.

---

## PHẦN 6: THEO DÕI FIREBASE CRASHLYTICS & FIREBASE ANALYTICS TRÊN WEB FLOW API

Hệ thống Flow API hiện đã hỗ trợ **3 chế độ giám sát thời gian thực**:
1. 📡 **API Logs**: Theo dõi cuộc gọi HTTP (Status 200, 4xx, 5xx, latency, request/response payload).
2. 💥 **Crashlytics**: Bắt các lỗi sập app (Fatal crash), ngoại lệ (Non-fatal exceptions), dòng lệnh lỗi (Stack Trace) và cấu hình thiết bị.
3. 📈 **Analytics & Sự kiện**: Ghi nhận hành vi người dùng (click, login, submit form, xem màn hình) kèm tham số chi tiết.

### 1. Cấu hình Crashlytics trong App Flutter (`main.dart`):

Trong file `lib/main.dart` của app Fizahub, thêm đoạn code sau:

```dart
import 'dart:ui';
import 'package:flutter/material.dart';
import 'core/api_logger.dart'; // File vừa copy ở trên

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Khởi tạo Telemetry cho Fizahub
  AppTelemetry.initialize(appId: 'vn.fizahub.app');

  // 1. Tự động bắt mọi lỗi Flutter Framework / Render
  FlutterError.onError = (FlutterErrorDetails details) {
    AppTelemetry.recordCrash(
      exception: details.exception,
      stack: details.stack,
      isFatal: true, // Đánh dấu là lỗi Fatal
      deviceInfo: {
        'os': 'Android/iOS',
        'app_version': '1.0.0',
      },
    );

    // Nếu app có dùng Firebase Crashlytics, gọi thêm:
    // FirebaseCrashlytics.instance.recordFlutterFatalError(details);
  };

  // 2. Tự động bắt mọi lỗi Bất đồng bộ (Uncaught Async Errors)
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

#### Khi có try/catch (Lỗi Non-Fatal không làm văng app):
```dart
try {
  // Thực hiện tác vụ có thể bị lỗi (parse data, tính toán,...)
} catch (e, stack) {
  AppTelemetry.recordCrash(
    exception: e,
    stack: stack,
    isFatal: false, // Không sập app, chỉ cảnh báo ngoại lệ
  );
}
```

---

### 2. Cấu hình Firebase Analytics & Screen Tracking:

Khi người dùng thực hiện một hành động hoặc chuyển màn hình:

```dart
// 1. Ghi nhận sự kiện người dùng (Custom Event)
AppTelemetry.logEvent(
  'login_success',
  parameters: {
    'phone': '0394264400',
    'role': 'user',
    'method': 'password',
  },
  userId: '266', // ID người dùng
);

// 2. Ghi nhận khi xem màn hình (Screen View)
AppTelemetry.logScreenView(
  'HomeScreen',
  parameters: {
    'tab': 'dashboard',
  },
  userId: '266',
);
```

---

### 3. Xem dữ liệu trên Web Dashboard:

1. Mở trang: **https://flow-api.hieupham101097.workers.dev/admin/dashboard**
2. Nhấn vào thanh chọn chế độ ở đầu trang:
   * Chọn **📡 API Logs**: Xem các cuộc gọi API.
   * Chọn **💥 Crashlytics**: Xem danh sách các lần sập app, bấm **"Stack Trace"** để copy toàn bộ dòng lệnh báo lỗi mà không cần vào Firebase Console.
   * Chọn **📈 Analytics & Sự kiện**: Xem danh sách sự kiện, người dùng nào thực hiện, tham số chi tiết và luồng màn hình.

