import React, { memo } from 'react';
import CustomSelect from '../ui/CustomSelect';
import PaginationDock from '../ui/PaginationDock';
import { SkeletonRows } from '../ui/SkeletonTable';
import { formatVietnamDate, formatVietnamTime, getCrashPlatform, parseJsonSafe } from '../../utils/format';
import { exportToCsv } from '../../utils/exportCsv';

/**
 * CrashRow được bọc bởi React.memo để tối ưu 60 FPS khi render
 */
const CrashRow = memo(function CrashRow({
  crash,
  onOpenDetail,
  onViewTimeline,
}) {
  const isFatal = Number(crash.is_fatal) === 1;
  const deviceInfoParsed = parseJsonSafe(crash.device_info);
  const osInfo = getCrashPlatform(crash);

  return (
    <tr
      data-monitor-row
      tabIndex={0}
      className={isFatal ? 'row-error' : ''}
      onClick={() => onOpenDetail('crash', crash)}
      style={{ cursor: 'pointer' }}
      title="Nhấn để xem chi tiết & Stack Trace"
    >
      <td className="timestamp-cell" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', lineHeight: 1.4 }}>
        <div>{formatVietnamDate(crash.created_at)}</div>
        <div style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{formatVietnamTime(crash.created_at)}</div>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span className="type-badge type-badge-app" style={{ width: 'fit-content', fontSize: '0.72rem' }}>
            📱 {crash.job_name || crash.app_identifier || 'Mobile App'}
          </span>
          <small style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
            {crash.app_identifier ? <code>{crash.app_identifier}</code> : '-'}
          </small>
        </div>
      </td>
      <td>
        {isFatal ? (
          <span className="badge-fatal">💥 FATAL</span>
        ) : (
          <span className="badge-non-fatal">⚠️ Non-fatal</span>
        )}
      </td>
      <td style={{ fontSize: '0.82rem', fontWeight: 500, color: isFatal ? '#ff7785' : 'var(--text)', wordBreak: 'break-word', maxWidth: '340px' }}>
        {crash.error_message}
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
            <span className={osInfo.badgeClass}>{osInfo.label}</span>
            {deviceInfoParsed && typeof deviceInfoParsed === 'object' && (deviceInfoParsed.model || deviceInfoParsed.device_name) && (
              <span className="device-chip">{deviceInfoParsed.model || deviceInfoParsed.device_name}</span>
            )}
          </div>
          {deviceInfoParsed && typeof deviceInfoParsed === 'object' && deviceInfoParsed.os_version && (
            <small style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
              OS v{deviceInfoParsed.os_version}
            </small>
          )}
        </div>
      </td>
      <td className="action-cell" style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="view-btn"
          style={{ fontSize: '0.72rem', padding: '0.25rem 0.45rem', background: 'rgba(125, 156, 255, 0.12)', color: 'var(--accent)' }}
          title="Xem toàn bộ hành trình trước khi xảy ra sự cố này"
          onClick={(event) => {
            event.stopPropagation();
            viewUserTimeline({
              user: crash.user_name || '',
              device: (typeof deviceInfoParsed === 'object' ? deviceInfoParsed.model || deviceInfoParsed.device_name : '') || '',
              app: crash.app_identifier || '',
            });
          }}
        >
          🐾
        </button>
        <button
          type="button"
          className="view-btn"
          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail('crash', crash);
          }}
        >
          Stack Trace
        </button>
      </td>
    </tr>
  );
});

export default function CrashlyticsPanel({
  crashes = [],
  filteredCrashes = [],
  paginatedCrashes = [],
  loading = false,
  totalCrashes = 0,
  androidCrashes = 0,
  iosCrashes = 0,
  fatalCrashes = 0,
  nonFatalCrashes = 0,
  crashTab = 'all',
  setCrashTab,
  setMonitorQuery,
  deviceFilter = 'all',
  handleDeviceChange,
  uniqueDevices = [],
  userFilter = 'all',
  handleUserChange,
  uniqueUsers = [],
  platformScope = 'all',
  searchTerm = '',
  setSearchTerm,
  crashPage = 1,
  setCrashPage,
  crashPageSize = 20,
  setCrashPageSize,
  onOpenDetail,
  viewUserTimeline,
}) {
  return (
    <section className="log-panel" aria-labelledby="crashlytics-log-title">
      <div className="log-panel-header">
        <div className="log-title-group">
          <h2 id="crashlytics-log-title">Nhật ký sự cố & Crashlytics</h2>
          <span className="count-pill">{filteredCrashes.length} sự cố</span>
        </div>

        <div className="log-controls">
          <div className="filter-tabs" role="tablist" aria-label="Lọc mức độ và nền tảng crash">
            <button
              type="button"
              role="tab"
              aria-selected={crashTab === 'all'}
              className={`filter-tab ${crashTab === 'all' ? 'active' : ''}`}
              onClick={() => { setCrashTab('all'); setMonitorQuery({ severity: null }); }}
            >
              Tất cả <span className="tab-count">{totalCrashes}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={crashTab === 'android'}
              className={`filter-tab ${crashTab === 'android' ? 'active' : ''}`}
              style={{ color: crashTab === 'android' ? '#4ade80' : undefined }}
              onClick={() => { setCrashTab('android'); setMonitorQuery({ severity: 'android' }); }}
              title="Chỉ lọc sự cố trên hệ điều hành Android"
            >
              🤖 Android <span className="tab-count">{androidCrashes}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={crashTab === 'ios'}
              className={`filter-tab ${crashTab === 'ios' ? 'active' : ''}`}
              style={{ color: crashTab === 'ios' ? '#38bdf8' : undefined }}
              onClick={() => { setCrashTab('ios'); setMonitorQuery({ severity: 'ios' }); }}
              title="Chỉ lọc sự cố trên hệ điều hành iOS"
            >
              🍎 iOS <span className="tab-count">{iosCrashes}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={crashTab === 'fatal'}
              className={`filter-tab tab-danger ${crashTab === 'fatal' ? 'active' : ''}`}
              onClick={() => { setCrashTab('fatal'); setMonitorQuery({ severity: 'fatal' }); }}
            >
              <span className="dot dot-danger" /> {platformScope === 'web' ? 'Fatal (Lỗi Runtime)' : 'Fatal (Sập App)'} <span className="tab-count">{fatalCrashes}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={crashTab === 'non-fatal'}
              className={`filter-tab tab-warning ${crashTab === 'non-fatal' ? 'active' : ''}`}
              onClick={() => { setCrashTab('non-fatal'); setMonitorQuery({ severity: 'non-fatal' }); }}
            >
              <span className="dot dot-warning" /> {platformScope === 'web' ? 'Non-fatal (Cảnh báo)' : 'Non-fatal (Ngoại lệ)'} <span className="tab-count">{nonFatalCrashes}</span>
            </button>
          </div>

          <CustomSelect
            className="select-mini"
            value={deviceFilter}
            onChange={handleDeviceChange}
            options={[
              {
                value: 'all',
                label: platformScope === 'web'
                  ? `🌐 Tất cả trình duyệt ${uniqueDevices.length > 0 ? `(${uniqueDevices.length})` : ''}`
                  : `📱 Tất cả thiết bị ${uniqueDevices.length > 0 ? `(${uniqueDevices.length})` : ''}`,
              },
              ...uniqueDevices.map((d) => ({
                value: d,
                label: `${platformScope === 'web' ? '🌐' : '📱'} ${d}`,
              })),
            ]}
            ariaLabel={platformScope === 'web' ? 'Lọc theo trình duyệt' : 'Lọc theo thiết bị'}
          />

          <CustomSelect
            className="select-mini"
            value={userFilter}
            onChange={handleUserChange}
            options={[
              {
                value: 'all',
                label: platformScope === 'web'
                  ? `👤 Tất cả user web ${uniqueUsers.length > 0 ? `(${uniqueUsers.length})` : ''}`
                  : `👤 Tất cả user ${uniqueUsers.length > 0 ? `(${uniqueUsers.length})` : ''}`,
              },
              ...uniqueUsers.map((u) => ({ value: u, label: `👤 ${u}` })),
            ]}
            ariaLabel={platformScope === 'web' ? 'Lọc theo người dùng web' : 'Lọc theo người dùng'}
          />

          <label className="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 4 4" />
            </svg>
            <span className="sr-only">Tìm kiếm crash</span>
            <input
              type="search"
              placeholder="Tìm lỗi, stack trace, app ID..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="secondary-btn"
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            onClick={() => exportToCsv('crashes', filteredCrashes)}
            title="Xuất danh sách Crashes đang xem ra file CSV"
          >
            📥 Xuất CSV
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={{ width: '130px' }}>Thời gian</th>
              <th style={{ width: '22%' }}>Mục tiêu (Job / App ID)</th>
              <th style={{ width: '110px' }}>Mức độ</th>
              <th>Ngoại lệ & Tiêu đề lỗi</th>
              <th style={{ width: '180px' }}>Thiết bị / OS</th>
              <th style={{ width: '80px' }}><span className="sr-only">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && crashes.length === 0 && (
              <SkeletonRows columns={6} rows={5} />
            )}

            {filteredCrashes.length === 0 && !loading && (
              <tr>
                <td colSpan="6">
                  <div className="empty-state">
                    <h3>{crashes.length === 0 ? 'Tuyệt vời! Không có sự cố crash nào' : 'Không tìm thấy crash phù hợp'}</h3>
                    <p>
                      {crashes.length === 0
                        ? 'Hệ thống ứng dụng hoạt động ổn định và chưa ghi nhận bất kỳ ngoại lệ nào.'
                        : 'Thử tìm kiếm với từ khóa khác hoặc chuyển tab lọc.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {paginatedCrashes.map((crash) => (
              <CrashRow
                key={crash.id}
                crash={crash}
                onOpenDetail={onOpenDetail}
                onViewTimeline={viewUserTimeline}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PaginationDock
        currentPage={crashPage}
        totalItems={filteredCrashes.length}
        pageSize={crashPageSize}
        onPageChange={setCrashPage}
        onPageSizeChange={(newSize) => {
          setCrashPageSize(newSize);
          setCrashPage(1);
          setMonitorQuery({ size: newSize });
        }}
      />
    </section>
  );
}
