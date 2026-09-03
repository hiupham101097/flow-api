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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chỉ mục tối ưu tốc độ truy vấn
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_job_id ON api_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_logs_app_identifier ON api_logs(app_identifier);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
