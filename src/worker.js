const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Requested-With',
};

// ==========================================
// THỐNG KÊ SỰ KIỆN (EVENT FUNNEL ANALYTICS)
// ==========================================

// Múi giờ hiển thị của hệ thống. Mọi phép gom nhóm theo "ngày" đều phải dùng
// ngày Việt Nam, không phải ngày UTC, nếu không biểu đồ sẽ lệch 7 tiếng.
const VN_OFFSET_HOURS = 7;
const VN_SQL_OFFSET = `+${VN_OFFSET_HOURS} hours`;

// Ngày VN dạng YYYY-MM-DD, lùi lại `daysAgo` ngày.
const vnDay = (daysAgo = 0) =>
  new Date(Date.now() + VN_OFFSET_HOURS * 3600000 - daysAgo * 86400000)
    .toISOString()
    .slice(0, 10);

/**
 * Đổi khoảng ngày VN thành cặp mốc UTC để so thẳng trên cột created_at.
 *
 * Viết `date(created_at, '+7 hours') >= ?` là bọc hàm quanh cột, SQLite không
 * dùng được index và phải quét toàn bảng (EXPLAIN QUERY PLAN cho ra "SCAN").
 * So sánh trực tiếp created_at với hai mốc thì thành "SEARCH ... created_at>?".
 *
 * Ngày VN D kéo dài từ UTC (D-1) 17:00 đến UTC D 17:00.
 */
const vnDayRangeToUtc = (dayFrom, dayTo) => {
  const start = new Date(`${dayFrom}T00:00:00Z`);
  start.setUTCHours(start.getUTCHours() - VN_OFFSET_HOURS);

  const end = new Date(`${dayTo}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCHours(end.getUTCHours() - VN_OFFSET_HOURS);

  const format = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
  return { from: format(start), to: format(end) };
};

// Nhóm kết quả cuối của một lượt thử. Thứ tự ở đây là thứ tự hiển thị trên UI.
const OUTCOME_BUCKETS = [
  { key: 'success_auto', label: 'Thành công tự động' },
  { key: 'success_manual', label: 'Chuyển duyệt tay' },
  { key: 'failed', label: 'Thất bại' },
  { key: 'abandoned', label: 'Bỏ dở' },
  { key: 'open', label: 'Đang dở' },
  { key: 'other', label: 'Khác (chưa phân loại)' },
];

// Đoán nhóm từ chính giá trị outcome, dùng khi funnel chưa khai báo outcome_buckets.
// Không đoán bừa: giá trị lạ rơi vào nhóm 'other' chứ không bị tính thành Thất bại.
//
// So khớp theo TỪNG TỪ chứ không phải chuỗi con, vì so chuỗi con là cái bẫy:
// "abandoned" có chứa "done", "denied" có chứa "deny". Tách theo ký tự không
// phải chữ/số nên "auto_approved" vẫn ra đúng nhóm.
const OUTCOME_EXACT = {
  auto: 'success_auto',
  automatic: 'success_auto',
  success: 'success_auto',
  succeeded: 'success_auto',
  ok: 'success_auto',
  approved: 'success_auto',
  verified: 'success_auto',
  completed: 'success_auto',
  passed: 'success_auto',
  manual: 'success_manual',
  review: 'success_manual',
  reviewing: 'success_manual',
  pending: 'success_manual',
  waiting: 'success_manual',
  failed: 'failed',
  failure: 'failed',
  error: 'failed',
  rejected: 'failed',
  denied: 'failed',
  declined: 'failed',
  abandoned: 'abandoned',
  abandon: 'abandoned',
  cancelled: 'abandoned',
  canceled: 'abandoned',
  dropped: 'abandoned',
  exited: 'abandoned',
  dismissed: 'abandoned',
  timeout: 'abandoned',
};

// Dự phòng khi không từ nào khớp chính xác. Thứ tự quan trọng: các nhóm dễ bị
// nuốt bởi chuỗi con (bỏ dở, thất bại) phải được xét trước.
const OUTCOME_HEURISTICS = [
  [/abandon|cancel|quit|exit|dismiss|expire/i, 'abandoned'],
  [/fail|error|reject|deny|declin/i, 'failed'],
  [/manual|review|pending|waiting/i, 'success_manual'],
  [/auto|success|approve|verif/i, 'success_auto'],
];

const classifyOutcome = (value) => {
  const text = String(value).toLowerCase();
  for (const token of text.split(/[^a-z0-9]+/)) {
    if (token && OUTCOME_EXACT[token]) return OUTCOME_EXACT[token];
  }
  for (const [pattern, bucket] of OUTCOME_HEURISTICS) {
    if (pattern.test(text)) return bucket;
  }
  return null;
};

const DEFAULT_FUNNEL_CONFIG = {
  correlation_param: 'attempt_id',
  outcome_param: 'outcome',
  step_param: 'step',
  duration_param: 'duration_ms',
  start_event: null,
  complete_event: null,
  step_started_event: null,
  step_succeeded_event: null,
  step_failed_event: null,
  fallback_manual_event: null,
  steps_order: [],
  step_labels: {},
  outcome_buckets: {},
  reason_params: ['reason', 'error_code', 'error_type', 'status_code'],
  // App hiện không bao giờ bắn outcome 'failed': khi submit lỗi, luồng eKYB cố ý
  // giữ lượt thử mở để người dùng sửa hồ sơ, và onClose đóng lại bằng 'abandoned'.
  // Cờ này xếp các lượt "bỏ dở nhưng đã có bước lỗi" vào nhóm Thất bại, nếu không
  // thì cột Thất bại luôn bằng 0.
  infer_failed_from_steps: true,
};

// ============================================================================
// FUNNEL ĐỊNH DANH DÙNG CHUNG CHO MỌI APP
// ----------------------------------------------------------------------------
// eKYC/eKYB không của riêng app nào: FizaHub, VNetrip và các app sau đều bắn
// cùng một bộ sự kiện vào cùng một funnel, rồi lọc theo `app_identifier` trên
// dashboard. Nhờ vậy thêm một app mới KHÔNG cần sửa file này - app chỉ cần
// bắn đúng giao kèo sự kiện mô tả ở HUONG_DAN_EKYC_FUNNEL.md.
//
// Chỉ phải đụng vào đây khi xuất hiện một LOẠI luồng mới (ví dụ định danh
// hộ chiếu), lúc đó thêm một dòng makeIdentityFunnel(...) là xong.
// ============================================================================

// Từ vựng bước chuẩn. App nên chọn tên bước trong danh sách này thay vì tự đặt,
// để số liệu của các app so sánh được với nhau. Bước lạ vẫn hiện trên dashboard
// (xếp sau các bước đã khai báo) nhưng sẽ mang nhãn là chính tên khoá.
const IDENTITY_STEP_LABELS = {
  // Chụp / thu thập ảnh
  capture_front: 'Chụp mặt trước giấy tờ',
  capture_back: 'Chụp mặt sau giấy tờ',
  capture_license: 'Chụp giấy phép kinh doanh',
  capture_portrait: 'Chụp chân dung',
  // Bóc tách dữ liệu
  id_ocr: 'OCR giấy tờ tuỳ thân',
  business_ocr: 'OCR giấy phép kinh doanh',
  mrz_read: 'Đọc MRZ/QR để mở chip',
  nfc_read: 'Đọc chip NFC',
  // Đối chiếu và gửi hồ sơ
  face_match: 'Đối chiếu khuôn mặt',
  form_review: 'Rà soát hồ sơ',
  kyc_submit: 'Gửi hồ sơ eKYC',
  kyb_submit: 'Gửi hồ sơ eKYB',
};

// Bốn giá trị outcome chuẩn mà app gửi lên. Giữ nguyên cho mọi funnel định danh
// để cột thống kê của các app đọc giống nhau.
const IDENTITY_OUTCOME_BUCKETS = {
  auto: 'success_auto',
  manual: 'success_manual',
  failed: 'failed',
  abandoned: 'abandoned',
};

/**
 * Dựng một funnel định danh từ tiền tố sự kiện và danh sách bước.
 *
 * Tên sáu sự kiện được suy ra từ `key` theo đúng quy ước
 * `<key>_attempt_started`, `<key>_step_started`, ... nên app và server không
 * thể lệch nhau vì gõ nhầm.
 *
 * @param {string}   key   Tiền tố, ví dụ 'ekyc' -> sự kiện 'ekyc_attempt_started'.
 * @param {string}   name  Tên hiển thị trên dashboard.
 * @param {string[]} steps Các bước theo đúng thứ tự luồng chạy.
 * @param {string?}  appIdentifier  Để null nghĩa là dùng chung cho mọi app.
 */
const makeIdentityFunnel = ({ key, name, steps, appIdentifier = null }) => ({
  funnel_key: key,
  name,
  app_identifier: appIdentifier,
  event_prefix: `${key}_`,
  config: {
    ...DEFAULT_FUNNEL_CONFIG,
    start_event: `${key}_attempt_started`,
    complete_event: `${key}_attempt_completed`,
    step_started_event: `${key}_step_started`,
    step_succeeded_event: `${key}_step_succeeded`,
    step_failed_event: `${key}_step_failed`,
    fallback_manual_event: `${key}_fallback_manual`,
    steps_order: steps,
    step_labels: Object.fromEntries(
      steps.map((step) => [step, IDENTITY_STEP_LABELS[step] || step])
    ),
    outcome_buckets: { ...IDENTITY_OUTCOME_BUCKETS },
  },
});

// 1. Định danh cá nhân qua ảnh chụp giấy tờ (OCR + Face Matching)
const EKYC_FUNNEL = makeIdentityFunnel({
  key: 'ekyc',
  name: 'Định danh ảnh chụp (eKYC)',
  steps: [
    'capture_front',
    'capture_back',
    'id_ocr',
    'face_match',
    'kyc_submit',
  ],
});

// 2. Định danh cá nhân qua căn cước công dân gắn chip NFC (eID / eKYD)
const EID_FUNNEL = makeIdentityFunnel({
  key: 'eid',
  name: 'Định danh CCCD gắn chip (eID / NFC)',
  steps: [
    'capture_front',
    'mrz_read',
    'nfc_read',
    'face_match',
    'kyc_submit',
  ],
});

// 3. Định danh doanh nghiệp (eKYB)
const EKYB_FUNNEL = makeIdentityFunnel({
  key: 'ekyb',
  name: 'Định danh doanh nghiệp (eKYB)',
  steps: [
    'capture_front',
    'capture_back',
    'capture_license',
    'id_ocr',
    'nfc_read',
    'face_match',
    'kyc_submit',
    'business_ocr',
    'form_review',
    'kyb_submit',
  ],
});

// Ba funnel chuẩn được seed sẵn khi khởi tạo schema
const SEEDED_FUNNELS = [EKYC_FUNNEL, EID_FUNNEL, EKYB_FUNNEL];

// Giá trị mặc định cho ai gọi thẳng /events/stats mà quên tham số `funnel`
const DEFAULT_STATS_FUNNEL_KEY = EKYC_FUNNEL.funnel_key;

const safeJsonParse = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeFunnelConfig = (raw) => {
  const cfg = { ...DEFAULT_FUNNEL_CONFIG, ...(safeJsonParse(raw, {}) || {}) };
  cfg.steps_order = Array.isArray(cfg.steps_order) ? cfg.steps_order : [];
  cfg.step_labels = cfg.step_labels && typeof cfg.step_labels === 'object' ? cfg.step_labels : {};
  cfg.outcome_buckets =
    cfg.outcome_buckets && typeof cfg.outcome_buckets === 'object' ? cfg.outcome_buckets : {};
  cfg.reason_params =
    Array.isArray(cfg.reason_params) && cfg.reason_params.length
      ? cfg.reason_params.slice(0, 4)
      : DEFAULT_FUNNEL_CONFIG.reason_params;
  return cfg;
};

const mapFunnelRow = (row) => ({
  id: row.id,
  funnel_key: row.funnel_key,
  name: row.name,
  app_identifier: row.app_identifier || null,
  event_prefix: row.event_prefix || null,
  status: row.status || 'active',
  created_at: row.created_at,
  config: normalizeFunnelConfig(row.config),
});

// Đoán cấu hình funnel từ danh sách tên sự kiện có thật trong DB.
// Dùng khi người dùng chỉ nhập tiền tố (ví dụ "ekyb_") mà không muốn khai báo tay.
const deriveFunnelConfig = (prefix, eventNames) => {
  const names = eventNames.filter((name) => !prefix || name.startsWith(prefix));
  const pick = (...patterns) => {
    for (const pattern of patterns) {
      const hit = names.find((name) => pattern.test(name));
      if (hit) return hit;
    }
    return null;
  };

  return {
    ...DEFAULT_FUNNEL_CONFIG,
    start_event: pick(/_attempt_started$/, /_started$/, /_start$/, /_begin$/),
    complete_event: pick(/_attempt_completed$/, /_completed$/, /_complete$/, /_finished$/),
    step_started_event: pick(/_step_started$/, /_step_begin$/),
    step_succeeded_event: pick(/_step_succeeded$/, /_step_success$/, /_step_ok$/),
    step_failed_event: pick(/_step_failed$/, /_step_failure$/, /_step_error$/),
    fallback_manual_event: pick(/fallback/, /manual/),
  };
};

const percentile = (sortedValues, p) => {
  if (!sortedValues.length) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1)
  );
  return sortedValues[index];
};

const pct = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

// Xếp một lượt thử vào đúng nhóm kết quả.
const bucketOfAttempt = (attempt, cfg) => {
  if (attempt.outcome === null || attempt.outcome === undefined || attempt.outcome === '') {
    return 'open';
  }
  const explicit = cfg.outcome_buckets[attempt.outcome];
  const mapped =
    (OUTCOME_BUCKETS.some((bucket) => bucket.key === explicit) ? explicit : null) ||
    classifyOutcome(attempt.outcome) ||
    'other';

  if (mapped === 'abandoned' && cfg.infer_failed_from_steps && Number(attempt.failed_steps) > 0) {
    return 'failed';
  }
  return mapped;
};

/**
 * Tính toàn bộ số liệu của một funnel trong khoảng ngày VN [dayFrom, dayTo].
 *
 * Mọi phép gom nhóm nặng đều đẩy xuống SQL; chỉ percentile và việc xếp nhóm kết
 * quả (vốn phụ thuộc cấu hình) mới làm trong JS.
 */
async function computeFunnelStats(db, funnel, options = {}) {
  const cfg = funnel.config;
  const {
    dayFrom,
    dayTo,
    appIdentifier = null,
    jobId = null,
    userName = null,
    device = null,
    groupBy = 'day',
  } = options;

  const funnelEvents = [
    cfg.start_event,
    cfg.complete_event,
    cfg.step_started_event,
    cfg.step_succeeded_event,
    cfg.step_failed_event,
    cfg.fallback_manual_event,
  ].filter(Boolean);

  let eventClause = '';
  const eventParams = [];
  if (funnel.funnel_key === 'eid') {
    eventClause = " AND (e.event_name LIKE 'eid_%' OR (e.event_name LIKE 'ekyc_%' AND json_extract(e.parameters, '$.mode') = 'eid'))";
  } else if (funnel.funnel_key === 'ekyc') {
    eventClause = " AND (e.event_name LIKE 'ekyc_%' AND (json_extract(e.parameters, '$.mode') IS NULL OR json_extract(e.parameters, '$.mode') <> 'eid'))";
  } else if (funnel.event_prefix) {
    eventClause = ' AND e.event_name LIKE ?';
    eventParams.push(`${funnel.event_prefix}%`);
  } else if (funnelEvents.length) {
    eventClause = ` AND e.event_name IN (${funnelEvents.map(() => '?').join(', ')})`;
    eventParams.push(...funnelEvents);
  }

  let scopeClause = '';
  const scopeParams = [];
  const effectiveApp = appIdentifier || funnel.app_identifier;
  if (effectiveApp) {
    scopeClause += ' AND e.app_identifier = ?';
    scopeParams.push(effectiveApp);
  }
  if (jobId) {
    scopeClause += ' AND e.job_id = ?';
    scopeParams.push(Number(jobId));
  }
  if (userName) {
    scopeClause += ' AND (e.user_name LIKE ? OR e.user_id LIKE ?)';
    scopeParams.push(`%${userName}%`, `%${userName}%`);
  }
  if (device) {
    scopeClause += ' AND (e.device_name LIKE ? OR e.device_info LIKE ?)';
    scopeParams.push(`%${device}%`, `%${device}%`);
  }

  const bucketExpr =
    groupBy === 'hour'
      ? `strftime('%Y-%m-%d %H:00', e.created_at, '${VN_SQL_OFFSET}')`
      : `date(e.created_at, '${VN_SQL_OFFSET}')`;

  const utcRange = vnDayRangeToUtc(dayFrom, dayTo);

  const isEidFunnel = funnel.funnel_key === 'eid';
  const eventNameExpr = isEidFunnel
    ? "CASE WHEN e.event_name LIKE 'ekyc_%' THEN REPLACE(e.event_name, 'ekyc_', 'eid_') ELSE e.event_name END"
    : "e.event_name";

  const baseCte = `
    WITH ev AS (
      SELECT
        json_extract(e.parameters, '$.' || ?) AS attempt_id,
        json_extract(e.parameters, '$.' || ?) AS step,
        json_extract(e.parameters, '$.' || ?) AS outcome,
        CAST(json_extract(e.parameters, '$.' || ?) AS INTEGER) AS duration_ms,
        ${eventNameExpr} AS event_name,
        e.parameters AS parameters,
        e.created_at AS created_at,
        ${bucketExpr} AS bucket
      FROM app_events e
      WHERE e.created_at >= ?
        AND e.created_at < ?
        ${eventClause}
        ${scopeClause}
    )
  `;
  const baseParams = [
    cfg.correlation_param || 'attempt_id',
    cfg.step_param || 'step',
    cfg.outcome_param || 'outcome',
    cfg.duration_param || 'duration_ms',
    utcRange.from,
    utcRange.to,
    ...eventParams,
    ...scopeParams,
  ];

  const run = async (sql, extraParams = []) => {
    const { results } = await db
      .prepare(`${baseCte}${sql}`)
      .bind(...baseParams, ...extraParams)
      .all();
    return results || [];
  };

  // 1. Gom về mức "một lượt thử" — đơn vị mà mọi tỷ lệ % được tính trên đó.
  const attemptRows = cfg.correlation_param
    ? await run(
        `
        SELECT
          attempt_id,
          MAX(CASE WHEN event_name = ? THEN outcome END) AS outcome,
          SUM(CASE WHEN event_name = ? THEN 1 ELSE 0 END) AS failed_steps,
          SUM(CASE WHEN event_name = ? THEN 1 ELSE 0 END) AS fallbacks,
          MIN(bucket) AS bucket,
          MIN(created_at) AS started_at,
          MAX(created_at) AS ended_at
        FROM ev
        WHERE attempt_id IS NOT NULL
        GROUP BY attempt_id
        `,
        [cfg.complete_event, cfg.step_failed_event, cfg.fallback_manual_event]
      )
    : [];

  // 2. Đếm theo từng bước của luồng
  const stepRows = await run(
    'SELECT step, event_name, COUNT(*) AS total FROM ev WHERE step IS NOT NULL GROUP BY step, event_name'
  );

  // 3. Thời lượng từng bước, sort sẵn để tính percentile
  const durationRows = await run(
    `
    SELECT step, duration_ms
    FROM ev
    WHERE step IS NOT NULL AND duration_ms IS NOT NULL AND event_name IN (?, ?)
    ORDER BY step, duration_ms
    LIMIT 20000
    `,
    [cfg.step_succeeded_event, cfg.step_failed_event]
  );

  // 4. Nguyên nhân lỗi hay gặp nhất — cái chỉ thẳng ra bước nào đang hỏng
  const reasonParams = cfg.reason_params;
  const failureRows = cfg.step_failed_event
    ? await run(
        `
        SELECT
          step,
          json_extract(parameters, '$.' || ?) AS reason,
          json_extract(parameters, '$.' || ?) AS error_code,
          json_extract(parameters, '$.' || ?) AS error_type,
          json_extract(parameters, '$.' || ?) AS status_code,
          COUNT(*) AS total
        FROM ev
        WHERE event_name = ?
        GROUP BY step, reason, error_code, error_type, status_code
        ORDER BY total DESC
        LIMIT 15
        `,
        [
          reasonParams[0] || 'reason',
          reasonParams[1] || 'error_code',
          reasonParams[2] || 'error_type',
          reasonParams[3] || 'status_code',
          cfg.step_failed_event,
        ]
      )
    : [];

  // 5. Lý do bị đẩy sang duyệt tay
  const fallbackRows = cfg.fallback_manual_event
    ? await run(
        `
        SELECT step, json_extract(parameters, '$.' || ?) AS reason, COUNT(*) AS total
        FROM ev
        WHERE event_name = ?
        GROUP BY step, reason
        ORDER BY total DESC
        LIMIT 10
        `,
        [reasonParams[0] || 'reason', cfg.fallback_manual_event]
      )
    : [];

  const eventCountRows = await run('SELECT COUNT(*) AS total_events FROM ev');
  const totalEvents = eventCountRows[0]?.total_events || 0;

  // ---- Gộp số liệu ----
  const counts = Object.fromEntries(OUTCOME_BUCKETS.map((bucket) => [bucket.key, 0]));
  const emptyPoint = () => Object.fromEntries(OUTCOME_BUCKETS.map((bucket) => [bucket.key, 0]));
  const series = new Map();

  attemptRows.forEach((row) => {
    const bucket = bucketOfAttempt(row, cfg);
    counts[bucket] = (counts[bucket] || 0) + 1;

    const key = row.bucket || dayFrom;
    if (!series.has(key)) {
      series.set(key, { bucket: key, attempts: 0, ...emptyPoint() });
    }
    const point = series.get(key);
    point.attempts += 1;
    point[bucket] += 1;
  });

  const attempts = attemptRows.length;
  const succeeded = counts.success_auto + counts.success_manual;
  const completed = attempts - counts.open;

  const outcomes = OUTCOME_BUCKETS.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: counts[bucket.key],
    pct_of_attempts: pct(counts[bucket.key], attempts),
    pct_of_completed: bucket.key === 'open' ? null : pct(counts[bucket.key], completed),
  }));

  const durationsByStep = new Map();
  durationRows.forEach((row) => {
    if (!durationsByStep.has(row.step)) durationsByStep.set(row.step, []);
    durationsByStep.get(row.step).push(Number(row.duration_ms));
  });

  const stepTotals = new Map();
  stepRows.forEach((row) => {
    if (!stepTotals.has(row.step)) {
      stepTotals.set(row.step, { started: 0, succeeded: 0, failed: 0 });
    }
    const entry = stepTotals.get(row.step);
    if (row.event_name === cfg.step_started_event) entry.started += row.total;
    else if (row.event_name === cfg.step_succeeded_event) entry.succeeded += row.total;
    else if (row.event_name === cfg.step_failed_event) entry.failed += row.total;
  });

  // Giữ đúng thứ tự luồng đã khai báo, rồi mới tới các bước lạ chưa khai báo
  const orderedSteps = [
    ...cfg.steps_order,
    ...Array.from(stepTotals.keys()).filter((step) => !cfg.steps_order.includes(step)),
  ];

  const steps = orderedSteps.map((step) => {
    const entry = stepTotals.get(step) || { started: 0, succeeded: 0, failed: 0 };
    const durations = (durationsByStep.get(step) || []).sort((a, b) => a - b);
    const resolved = entry.succeeded + entry.failed;
    const denominator = resolved || entry.started;
    return {
      step,
      label: cfg.step_labels[step] || step,
      started: entry.started,
      succeeded: entry.succeeded,
      failed: entry.failed,
      success_pct: pct(entry.succeeded, denominator),
      failure_pct: pct(entry.failed, denominator),
      drop_off_pct: pct(Math.max(0, entry.started - resolved), entry.started),
      p50_ms: percentile(durations, 50),
      p95_ms: percentile(durations, 95),
      samples: durations.length,
    };
  });

  const totalFailures = failureRows.reduce((sum, row) => sum + row.total, 0);

  return {
    funnel: {
      key: funnel.funnel_key,
      name: funnel.name,
      event_prefix: funnel.event_prefix,
      app_identifier: funnel.app_identifier,
      steps_order: cfg.steps_order,
    },
    range: { day_from: dayFrom, day_to: dayTo, group_by: groupBy },
    totals: {
      attempts,
      completed,
      succeeded,
      open: counts.open,
      events: totalEvents,
    },
    outcomes,
    rates: {
      completion: pct(completed, attempts),
      success: pct(succeeded, attempts),
      auto: pct(counts.success_auto, succeeded),
      manual_fallback: pct(counts.success_manual, succeeded),
      failure: pct(counts.failed, attempts),
      abandon: pct(counts.abandoned, attempts),
    },
    steps,
    top_failures: failureRows.map((row) => ({
      step: row.step,
      label: cfg.step_labels[row.step] || row.step,
      reason: row.reason,
      error_code: row.error_code,
      error_type: row.error_type,
      status_code: row.status_code,
      count: row.total,
      pct: pct(row.total, totalFailures),
    })),
    manual_fallbacks: fallbackRows.map((row) => ({
      step: row.step,
      label: cfg.step_labels[row.step] || row.step,
      reason: row.reason,
      count: row.total,
    })),
    series: Array.from(series.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
  };
}

let tablesInitialized = false;
async function ensureSchema(db) {
  if (tablesInitialized) return;
  try {
    // 1. Tạo bảng users nếu chưa có
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 2. Tạo bảng jobs nếu chưa có
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('app', 'web')),
        app_identifier TEXT UNIQUE NOT NULL,
        target_url TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 3. Tạo bảng api_logs cơ bản nếu chưa có
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS api_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER,
        app_identifier TEXT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER,
        error_message TEXT,
        request_payload TEXT,
        response_payload TEXT,
        duration_ms INTEGER,
        device_name TEXT,
        user_name TEXT,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Vá cho DB đã tạo từ phiên bản cũ (CREATE TABLE IF NOT EXISTS không thêm cột).
    // ALTER không idempotent nên bọc try/catch cho lần chạy thứ hai trở đi.
    for (const column of [
      'job_id INTEGER',
      'app_identifier TEXT',
      'device_name TEXT',
      'user_name TEXT',
      'ip_address TEXT',
    ]) {
      try {
        await db.prepare(`ALTER TABLE api_logs ADD COLUMN ${column}`).run();
      } catch (_) {}
    }

    // 5. Tạo bảng app_crashes nếu chưa có
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS app_crashes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        app_identifier TEXT,
        error_message TEXT NOT NULL,
        stack_trace TEXT,
        is_fatal INTEGER DEFAULT 0,
        device_info TEXT,
        custom_attributes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 6. Tạo bảng app_events nếu chưa có
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS app_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        app_identifier TEXT,
        event_name TEXT NOT NULL,
        event_type TEXT DEFAULT 'event',
        screen_name TEXT,
        user_id TEXT,
        parameters TEXT,
        device_info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 6b. Bổ sung cột định danh người dùng / thiết bị cho app_events.
    // App đã gửi user_name + device_name trong payload từ lâu nhưng server bỏ qua,
    // nên không cắt lát thống kê theo người dùng được. ALTER không idempotent nên
    // bọc try/catch: lần chạy thứ hai trở đi sẽ báo "duplicate column" và bỏ qua.
    for (const column of ['user_name TEXT', 'device_name TEXT']) {
      try {
        await db.prepare(`ALTER TABLE app_events ADD COLUMN ${column}`).run();
      } catch (_) {}
    }

    // 7. Định nghĩa funnel để thống kê sự kiện (ví dụ: luồng eKYB)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS event_funnels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funnel_key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        app_identifier TEXT,
        event_prefix TEXT,
        config TEXT NOT NULL,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 8. Rollup theo ngày: app_events chỉ giữ vài ngày, bảng này giữ lịch sử dài hạn
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS event_funnel_daily (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funnel_key TEXT NOT NULL,
        app_identifier TEXT,
        day TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        outcome_auto INTEGER DEFAULT 0,
        outcome_manual INTEGER DEFAULT 0,
        outcome_failed INTEGER DEFAULT 0,
        outcome_abandoned INTEGER DEFAULT 0,
        outcome_open INTEGER DEFAULT 0,
        steps_json TEXT,
        reasons_json TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(funnel_key, app_identifier, day)
      )
    `).run();

    for (const index of [
      'CREATE INDEX IF NOT EXISTS idx_logs_created_at ON api_logs(created_at DESC)',
      // Sắp theo id chứ không phải created_at: danh sách luôn ORDER BY id DESC nên
      // index này phục vụ được cả lọc lẫn sắp xếp, khỏi dựng b-tree tạm.
      'CREATE INDEX IF NOT EXISTS idx_logs_job_id_desc ON api_logs(job_id, id DESC)',
      'CREATE INDEX IF NOT EXISTS idx_logs_app_id_desc ON api_logs(app_identifier, id DESC)',
      'CREATE INDEX IF NOT EXISTS idx_crashes_created_at ON app_crashes(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_crashes_app_id_desc ON app_crashes(app_identifier, id DESC)',
      'CREATE INDEX IF NOT EXISTS idx_events_created_at ON app_events(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_events_app_id_desc ON app_events(app_identifier, id DESC)',
      'CREATE INDEX IF NOT EXISTS idx_events_name_created ON app_events(event_name, created_at DESC)',
    ]) {
      try {
        await db.prepare(index).run();
      } catch (_) {}
    }
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_funnel_daily_lookup ON event_funnel_daily(funnel_key, day)'
    ).run();

    // Seed funnel sẵn có để mở tab Thống kê là thấy số ngay, khỏi cấu hình tay.
    // Tự động cập nhật tên và cấu hình chuẩn khi hệ thống nâng cấp.
    for (const funnel of SEEDED_FUNNELS) {
      await db.prepare(`
        INSERT INTO event_funnels (funnel_key, name, app_identifier, event_prefix, config)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(funnel_key) DO UPDATE SET
          name = excluded.name,
          config = excluded.config
      `).bind(
        funnel.funnel_key,
        funnel.name,
        funnel.app_identifier,
        funnel.event_prefix,
        JSON.stringify(funnel.config)
      ).run();
    }

    // 9. Cấu hình hệ thống (Telegram Bot, cảnh báo, tùy chọn)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 10. GIAI ĐOẠN 1: Bảng Quản lý Nhóm Sự Cố (Issues - APM Model)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT UNIQUE NOT NULL,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        app_identifier TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('crash', 'api_error')),
        title TEXT NOT NULL,
        culprit TEXT,
        status TEXT DEFAULT 'unresolved' CHECK(status IN ('unresolved', 'resolved', 'ignored')),
        severity TEXT DEFAULT 'error' CHECK(severity IN ('fatal', 'error', 'warning', 'info')),
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_occurrences INTEGER DEFAULT 1,
        user_count INTEGER DEFAULT 1,
        sample_payload TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    for (const idx of [
      'CREATE INDEX IF NOT EXISTS idx_issues_fingerprint ON issues(fingerprint)',
      'CREATE INDEX IF NOT EXISTS idx_issues_app_status ON issues(app_identifier, status)',
      'CREATE INDEX IF NOT EXISTS idx_issues_job_status ON issues(job_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_issues_last_seen ON issues(last_seen DESC)',
      'CREATE INDEX IF NOT EXISTS idx_issues_occurrences ON issues(total_occurrences DESC)',
    ]) {
      try { await db.prepare(idx).run(); } catch (_) {}
    }

    // Bổ sung cột issue_id và fingerprint cho app_crashes và api_logs (idempotent)
    for (const col of [
      'ALTER TABLE app_crashes ADD COLUMN issue_id INTEGER',
      'ALTER TABLE app_crashes ADD COLUMN fingerprint TEXT',
      'ALTER TABLE api_logs ADD COLUMN issue_id INTEGER',
      'ALTER TABLE api_logs ADD COLUMN fingerprint TEXT',
    ]) {
      try { await db.prepare(col).run(); } catch (_) {}
    }

    tablesInitialized = true;
  } catch (err) {
    console.error('ensureSchema error:', err);
  }
}

// ============================================================
// GIAI ĐOẠN 1: THUẬT TOÁN ISSUE FINGERPRINTING & UPSERT LOGIC
// ============================================================
async function generateIssueFingerprint(type, appIdentifier, errorTitle, culprit) {
  const normApp = (appIdentifier || 'unknown').trim().toLowerCase();
  const normTitle = normalizeErrorFingerprint(errorTitle || 'unknown');
  const normCulprit = normalizeErrorFingerprint(culprit || '');
  const raw = `${type}:${normApp}:${normTitle}:${normCulprit}`;

  const msgBuffer = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function upsertIssueRecord(db, {
  fingerprint,
  jobId = null,
  appIdentifier,
  type,
  title,
  culprit = null,
  severity = 'error',
  samplePayload = null,
  userCountIncrement = 0,
}) {
  if (!db || !fingerprint) return null;
  try {
    const serializedPayload = formatPayload(samplePayload);
    const shortTitle = String(title || 'Sự cố không xác định').slice(0, 250);
    const shortCulprit = culprit ? String(culprit).slice(0, 250) : null;

    const row = await db.prepare(`
      INSERT INTO issues (
        fingerprint, job_id, app_identifier, type, title, culprit,
        severity, status, first_seen, last_seen, total_occurrences,
        user_count, sample_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'unresolved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 1, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        total_occurrences = total_occurrences + 1,
        last_seen = CURRENT_TIMESTAMP,
        status = CASE WHEN status = 'resolved' THEN 'unresolved' ELSE status END,
        job_id = COALESCE(excluded.job_id, issues.job_id),
        severity = excluded.severity,
        sample_payload = COALESCE(excluded.sample_payload, issues.sample_payload),
        user_count = issues.user_count + ?
      RETURNING id, fingerprint, status, total_occurrences
    `).bind(
      fingerprint,
      jobId || null,
      appIdentifier || 'unknown',
      type,
      shortTitle,
      shortCulprit,
      severity,
      serializedPayload,
      userCountIncrement
    ).first();

    return row || null;
  } catch (err) {
    console.error('upsertIssueRecord error:', err);
    return null;
  }
}

// ==========================================
// CẤU HÌNH & CẢNH BÁO TELEGRAM (ALERTS)
// ==========================================
let settingsCache = { at: 0, data: null };
const SETTINGS_TTL_MS = 30000; // 30s

async function getSystemSettings(db) {
  if (settingsCache.data && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.data;
  }
  try {
    const { results } = await db.prepare('SELECT key, value FROM system_settings').all();
    const map = {};
    (results || []).forEach((row) => {
      map[row.key] = row.value;
    });
    settingsCache = { at: Date.now(), data: map };
    return map;
  } catch (_) {
    return {};
  }
}

function invalidateSettingsCache() {
  settingsCache = { at: 0, data: null };
}

// ==========================================
// CƠ CHẾ CHỐNG QUÁ TẢI & CẢNH BÁO TELEGRAM (OPTIMIZED)
// ==========================================
const alertThrottleMap = new Map();
let globalLastAlertSentTime = 0;
const GLOBAL_MIN_INTERVAL_MS = 2500; // Cách nhau tối thiểu 2.5s giữa các thông báo

// Giới hạn tốc độ toàn hệ thống (Rolling minute window)
let alertMinuteWindowStart = Date.now();
let alertsSentThisMinute = 0;
const MAX_ALERTS_PER_MINUTE = 6; // Tối đa 6 tin/phút toàn hệ thống
let isStormModeActive = false;
let stormSuppressedCount = 0;
let stormActivatedAt = 0;

// Cache tên Dự án / Job để không tốn D1 read quota
let jobDisplayNameCache = { at: 0, map: new Map() };
const JOB_CACHE_TTL = 60000; // 1 phút

async function getJobDisplayName(db, appId, jobId) {
  if (!db) return null;
  if (Date.now() - jobDisplayNameCache.at > JOB_CACHE_TTL) {
    try {
      const { results } = await db.prepare('SELECT id, name, app_identifier FROM jobs').all();
      const map = new Map();
      (results || []).forEach((j) => {
        if (j.id) map.set(`id:${j.id}`, j.name);
        if (j.app_identifier) map.set(`app:${j.app_identifier}`, j.name);
      });
      jobDisplayNameCache = { at: Date.now(), map };
    } catch (_) {}
  }
  if (jobId && jobDisplayNameCache.map.has(`id:${jobId}`)) return jobDisplayNameCache.map.get(`id:${jobId}`);
  if (appId && jobDisplayNameCache.map.has(`app:${appId}`)) return jobDisplayNameCache.map.get(`app:${appId}`);
  return null;
}

// Tự động dọn dẹp bộ nhớ định kỳ chống rò rỉ (memory leak)
let lastThrottleCleanup = Date.now();
function cleanupAlertThrottleMap() {
  const now = Date.now();
  if (now - lastThrottleCleanup < 300000) return; // 5 phút
  lastThrottleCleanup = now;
  for (const [key, val] of alertThrottleMap.entries()) {
    if (now - (val.lastSent || 0) > 900000) { // Quá 15 phút không xuất hiện
      alertThrottleMap.delete(key);
    }
  }
}

// Chuẩn hóa dấu vết lỗi (Error Fingerprint) để gom nhóm chính xác
function normalizeErrorFingerprint(str) {
  if (!str) return 'unknown';
  return String(str)
    .toLowerCase()
    .replace(/0x[0-9a-fA-F]+/g, 'hex')
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, 'uuid')
    .replace(/\b\d+\b/g, 'num')
    .replace(/\?.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendTelegramMessage(token, chatId, text) {
  if (!token || !chatId || !text) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      console.warn('Telegram API response not OK:', json);
      if (res.status === 429) {
        // Telegram rate limit: cooldown theo yêu cầu của Telegram
        const retryAfter = (json.parameters?.retry_after || 30) * 1000;
        globalLastAlertSentTime = Date.now() + retryAfter;
      }
    }
    return json.ok === true;
  } catch (err) {
    console.error('Telegram send error:', err);
    return false;
  }
}

async function triggerTelegramAlert(db, type, payload) {
  try {
    const settings = await getSystemSettings(db);
    const token = settings.telegram_bot_token;
    const chatId = settings.telegram_chat_id;
    if (!token || !chatId) return;

    if (type === 'fatal_crash' && settings.telegram_alert_crashes === '0') return;
    if (type === 'api_500' && settings.telegram_alert_api500 !== '1') return;

    const now = Date.now();
    cleanupAlertThrottleMap();

    // 1. Kiểm tra giới hạn tần suất toàn hệ thống (Window 1 phút)
    if (now - alertMinuteWindowStart > 60000) {
      alertMinuteWindowStart = now;
      alertsSentThisMinute = 0;
      // Thoát chế độ Storm nếu sau 3 phút tải đã hạ nhiệt
      if (isStormModeActive && now - stormActivatedAt > 180000) {
        if (stormSuppressedCount > 0) {
          const stormSummaryMsg = [
            `✅ <b>[Gden Flow] BÃO SỰ CỐ ĐÃ HẠ NHIỆT</b>`,
            `Trong đợt quá tải vừa qua, hệ thống đã tự động nén <b>${stormSuppressedCount} cảnh báo dồn dập</b> để bảo vệ bot và chống ngập tin nhắn.`,
            `Hệ thống hiện đã trở lại chế độ giám sát bình thường.`,
          ].join('\n');
          await sendTelegramMessage(token, chatId, stormSummaryMsg);
        }
        isStormModeActive = false;
        stormSuppressedCount = 0;
      }
    }

    // 2. Kích hoạt Bộ ngắt mạch chống Bão lỗi (Storm Mode Circuit Breaker)
    if (alertsSentThisMinute >= MAX_ALERTS_PER_MINUTE) {
      if (!isStormModeActive) {
        isStormModeActive = true;
        stormActivatedAt = now;
        stormSuppressedCount = 1;
        const stormAlertMsg = [
          `🚨 <b>[Gden Flow] BẢO VỆ QUÁ TẢI: KÍCH HOẠT CHẾ ĐỘ NÉN BÃO LỖI</b>`,
          `⚠️ Phát hiện tần suất sự cố tăng đột biến (> ${MAX_ALERTS_PER_MINUTE} lỗi/phút).`,
          `🛡️ Hệ thống tự động tạm dừng gửi thông báo đơn lẻ trong 3 phút để chống nghẽn và tránh bị Telegram khóa bot.`,
          `👉 Vui lòng mở Dashboard để theo dõi toàn bộ log chi tiết.`,
        ].join('\n');
        await sendTelegramMessage(token, chatId, stormAlertMsg);
        return;
      } else {
        stormSuppressedCount++;
        return; // Đang trong storm mode, nén toàn bộ
      }
    }

    // 3. Chuẩn hóa Fingerprint & Chống trùng lặp theo từng lỗi
    const app = (payload.app_identifier || 'Unknown App').trim();
    const jobId = payload.job_id || null;
    let fingerprintKey = '';
    let cooldownMs = 180000; // 3 phút mặc định

    if (type === 'fatal_crash') {
      const normalizedMsg = normalizeErrorFingerprint(payload.error_message);
      fingerprintKey = `crash:${app}:${normalizedMsg}`;
      cooldownMs = 120000; // 2 phút cho crash
    } else if (type === 'api_500') {
      const normalizedEndpoint = normalizeErrorFingerprint(payload.endpoint);
      const method = payload.method || 'GET';
      fingerprintKey = `api500:${app}:${method}:${normalizedEndpoint}`;
      cooldownMs = 180000; // 3 phút cho api 500
    }

    let trackEntry = alertThrottleMap.get(fingerprintKey);
    if (trackEntry) {
      if (now - trackEntry.lastSent < cooldownMs) {
        // Vẫn đang trong thời gian nén (cooldown)
        trackEntry.suppressedCount = (trackEntry.suppressedCount || 0) + 1;
        return;
      }
    } else {
      trackEntry = { lastSent: 0, suppressedCount: 0 };
      alertThrottleMap.set(fingerprintKey, trackEntry);
    }

    // 4. Giãn cách an toàn giữa 2 tin nhắn bất kỳ (Global Minimum Interval)
    if (now - globalLastAlertSentTime < GLOBAL_MIN_INTERVAL_MS) {
      trackEntry.suppressedCount = (trackEntry.suppressedCount || 0) + 1;
      return;
    }

    // 5. Chuẩn bị thông tin định danh (Dự án, môi trường, tần suất nén)
    const timeStr = new Date(now + VN_OFFSET_HOURS * 3600000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    const resolvedJobName = await getJobDisplayName(db, app, jobId);
    const projectName = resolvedJobName || app;
    const isTestEnv = /dev|test|stag|localhost|demo/i.test(app);
    const envBadge = isTestEnv ? '🟡 [STAGING/TEST]' : '🔴 [PRODUCTION]';

    const frequencyNote = trackEntry.suppressedCount > 0
      ? `🔁 <b>Tần suất dồn:</b> Đã lặp lại thêm <b>${trackEntry.suppressedCount} lần</b> trong ${Math.max(1, Math.round((now - trackEntry.lastSent) / 60000))} phút qua (Đã tự động nén chống spam)`
      : null;

    let msg = '';

    if (type === 'fatal_crash') {
      const device = payload.device_name || 'Thiết bị di động';
      const user = payload.user_name || 'Khách';
      const errMsg = String(payload.error_message || 'Sự cố không xác định').slice(0, 300);
      const stack = String(payload.stack_trace || '').slice(0, 400);

      msg = [
        `🚨 <b>${envBadge} CẢNH BÁO SẬP APP (FATAL CRASH)</b>`,
        `🏢 <b>Dự án:</b> <b>${escapeHtml(projectName)}</b>`,
        `📱 <b>App ID:</b> <code>${escapeHtml(app)}</code>`,
        `📟 <b>Thiết bị:</b> ${escapeHtml(device)}`,
        `👤 <b>Người dùng:</b> ${escapeHtml(user)}`,
        `💥 <b>Lỗi:</b> <code>${escapeHtml(errMsg)}</code>`,
        frequencyNote,
        stack ? `📜 <b>Stack Trace:</b>\n<pre>${escapeHtml(stack)}</pre>` : '',
        `🕒 <b>Thời gian:</b> ${timeStr}`,
      ].filter(Boolean).join('\n');
    } else if (type === 'api_500') {
      const endpoint = payload.endpoint || '';
      const method = payload.method || 'GET';
      const status = payload.status_code || 500;
      const errMsg = String(payload.error_message || '').slice(0, 250);

      msg = [
        `⚠️ <b>${envBadge} CẢNH BÁO LỖI MÁY CHỦ API (${status})</b>`,
        `🏢 <b>Dự án:</b> <b>${escapeHtml(projectName)}</b>`,
        `📱 <b>App ID:</b> <code>${escapeHtml(app)}</code>`,
        `🔗 <b>Endpoint:</b> <code>${escapeHtml(method)} ${escapeHtml(endpoint)}</code>`,
        errMsg ? `💥 <b>Chi tiết:</b> <code>${escapeHtml(errMsg)}</code>` : '',
        frequencyNote,
        `🕒 <b>Thời gian:</b> ${timeStr}`,
      ].filter(Boolean).join('\n');
    }

    if (msg) {
      const ok = await sendTelegramMessage(token, chatId, msg);
      if (ok) {
        trackEntry.lastSent = now;
        trackEntry.suppressedCount = 0;
        globalLastAlertSentTime = now;
        alertsSentThisMinute++;
      }
    }
  } catch (e) {
    console.error('triggerTelegramAlert error:', e);
  }
}

const jsonResponse = (data, status = 200, cacheControl = null) => {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (cacheControl) {
    headers['Cache-Control'] = cacheControl;
  } else if (status === 200) {
    headers['Cache-Control'] = 'no-cache';
  }
  return new Response(JSON.stringify(data), { status, headers });
};

// D1 free tier hết hạn mức đọc thì trả lỗi chứ không phải trả rỗng. Nhận diện để
// dashboard hiện cảnh báo rõ ràng thay vì "không có dữ liệu".
const isD1QuotaExceeded = (err) => {
  const message = (err?.message || String(err || '')).toLowerCase();
  return (
    message.includes('daily row read limit') ||
    message.includes('exceeded') ||
    message.includes('quota')
  );
};

const QUOTA_MESSAGE =
  'Tài khoản Cloudflare D1 Free Tier đã dùng hết hạn mức đọc trong ngày (reset lúc 00:00 UTC / 07:00 sáng giờ VN).';

// Dùng ở khối catch của các endpoint đọc: phân biệt hết hạn mức với lỗi thật.
const readErrorResponse = (err, extra = {}, db = null) => {
  if (isD1QuotaExceeded(err)) {
    return jsonResponse({ quota_exceeded: true, error: QUOTA_MESSAGE, ...extra }, 200, 'public, max-age=60');
  }
  // DB mới tinh chưa có bảng: vì schema chỉ được tạo ở lượt ghi, dựng lại ngay
  // để request kế tiếp chạy được thay vì hỏng mãi.
  if (db && /no such (table|column)/i.test(err?.message || '')) {
    tablesInitialized = false;
    ensureSchema(db).catch(() => {});
  }
  return jsonResponse({ error: err.message, ...extra }, 500);
};

const formatPayload = (val) => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
};

const loadFunnel = async (db, funnelKey) => {
  const row = await db
    .prepare('SELECT * FROM event_funnels WHERE funnel_key = ?')
    .bind(funnelKey)
    .first();
  return row ? mapFunnelRow(row) : null;
};

// GROUP BY trên cả bảng là một lần quét toàn bảng. Danh mục sự kiện chỉ dùng để
// gợi ý khi cấu hình, nên chỉ cần nhìn vào các dòng gần nhất là đủ.
const CATALOG_SCAN_ROWS = 5000;

const listDistinctEventNames = async (db, appIdentifier = null) => {
  const inner = appIdentifier
    ? 'SELECT event_name FROM app_events WHERE app_identifier = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT event_name FROM app_events ORDER BY created_at DESC LIMIT ?';
  const binds = appIdentifier ? [appIdentifier, CATALOG_SCAN_ROWS] : [CATALOG_SCAN_ROWS];

  const { results } = await db
    .prepare(
      `SELECT event_name, COUNT(*) AS total FROM (${inner}) GROUP BY event_name ORDER BY total DESC LIMIT 300`
    )
    .bind(...binds)
    .all();
  return results || [];
};

// Đọc các giá trị outcome thực tế trong DB rồi xếp sẵn vào nhóm, để cấu hình
// funnel lưu xuống là tường minh và sửa được trên UI thay vì đoán lại mỗi lần.
const deriveOutcomeBuckets = async (db, completeEvent, outcomeParam, appIdentifier) => {
  if (!completeEvent) return {};
  try {
    const sql = `
      SELECT DISTINCT json_extract(parameters, '$.' || ?) AS outcome
      FROM (
        SELECT parameters FROM app_events
        WHERE event_name = ?${appIdentifier ? ' AND app_identifier = ?' : ''}
        ORDER BY created_at DESC
        LIMIT 500
      )
      LIMIT 50
    `;
    const binds = [outcomeParam || 'outcome', completeEvent];
    if (appIdentifier) binds.push(appIdentifier);
    const { results } = await db.prepare(sql).bind(...binds).all();

    const map = {};
    (results || []).forEach((row) => {
      if (row.outcome === null || row.outcome === undefined || row.outcome === '') return;
      const bucket = classifyOutcome(row.outcome);
      if (bucket) map[row.outcome] = bucket;
    });
    return map;
  } catch (_) {
    return {};
  }
};

/**
 * Chốt số liệu từng ngày vào event_funnel_daily trước khi cron xoá dữ liệu thô.
 *
 * app_events chỉ giữ vài ngày, nên nếu không chốt lại thì mọi thống kê dài hơn
 * cửa sổ đó sẽ biến mất. Chạy lại nhiều lần trên cùng một ngày là an toàn: bảng
 * có UNIQUE(funnel_key, app_identifier, day) và câu lệnh dùng UPSERT.
 *
 * app_identifier lưu chuỗi rỗng thay vì NULL — trong SQLite hai giá trị NULL
 * được coi là khác nhau trong UNIQUE index, dùng NULL sẽ đẻ ra bản ghi trùng.
 */
async function rollupFunnels(db, daysBack = 2) {
  const { results } = await db
    .prepare("SELECT * FROM event_funnels WHERE status = 'active'")
    .all();

  for (const row of results || []) {
    const funnel = mapFunnelRow(row);
    for (let offset = 0; offset <= daysBack; offset += 1) {
      const day = vnDay(offset);
      try {
        const stats = await computeFunnelStats(db, funnel, {
          dayFrom: day,
          dayTo: day,
          groupBy: 'day',
        });
        if (!stats.totals.events) continue;

        const counts = Object.fromEntries(stats.outcomes.map((o) => [o.key, o.count]));
        await db
          .prepare(
            `
            INSERT INTO event_funnel_daily (
              funnel_key, app_identifier, day, attempts,
              outcome_auto, outcome_manual, outcome_failed, outcome_abandoned, outcome_open,
              steps_json, reasons_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(funnel_key, app_identifier, day) DO UPDATE SET
              attempts = excluded.attempts,
              outcome_auto = excluded.outcome_auto,
              outcome_manual = excluded.outcome_manual,
              outcome_failed = excluded.outcome_failed,
              outcome_abandoned = excluded.outcome_abandoned,
              outcome_open = excluded.outcome_open,
              steps_json = excluded.steps_json,
              reasons_json = excluded.reasons_json,
              updated_at = CURRENT_TIMESTAMP
            `
          )
          .bind(
            funnel.funnel_key,
            funnel.app_identifier || '',
            day,
            stats.totals.attempts,
            counts.success_auto || 0,
            counts.success_manual || 0,
            counts.failed || 0,
            counts.abandoned || 0,
            counts.open || 0,
            JSON.stringify(stats.steps),
            JSON.stringify(stats.top_failures)
          )
          .run();
      } catch (err) {
        console.error(`rollupFunnels failed for ${funnel.funnel_key} @ ${day}:`, err.message);
      }
    }
  }
}

// ==========================================
// TỐI ƯU SỐ DÒNG ĐỌC CỦA D1
// ==========================================
//
// Trước đây mọi truy vấn danh sách đều JOIN jobs/users bằng điều kiện OR:
//   LEFT JOIN jobs j ON (l.job_id = j.id) OR (l.app_identifier = j.app_identifier)
// SQLite không dùng được index cho điều kiện OR, và vì WHERE có tham chiếu tới
// cột của j nên LIMIT không thể dừng sớm. EXPLAIN QUERY PLAN cho ra ba dòng
// "SCAN" liên tiếp: mỗi request quét sạch api_logs, rồi quét jobs và users một
// lần cho từng dòng. Với vài chục nghìn log và dashboard tự làm mới 15 giây một
// lần, số dòng đọc phình lên hàng triệu mỗi ngày và đốt sạch hạn mức D1.
//
// jobs và users chỉ có vài dòng và gần như không đổi, nên cách rẻ nhất là nạp
// một lần, giữ trong bộ nhớ isolate, rồi ghép bằng JS. Truy vấn telemetry nhờ
// đó chỉ còn đọc đúng số dòng nó trả về.
const DIMENSION_TTL_MS = 60000;
let dimensionCache = { at: 0, jobs: [], users: [] };

async function loadDimensions(db, force = false) {
  if (!force && dimensionCache.at && Date.now() - dimensionCache.at < DIMENSION_TTL_MS) {
    return dimensionCache;
  }
  try {
    const [jobsResult, usersResult] = await Promise.all([
      db.prepare('SELECT id, user_id, name, type, app_identifier FROM jobs').all(),
      db.prepare('SELECT id, name, email FROM users').all(),
    ]);
    dimensionCache = {
      at: Date.now(),
      jobs: jobsResult.results || [],
      users: usersResult.results || [],
    };
  } catch (_) {
    dimensionCache = { at: Date.now(), jobs: [], users: [] };
  }
  return dimensionCache;
}

// Danh sách thiết bị / người dùng cho dropdown đổi rất chậm, không đáng để tính lại
// mỗi lần mở dashboard.
const FILTER_TTL_MS = 300000;
const FILTER_SCAN_ROWS = 1000;
const filterCacheMap = new Map();

const invalidateDimensions = () => {
  dimensionCache = { at: 0, jobs: [], users: [] };
  filterCacheMap.clear();
};

const isBrowserDevice = (dev) => {
  if (!dev) return false;
  const s = String(dev).toLowerCase();
  return (
    s.includes('chrome') ||
    s.includes('safari') ||
    s.includes('firefox') ||
    s.includes('edge') ||
    s.includes('browser') ||
    s.includes('trình duyệt') ||
    s.includes('windows') ||
    s.includes('macos') ||
    s.includes('linux') ||
    s.includes('opera') ||
    s.includes('web')
  );
};

// Ghép tên job / chủ sở hữu vào từng dòng telemetry — việc mà JOIN vẫn làm trước đây.
const decorateRows = (rows, dims) => {
  const jobById = new Map(dims.jobs.map((job) => [String(job.id), job]));
  const jobByApp = new Map(
    dims.jobs.filter((job) => job.app_identifier).map((job) => [job.app_identifier, job])
  );
  const userById = new Map(dims.users.map((user) => [String(user.id), user]));

  return (rows || []).map((row) => {
    const job =
      (row.job_id !== null && row.job_id !== undefined && jobById.get(String(row.job_id))) ||
      (row.app_identifier && jobByApp.get(row.app_identifier)) ||
      null;
    const owner = job ? userById.get(String(job.user_id)) : null;

    return {
      ...row,
      job_id: row.job_id ?? job?.id ?? null,
      job_name: job?.name || null,
      job_type: job?.type || null,
      owner_id: owner?.id ?? null,
      owner_name: owner?.name || null,
    };
  });
};

/**
 * Chuyển bộ lọc của dashboard thành MỘT điều kiện dùng được index.
 * Hỗ trợ phân quyền phân hệ platform ('web' hoặc 'app').
 */
const buildScopeClause = (dims, { userId, jobId, appIdentifier, platform }, columnPrefix = '') => {
  let jobs = dims.jobs;

  // Lọc theo nền tảng nếu có
  if (platform === 'web') {
    jobs = jobs.filter((job) => job.type === 'web');
  } else if (platform === 'app') {
    jobs = jobs.filter((job) => job.type === 'app' || !job.type);
  }

  if (jobId) jobs = jobs.filter((job) => String(job.id) === String(jobId));
  if (userId) jobs = jobs.filter((job) => String(job.user_id) === String(userId));
  if (appIdentifier) jobs = jobs.filter((job) => job.app_identifier === appIdentifier);

  const appIds = Array.from(new Set(jobs.map((job) => job.app_identifier).filter(Boolean)));
  if (!appIds.length && appIdentifier) appIds.push(appIdentifier);

  // Nếu người dùng chọn đích danh userId, jobId, hoặc appIdentifier
  if (userId || jobId || appIdentifier) {
    if (appIds.length) {
      return {
        clause: ` AND ${columnPrefix}app_identifier IN (${appIds.map(() => '?').join(', ')})`,
        params: appIds,
      };
    }
    const jobIds = jobs.map((job) => job.id);
    if (jobIds.length) {
      return {
        clause: ` AND ${columnPrefix}job_id IN (${jobIds.map(() => '?').join(', ')})`,
        params: jobIds,
      };
    }
    return { clause: ' AND 1 = 0', params: [] };
  }

  // Nếu người dùng chọn 'all' nhưng có chỉ định platform
  if (platform === 'web') {
    const webJobs = dims.jobs.filter((j) => j.type === 'web');
    const webAppIds = webJobs.map((j) => j.app_identifier).filter(Boolean);
    webAppIds.push('vn.myportal.web');
    const uniqueWebAppIds = Array.from(new Set(webAppIds));

    return {
      clause: ` AND (${columnPrefix}app_identifier IN (${uniqueWebAppIds.map(() => '?').join(', ')}) OR ${columnPrefix}app_identifier LIKE '%web%' OR ${columnPrefix}device_name LIKE '%Web%' OR ${columnPrefix}device_name LIKE '%Chrome%' OR ${columnPrefix}device_name LIKE '%Firefox%' OR ${columnPrefix}device_name LIKE '%Safari%' OR ${columnPrefix}device_name LIKE '%Edge%')`,
      params: uniqueWebAppIds,
    };
  }

  if (platform === 'app') {
    const webJobs = dims.jobs.filter((j) => j.type === 'web');
    const webAppIds = webJobs.map((j) => j.app_identifier).filter(Boolean);
    webAppIds.push('vn.myportal.web');
    const uniqueWebAppIds = Array.from(new Set(webAppIds));

    return {
      clause: ` AND (${columnPrefix}app_identifier NOT IN (${uniqueWebAppIds.map(() => '?').join(', ')}) OR ${columnPrefix}app_identifier IS NULL) AND (${columnPrefix}app_identifier NOT LIKE '%web%' OR ${columnPrefix}app_identifier IS NULL) AND (${columnPrefix}device_name IS NULL OR (${columnPrefix}device_name NOT LIKE '%Chrome%' AND ${columnPrefix}device_name NOT LIKE '%Firefox%' AND ${columnPrefix}device_name NOT LIKE '%Safari%' AND ${columnPrefix}device_name NOT LIKE '%Edge%' AND ${columnPrefix}device_name NOT LIKE '%Web Browser%'))`,
      params: uniqueWebAppIds,
    };
  }

  if (!userId && !jobId && !appIdentifier && !platform) return { clause: '', params: [] };

  return { clause: ' AND 1 = 0', params: [] };
};

// Giới hạn chung cho mọi truy vấn danh sách, để một request hỏng cũng không thể
// kéo về vài chục nghìn dòng.
const readLimit = (url, fallback = 100, max = 300) =>
  Math.min(Math.max(Number(url.searchParams.get('limit')) || fallback, 1), max);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '').replace(/^\/+/, '/');

    // Chỉ kiểm tra schema khi GHI. Chạy trên cả lượt đọc nghĩa là mỗi request
    // kéo theo hàng chục câu DDL, vừa chậm vừa tốn hạn mức.
    // /funnels là ngoại lệ: bảng cấu hình chỉ được tạo ở đây, và endpoint này
    // gọi rất thưa nên chi phí không đáng kể.
    const isWrite = request.method !== 'GET' && request.method !== 'HEAD';
    if (
      (isWrite &&
        (path.startsWith('/logs') ||
          path.startsWith('/users') ||
          path.startsWith('/jobs') ||
          path.startsWith('/crashes') ||
          path.startsWith('/events') ||
          path.startsWith('/settings') ||
          path.startsWith('/telemetry/batch'))) ||
      path.startsWith('/funnels') ||
      path.startsWith('/settings') ||
      path.startsWith('/issues')
    ) {
      await ensureSchema(env.DB);
    }

    // ==========================================
    // 0. API TELEMETRY METADATA FILTERS: /telemetry/filters
    // ==========================================
    if (path === '/telemetry/filters' && request.method === 'GET') {
      try {
        const platform = (url.searchParams.get('platform') || '').trim().toLowerCase();
        const cacheKey = platform || 'all';
        const cached = filterCacheMap.get(cacheKey);
        if (cached && Date.now() - cached.at < FILTER_TTL_MS) {
          return jsonResponse(cached.value);
        }

        const dims = await loadDimensions(env.DB);

        // Danh sách app lấy thẳng từ bảng jobs — không cần quét bảng telemetry
        const appsMap = new Map();
        dims.jobs.forEach((job) => {
          if (!job.app_identifier) return;
          const owner = dims.users.find((user) => String(user.id) === String(job.user_id));
          appsMap.set(job.app_identifier, {
            id: String(job.user_id || job.id || job.app_identifier),
            filterValue: String(job.user_id || job.app_identifier),
            job_name: job.name || job.app_identifier,
            app_identifier: job.app_identifier,
            job_type: job.type || 'app',
            user_name: owner?.name || 'Hệ thống',
          });
        });

        const [recentLogs, recentEvents, recentCrashes] = await Promise.all([
          env.DB.prepare(
            'SELECT app_identifier, device_name, user_name FROM api_logs ORDER BY created_at DESC LIMIT ?'
          ).bind(FILTER_SCAN_ROWS).all(),
          env.DB.prepare(
            'SELECT app_identifier, device_name, user_name, user_id, substr(device_info, 1, 200) AS device_info FROM app_events ORDER BY created_at DESC LIMIT ?'
          ).bind(FILTER_SCAN_ROWS).all(),
          env.DB.prepare(
            'SELECT app_identifier, substr(device_info, 1, 200) AS device_info FROM app_crashes ORDER BY created_at DESC LIMIT ?'
          ).bind(Math.floor(FILTER_SCAN_ROWS / 2)).all(),
        ]);

        const deviceSet = new Set();
        const userSet = new Set();

        const addDeviceInfo = (raw) => {
          if (!raw) return;
          const parsed = safeJsonParse(raw, null);
          if (parsed && typeof parsed === 'object') {
            const device = parsed.device_name || parsed.model || parsed.name || parsed.device || parsed.os || parsed.browser;
            if (device) {
              deviceSet.add(String(device).trim());
              return;
            }
          }
          if (typeof raw === 'string') deviceSet.add(raw.trim().slice(0, 50));
        };

        const allRows = [
          ...(recentLogs.results || []),
          ...(recentEvents.results || []),
          ...(recentCrashes.results || []),
        ];

        allRows.forEach((row) => {
          if (row.device_name) deviceSet.add(String(row.device_name).trim());
          else addDeviceInfo(row.device_info);

          if (row.user_name) userSet.add(String(row.user_name).trim());
          else if (row.user_id) userSet.add(String(row.user_id).trim());

          if (row.app_identifier && !appsMap.has(row.app_identifier)) {
            const isWeb = row.app_identifier.includes('web') || row.app_identifier.includes('portal');
            appsMap.set(row.app_identifier, {
              id: row.app_identifier,
              filterValue: row.app_identifier,
              job_name: row.app_identifier,
              app_identifier: row.app_identifier,
              job_type: isWeb ? 'web' : 'app',
              user_name: isWeb ? 'Web Client' : 'Telemetry App',
            });
          }
        });

        dims.users.forEach((user) => {
          if (user.name) userSet.add(String(user.name).trim());
        });

        let allApps = Array.from(appsMap.values());
        let allDevices = Array.from(deviceSet).filter(Boolean);
        let allUsers = Array.from(userSet).filter(Boolean);

        if (platform === 'web') {
          allApps = allApps.filter((a) => a.job_type === 'web');
          allDevices = allDevices.filter((d) => isBrowserDevice(d));
          if (!allDevices.length) {
            allDevices = ['Chrome Web', 'Firefox Web', 'Safari Web', 'Edge Web'];
          }
          const webUserCandidates = allUsers.filter(
            (u) => u.toLowerCase().includes('web') || u.toLowerCase().includes('admin') || u.toLowerCase().includes('dev')
          );
          allUsers = webUserCandidates.length ? webUserCandidates : ['web-dev', 'Web Developer'];
        } else if (platform === 'app') {
          allApps = allApps.filter((a) => a.job_type === 'app' || !a.job_type);
          allDevices = allDevices.filter((d) => !isBrowserDevice(d));
          allUsers = allUsers.filter(
            (u) => !u.toLowerCase().includes('web-dev') && !u.toLowerCase().includes('web developer')
          );
        }

        const value = {
          apps: allApps,
          devices: allDevices.sort(),
          users: allUsers.sort(),
        };
        filterCacheMap.set(cacheKey, { at: Date.now(), value });
        return jsonResponse(value, 200, 'public, max-age=30, stale-while-revalidate=60');
      } catch (e) {
        return readErrorResponse(e, { apps: [], devices: [], users: [] }, env.DB);
      }
    }

    // ==========================================
    // 1. API USERS: /users
    // ==========================================
    if (path === '/users' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(`
          SELECT 
            u.id, u.name, u.email, u.created_at,
            j.id as job_id, j.name as job_name, j.type as job_type, 
            j.app_identifier, j.target_url, j.status as job_status, j.created_at as job_created_at
          FROM users u
          LEFT JOIN jobs j ON u.id = j.user_id
          ORDER BY u.created_at DESC
        `).all();
        return jsonResponse(results);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (path === '/users' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { name, email, job_name, job_type, app_identifier, target_url } = body;

        if (!name || !email) {
          return jsonResponse({ error: 'Name and email are required' }, 400);
        }

        // Tạo user
        const userInsert = await env.DB.prepare(
          'INSERT INTO users (name, email) VALUES (?, ?)'
        ).bind(name.trim(), email.trim()).run();

        const userId = userInsert.meta?.last_row_id;

        // Nếu có khai báo thông tin Job (mỗi user theo dõi 1 app hoặc 1 web)
        if (userId && (job_name || app_identifier)) {
          const sanitizedIdentifier = (app_identifier || `${job_type || 'app'}_${Date.now()}`).trim().toLowerCase().replace(/\s+/g, '_');
          await env.DB.prepare(`
            INSERT INTO jobs (user_id, name, type, app_identifier, target_url, status)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            userId,
            job_name || `${name}'s ${job_type === 'web' ? 'Web' : 'App'}`,
            job_type === 'web' ? 'web' : 'app',
            sanitizedIdentifier,
            target_url || null,
            'active'
          ).run();
        }

        invalidateDimensions();
        return jsonResponse({ success: true, user_id: userId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // DELETE /users/:id
    const userMatch = path.match(/^\/users\/(\d+)$/);
    if (userMatch && request.method === 'DELETE') {
      try {
        const userId = Number(userMatch[1]);
        await env.DB.prepare('DELETE FROM jobs WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
        invalidateDimensions();
        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 2. API JOBS: /jobs
    // ==========================================
    if (path === '/jobs' && request.method === 'GET') {
      try {
        const userIdParam = url.searchParams.get('user_id');
        const typeParam = url.searchParams.get('type');

        let query = `
          SELECT 
            j.*, 
            u.name as user_name, u.email as user_email
          FROM jobs j
          LEFT JOIN users u ON j.user_id = u.id
          WHERE 1=1
        `;
        const params = [];

        if (userIdParam) {
          query += ' AND j.user_id = ?';
          params.push(Number(userIdParam));
        }
        if (typeParam) {
          query += ' AND j.type = ?';
          params.push(typeParam);
        }

        query += ' ORDER BY j.created_at DESC';

        const stmt = env.DB.prepare(query);
        const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
        return jsonResponse(results);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (path === '/jobs' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { user_id, name, type, app_identifier, target_url, status } = body;

        if (!user_id || !name || !app_identifier) {
          return jsonResponse({ error: 'user_id, name, and app_identifier are required' }, 400);
        }

        const sanitizedIdentifier = app_identifier.trim().toLowerCase().replace(/\s+/g, '_');

        // Mỗi user theo dõi 1 app/web: Cập nhật hoặc thêm mới
        const existingJob = await env.DB.prepare('SELECT id FROM jobs WHERE user_id = ?').bind(user_id).first();
        if (existingJob) {
          await env.DB.prepare(`
            UPDATE jobs 
            SET name = ?, type = ?, app_identifier = ?, target_url = ?, status = ?
            WHERE user_id = ?
          `).bind(
            name.trim(),
            type === 'web' ? 'web' : 'app',
            sanitizedIdentifier,
            target_url || null,
            status || 'active',
            user_id
          ).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO jobs (user_id, name, type, app_identifier, target_url, status)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            user_id,
            name.trim(),
            type === 'web' ? 'web' : 'app',
            sanitizedIdentifier,
            target_url || null,
            status || 'active'
          ).run();
        }

        invalidateDimensions();
        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    const jobMatch = path.match(/^\/jobs\/(\d+)$/);
    if (jobMatch && request.method === 'DELETE') {
      try {
        const jobId = Number(jobMatch[1]);
        await env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(jobId).run();
        invalidateDimensions();
        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 3. API LOGS: /logs
    // ==========================================
    if (path === '/logs' && request.method === 'GET') {
      try {
        const dims = await loadDimensions(env.DB);
        const limit = readLimit(url);
        const afterId = Number(url.searchParams.get('after_id')) || 0;
        const deviceParam = url.searchParams.get('device') || url.searchParams.get('device_name');
        const ipParam = url.searchParams.get('ip') || url.searchParams.get('ip_address');
        const userParam = url.searchParams.get('user') || url.searchParams.get('user_name');

        // Không JOIN: tên job / chủ sở hữu ghép bằng JS từ dims đã nạp sẵn.
        // response_payload chỉ lấy 300 ký tự đầu vì danh sách chỉ cần đoạn tóm tắt;
        // bản đầy đủ lấy qua /telemetry/detail khi người dùng bấm xem chi tiết.
        let query = `
          SELECT
            id, job_id, app_identifier, endpoint, method, status_code,
            error_message, duration_ms, ip_address, user_name, created_at,
            COALESCE(device_name, 'Thiết bị di động') AS device_name,
            substr(response_payload, 1, 300) AS response_payload
          FROM api_logs
          WHERE 1=1
        `;
        const params = [];

        const scope = buildScopeClause(dims, {
          userId: url.searchParams.get('user_id'),
          jobId: url.searchParams.get('job_id'),
          appIdentifier: url.searchParams.get('app_identifier') || url.searchParams.get('app_id'),
          platform: url.searchParams.get('platform') || url.searchParams.get('job_type'),
        });
        query += scope.clause;
        params.push(...scope.params);

        if (deviceParam) {
          query += ' AND device_name = ?';
          params.push(deviceParam);
        }
        if (userParam) {
          query += ' AND user_name = ?';
          params.push(userParam);
        }
        if (ipParam) {
          query += ' AND ip_address = ?';
          params.push(ipParam);
        }

        // Chế độ tăng dần: dashboard chỉ hỏi những dòng mới hơn dòng nó đang giữ,
        // nên một dashboard mở cả ngày mà không có traffic gần như không đọc dòng nào.
        if (afterId > 0) {
          query += ' AND id > ? ORDER BY id DESC LIMIT ?';
          params.push(afterId, limit);
        } else {
          // Sắp xếp theo id thay vì created_at: id là INTEGER PRIMARY KEY nên vừa
          // tăng dần đúng theo thứ tự ghi, vừa không cần b-tree tạm để sort. Dùng
          // created_at sẽ cho thứ tự bất định khi nhiều dòng trùng giây.
          query += ' ORDER BY id DESC LIMIT ?';
          params.push(limit);
        }

        const { results } = await env.DB.prepare(query).bind(...params).all();
        return jsonResponse(decorateRows(results, dims));
      } catch (e) {
        return readErrorResponse(e, {}, env.DB);
      }
    }

    if (path === '/logs' && request.method === 'POST') {
      try {
        const body = await request.json();
        const {
          endpoint,
          method,
          status_code,
          error_message,
          request_payload,
          response_payload,
          duration_ms,
          app_id,
          app_identifier,
          job_id,
          device_name,
          device_info,
          user_name,
          user,
          user_id,
          ip_address,
        } = body;

        const clientIp = (
          request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-forwarded-for')?.split(',')[0] ||
          request.headers.get('x-real-ip') ||
          ip_address ||
          body.ip ||
          ''
        ).trim();

        const clientUserName = (user_name || user || (user_id ? String(user_id) : '')).trim();

        let effectiveDeviceName = (device_name || body.device || '').trim();
        if (!effectiveDeviceName && device_info) {
          if (typeof device_info === 'object') {
            effectiveDeviceName = (device_info.device_name || device_info.model || device_info.name || device_info.os || '').trim();
          } else if (typeof device_info === 'string') {
            try {
              const parsed = JSON.parse(device_info);
              effectiveDeviceName = (parsed.device_name || parsed.model || parsed.name || parsed.os || '').trim();
            } catch (_) {
              effectiveDeviceName = device_info.slice(0, 50).trim();
            }
          }
        }
        if (!effectiveDeviceName) {
          const ua = request.headers.get('user-agent') || '';
          if (ua.includes('iPhone')) effectiveDeviceName = 'Apple iPhone';
          else if (ua.includes('iPad')) effectiveDeviceName = 'Apple iPad';
          else if (ua.includes('Android')) effectiveDeviceName = 'Thiết bị Android';
          else if (ua.includes('Windows')) effectiveDeviceName = 'Windows PC';
          else if (ua.includes('Macintosh')) effectiveDeviceName = 'Apple Mac';
          else if (ua.includes('Linux')) effectiveDeviceName = 'Linux Client';
          else if (ua.includes('Dart')) effectiveDeviceName = 'Flutter Mobile';
          else effectiveDeviceName = 'Thiết bị di động';
        }

        const effectiveAppIdentifier = (app_identifier || app_id || '').trim();
        let effectiveJobId = job_id ? Number(job_id) : null;

        // Nếu chưa có job_id nhưng có app_identifier, tìm kiếm job_id tương ứng
        if (!effectiveJobId && effectiveAppIdentifier) {
          try {
            const matchedJob = await env.DB.prepare(
              'SELECT id FROM jobs WHERE app_identifier = ?'
            ).bind(effectiveAppIdentifier).first();
            if (matchedJob) {
              effectiveJobId = matchedJob.id;
            }
          } catch (_) {}
        }

        let logIssueId = null;
        let logFingerprint = null;

        if (status_code && Number(status_code) >= 500) {
          const title = `${(method || 'GET').toUpperCase()} ${endpoint} (${status_code})`;
          const culprit = error_message ? String(error_message).slice(0, 200) : endpoint;
          logFingerprint = await generateIssueFingerprint('api_error', effectiveAppIdentifier, title, culprit);
          const issue = await upsertIssueRecord(env.DB, {
            fingerprint: logFingerprint,
            jobId: effectiveJobId,
            appIdentifier: effectiveAppIdentifier,
            type: 'api_error',
            title,
            culprit,
            severity: 'error',
            samplePayload: { endpoint, method, status_code, error_message, request_payload, response_payload },
          });
          logIssueId = issue?.id || null;

          triggerTelegramAlert(env.DB, 'api_500', {
            app_identifier: effectiveAppIdentifier,
            endpoint,
            method,
            status_code,
            error_message,
            job_id: effectiveJobId,
            issue_id: logIssueId,
          }).catch(() => {});
        }

        try {
          await env.DB.prepare(`
            INSERT INTO api_logs (
              job_id, app_identifier, endpoint, method, status_code, 
              error_message, request_payload, response_payload, duration_ms,
              device_name, user_name, ip_address, issue_id, fingerprint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            effectiveJobId,
            effectiveAppIdentifier || null,
            endpoint || '',
            method || 'GET',
            status_code || null,
            error_message || null,
            formatPayload(request_payload),
            formatPayload(response_payload),
            duration_ms || 0,
            effectiveDeviceName || null,
            clientUserName || null,
            clientIp || null,
            logIssueId,
            logFingerprint
          ).run();
        } catch (insertErr) {
          // Fallback nếu cột mới chưa cập nhật
          await env.DB.prepare(`
            INSERT INTO api_logs (
              job_id, app_identifier, endpoint, method, status_code, 
              error_message, request_payload, response_payload, duration_ms,
              device_name, user_name, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            effectiveJobId,
            effectiveAppIdentifier || null,
            endpoint || '',
            method || 'GET',
            status_code || null,
            error_message || null,
            formatPayload(request_payload),
            formatPayload(response_payload),
            duration_ms || 0,
            effectiveDeviceName || null,
            clientUserName || null,
            clientIp || null
          ).run();
        }

        return jsonResponse({ success: true, job_id: effectiveJobId, issue_id: logIssueId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 4. API CRASHES: /crashes (Crashlytics)
    // ==========================================
    if (path === '/crashes' && request.method === 'GET') {
      try {
        const dims = await loadDimensions(env.DB);
        const limit = readLimit(url);
        const afterId = Number(url.searchParams.get('after_id')) || 0;
        const isFatal = url.searchParams.get('is_fatal');
        const deviceParam = url.searchParams.get('device');

        let query = `
          SELECT
            id, job_id, app_identifier, error_message, is_fatal, created_at,
            substr(stack_trace, 1, 500) AS stack_trace,
            substr(device_info, 1, 300) AS device_info,
            substr(custom_attributes, 1, 300) AS custom_attributes
          FROM app_crashes
          WHERE 1=1
        `;
        const params = [];

        const scope = buildScopeClause(dims, {
          userId: url.searchParams.get('user_id'),
          jobId: url.searchParams.get('job_id'),
          appIdentifier: url.searchParams.get('app_identifier') || url.searchParams.get('app_id'),
          platform: url.searchParams.get('platform') || url.searchParams.get('job_type'),
        });
        query += scope.clause;
        params.push(...scope.params);

        if (isFatal !== null && isFatal !== undefined && isFatal !== '') {
          query += ' AND is_fatal = ?';
          params.push(Number(isFatal));
        }
        if (deviceParam) {
          query += ' AND device_info LIKE ?';
          params.push(`%${deviceParam}%`);
        }

        if (afterId > 0) {
          query += ' AND id > ? ORDER BY id DESC LIMIT ?';
          params.push(afterId, limit);
        } else {
          // Sắp xếp theo id thay vì created_at: id là INTEGER PRIMARY KEY nên vừa
          // tăng dần đúng theo thứ tự ghi, vừa không cần b-tree tạm để sort. Dùng
          // created_at sẽ cho thứ tự bất định khi nhiều dòng trùng giây.
          query += ' ORDER BY id DESC LIMIT ?';
          params.push(limit);
        }

        const { results } = await env.DB.prepare(query).bind(...params).all();
        return jsonResponse(decorateRows(results, dims));
      } catch (e) {
        return readErrorResponse(e, {}, env.DB);
      }
    }

    if (path === '/crashes' && request.method === 'POST') {
      try {
        const body = await request.json();
        const {
          error_message,
          stack_trace,
          is_fatal,
          device_info,
          custom_attributes,
          app_id,
          app_identifier,
          job_id,
        } = body;

        if (!error_message) {
          return jsonResponse({ error: 'error_message is required' }, 400);
        }

        const effectiveAppIdentifier = (app_identifier || app_id || '').trim();
        let effectiveJobId = job_id ? Number(job_id) : null;

        if (!effectiveJobId && effectiveAppIdentifier) {
          try {
            const matchedJob = await env.DB.prepare(
              'SELECT id FROM jobs WHERE app_identifier = ?'
            ).bind(effectiveAppIdentifier).first();
            if (matchedJob) {
              effectiveJobId = matchedJob.id;
            }
          } catch (_) {}
        }

        const crashTitle = String(error_message || 'App Crash').split('\n')[0].slice(0, 200);
        let crashCulprit = null;
        if (stack_trace) {
          const lines = String(stack_trace).split('\n').map((l) => l.trim()).filter(Boolean);
          crashCulprit = lines.find((l) => l.includes('.dart') || l.includes('.js') || l.includes('.ts') || l.includes(':')) || lines[0] || null;
        }

        const crashFingerprint = await generateIssueFingerprint('crash', effectiveAppIdentifier, crashTitle, crashCulprit);
        const crashIssue = await upsertIssueRecord(env.DB, {
          fingerprint: crashFingerprint,
          jobId: effectiveJobId,
          appIdentifier: effectiveAppIdentifier,
          type: 'crash',
          title: crashTitle,
          culprit: crashCulprit,
          severity: is_fatal ? 'fatal' : 'error',
          samplePayload: { error_message, stack_trace, device_info, custom_attributes },
        });
        const issueId = crashIssue?.id || null;

        let res;
        try {
          res = await env.DB.prepare(`
            INSERT INTO app_crashes (
              job_id, app_identifier, error_message, stack_trace,
              is_fatal, device_info, custom_attributes, issue_id, fingerprint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            effectiveJobId,
            effectiveAppIdentifier || null,
            String(error_message),
            stack_trace ? String(stack_trace) : null,
            is_fatal ? 1 : 0,
            formatPayload(device_info),
            formatPayload(custom_attributes),
            issueId,
            crashFingerprint
          ).run();
        } catch (insertErr) {
          res = await env.DB.prepare(`
            INSERT INTO app_crashes (
              job_id, app_identifier, error_message, stack_trace,
              is_fatal, device_info, custom_attributes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            effectiveJobId,
            effectiveAppIdentifier || null,
            String(error_message),
            stack_trace ? String(stack_trace) : null,
            is_fatal ? 1 : 0,
            formatPayload(device_info),
            formatPayload(custom_attributes)
          ).run();
        }

        let crashDevice = body.device_name || '';
        if (!crashDevice && device_info) {
          if (typeof device_info === 'object') crashDevice = device_info.device_name || device_info.model || '';
          else if (typeof device_info === 'string') {
            try { crashDevice = JSON.parse(device_info).device_name || ''; } catch (_) { crashDevice = device_info.slice(0, 30); }
          }
        }
        const crashUser = body.user_name || body.user || '';

        if (is_fatal) {
          triggerTelegramAlert(env.DB, 'fatal_crash', {
            app_identifier: effectiveAppIdentifier,
            error_message,
            stack_trace,
            is_fatal: 1,
            device_name: crashDevice,
            user_name: crashUser,
            job_id: effectiveJobId,
            issue_id: issueId,
          }).catch(() => {});
        }

        return jsonResponse({ success: true, id: res.meta?.last_row_id, job_id: effectiveJobId, issue_id: issueId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 5. API EVENTS (ANALYTICS): /events
    // ==========================================
    if (path === '/events' && request.method === 'GET') {
      try {
        const dims = await loadDimensions(env.DB);
        const limit = readLimit(url);
        const afterId = Number(url.searchParams.get('after_id')) || 0;
        const eventName = url.searchParams.get('event_name');
        const eventType = url.searchParams.get('event_type');
        const deviceParam = url.searchParams.get('device');
        const userParam = url.searchParams.get('user');

        let query = `
          SELECT
            id, job_id, app_identifier, event_name, event_type, screen_name,
            user_id, user_name, device_name, created_at,
            substr(parameters, 1, 1000) AS parameters,
            substr(device_info, 1, 300) AS device_info
          FROM app_events
          WHERE 1=1
        `;
        const params = [];

        const scope = buildScopeClause(dims, {
          userId: url.searchParams.get('user_id'),
          jobId: url.searchParams.get('job_id'),
          appIdentifier: url.searchParams.get('app_identifier') || url.searchParams.get('app_id'),
          platform: url.searchParams.get('platform') || url.searchParams.get('job_type'),
        });
        query += scope.clause;
        params.push(...scope.params);

        if (eventName) {
          query += ' AND event_name = ?';
          params.push(eventName);
        }
        if (eventType) {
          query += ' AND event_type = ?';
          params.push(eventType);
        }
        if (userParam) {
          query += ' AND (user_name = ? OR user_id = ?)';
          params.push(userParam, userParam);
        }
        if (deviceParam) {
          query += ' AND (device_name = ? OR device_info LIKE ?)';
          params.push(deviceParam, `%${deviceParam}%`);
        }

        if (afterId > 0) {
          query += ' AND id > ? ORDER BY id DESC LIMIT ?';
          params.push(afterId, limit);
        } else {
          // Sắp xếp theo id thay vì created_at: id là INTEGER PRIMARY KEY nên vừa
          // tăng dần đúng theo thứ tự ghi, vừa không cần b-tree tạm để sort. Dùng
          // created_at sẽ cho thứ tự bất định khi nhiều dòng trùng giây.
          query += ' ORDER BY id DESC LIMIT ?';
          params.push(limit);
        }

        const { results } = await env.DB.prepare(query).bind(...params).all();
        const dimsRows = decorateRows(results, dims);

        // user_name của app được ưu tiên; nếu app không gửi thì lấy tên chủ job,
        // giữ đúng hành vi hiển thị cũ mà không cần JOIN.
        return jsonResponse(
          dimsRows.map((row) => ({
            ...row,
            user_name: row.user_name || row.owner_name || null,
            user_id: row.user_id !== null && row.user_id !== undefined
              ? String(row.user_id)
              : row.owner_id !== null && row.owner_id !== undefined
                ? String(row.owner_id)
                : null,
          }))
        );
      } catch (e) {
        return readErrorResponse(e, {}, env.DB);
      }
    }

    // Bản đầy đủ của một dòng telemetry, chỉ gọi khi người dùng mở chi tiết.
    // Nhờ vậy danh sách không phải kéo theo request/response payload và stack trace.
    if (path === '/telemetry/detail' && request.method === 'GET') {
      try {
        const id = Number(url.searchParams.get('id'));
        const table = { log: 'api_logs', crash: 'app_crashes', event: 'app_events' }[
          url.searchParams.get('type')
        ];
        if (!id || !table) {
          return jsonResponse({ error: 'Cần tham số type (log|crash|event) và id' }, 400);
        }

        const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
        if (!row) return jsonResponse({ error: 'Không tìm thấy bản ghi' }, 404);

        const dims = await loadDimensions(env.DB);
        return jsonResponse(decorateRows([row], dims)[0]);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (path === '/events' && request.method === 'POST') {
      try {
        const body = await request.json();
        const {
          event_name,
          event_type,
          screen_name,
          user_id,
          parameters,
          device_info,
          app_id,
          app_identifier,
          job_id,
          user_name,
          device_name,
        } = body;

        if (!event_name) {
          return jsonResponse({ error: 'event_name is required' }, 400);
        }

        const effectiveAppIdentifier = (app_identifier || app_id || '').trim();
        let effectiveJobId = job_id ? Number(job_id) : null;

        if (!effectiveJobId && effectiveAppIdentifier) {
          try {
            const matchedJob = await env.DB.prepare(
              'SELECT id FROM jobs WHERE app_identifier = ?'
            ).bind(effectiveAppIdentifier).first();
            if (matchedJob) {
              effectiveJobId = matchedJob.id;
            }
          } catch (_) {}
        }

        // App gửi kèm user_name / device_name từ lâu nhưng trước đây bị bỏ qua,
        // nên không cắt lát thống kê theo người dùng hay thiết bị được.
        const effectiveUserName = (user_name || body.user || '').trim();
        let effectiveDeviceName = (device_name || body.device || '').trim();
        if (!effectiveDeviceName && device_info) {
          const parsed =
            typeof device_info === 'object' ? device_info : safeJsonParse(device_info, null);
          if (parsed && typeof parsed === 'object') {
            effectiveDeviceName = (
              parsed.device_name || parsed.model || parsed.name || parsed.os || ''
            ).trim();
          } else if (typeof device_info === 'string') {
            effectiveDeviceName = device_info.slice(0, 50).trim();
          }
        }

        const insertValues = [
          effectiveJobId,
          effectiveAppIdentifier || null,
          String(event_name).trim(),
          event_type || 'event',
          screen_name || null,
          user_id ? String(user_id) : null,
          formatPayload(parameters),
          formatPayload(device_info),
        ];

        let res;
        try {
          res = await env.DB.prepare(`
            INSERT INTO app_events (
              job_id, app_identifier, event_name, event_type,
              screen_name, user_id, parameters, device_info,
              user_name, device_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            ...insertValues,
            effectiveUserName || null,
            effectiveDeviceName || null
          ).run();
        } catch (insertErr) {
          // Dự phòng cho DB chưa kịp chạy ALTER thêm hai cột mới
          res = await env.DB.prepare(`
            INSERT INTO app_events (
              job_id, app_identifier, event_name, event_type,
              screen_name, user_id, parameters, device_info
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(...insertValues).run();
        }

        return jsonResponse({ success: true, id: res.meta?.last_row_id, job_id: effectiveJobId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }
    // ==========================================
    // 6. API FUNNELS (CẤU HÌNH THỐNG KÊ SỰ KIỆN): /funnels
    // ==========================================
    if (path === '/funnels' && request.method === 'GET') {
      try {
        const platform = (url.searchParams.get('platform') || '').trim().toLowerCase();
        let query = 'SELECT * FROM event_funnels WHERE 1=1';
        if (platform === 'web') {
          query += " AND (app_identifier LIKE '%web%' OR app_identifier = 'vn.myportal.web')";
        } else if (platform === 'app') {
          query += " AND (app_identifier NOT LIKE '%web%' AND (app_identifier != 'vn.myportal.web' OR app_identifier IS NULL))";
        }
        query += ' ORDER BY status ASC, name ASC';
        const { results } = await env.DB.prepare(query).all();
        return jsonResponse((results || []).map(mapFunnelRow));
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (path === '/funnels' && request.method === 'POST') {
      try {
        const body = await request.json();
        const funnelKey = String(body.funnel_key || '').trim().toLowerCase();
        const name = String(body.name || '').trim();
        const eventPrefix = String(body.event_prefix || '').trim();

        if (!funnelKey || !name) {
          return jsonResponse({ error: 'funnel_key và name là bắt buộc' }, 400);
        }
        if (!/^[a-z0-9_-]+$/.test(funnelKey)) {
          return jsonResponse(
            { error: 'funnel_key chỉ được dùng chữ thường, số, gạch dưới và gạch ngang' },
            400
          );
        }

        const appIdentifier = String(body.app_identifier || '').trim() || null;

        // Không khai báo config thì tự dò từ tên sự kiện có thật trong DB
        let config = body.config ? normalizeFunnelConfig(body.config) : null;
        if (!config || !config.start_event) {
          const names = (await listDistinctEventNames(env.DB, appIdentifier)).map(
            (row) => row.event_name
          );
          const derived = deriveFunnelConfig(eventPrefix, names);
          config = normalizeFunnelConfig({ ...derived, ...(config || {}) });
        }
        if (!Object.keys(config.outcome_buckets).length) {
          config.outcome_buckets = await deriveOutcomeBuckets(
            env.DB,
            config.complete_event,
            config.outcome_param,
            appIdentifier
          );
        }

        await env.DB.prepare(
          `
          INSERT INTO event_funnels (funnel_key, name, app_identifier, event_prefix, config, status)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(funnel_key) DO UPDATE SET
            name = excluded.name,
            app_identifier = excluded.app_identifier,
            event_prefix = excluded.event_prefix,
            config = excluded.config,
            status = excluded.status
          `
        )
          .bind(
            funnelKey,
            name,
            appIdentifier,
            eventPrefix || null,
            JSON.stringify(config),
            body.status === 'inactive' ? 'inactive' : 'active'
          )
          .run();

        const saved = await loadFunnel(env.DB, funnelKey);
        return jsonResponse({ success: true, funnel: saved });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (path === '/funnels' && request.method === 'DELETE') {
      try {
        const funnelKey = url.searchParams.get('funnel_key') || url.searchParams.get('key');
        if (!funnelKey) {
          return jsonResponse({ error: 'Thiếu funnel_key' }, 400);
        }
        await env.DB.prepare('DELETE FROM event_funnels WHERE funnel_key = ?')
          .bind(funnelKey)
          .run();
        await env.DB.prepare('DELETE FROM event_funnel_daily WHERE funnel_key = ?')
          .bind(funnelKey)
          .run();
        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // Danh mục sự kiện đang có thật trong DB — dùng để gợi ý khi tạo funnel mới
    if (path === '/events/catalog' && request.method === 'GET') {
      try {
        const appIdentifier =
          url.searchParams.get('app_identifier') || url.searchParams.get('app_id');
        const events = await listDistinctEventNames(env.DB, appIdentifier);

        // Gợi ý tiền tố: cụm đầu tiên trước dấu "_" của các sự kiện cùng họ
        const prefixCounts = new Map();
        events.forEach((row) => {
          const head = String(row.event_name || '').split('_')[0];
          if (!head) return;
          const prefix = `${head}_`;
          prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + row.total);
        });

        const suggestions = Array.from(prefixCounts.entries())
          .filter(([prefix]) => events.filter((e) => e.event_name.startsWith(prefix)).length > 1)
          .map(([prefix, total]) => ({ prefix, events: total }))
          .sort((a, b) => b.events - a.events)
          .slice(0, 12);

        return jsonResponse({ events, suggestions });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 7. API THỐNG KÊ SỰ KIỆN: /events/stats
    // ==========================================
    if (path === '/events/stats' && request.method === 'GET') {
      try {
        const funnelKey = url.searchParams.get('funnel') || DEFAULT_STATS_FUNNEL_KEY;
        const funnel = await loadFunnel(env.DB, funnelKey);
        if (!funnel) {
          return jsonResponse({ error: `Không tìm thấy funnel "${funnelKey}"` }, 404);
        }

        const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 7, 1), 180);
        const groupBy = url.searchParams.get('group_by') === 'hour' ? 'hour' : 'day';
        const appIdentifier =
          url.searchParams.get('app_identifier') || url.searchParams.get('app_id') || null;
        const jobId = url.searchParams.get('job_id') || null;
        const userName = url.searchParams.get('user') || null;
        const device = url.searchParams.get('device') || null;

        const dayTo = vnDay(0);
        const dayFrom = vnDay(days - 1);

        const stats = await computeFunnelStats(env.DB, funnel, {
          dayFrom,
          dayTo,
          appIdentifier,
          jobId,
          userName,
          device,
          groupBy,
        });

        // Dữ liệu thô chỉ sống vài ngày, nên chuỗi thời gian dài hơn phải lấy từ
        // bảng rollup. Điểm nào có cả hai thì ưu tiên dữ liệu thô vì nó mới hơn.
        if (groupBy === 'day') {
          try {
            const { results: history } = await env.DB.prepare(
              `
              SELECT day, attempts, outcome_auto, outcome_manual,
                     outcome_failed, outcome_abandoned, outcome_open
              FROM event_funnel_daily
              WHERE funnel_key = ? AND app_identifier = ? AND day >= ? AND day <= ?
              ORDER BY day ASC
              `
            )
              .bind(funnel.funnel_key, appIdentifier || funnel.app_identifier || '', dayFrom, dayTo)
              .all();

            const merged = new Map();
            (history || []).forEach((row) => {
              merged.set(row.day, {
                bucket: row.day,
                attempts: row.attempts || 0,
                success_auto: row.outcome_auto || 0,
                success_manual: row.outcome_manual || 0,
                failed: row.outcome_failed || 0,
                abandoned: row.outcome_abandoned || 0,
                open: row.outcome_open || 0,
                from_rollup: true,
              });
            });
            stats.series.forEach((point) => merged.set(point.bucket, point));

            stats.series = Array.from(merged.values()).sort((a, b) =>
              a.bucket.localeCompare(b.bucket)
            );
            stats.history_days = (history || []).length;
          } catch (_) {
            // Chưa có bảng rollup thì cứ dùng dữ liệu thô
          }
        }

        return jsonResponse(stats, 200, 'public, max-age=30');
      } catch (e) {
        return readErrorResponse(e, {}, env.DB);
      }
    }

    // ==========================================
    // 8. API SYSTEM HEALTH: /telemetry/health
    // ==========================================
    if (path === '/telemetry/health' && request.method === 'GET') {
      try {
        const platform = (url.searchParams.get('platform') || '').trim().toLowerCase();
        const appIdentifier = url.searchParams.get('app_identifier') || url.searchParams.get('app_id') || null;
        let appFilterLogs = '';
        let appFilterCrashes = '';
        let appFilterEvents = '';
        const paramsLogs = [];
        const paramsCrashes = [];
        const paramsEvents = [];

        if (appIdentifier) {
          appFilterLogs = ' AND app_identifier = ?';
          appFilterCrashes = ' AND app_identifier = ?';
          appFilterEvents = ' AND app_identifier = ?';
          paramsLogs.push(appIdentifier);
          paramsCrashes.push(appIdentifier);
          paramsEvents.push(appIdentifier);
        } else if (platform === 'web') {
          appFilterLogs = " AND (app_identifier LIKE '%web%' OR app_identifier = 'vn.myportal.web' OR device_name LIKE '%Web%' OR device_name LIKE '%Chrome%' OR device_name LIKE '%Safari%' OR device_name LIKE '%Firefox%' OR device_name LIKE '%Edge%')";
          appFilterCrashes = " AND (app_identifier LIKE '%web%' OR app_identifier = 'vn.myportal.web')";
          appFilterEvents = " AND (app_identifier LIKE '%web%' OR app_identifier = 'vn.myportal.web')";
        } else if (platform === 'app') {
          appFilterLogs = " AND (app_identifier NOT LIKE '%web%' AND (app_identifier != 'vn.myportal.web' OR app_identifier IS NULL)) AND (device_name IS NULL OR (device_name NOT LIKE '%Chrome%' AND device_name NOT LIKE '%Firefox%' AND device_name NOT LIKE '%Safari%' AND device_name NOT LIKE '%Edge%' AND device_name NOT LIKE '%Web Browser%'))";
          appFilterCrashes = " AND (app_identifier NOT LIKE '%web%' AND (app_identifier != 'vn.myportal.web' OR app_identifier IS NULL))";
          appFilterEvents = " AND (app_identifier NOT LIKE '%web%' AND (app_identifier != 'vn.myportal.web' OR app_identifier IS NULL))";
        }

        const [logStats, crashStats, eventStats] = await Promise.all([
          env.DB.prepare(`
            SELECT 
              COUNT(*) AS total,
              SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END) AS success_count,
              SUM(CASE WHEN status_code >= 500 OR status_code < 200 THEN 1 ELSE 0 END) AS server_errors,
              ROUND(AVG(CASE WHEN duration_ms > 0 THEN duration_ms ELSE NULL END), 0) AS avg_duration
            FROM api_logs
            WHERE created_at >= datetime('now', '-24 hours')${appFilterLogs}
          `).bind(...paramsLogs).first(),
          env.DB.prepare(`
            SELECT 
              COUNT(*) AS total,
              SUM(CASE WHEN is_fatal = 1 THEN 1 ELSE 0 END) AS fatal_count
            FROM app_crashes
            WHERE created_at >= datetime('now', '-24 hours')${appFilterCrashes}
          `).bind(...paramsCrashes).first(),
          env.DB.prepare(`
            SELECT COUNT(*) AS total
            FROM app_events
            WHERE created_at >= datetime('now', '-24 hours')${appFilterEvents}
          `).bind(...paramsEvents).first(),
        ]);

        const totalLogs = logStats?.total || 0;
        const successCount = logStats?.success_count || 0;
        const successRate = totalLogs > 0 ? Math.round((successCount / totalLogs) * 1000) / 10 : 100;

        return jsonResponse({
          window: '24 hours',
          total_logs: totalLogs,
          success_rate: successRate,
          server_errors: logStats?.server_errors || 0,
          avg_latency_ms: logStats?.avg_duration || 0,
          total_crashes: crashStats?.total || 0,
          fatal_crashes: crashStats?.fatal_count || 0,
          total_events: eventStats?.total || 0,
        }, 200, 'public, max-age=30');
      } catch (e) {
        return readErrorResponse(e, {}, env.DB);
      }
    }

    // ==========================================
    // 9. API USER JOURNEY TIMELINE: /telemetry/timeline
    // ==========================================
    if (path === '/telemetry/timeline' && request.method === 'GET') {
      try {
        const userParam = url.searchParams.get('user') || url.searchParams.get('user_name') || url.searchParams.get('user_id');
        const deviceParam = url.searchParams.get('device') || url.searchParams.get('device_name');
        const appIdentifier = url.searchParams.get('app_identifier') || url.searchParams.get('app_id');
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 80, 10), 200);

        if (!userParam && !deviceParam && !appIdentifier) {
          return jsonResponse({ items: [], message: 'Cần chọn ít nhất Người dùng, Thiết bị hoặc App' });
        }

        let logWhere = 'WHERE 1=1';
        const logParams = [];
        let crashWhere = 'WHERE 1=1';
        const crashParams = [];
        let eventWhere = 'WHERE 1=1';
        const eventParams = [];

        if (appIdentifier) {
          logWhere += ' AND app_identifier = ?';
          logParams.push(appIdentifier);
          crashWhere += ' AND app_identifier = ?';
          crashParams.push(appIdentifier);
          eventWhere += ' AND app_identifier = ?';
          eventParams.push(appIdentifier);
        }
        if (userParam) {
          logWhere += ' AND user_name = ?';
          logParams.push(userParam);
          crashWhere += ' AND (custom_attributes LIKE ? OR device_info LIKE ?)';
          crashParams.push(`%${userParam}%`, `%${userParam}%`);
          eventWhere += ' AND (user_name = ? OR user_id = ?)';
          eventParams.push(userParam, userParam);
        }
        if (deviceParam) {
          logWhere += ' AND device_name = ?';
          logParams.push(deviceParam);
          crashWhere += ' AND device_info LIKE ?';
          crashParams.push(`%${deviceParam}%`);
          eventWhere += ' AND (device_name = ? OR device_info LIKE ?)';
          eventParams.push(deviceParam, `%${deviceParam}%`);
        }

        const [eventsRes, logsRes, crashesRes] = await Promise.all([
          env.DB.prepare(`
            SELECT id, app_identifier, event_name, event_type, screen_name, user_id, user_name, device_name, parameters, created_at
            FROM app_events ${eventWhere}
            ORDER BY id DESC LIMIT ?
          `).bind(...eventParams, limit).all(),
          env.DB.prepare(`
            SELECT id, app_identifier, endpoint, method, status_code, error_message, duration_ms, user_name, device_name, substr(response_payload, 1, 300) as response_payload, created_at
            FROM api_logs ${logWhere}
            ORDER BY id DESC LIMIT ?
          `).bind(...logParams, limit).all(),
          env.DB.prepare(`
            SELECT id, app_identifier, error_message, is_fatal, stack_trace, device_info, created_at
            FROM app_crashes ${crashWhere}
            ORDER BY id DESC LIMIT ?
          `).bind(...crashParams, Math.floor(limit / 2)).all(),
        ]);

        const rawTimeline = [];

        (eventsRes.results || []).forEach((e) => {
          const isScreen = e.event_type === 'screen_view' || e.event_name === 'screen_view' || !!e.screen_name;
          rawTimeline.push({
            id: `event-${e.id}`,
            raw_id: e.id,
            category: isScreen ? 'screen' : 'event',
            title: isScreen ? (e.screen_name || e.event_name) : e.event_name,
            subtitle: isScreen ? 'Màn hình' : `Sự kiện (${e.event_type || 'custom'})`,
            created_at: e.created_at,
            user_name: e.user_name || e.user_id,
            device_name: e.device_name,
            app_identifier: e.app_identifier,
            parameters: safeJsonParse(e.parameters, null),
          });
        });

        (logsRes.results || []).forEach((l) => {
          const isError = l.status_code >= 500 || l.status_code < 200;
          const isWarn = l.status_code >= 400 && l.status_code < 500;
          rawTimeline.push({
            id: `log-${l.id}`,
            raw_id: l.id,
            category: isError ? 'api_error' : isWarn ? 'api_warning' : 'api_success',
            title: `${l.method} ${l.endpoint}`,
            subtitle: `HTTP ${l.status_code} • ${l.duration_ms || 0}ms`,
            created_at: l.created_at,
            user_name: l.user_name,
            device_name: l.device_name,
            app_identifier: l.app_identifier,
            status_code: l.status_code,
            duration_ms: l.duration_ms,
            error_message: l.error_message,
            response_payload: l.response_payload,
          });
        });

        (crashesRes.results || []).forEach((c) => {
          rawTimeline.push({
            id: `crash-${c.id}`,
            raw_id: c.id,
            category: 'crash',
            title: c.is_fatal ? 'Sập app nghiêm trọng (Fatal Crash)' : 'Ngoại lệ (Non-fatal Crash)',
            subtitle: c.error_message,
            created_at: c.created_at,
            app_identifier: c.app_identifier,
            is_fatal: Number(c.is_fatal) === 1,
            error_message: c.error_message,
            stack_trace: c.stack_trace,
          });
        });

        rawTimeline.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const items = rawTimeline.slice(-limit);

        for (let i = 0; i < items.length; i++) {
          if (i === 0) {
            items[i].time_delta = 'Bắt đầu';
          } else {
            const diffMs = new Date(items[i].created_at).getTime() - new Date(items[i - 1].created_at).getTime();
            if (diffMs < 1000) {
              items[i].time_delta = `+${Math.max(diffMs, 0)}ms`;
            } else if (diffMs < 60000) {
              items[i].time_delta = `+${(diffMs / 1000).toFixed(1)}s`;
            } else if (diffMs < 3600000) {
              items[i].time_delta = `+${Math.round(diffMs / 60000)}m`;
            } else {
              items[i].time_delta = `+${Math.round(diffMs / 3600000)}h`;
            }
          }
        }

        return jsonResponse({
          items,
          total: items.length,
          user: userParam || null,
          device: deviceParam || null,
        });
      } catch (e) {
        return readErrorResponse(e, { items: [] }, env.DB);
      }
    }

    // ==========================================
    // 10. API SETTINGS (TELEGRAM ALERTS): /settings/telegram
    // ==========================================
    if (path === '/settings/telegram' && request.method === 'GET') {
      try {
        const settings = await getSystemSettings(env.DB);
        const token = settings.telegram_bot_token || '';
        let maskedToken = '';
        if (token.length > 8) {
          maskedToken = `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
        }
        return jsonResponse({
          configured: !!(token && settings.telegram_chat_id),
          has_bot_token: !!token,
          bot_token_masked: maskedToken,
          chat_id: settings.telegram_chat_id || '',
          alert_crashes: settings.telegram_alert_crashes !== '0',
          alert_api500: settings.telegram_alert_api500 === '1',
          updated_at: settings.updated_at || null,
        });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (path === '/settings/telegram' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { bot_token, chat_id, alert_crashes, alert_api500 } = body;

        const currentSettings = await getSystemSettings(env.DB);
        const effectiveToken = (bot_token && !bot_token.includes('••')) ? bot_token.trim() : currentSettings.telegram_bot_token;
        const effectiveChatId = chat_id !== undefined ? String(chat_id).trim() : currentSettings.telegram_chat_id;
        const effectiveAlertCrashes = alert_crashes !== undefined ? (alert_crashes ? '1' : '0') : '1';
        const effectiveAlertApi500 = alert_api500 !== undefined ? (alert_api500 ? '1' : '0') : '0';

        const stmt = env.DB.prepare(`
          INSERT INTO system_settings (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `);

        await env.DB.batch([
          stmt.bind('telegram_bot_token', effectiveToken || ''),
          stmt.bind('telegram_chat_id', effectiveChatId || ''),
          stmt.bind('telegram_alert_crashes', effectiveAlertCrashes),
          stmt.bind('telegram_alert_api500', effectiveAlertApi500),
        ]);

        invalidateSettingsCache();
        return jsonResponse({ success: true, message: 'Đã lưu cấu hình Telegram thành công' });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (path === '/settings/telegram/test' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const currentSettings = await getSystemSettings(env.DB);
        const token = (body.bot_token && !body.bot_token.includes('••')) ? body.bot_token.trim() : currentSettings.telegram_bot_token;
        const chatId = body.chat_id ? String(body.chat_id).trim() : currentSettings.telegram_chat_id;

        if (!token || !chatId) {
          return jsonResponse({ error: 'Cần có Telegram Bot Token và Chat ID để kiểm tra' }, 400);
        }

        const timeStr = new Date(Date.now() + VN_OFFSET_HOURS * 3600000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ');

        const testMsg = [
          `🔔 <b>[Gden Flow] KIỂM TRA KẾT NỐI TELEGRAM BOT</b>`,
          `✅ <i>Kết nối thành công! Hệ thống đã sẵn sàng gửi cảnh báo sự cố sập ứng dụng và lỗi API thời gian thực.</i>`,
          `🕒 <b>Thời gian:</b> ${timeStr}`,
        ].join('\n');

        const ok = await sendTelegramMessage(token, chatId, testMsg);
        if (ok) {
          return jsonResponse({ success: true, message: 'Đã gửi tin nhắn thử nghiệm thành công tới Telegram!' });
        } else {
          return jsonResponse({ error: 'Không thể gửi tin nhắn qua Telegram. Vui lòng kiểm tra lại Bot Token và Chat ID (đảm bảo bạn đã nhấn /start trong bot).' }, 400);
        }
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 11. API BATCH TELEMETRY INGESTION: /telemetry/batch
    // ==========================================
    if (path === '/telemetry/batch' && request.method === 'POST') {
      try {
        const body = await request.json();
        const {
          app_id,
          app_identifier,
          device_name,
          user_name,
          logs = [],
          crashes = [],
          events = [],
        } = body;

        const effectiveApp = (app_identifier || app_id || '').trim();
        let effectiveJobId = null;
        if (effectiveApp) {
          try {
            const matchedJob = await env.DB.prepare('SELECT id FROM jobs WHERE app_identifier = ?').bind(effectiveApp).first();
            if (matchedJob) effectiveJobId = matchedJob.id;
          } catch (_) {}
        }

        const clientIp = (
          request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-forwarded-for')?.split(',')[0] ||
          request.headers.get('x-real-ip') ||
          ''
        ).trim();

        const statements = [];

        // 1. Logs
        let batchApi500AlertTriggered = false;
        for (const log of logs) {
          const lApp = (log.app_identifier || log.app_id || effectiveApp).trim();
          const lDevice = (log.device_name || device_name || '').trim();
          const lUser = (log.user_name || user_name || '').trim();

          let lIssueId = null;
          let lFingerprint = null;
          if (log.status_code && Number(log.status_code) >= 500) {
            const lTitle = `${(log.method || 'GET').toUpperCase()} ${log.endpoint} (${log.status_code})`;
            const lCulprit = log.error_message ? String(log.error_message).slice(0, 200) : log.endpoint;
            lFingerprint = await generateIssueFingerprint('api_error', lApp, lTitle, lCulprit);
            const lIssue = await upsertIssueRecord(env.DB, {
              fingerprint: lFingerprint,
              jobId: effectiveJobId,
              appIdentifier: lApp,
              type: 'api_error',
              title: lTitle,
              culprit: lCulprit,
              severity: 'error',
              samplePayload: { endpoint: log.endpoint, method: log.method, status_code: log.status_code, error_message: log.error_message },
            });
            lIssueId = lIssue?.id || null;

            if (!batchApi500AlertTriggered) {
              batchApi500AlertTriggered = true;
              triggerTelegramAlert(env.DB, 'api_500', {
                app_identifier: lApp,
                endpoint: log.endpoint,
                method: log.method,
                status_code: log.status_code,
                error_message: log.error_message,
                job_id: effectiveJobId,
                issue_id: lIssueId,
              }).catch(() => {});
            }
          }

          statements.push(
            env.DB.prepare(`
              INSERT INTO api_logs (
                job_id, app_identifier, endpoint, method, status_code, 
                error_message, request_payload, response_payload, duration_ms,
                device_name, user_name, ip_address, issue_id, fingerprint
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              effectiveJobId,
              lApp || null,
              log.endpoint || '',
              (log.method || 'GET').toUpperCase(),
              log.status_code || null,
              log.error_message || null,
              formatPayload(log.request_payload),
              formatPayload(log.response_payload),
              log.duration_ms || 0,
              lDevice || null,
              lUser || null,
              clientIp || null,
              lIssueId,
              lFingerprint
            )
          );
        }

        // 2. Crashes
        let batchCrashAlertTriggered = false;
        for (const crash of crashes) {
          const cApp = (crash.app_identifier || crash.app_id || effectiveApp).trim();
          const isFatal = crash.is_fatal ? 1 : 0;
          const cTitle = String(crash.error_message || 'Unknown Crash').split('\n')[0].slice(0, 200);
          let cCulprit = null;
          if (crash.stack_trace) {
            const lines = String(crash.stack_trace).split('\n').map((l) => l.trim()).filter(Boolean);
            cCulprit = lines.find((l) => l.includes('.dart') || l.includes('.js') || l.includes('.ts') || l.includes(':')) || lines[0] || null;
          }

          const cFingerprint = await generateIssueFingerprint('crash', cApp, cTitle, cCulprit);
          const cIssue = await upsertIssueRecord(env.DB, {
            fingerprint: cFingerprint,
            jobId: effectiveJobId,
            appIdentifier: cApp,
            type: 'crash',
            title: cTitle,
            culprit: cCulprit,
            severity: isFatal ? 'fatal' : 'error',
            samplePayload: { error_message: crash.error_message, stack_trace: crash.stack_trace, device_info: crash.device_info, custom_attributes: crash.custom_attributes },
          });

          statements.push(
            env.DB.prepare(`
              INSERT INTO app_crashes (
                job_id, app_identifier, error_message, stack_trace,
                is_fatal, device_info, custom_attributes, issue_id, fingerprint
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              effectiveJobId,
              cApp || null,
              String(crash.error_message || 'Unknown Crash'),
              crash.stack_trace ? String(crash.stack_trace) : null,
              isFatal,
              formatPayload(crash.device_info || device_name),
              formatPayload(crash.custom_attributes),
              cIssue?.id || null,
              cFingerprint
            )
          );

          if (!batchCrashAlertTriggered && isFatal) {
            batchCrashAlertTriggered = true;
            triggerTelegramAlert(env.DB, 'fatal_crash', {
              app_identifier: cApp,
              error_message: crash.error_message,
              stack_trace: crash.stack_trace,
              is_fatal: 1,
              device_name: crash.device_name || device_name,
              user_name: crash.user_name || user_name,
              job_id: effectiveJobId,
              issue_id: cIssue?.id || null,
            }).catch(() => {});
          }
        }

        // 3. Events
        for (const ev of events) {
          const eApp = (ev.app_identifier || ev.app_id || effectiveApp).trim();
          statements.push(
            env.DB.prepare(`
              INSERT INTO app_events (
                job_id, app_identifier, event_name, event_type,
                screen_name, user_id, parameters, device_info,
                user_name, device_name
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              effectiveJobId,
              eApp || null,
              String(ev.event_name || 'event').trim(),
              ev.event_type || 'event',
              ev.screen_name || null,
              ev.user_id ? String(ev.user_id) : null,
              formatPayload(ev.parameters),
              formatPayload(ev.device_info),
              (ev.user_name || user_name || '').trim() || null,
              (ev.device_name || device_name || '').trim() || null
            )
          );
        }

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        return jsonResponse({
          success: true,
          processed: {
            logs: logs.length,
            crashes: crashes.length,
            events: events.length,
          },
        });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 12. API ISSUES (APM MANAGEMENT): /issues
    // ==========================================
    if (path === '/issues' && request.method === 'GET') {
      try {
        const urlParams = url.searchParams;
        const status = urlParams.get('status'); // 'unresolved', 'resolved', 'ignored', 'all'
        const type = urlParams.get('type'); // 'crash', 'api_error'
        const appIdentifier = (urlParams.get('app_identifier') || urlParams.get('app_id') || '').trim();
        const jobId = urlParams.get('job_id');
        const sortBy = urlParams.get('sort_by') || 'last_seen';
        const order = (urlParams.get('order') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const limit = Math.min(Math.max(Number(urlParams.get('limit')) || 50, 1), 100);
        const offset = Math.max(Number(urlParams.get('offset')) || 0, 0);

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (status && status !== 'all') {
          whereClause += ' AND status = ?';
          params.push(status);
        } else if (!status) {
          whereClause += " AND status = 'unresolved'";
        }

        if (type) {
          whereClause += ' AND type = ?';
          params.push(type);
        }

        const platform = (urlParams.get('platform') || '').trim().toLowerCase();
        if (appIdentifier) {
          whereClause += ' AND app_identifier = ?';
          params.push(appIdentifier);
        } else if (jobId) {
          whereClause += ' AND job_id = ?';
          params.push(Number(jobId));
        } else if (platform === 'web') {
          whereClause += " AND (app_identifier LIKE '%web%' OR app_identifier = 'vn.myportal.web')";
        } else if (platform === 'app') {
          whereClause += " AND (app_identifier NOT LIKE '%web%' AND (app_identifier != 'vn.myportal.web' OR app_identifier IS NULL))";
        }

        const allowedSorts = ['last_seen', 'total_occurrences', 'created_at', 'first_seen'];
        const sortColumn = allowedSorts.includes(sortBy) ? sortBy : 'last_seen';

        const listQuery = `
          SELECT * FROM issues
          ${whereClause}
          ORDER BY ${sortColumn} ${order}
          LIMIT ? OFFSET ?
        `;
        const { results: issuesList } = await env.DB.prepare(listQuery).bind(...params, limit, offset).all();

        // Thống kê số lượng theo từng trạng thái để phục vụ Tabs trên UI
        let countFilter = 'WHERE 1=1';
        const countParams = [];
        if (appIdentifier) {
          countFilter += ' AND app_identifier = ?';
          countParams.push(appIdentifier);
        } else if (jobId) {
          countFilter += ' AND job_id = ?';
          countParams.push(Number(jobId));
        }

        const countsStmt = env.DB.prepare(`
          SELECT 
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status = 'unresolved' THEN 1 ELSE 0 END), 0) AS unresolved,
            COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END), 0) AS resolved,
            COALESCE(SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END), 0) AS ignored
          FROM issues
          ${countFilter}
        `);
        const countsRes = countParams.length > 0 ? await countsStmt.bind(...countParams).first() : await countsStmt.first();

        const dims = await loadDimensions(env.DB);
        const decoratedIssues = (issuesList || []).map((issue) => {
          const job = dims.jobs.find((j) => String(j.id) === String(issue.job_id) || j.app_identifier === issue.app_identifier);
          return {
            ...issue,
            job_name: job?.name || issue.app_identifier,
          };
        });

        return jsonResponse({
          issues: decoratedIssues,
          total: decoratedIssues.length,
          pagination: { limit, offset },
          counts: {
            total: countsRes?.total || 0,
            unresolved: countsRes?.unresolved || 0,
            resolved: countsRes?.resolved || 0,
            ignored: countsRes?.ignored || 0,
          },
        });
      } catch (e) {
        return readErrorResponse(e, { issues: [] }, env.DB);
      }
    }

    // Chi tiết một Issue: /issues/:id
    const issueDetailMatch = path.match(/^\/issues\/(\d+)$/);
    if (issueDetailMatch && request.method === 'GET') {
      try {
        const issueId = Number(issueDetailMatch[1]);
        const issue = await env.DB.prepare('SELECT * FROM issues WHERE id = ?').bind(issueId).first();
        if (!issue) {
          return jsonResponse({ error: 'Không tìm thấy Issue' }, 404);
        }

        let recentEvents = [];
        if (issue.type === 'crash') {
          const { results } = await env.DB.prepare(`
            SELECT id, app_identifier, error_message, stack_trace, is_fatal, device_info, custom_attributes, created_at
            FROM app_crashes
            WHERE issue_id = ? OR fingerprint = ?
            ORDER BY id DESC LIMIT 20
          `).bind(issueId, issue.fingerprint).all();
          recentEvents = results || [];
        } else {
          const { results } = await env.DB.prepare(`
            SELECT id, app_identifier, endpoint, method, status_code, error_message, request_payload, response_payload, duration_ms, device_name, user_name, created_at
            FROM api_logs
            WHERE issue_id = ? OR fingerprint = ?
            ORDER BY id DESC LIMIT 20
          `).bind(issueId, issue.fingerprint).all();
          recentEvents = results || [];
        }

        return jsonResponse({
          issue,
          recent_events: recentEvents,
        });
      } catch (e) {
        return readErrorResponse(e, {}, env.DB);
      }
    }

    // Cập nhật trạng thái Issue: PATCH /issues/:id
    if (issueDetailMatch && request.method === 'PATCH') {
      try {
        const issueId = Number(issueDetailMatch[1]);
        const body = await request.json().catch(() => ({}));
        const newStatus = body.status;
        if (!['unresolved', 'resolved', 'ignored'].includes(newStatus)) {
          return jsonResponse({ error: 'Trạng thái không hợp lệ (chỉ chấp nhận unresolved, resolved, ignored)' }, 400);
        }

        await env.DB.prepare(`
          UPDATE issues
          SET status = ?, last_seen = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(newStatus, issueId).run();

        const updated = await env.DB.prepare('SELECT * FROM issues WHERE id = ?').bind(issueId).first();
        return jsonResponse({ success: true, issue: updated });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // Đánh dấu nhanh Resolved: POST /issues/:id/resolve
    const issueResolveMatch = path.match(/^\/issues\/(\d+)\/resolve$/);
    if (issueResolveMatch && request.method === 'POST') {
      try {
        const issueId = Number(issueResolveMatch[1]);
        await env.DB.prepare(`
          UPDATE issues
          SET status = 'resolved'
          WHERE id = ?
        `).bind(issueId).run();

        return jsonResponse({ success: true, message: 'Đã giải quyết Issue thành công' });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // Serve the Vite build for the website and let Cloudflare's SPA fallback
    // return index.html for client-side routes such as /admin/dashboard or /admin/users.
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    try {
      await ensureSchema(env.DB);

      // Chốt số liệu funnel TRƯỚC khi xoá dữ liệu thô — nếu xoá trước thì mọi
      // thống kê dài hơn cửa sổ giữ log sẽ biến mất vĩnh viễn.
      await rollupFunnels(env.DB);

      // Xóa log và telemetry cũ hơn 2 ngày
      await env.DB.prepare(
        "DELETE FROM api_logs WHERE created_at < datetime('now', '-2 days')"
      ).run();
      await env.DB.prepare(
        "DELETE FROM app_crashes WHERE created_at < datetime('now', '-2 days')"
      ).run();

      // Sự kiện thuộc một funnel đang bật được giữ 7 ngày để còn xem chi tiết,
      // phần còn lại vẫn theo mức 2 ngày như cũ.
      const { results: activeFunnels } = await env.DB.prepare(
        "SELECT event_prefix FROM event_funnels WHERE status = 'active' AND event_prefix IS NOT NULL AND event_prefix <> ''"
      ).all();
      const prefixes = (activeFunnels || []).map((row) => row.event_prefix);

      if (prefixes.length) {
        const keepClause = prefixes.map(() => 'event_name LIKE ?').join(' OR ');
        await env.DB.prepare(
          `
          DELETE FROM app_events
          WHERE created_at < datetime('now', '-7 days')
             OR (created_at < datetime('now', '-2 days') AND NOT (${keepClause}))
          `
        )
          .bind(...prefixes.map((prefix) => `${prefix}%`))
          .run();
      } else {
        await env.DB.prepare(
          "DELETE FROM app_events WHERE created_at < datetime('now', '-2 days')"
        ).run();
      }

      console.log('Rolled up funnel stats and deleted old logs, crashes and analytics events');
    } catch (e) {
      console.error('Failed to roll up or delete old telemetry:', e.message);
    }
  },
};
