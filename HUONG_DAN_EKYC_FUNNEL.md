# 🪪 HƯỚNG DẪN GẮN THỐNG KÊ LUỒNG ĐỊNH DANH (eKYC / eID / eKYB)

> 🎯 **Mục đích:** Đo xem người dùng rơi rụng ở bước nào của luồng định danh, bước nào chậm, lỗi gì hay gặp nhất.
> 📊 **Xem số liệu:** tab **Thống kê** trên dashboard, chọn funnel `ekyc` hoặc `ekyb`.
> ♻️ **Dùng lại được cho mọi app:** eKYC không của riêng app nào. Mọi app bắn cùng một bộ sự kiện vào cùng một funnel, rồi lọc theo app trên dashboard.

---

## ⚡ TÓM TẮT CHO NGƯỜI VỘI

Thêm một app mới vào thống kê eKYC **không cần sửa gì ở server**. Chỉ ba việc phía app:

1. Copy file SDK vào dự án: `src/utils/kyc_funnel.dart` (Flutter) hoặc `src/utils/kyc-funnel.js` (Web).
2. Gọi `configure(baseUrl, appId)` một lần lúc mở app.
3. Đánh dấu từng bước của luồng định danh bằng `start / stepStarted / stepSucceeded / stepFailed / complete`.

Xong. Dashboard tự gom số.

---

## 1. MÔ HÌNH SỐ LIỆU

### Lượt thử (attempt)

Đơn vị mà **mọi tỷ lệ phần trăm** được tính trên đó.

> Một lượt thử = một lần người dùng mở luồng định danh cho tới khi nó kết thúc.

Mỗi lượt thử có một `attempt_id` do app sinh ra; mọi sự kiện trong cùng lượt mang chung id đó để server gom nhóm. Không có `attempt_id` thì sự kiện vẫn được lưu nhưng **không** vào thống kê funnel.

### Bước (step)

Một chặng có thể đo riêng trong luồng: chụp mặt trước, đọc chip NFC, gửi hồ sơ... Mỗi bước sinh ra cặp số **bắt đầu / chốt** để tính tỷ lệ rơi rụng.

### Kết quả (outcome)

Trạng thái cuối của lượt thử. Đúng bốn giá trị:

| Giá trị | Ý nghĩa | Hiện trên dashboard |
| --- | --- | --- |
| `auto` | Hệ thống duyệt tự động | Thành công tự động |
| `manual` | Chuyển sang duyệt tay | Chuyển duyệt tay |
| `failed` | Thất bại, người dùng dừng lại | Thất bại |
| `abandoned` | Bỏ dở giữa chừng | Bỏ dở |

Lượt thử chưa có `attempt_completed` bị xếp vào nhóm **Đang dở**.

---

## 2. GIAO KÈO SỰ KIỆN

Sáu sự kiện, gửi bằng `POST /events`. `<key>` là khoá funnel (`ekyc` hoặc `ekyb`):

| Sự kiện | Tham số bắt buộc | Tham số nên có |
| --- | --- | --- |
| `<key>_attempt_started` | `attempt_id` | `mode` |
| `<key>_step_started` | `attempt_id`, `step` | |
| `<key>_step_succeeded` | `attempt_id`, `step` | `duration_ms` |
| `<key>_step_failed` | `attempt_id`, `step` | `duration_ms`, `reason` |
| `<key>_fallback_manual` | `attempt_id` | `reason` |
| `<key>_attempt_completed` | `attempt_id`, `outcome` | `duration_ms`, `reason` |

Tất cả nằm trong trường `parameters` của payload:

```json
{
  "app_id": "com.cong.ty.app",
  "event_name": "ekyc_step_failed",
  "event_type": "funnel",
  "screen_name": "verify_flow",
  "user_name": "Nguyễn Văn A",
  "parameters": {
    "attempt_id": "ekyc-1731052800123-a4f91c",
    "step": "nfc_read",
    "duration_ms": 8420,
    "reason": "tag_lost"
  }
}
```

> ⚠️ **Gõ sai một chữ là thống kê về 0** trong khi app vẫn chạy bình thường, không ai phát hiện ra. Đó là lý do nên dùng file SDK sẵn có thay vì tự ghép chuỗi.

---

## 3. TỪ VỰNG BƯỚC CHUẨN

Chọn tên bước trong bảng này để số liệu giữa các app so sánh được với nhau. Bước riêng của app vẫn hiện trên dashboard, chỉ là xếp sau các bước đã khai báo và mang nhãn bằng chính tên khoá.

| Tên bước | Nhãn trên dashboard | Dùng khi |
| --- | --- | --- |
| `capture_front` | Chụp mặt trước giấy tờ | Chụp/chọn ảnh mặt trước CCCD |
| `capture_back` | Chụp mặt sau giấy tờ | Chụp/chọn ảnh mặt sau CCCD |
| `capture_license` | Chụp giấy phép kinh doanh | Luồng eKYB |
| `capture_portrait` | Chụp chân dung | Khi chụp chân dung tách khỏi bước đối chiếu |
| `id_ocr` | OCR giấy tờ tuỳ thân | Bóc dữ liệu từ ảnh CCCD |
| `business_ocr` | OCR giấy phép kinh doanh | Luồng eKYB |
| `mrz_read` | Đọc MRZ/QR để mở chip | Lấy khoá truy cập trước khi đọc NFC |
| `nfc_read` | Đọc chip NFC | Luồng eID |
| `face_match` | Đối chiếu khuôn mặt | Liveness / so khớp khuôn mặt |
| `form_review` | Rà soát hồ sơ | Người dùng xem lại và sửa dữ liệu |
| `kyc_submit` | Gửi hồ sơ eKYC | Nộp hồ sơ cá nhân lên server |
| `kyb_submit` | Gửi hồ sơ eKYB | Nộp hồ sơ doanh nghiệp lên server |

Nguồn duy nhất của bảng này: `IDENTITY_STEP_LABELS` trong `src/worker.js`.

### Ba funnel chuẩn được tách biệt sẵn

| Funnel | Tên hiển thị | Tiền tố | Thứ tự bước chuẩn |
| --- | --- | --- | --- |
| `ekyc` | **Định danh ảnh chụp (eKYC)** | `ekyc_` | `capture_front` → `capture_back` → `id_ocr` → `face_match` → `kyc_submit` |
| `eid` | **Định danh CCCD gắn chip (eID / NFC)** | `eid_` | `capture_front` → `mrz_read` → `nfc_read` → `face_match` → `kyc_submit` |
| `ekyb` | **Định danh doanh nghiệp (eKYB)** | `ekyb_` | `capture_front` → `capture_back` → `capture_license` → `id_ocr` → `nfc_read` → `face_match` → `kyc_submit` → `business_ocr` → `form_review` → `kyb_submit` |

> 💡 **Phân biệt rõ ràng:**
> - **`ekyc` (eKYC)**: Dành cho xác thực chụp ảnh thông thường (mặt trước + mặt sau + OCR + chụp khuôn mặt). Hoàn toàn **không có bước quét NFC/đọc chip**.
> - **`eid` (eID / eKYD)**: Dành cho xác thực qua căn cước công dân gắn chip (quét mã MRZ + áp thẻ đọc chip NFC + đối chiếu ảnh trong chip).
> - Hệ thống tự động phân tách thống kê độc lập để tỷ lệ hoàn thành (completion rate) của từng luồng phản ánh đúng thực tế, không bị rơi rụng giả tạo.
> - *Khả năng tương thích ngược*: Các bản build cũ vẫn bắn sự kiện `ekyc_` với tham số `mode: 'eid'` sẽ được hệ thống tự động bóc tách vào đúng funnel `eid`!

---

## 4. TÍCH HỢP VÀO APP FLUTTER

### Bước 1 — Copy file SDK

Copy `src/utils/kyc_funnel.dart` của repo này vào app, ví dụ `lib/core/telemetry/kyc_funnel.dart`. Chỉ cần `http: ^1.2.0` trong `pubspec.yaml`.

### Bước 2 — Khai báo một lần lúc mở app

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  KycFunnelReporter.configure(
    baseUrl: 'https://flow-api.hieupham101097.workers.dev',
    appId: 'com.cong.ty.app', // khớp app_identifier của bảng jobs
  );

  runApp(const MyApp());
}
```

Sau khi đăng nhập thành công:

```dart
KycFunnelReporter.setUser(name: user.fullName, id: user.id);
```

### Bước 3 — Gắn vào màn hình định danh

Funnel sống đúng bằng vòng đời màn hình:

```dart
class _VerifyFlowState extends State<VerifyFlow> {
  final _funnel = KycFunnel(
    key: KycFunnelKeys.ekyc,
    screenName: 'verify_flow',
  );

  @override
  void initState() {
    super.initState();
    _funnel.start(parameters: {'mode': widget.isEid ? 'eid' : 'ekyc'});
    _funnel.stepStarted(KycSteps.captureFront);
  }

  @override
  void dispose() {
    // Rời màn hình khi chưa có kết quả = người dùng bỏ dở.
    _funnel.abandonIfOpen(reason: 'closed_flow');
    super.dispose();
  }

  Future<void> _onFrontCaptured(File image) async {
    final ok = await validateIdCard(image);
    if (!ok) {
      _funnel.stepFailed(KycSteps.captureFront, reason: 'invalid_card');
      return;
    }
    _funnel.stepSucceeded(KycSteps.captureFront);
    _funnel.stepStarted(KycSteps.captureBack); // mở bước kế tiếp
  }

  Future<void> _onSubmit() async {
    _funnel.stepStarted(KycSteps.kycSubmit);
    final result = await api.submit(...);

    if (result.isSuccess) {
      _funnel.stepSucceeded(KycSteps.kycSubmit);
      _funnel.complete(KycOutcome.auto);
      return;
    }
    _funnel.stepFailed(KycSteps.kycSubmit, reason: result.message);
    // Không complete ở đây - xem mục 6.
  }
}
```

---

## 5. TÍCH HỢP VÀO APP WEB

Copy `src/utils/kyc-funnel.js`, không phụ thuộc thư viện nào:

```js
import { configureKycFunnel, KycFunnel, KYC_STEPS, KYC_OUTCOME } from './kyc-funnel';

configureKycFunnel({
  baseUrl: 'https://flow-api.hieupham101097.workers.dev',
  appId: 'cong-ty-web',
});

const funnel = new KycFunnel({ key: 'ekyc', screenName: 'verify' });
funnel.start({ mode: 'ekyc' });
funnel.stepStarted(KYC_STEPS.captureFront);
// ...
funnel.complete(KYC_OUTCOME.auto);

// Rời trang khi chưa xong = bỏ dở. `keepalive` lo việc gửi kịp.
window.addEventListener('pagehide', () => funnel.abandonIfOpen('left_page'));
```

---

## 6. BỐN LỖI HAY GẶP

### ❌ Bắn `step_started` nhiều lần cho một bước

Dashboard đếm `step_started` theo **số sự kiện thô**. Người dùng bấm qua lại giữa hai tab mặt trước/mặt sau mà lần nào cũng bắn thì cột "bắt đầu" phồng lên, tỷ lệ rơi rụng sai bét.

✅ SDK đã chặn sẵn: gọi `stepStarted` khi bước **đang dở** sẽ bị bỏ qua. Sau khi bước đã chốt (`succeeded`/`failed`) thì gọi lại được — đúng với ca người dùng chụp lại ảnh.

### ❌ `complete(failed)` ngay khi API trả lỗi

Nộp hồ sơ hỏng thường **không** kết thúc luồng: người dùng vẫn ở lại màn hình để chụp lại. Đóng lượt thử ở đây làm mọi sự kiện sau đó biến mất khỏi thống kê.

✅ Cứ để lượt thử mở, `abandonIfOpen` ở `dispose` sẽ đóng bằng `abandoned`. Funnel bật sẵn cờ `infer_failed_from_steps` nên lượt "bỏ dở nhưng đã có bước lỗi" vẫn được xếp vào nhóm **Thất bại** — không mất số.

Chỉ `complete(failed)` khi luồng thật sự đóng lại sau thất bại.

### ❌ Nhét thông báo lỗi nguyên bản vào `reason`

Cột "nguyên nhân hay gặp" gom theo giá trị giống hệt nhau. Thông báo có chứa tên người, mã đơn, số giây... thì mỗi lỗi thành một dòng riêng, bảng vô dụng.

✅ Dùng mã ngắn ổn định: `tag_lost`, `face_mismatch`, `ocr_no_data`. SDK cũng tự cắt `reason` ở 120 ký tự để phòng hờ.

### ❌ Bắn ảnh giấy tờ hoặc khoá API vào `parameters`

Sự kiện được lưu nguyên văn trong DB.

✅ Chỉ gửi kích thước, mã lỗi, cờ true/false. Không bao giờ gửi base64 ảnh, `idFront`/`idBack`/`faceData`, khoá API hay token.

---

## 7. THÊM MỘT LOẠI LUỒNG MỚI

Chỉ khi xuất hiện một **loại** luồng khác hẳn (ví dụ định danh hộ chiếu). App mới dùng lại `ekyc`/`ekyb` thì bỏ qua mục này.

Hai cách:

**Cách 1 — trên dashboard (không cần deploy):** tab Thống kê → *Cấu hình funnel* → nhập khoá và tiền tố sự kiện. Server tự suy ra cấu hình từ các sự kiện có thật trong DB.

**Cách 2 — seed sẵn trong code:** thêm một dòng vào `src/worker.js`:

```js
const EKYP_FUNNEL = makeIdentityFunnel({
  key: 'ekyp',
  name: 'Định danh hộ chiếu (eKYP)',
  steps: ['capture_passport', 'mrz_read', 'nfc_read', 'face_match', 'kyc_submit'],
});

const SEEDED_FUNNELS = [EKYC_FUNNEL, EKYB_FUNNEL, EKYP_FUNNEL];
```

`makeIdentityFunnel` tự sinh sáu tên sự kiện theo quy ước `<key>_attempt_started`, `<key>_step_started`... nên app và server không thể lệch nhau vì gõ nhầm. Bước nào chưa có trong `IDENTITY_STEP_LABELS` thì thêm nhãn vào đó.

> Seed dùng `INSERT OR IGNORE`: funnel đã tồn tại trên DB sẽ **không** bị ghi đè, để cấu hình ai đó chỉnh trên dashboard không bị deploy xoá mất. Muốn đổi cấu hình funnel đang chạy thì sửa trên dashboard, hoặc gọi `POST /funnels`.

---

## 8. KIỂM TRA SAU KHI GẮN

1. Chạy luồng định danh một lượt trên máy thật.
2. Mở dashboard → tab **Sự kiện**, lọc theo app của bạn. Phải thấy đủ chuỗi `..._attempt_started` → `..._step_*` → `..._attempt_completed`.
3. Mở tab **Thống kê**, chọn funnel tương ứng:
   - **Số lượt thử** tăng đúng 1.
   - Bảng **từng bước** có số ở đúng các bước app bạn chạy qua.
   - **Kết quả** rơi vào đúng nhóm mong đợi.
4. Nếu số lượt thử là 0 mà tab Sự kiện vẫn có dữ liệu → gần như chắc chắn thiếu `attempt_id` trong `parameters`, hoặc tên sự kiện sai tiền tố.
