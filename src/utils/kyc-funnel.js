/**
 * Bộ đo luồng định danh (eKYC / eID / eKYB) cho app web.
 *
 * Bản JavaScript của `src/utils/kyc_funnel.dart` - cùng một giao kèo sự kiện,
 * nên số liệu của app web và app mobile nằm chung một funnel trên dashboard,
 * lọc theo `app_identifier` là tách được.
 *
 * Copy nguyên file này vào dự án, không phụ thuộc thư viện nào.
 *
 * ---
 *
 * ## Dùng trong 3 bước
 *
 * ```js
 * import { configureKycFunnel, KycFunnel, KYC_STEPS, KYC_OUTCOME } from './kyc-funnel';
 *
 * // 1. Khai báo một lần lúc khởi động
 * configureKycFunnel({
 *   baseUrl: 'https://flow-api.hieupham101097.workers.dev',
 *   appId: 'cong-ty-web',
 * });
 *
 * // 2. Mỗi lần người dùng mở luồng xác thực
 * const funnel = new KycFunnel({ key: 'ekyc', screenName: 'verify' });
 * funnel.start({ mode: 'ekyc' });
 * funnel.stepStarted(KYC_STEPS.captureFront);
 *
 * // 3. Đánh dấu từng bước
 * funnel.stepSucceeded(KYC_STEPS.captureFront);
 * funnel.stepFailed(KYC_STEPS.kycSubmit, { reason: 'face_mismatch' });
 * funnel.complete(KYC_OUTCOME.auto);
 *
 * // Rời trang khi chưa xong = bỏ dở
 * window.addEventListener('pagehide', () => funnel.abandonIfOpen('left_page'));
 * ```
 *
 * ## Quy tắc phải nhớ
 *
 * - Mỗi bước bắt đầu một lần, chốt một lần. `stepStarted` khi bước đang dở sẽ
 *   bị bỏ qua (chống đếm trùng); sau khi bước đã chốt thì gọi lại được.
 * - Chỉ `complete()` khi luồng thật sự kết thúc. Nộp hồ sơ hỏng mà người dùng
 *   vẫn ở lại để sửa thì đừng đóng: để `abandonIfOpen` đóng bằng `abandoned`,
 *   server có cờ `infer_failed_from_steps` sẽ xếp vào nhóm Thất bại.
 */

/** Tên các funnel định danh đã được seed sẵn trên server. */
export const KYC_FUNNELS = {
  /** Định danh cá nhân qua ảnh chụp giấy tờ (OCR + Face Matching). */
  ekyc: 'ekyc',
  /** Định danh cá nhân qua căn cước công dân gắn chip NFC (MRZ + NFC Chip). */
  eid: 'eid',
  /** Định danh doanh nghiệp. */
  ekyb: 'ekyb',
};

/** Từ vựng bước chuẩn, khớp `IDENTITY_STEP_LABELS` trong `src/worker.js`. */
export const KYC_STEPS = {
  captureFront: 'capture_front',
  captureBack: 'capture_back',
  captureLicense: 'capture_license',
  capturePortrait: 'capture_portrait',
  idOcr: 'id_ocr',
  businessOcr: 'business_ocr',
  mrzRead: 'mrz_read',
  nfcRead: 'nfc_read',
  faceMatch: 'face_match',
  formReview: 'form_review',
  kycSubmit: 'kyc_submit',
  kybSubmit: 'kyb_submit',
};

/** Bốn giá trị kết quả mà server phân loại được. */
export const KYC_OUTCOME = {
  /** Duyệt tự động. */
  auto: 'auto',
  /** Chuyển duyệt tay. */
  manual: 'manual',
  /** Thất bại và người dùng dừng lại. */
  failed: 'failed',
  /** Bỏ dở giữa chừng. */
  abandoned: 'abandoned',
};

const config = {
  baseUrl: '',
  appId: '',
  userName: null,
  userId: null,
  deviceName: null,
};

/** Gọi một lần lúc khởi động. baseUrl rỗng là tắt hẳn, không request nào gửi đi. */
export const configureKycFunnel = ({ baseUrl = '', appId = '', deviceName = null } = {}) => {
  config.baseUrl = String(baseUrl).replace(/\/+$/, '');
  config.appId = appId;
  config.deviceName = deviceName || detectDeviceName();
};

/** Gắn danh tính người dùng vào mọi sự kiện sau thời điểm đăng nhập. */
export const setKycFunnelUser = ({ name = null, id = null } = {}) => {
  if (name) config.userName = String(name).trim();
  if (id) config.userId = String(id).trim();
};

export const clearKycFunnelUser = () => {
  config.userName = null;
  config.userId = null;
};

const detectDeviceName = () => {
  if (typeof navigator === 'undefined') return 'Web Client';
  const ua = navigator.userAgent || '';
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('Chrome')) return 'Google Chrome';
  if (ua.includes('Firefox')) return 'Mozilla Firefox';
  if (ua.includes('Safari')) return 'Apple Safari';
  return 'Trình duyệt Web';
};

/**
 * Gửi rồi quên. `keepalive` để sự kiện cuối cùng (thường là `abandoned` lúc
 * rời trang) vẫn đi được khi trang đang đóng.
 */
const sendEvent = (eventName, parameters, screenName) => {
  if (!config.baseUrl || !config.appId) return;

  try {
    fetch(`${config.baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        app_id: config.appId,
        event_name: eventName,
        event_type: 'funnel',
        screen_name: screenName || null,
        user_id: config.userId,
        user_name: config.userName,
        device_name: config.deviceName,
        parameters,
      }),
    }).catch(() => {});
  } catch {
    // Telemetry hỏng không được phép làm hỏng luồng nghiệp vụ.
  }
};

/** Lý do lỗi đi vào cột "nguyên nhân" nên phải ngắn và ổn định. */
const shortReason = (reason) => {
  const cleaned = String(reason).replace(/\s+/g, ' ').trim();
  return cleaned.length <= 120 ? cleaned : `${cleaned.slice(0, 120)}...`;
};

/**
 * Bộ đếm một lượt thử định danh.
 *
 * Sáu sự kiện được sinh ra, `<key>` là khoá funnel:
 *
 * | Sự kiện | Tham số |
 * | --- | --- |
 * | `<key>_attempt_started`   | `attempt_id` |
 * | `<key>_step_started`      | `attempt_id`, `step` |
 * | `<key>_step_succeeded`    | `attempt_id`, `step`, `duration_ms` |
 * | `<key>_step_failed`       | `attempt_id`, `step`, `duration_ms`, `reason` |
 * | `<key>_fallback_manual`   | `attempt_id`, `reason` |
 * | `<key>_attempt_completed` | `attempt_id`, `outcome`, `duration_ms` |
 */
export class KycFunnel {
  constructor({ key, screenName = null, emitter = sendEvent } = {}) {
    this.key = key;
    this.screenName = screenName;
    this._emitter = emitter;
    this._attemptId = null;
    this._attemptStartedAt = null;
    this._stepStartedAt = new Map();
  }

  get isOpen() {
    return this._attemptId !== null;
  }

  get attemptId() {
    return this._attemptId;
  }

  /** Mở lượt thử mới. Lượt cũ còn dở thì đóng lại bằng `abandoned`. */
  start(parameters = null) {
    if (this.isOpen) this.complete(KYC_OUTCOME.abandoned, { reason: 'restarted' });

    const random = Math.floor(Math.random() * 0xffffff).toString(16);
    this._attemptId = `${this.key}-${Date.now()}-${random}`;
    this._attemptStartedAt = Date.now();
    this._stepStartedAt.clear();

    this._emit('attempt_started', parameters);
  }

  /**
   * Bắt đầu một bước. Bước đang dở mà gọi lại thì bỏ qua: dashboard đếm
   * `step_started` theo số sự kiện thô, bắn trùng sẽ thổi phồng tỷ lệ rơi.
   */
  stepStarted(step, parameters = null) {
    if (!this.isOpen || this._stepStartedAt.has(step)) return;
    this._stepStartedAt.set(step, Date.now());
    this._emit('step_started', { ...parameters, step });
  }

  stepSucceeded(step, parameters = null) {
    if (!this.isOpen) return;
    this._emit('step_succeeded', {
      ...parameters,
      step,
      duration_ms: this._takeStepDuration(step),
    });
  }

  stepFailed(step, { reason = null, errorCode = null, ...parameters } = {}) {
    if (!this.isOpen) return;
    this._emit('step_failed', {
      ...parameters,
      step,
      duration_ms: this._takeStepDuration(step),
      reason: reason === null ? null : shortReason(reason),
      error_code: errorCode,
    });
  }

  /** Luồng đi tiếp nhưng phải nhờ thao tác tay (OCR hỏng, người dùng tự nhập). */
  fallbackManual({ reason = null, ...parameters } = {}) {
    if (!this.isOpen) return;
    this._emit('fallback_manual', {
      ...parameters,
      reason: reason === null ? null : shortReason(reason),
    });
  }

  /** Đóng lượt thử. Gọi hai lần liên tiếp không sinh sự kiện trùng. */
  complete(outcome, { reason = null, ...parameters } = {}) {
    if (!this.isOpen) return;

    this._emit('attempt_completed', {
      ...parameters,
      outcome,
      duration_ms: Date.now() - this._attemptStartedAt,
      reason: reason === null ? null : shortReason(reason),
    });

    this._attemptId = null;
    this._attemptStartedAt = null;
    this._stepStartedAt.clear();
  }

  /** Dùng lúc rời trang: chỉ đóng khi lượt thử còn treo. */
  abandonIfOpen(reason = null) {
    if (!this.isOpen) return;
    this.complete(KYC_OUTCOME.abandoned, { reason });
  }

  /** Sự kiện phụ không mang `step` nên không ảnh hưởng số liệu từng bước. */
  logStage(suffix, parameters = null) {
    if (!this.isOpen) return;
    this._emit(suffix, parameters);
  }

  _takeStepDuration(step) {
    const startedAt = this._stepStartedAt.get(step);
    if (startedAt === undefined) return null;
    this._stepStartedAt.delete(step);
    return Date.now() - startedAt;
  }

  _emit(suffix, parameters) {
    if (this._attemptId === null) return;

    const payload = { attempt_id: this._attemptId };
    for (const [key, value] of Object.entries(parameters || {})) {
      if (value !== null && value !== undefined) payload[key] = value;
    }

    this._emitter(`${this.key}_${suffix}`, payload, this.screenName);
  }
}
