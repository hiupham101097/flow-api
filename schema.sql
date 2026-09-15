-- Bảng Người dùng (Users)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Tác vụ theo dõi App hoặc Web (Jobs)
-- Mỗi user theo dõi 1 app hoặc 1 web (user_id là UNIQUE)
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('app', 'web')),
    app_identifier TEXT UNIQUE NOT NULL,
    target_url TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Nhật ký gọi API (API Logs)
CREATE TABLE IF NOT EXISTS api_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
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
);

-- Chỉ mục tối ưu tốc độ truy vấn
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_job_id ON api_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_logs_app_identifier ON api_logs(app_identifier);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);

-- Bảng Crashlytics / Báo cáo sự cố App (Crashlytics & App Errors)
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
);

CREATE INDEX IF NOT EXISTS idx_crashes_created_at ON app_crashes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crashes_job_id ON app_crashes(job_id);
CREATE INDEX IF NOT EXISTS idx_crashes_app_identifier ON app_crashes(app_identifier);
CREATE INDEX IF NOT EXISTS idx_crashes_is_fatal ON app_crashes(is_fatal);

-- Bảng Analytics & Sự kiện người dùng (App & Web Analytics)
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
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON app_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_job_id ON app_events(job_id);
CREATE INDEX IF NOT EXISTS idx_events_app_identifier ON app_events(app_identifier);
CREATE INDEX IF NOT EXISTS idx_events_name ON app_events(event_name);

-- Composite Indexes tăng tốc đọc gấp 10-100x khi lọc theo App/Job và sắp xếp theo Thời gian
CREATE INDEX IF NOT EXISTS idx_logs_app_created ON api_logs(app_identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_job_created ON api_logs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crashes_app_created ON app_crashes(app_identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crashes_job_created ON app_crashes(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_app_created ON app_events(app_identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_job_created ON app_events(job_id, created_at DESC);

-- Chỉ mục phục vụ danh sách telemetry: khoá theo id chứ không phải created_at,
-- vì các endpoint danh sách đều ORDER BY id DESC. Một index này lo cả việc lọc
-- lẫn việc sắp xếp nên SQLite không phải dựng b-tree tạm.
CREATE INDEX IF NOT EXISTS idx_logs_app_id_desc ON api_logs(app_identifier, id DESC);
CREATE INDEX IF NOT EXISTS idx_logs_job_id_desc ON api_logs(job_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_crashes_app_id_desc ON app_crashes(app_identifier, id DESC);
CREATE INDEX IF NOT EXISTS idx_events_app_id_desc ON app_events(app_identifier, id DESC);
CREATE INDEX IF NOT EXISTS idx_events_name_created ON app_events(event_name, created_at DESC);


-- Định nghĩa luồng sự kiện cần thống kê (ví dụ: eKYB)
CREATE TABLE IF NOT EXISTS event_funnels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    funnel_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    app_identifier TEXT,
    event_prefix TEXT,
    config TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Số liệu chốt theo ngày, giữ lịch sử sau khi cron xoá dữ liệu thô.
-- app_identifier lưu chuỗi rỗng thay vì NULL: SQLite coi hai NULL là khác nhau
-- trong UNIQUE index nên dùng NULL sẽ sinh bản ghi trùng.
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
);

CREATE INDEX IF NOT EXISTS idx_funnel_daily_lookup ON event_funnel_daily(funnel_key, day);

-- Bảng Cấu hình hệ thống (Telegram Bot, cảnh báo, tùy chọn)
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- GIAI ĐOẠN 1: BẢNG QUẢN LÝ NHÓM SỰ CỐ (ISSUES - APM MODEL)
-- ============================================================
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
);

CREATE INDEX IF NOT EXISTS idx_issues_fingerprint ON issues(fingerprint);
CREATE INDEX IF NOT EXISTS idx_issues_app_status ON issues(app_identifier, status);
CREATE INDEX IF NOT EXISTS idx_issues_job_status ON issues(job_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_last_seen ON issues(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_issues_occurrences ON issues(total_occurrences DESC);

-- ĐẶT CUỐI FILE CÓ CHỦ ĐÍCH: SQLite không có ADD COLUMN IF NOT EXISTS, nên các
-- lệnh ALTER TABLE này sẽ báo "duplicate column name" nếu chạy lại.
-- Wrangler d1 execute dừng ngay ở lỗi đầu tiên nên phải để chúng sau mọi CREATE.
-- (Worker tự thêm các cột này trong ensureSchema với try/catch an toàn).
ALTER TABLE app_events ADD COLUMN user_name TEXT;
ALTER TABLE app_events ADD COLUMN device_name TEXT;
ALTER TABLE app_crashes ADD COLUMN issue_id INTEGER;
ALTER TABLE app_crashes ADD COLUMN fingerprint TEXT;
ALTER TABLE api_logs ADD COLUMN issue_id INTEGER;
ALTER TABLE api_logs ADD COLUMN fingerprint TEXT;
