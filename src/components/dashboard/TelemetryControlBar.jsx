import React, { useState, useEffect, useRef } from 'react';
import SavedViews from '../ui/SavedViews';

// SVG Icons tinh tế, sắc nét theo chuẩn thiết kế hiện đại
export const ModeIcons = {
  issues: (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  crashes: (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
    </svg>
  ),
  analytics: (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  funnels: (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  timeline: (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
    </svg>
  ),
};

export default function TelemetryControlBar({
  telemetryMode = 'logs',
  onSelectMode,
  modeCounts = {},
  platformScope = 'app',
  onOpenPlatformModal,
  onSelectPlatform,
  selectedFilter = 'all',
  onFilterChange,
  availableJobs = [],
  activeUserJob = null,
  refreshInterval = 30000,
  onRefreshIntervalChange,
  onOpenTelegramModal,
  onNavigateSetup,
  onRefresh,
  loading = false,
  CustomSelect,
}) {
  const [isModeOpen, setIsModeOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Tuỳ chọn hiển thị Tab bar đầy đủ hay Menu ẩn nhỏ gọn (mặc định gọn theo yêu cầu)
  const [isTabsExpanded, setIsTabsExpanded] = useState(() => {
    return localStorage.getItem('gden-flow:tabs-expanded') === 'true';
  });

  const modeMenuRef = useRef(null);
  const filterMenuRef = useRef(null);

  // Lưu trạng thái thu gọn / mở rộng tabs
  const toggleTabsExpanded = () => {
    setIsTabsExpanded((prev) => {
      const next = !prev;
      localStorage.setItem('gden-flow:tabs-expanded', String(next));
      return next;
    });
  };

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event) {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target)) {
        setIsModeOpen(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setIsFilterOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsModeOpen(false);
        setIsFilterOpen(false);
      }
    }
    if (isModeOpen || isFilterOpen) {
      document.addEventListener('pointerdown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModeOpen, isFilterOpen]);

  // Cấu hình metadata cho 6 chế độ
  const modesMeta = [
    {
      id: 'issues',
      label: 'Sự cố (Issues)',
      desc: 'Giám sát lỗi nghiêm trọng cần xử lý',
      icon: ModeIcons.issues,
      count: modeCounts.issues || 0,
      isAlert: (modeCounts.issues || 0) > 0,
    },
    {
      id: 'logs',
      label: platformScope === 'web' ? 'Nhật ký Web' : 'API Logs',
      desc: 'Lịch sử cuộc gọi API & trạng thái HTTP',
      icon: ModeIcons.logs,
      count: modeCounts.logs || 0,
      isAlert: false,
    },
    {
      id: 'crashes',
      label: platformScope === 'web' ? 'Sự cố & Lỗi JS' : 'Crashlytics',
      desc: 'Báo cáo sập ứng dụng & ngoại lệ runtime',
      icon: ModeIcons.crashes,
      count: modeCounts.crashes || 0,
      isAlert: (modeCounts.fatalCrashes || 0) > 0,
    },
    {
      id: 'analytics',
      label: platformScope === 'web' ? 'Tương tác Web' : 'Analytics & Sự kiện',
      desc: 'Theo dõi sự kiện và hành vi người dùng',
      icon: ModeIcons.analytics,
      count: modeCounts.events || 0,
      isAlert: false,
    },
    {
      id: 'funnels',
      label: 'Thống kê sự kiện',
      desc: 'Phân tích phễu chuyển đổi và tuần tự',
      icon: ModeIcons.funnels,
      count: modeCounts.funnels || 0,
      isAlert: false,
    },
    {
      id: 'timeline',
      label: 'Hành trình User',
      desc: 'Dòng thời gian hành động từng người dùng',
      icon: ModeIcons.timeline,
      badgeText: modeCounts.timelineUser ? modeCounts.timelineUser.slice(0, 10) : null,
      isAlert: false,
    },
  ];

  const currentMode = modesMeta.find((m) => m.id === telemetryMode) || modesMeta[1];

  // Nhãn hiển thị mục tiêu đang chọn
  const targetLabel = activeUserJob
    ? `${activeUserJob.job_type === 'app' ? '📱' : '🌐'} ${activeUserJob.job_name}`
    : platformScope === 'web'
    ? '🌐 Toàn bộ Web App'
    : '📱 Toàn bộ Mobile App';

  return (
    <div className="telemetry-control-strip-wrapper">
      {/* Thanh điều khiển siêu gọn gàng */}
      <div className="telemetry-control-strip">
        <div className="control-strip-left">
          {/* 1. Menu Ẩn: Chọn Chế độ Telemetry */}
          <div className="hidden-menu-container" ref={modeMenuRef}>
            <button
              type="button"
              className={`menu-trigger-btn mode-trigger-btn ${isModeOpen ? 'is-active' : ''}`}
              onClick={() => {
                setIsModeOpen((prev) => !prev);
                setIsFilterOpen(false);
              }}
              aria-expanded={isModeOpen}
              title="Nhấn để đổi chế độ xem (Sự cố, Logs, Crashlytics, Analytics...)"
            >
              <span className="trigger-icon">{currentMode.icon}</span>
              <span className="trigger-label">
                <span className="trigger-caption">Chế độ:</span>
                <strong className="trigger-value">{currentMode.label}</strong>
              </span>
              <span className={`trigger-badge ${currentMode.isAlert ? 'badge-alert' : ''}`}>
                {currentMode.badgeText || currentMode.count}
              </span>
              <span className={`trigger-arrow ${isModeOpen ? 'open' : ''}`}>▾</span>
            </button>

            {/* Dropdown Menu Chế độ */}
            {isModeOpen && (
              <div className="hidden-popover-menu mode-popover-menu" role="menu">
                <div className="popover-header">
                  <span>Chế độ giám sát Telemetry</span>
                  <span className="popover-tag">6 phân hệ</span>
                </div>
                <div className="mode-options-list">
                  {modesMeta.map((mode) => {
                    const isSelected = mode.id === telemetryMode;
                    return (
                      <button
                        type="button"
                        key={mode.id}
                        className={`mode-menu-option ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          onSelectMode(mode.id);
                          setIsModeOpen(false);
                        }}
                      >
                        <span className="option-icon-box">{mode.icon}</span>
                        <div className="option-info">
                          <strong className="option-name">{mode.label}</strong>
                          <span className="option-desc">{mode.desc}</span>
                        </div>
                        <span className={`option-counter ${mode.isAlert ? 'counter-alert' : ''}`}>
                          {mode.badgeText || mode.count}
                        </span>
                        {isSelected && <span className="option-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. Menu Ẩn: Mục tiêu & Bộ lọc Giám sát */}
          <div className="hidden-menu-container" ref={filterMenuRef}>
            <button
              type="button"
              className={`menu-trigger-btn filter-trigger-btn ${selectedFilter !== 'all' ? 'has-filter' : ''} ${isFilterOpen ? 'is-active' : ''}`}
              onClick={() => {
                setIsFilterOpen((prev) => !prev);
                setIsModeOpen(false);
              }}
              aria-expanded={isFilterOpen}
              title="Nhấn để đổi mục tiêu giám sát, phân hệ Web/App và quản lý Saved Views"
            >
              <span className="trigger-icon">{ModeIcons.target}</span>
              <span className="trigger-label">
                <span className="trigger-caption">Mục tiêu:</span>
                <strong className="trigger-value">{targetLabel}</strong>
              </span>
              {selectedFilter !== 'all' && (
                <span
                  className="quick-clear-btn"
                  title="Xoá bộ lọc, xem toàn bộ"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterChange('all');
                  }}
                >
                  ✕
                </span>
              )}
              <span className={`trigger-arrow ${isFilterOpen ? 'open' : ''}`}>▾</span>
            </button>

            {/* Popover Bộ lọc Mục tiêu & Saved Views */}
            {isFilterOpen && (
              <div className="hidden-popover-menu filter-popover-menu" role="dialog" aria-label="Bộ lọc mục tiêu">
                <div className="popover-header">
                  <div>
                    <strong>Mục tiêu & Bộ lọc Giám sát</strong>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Chọn phân hệ, ứng dụng cụ thể hoặc lưu cấu hình xem
                    </p>
                  </div>
                  <button
                    type="button"
                    className="popover-close-btn"
                    onClick={() => setIsFilterOpen(false)}
                    aria-label="Đóng"
                  >
                    ×
                  </button>
                </div>

                <div className="popover-body">
                  {/* Mục A: Chuyển đổi Phân hệ (Web / App) */}
                  <div className="filter-section">
                    <span className="section-title">Không gian Phân hệ</span>
                    <div className="platform-toggle-row">
                      <button
                        type="button"
                        className={`platform-btn ${platformScope === 'app' ? 'active active-app' : ''}`}
                        onClick={() => {
                          if (onSelectPlatform) onSelectPlatform('app');
                          else if (onOpenPlatformModal) onOpenPlatformModal();
                        }}
                      >
                        <span className="btn-icon">📱</span>
                        <span>Mobile App</span>
                        {platformScope === 'app' && <span className="active-dot" />}
                      </button>
                      <button
                        type="button"
                        className={`platform-btn ${platformScope === 'web' ? 'active active-web' : ''}`}
                        onClick={() => {
                          if (onSelectPlatform) onSelectPlatform('web');
                          else if (onOpenPlatformModal) onOpenPlatformModal();
                        }}
                      >
                        <span className="btn-icon">🌐</span>
                        <span>Web App</span>
                        {platformScope === 'web' && <span className="active-dot" />}
                      </button>
                    </div>
                  </div>

                  {/* Mục B: Chọn Ứng dụng / Dự án cụ thể */}
                  <div className="filter-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span className="section-title">Ứng dụng / Dự án</span>
                      {selectedFilter !== 'all' && (
                        <button
                          type="button"
                          className="link-reset-btn"
                          onClick={() => onFilterChange('all')}
                        >
                          ✕ Về toàn bộ
                        </button>
                      )}
                    </div>
                    {CustomSelect ? (
                      <CustomSelect
                        className="user-filter-custom"
                        value={selectedFilter}
                        onChange={(val) => {
                          onFilterChange(val);
                          setIsFilterOpen(false);
                        }}
                        options={[
                          {
                            value: 'all',
                            label: platformScope === 'web'
                              ? '🌐 Toàn bộ Web App (Tất cả web telemetry)'
                              : '📱 Toàn bộ Mobile App (Tất cả app telemetry)',
                          },
                          ...availableJobs.map((u) => ({
                            value: u.filterValue || u.id,
                            label: `${u.job_type === 'app' ? '📱' : '🌐'} ${u.job_name}${u.app_identifier ? ` (${u.app_identifier})` : ''}`,
                          })),
                        ]}
                        placeholder="Chọn ứng dụng / dự án..."
                      />
                    ) : (
                      <select
                        value={selectedFilter}
                        onChange={(e) => {
                          onFilterChange(e.target.value);
                          setIsFilterOpen(false);
                        }}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '8px' }}
                      >
                        <option value="all">
                          {platformScope === 'web' ? '🌐 Toàn bộ Web App' : '📱 Toàn bộ Mobile App'}
                        </option>
                        {availableJobs.map((u) => (
                          <option key={u.id} value={u.filterValue || u.id}>
                            {u.job_type === 'app' ? '📱' : '🌐'} {u.job_name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Mục C: Saved Views */}
                  <div className="filter-section" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <span className="section-title">Chế độ xem đã lưu (Saved Views)</span>
                    <SavedViews onNavigate={() => setIsFilterOpen(false)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cụm Action bên phải: Tự làm mới, Cảnh báo, SDK, Làm mới, Nút thu/phóng tabs */}
        <div className="control-strip-right">
          {/* Tự làm mới */}
          <div className="auto-refresh-dock compact-auto-refresh">
            <span className="auto-refresh-icon">{ModeIcons.clock}</span>
            <span className="auto-refresh-text">Tự làm mới:</span>
            {CustomSelect && (
              <CustomSelect
                className="select-mini"
                value={refreshInterval}
                onChange={(val) => onRefreshIntervalChange(Number(val))}
                options={[
                  { value: 0, label: 'Tắt' },
                  { value: 10000, label: '10s' },
                  { value: 15000, label: '15s' },
                  { value: 30000, label: '30s' },
                  { value: 60000, label: '1m' },
                  { value: 300000, label: '5m' },
                ]}
                alignRight={true}
                ariaLabel="Chu kỳ tự động tải dữ liệu mới"
              />
            )}
          </div>

          {/* Cảnh báo Telegram */}
          <button
            type="button"
            className="secondary-btn strip-action-btn"
            onClick={onOpenTelegramModal}
            title="Cài đặt thông báo sự cố qua Telegram Bot"
          >
            {ModeIcons.bell}
            <span className="strip-btn-text">Cảnh báo</span>
          </button>

          {/* Cài đặt SDK */}
          <button
            type="button"
            className="secondary-btn strip-action-btn"
            onClick={onNavigateSetup}
            title="Cấu hình SDK cho Mobile App và Web"
          >
            {ModeIcons.settings}
            <span className="strip-btn-text">Cài đặt SDK</span>
          </button>

          {/* Nút Làm mới (Refresh) */}
          <button
            type="button"
            className="primary-btn strip-refresh-btn"
            disabled={loading}
            onClick={onRefresh}
            title="Tải lại toàn bộ dữ liệu mới nhất"
          >
            <span className={`refresh-icon-wrap ${loading ? 'spin-anim' : ''}`}>
              {ModeIcons.refresh}
            </span>
            <span className="strip-btn-text">{loading ? 'Đang tải…' : 'Làm mới'}</span>
          </button>

          {/* Nút Chuyển đổi giữa Menu ẩn & Tab bar đầy đủ */}
          <button
            type="button"
            className={`view-mode-toggle-btn ${isTabsExpanded ? 'active' : ''}`}
            onClick={toggleTabsExpanded}
            title={isTabsExpanded ? 'Thu gọn thành Menu ẩn (tiết kiệm không gian)' : 'Hiển thị thanh Tab đầy đủ'}
            aria-label="Đổi kiểu hiển thị thanh điều hướng"
          >
            {isTabsExpanded ? '🔽 Menu gọn' : '📑 Tabs'}
          </button>
        </div>
      </div>

      {/* Nếu người dùng chủ động mở rộng Tabs (Tabs Mode), hiển thị thanh tab 1 dòng ngang không bao giờ bị rớt dòng */}
      {isTabsExpanded && (
        <div className="telemetry-mode-dock single-row-dock" role="tablist">
          {modesMeta.map((mode) => {
            const isActive = mode.id === telemetryMode;
            return (
              <button
                type="button"
                key={mode.id}
                role="tab"
                aria-selected={isActive}
                className={`mode-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectMode(mode.id)}
              >
                <span className="tab-icon">{mode.icon}</span>
                <span className="tab-label">{mode.label}</span>
                <span className={`mode-badge ${mode.isAlert && !isActive ? 'badge-alert' : ''}`}>
                  {mode.badgeText || mode.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
