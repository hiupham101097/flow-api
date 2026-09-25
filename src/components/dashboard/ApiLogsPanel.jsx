import React, { memo } from 'react';
import CustomSelect from '../ui/CustomSelect';
import PaginationDock from '../ui/PaginationDock';
import { SkeletonRows } from '../ui/SkeletonTable';
import { formatVietnamDate, formatVietnamTime, getStatusMeta, getSummarySnippet } from '../../utils/format';
import { exportToCsv } from '../../utils/exportCsv';

/**
 * LogRow được bọc bởi React.memo để loại bỏ hoàn toàn hiện tượng re-render thừa
 * khi typing search hoặc polling dữ liệu mới.
 */
const LogRow = memo(function LogRow({
  log,
  onOpenDetail,
  onViewTimeline,
  onFilterUser,
  onFilterDevice,
  onFilterIp,
}) {
  const statusMeta = getStatusMeta(log.status_code);
  const summaryText = getSummarySnippet(log);
  const isApp = log.job_type === 'app';

  return (
    <tr
      data-monitor-row
      tabIndex={0}
      className={statusMeta.type !== '200' ? 'row-error' : ''}
      onClick={() => onOpenDetail('log', log)}
      style={{ cursor: 'pointer' }}
      title="Nhấn để xem chi tiết"
    >
      <td className="timestamp-cell" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', lineHeight: 1.4 }}>
        <div>{formatVietnamDate(log.created_at)}</div>
        <div style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{formatVietnamTime(log.created_at)}</div>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span
              className={`type-badge ${isApp ? 'type-badge-app' : 'type-badge-web'}`}
              style={{ width: 'fit-content', fontSize: '0.72rem' }}
            >
              {isApp ? '📱' : '🌐'} {log.job_name || log.app_identifier || 'App'}
            </span>
            {log.user_name ? (
              <span
                className="user-tag"
                style={{ fontSize: '0.72rem', cursor: 'pointer', padding: '0.1rem 0.35rem' }}
                title="Nhấp để lọc theo người dùng này"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterUser(log.user_name);
                }}
              >
                👤 {log.user_name}
              </span>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}
              title="Nhấp để lọc theo thiết bị"
              onClick={(e) => {
                e.stopPropagation();
                onFilterDevice(log.device_name || '');
              }}
            >
              <span>📱</span>
              <strong style={{ color: 'var(--text-muted)' }}>
                {log.device_name || (isApp ? 'Thiết bị di động' : 'Trình duyệt Web')}
              </strong>
            </span>

            {log.ip_address ? (
              <span
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer', opacity: 0.85 }}
                title="Nhấp để lọc theo IP này"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterIp(log.ip_address);
                }}
              >
                <span>🌐</span>
                <code>{log.ip_address}</code>
              </span>
            ) : null}
          </div>
        </div>
      </td>
      <td>
        <span className={`method-badge ${(log.method || '').toLowerCase()}`}>
          {log.method}
        </span>
      </td>
      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', wordBreak: 'break-all', maxWidth: '240px' }}>
        {log.endpoint}
      </td>
      <td>
        <span className={`status-badge ${statusMeta.badgeClass}`}>
          {log.status_code || 0}
        </span>
      </td>
      <td className="summary-cell" title={summaryText} style={{ fontSize: '0.78rem' }}>
        <span className={`summary-pill ${statusMeta.pillClass}`}>
          {summaryText}
        </span>
      </td>
      <td className="duration-cell">{log.duration_ms || 0} ms</td>
      <td className="action-cell" style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="view-btn"
          style={{ fontSize: '0.72rem', padding: '0.25rem 0.45rem', background: 'rgba(125, 156, 255, 0.12)', color: 'var(--accent)' }}
          title="Xem toàn bộ hành trình của User / Thiết bị này"
          onClick={(event) => {
            event.stopPropagation();
            onViewTimeline({
              user: log.user_name || '',
              device: log.device_name || '',
              app: log.app_identifier || '',
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
            onOpenDetail('log', log);
          }}
        >
          Chi tiết
        </button>
      </td>
    </tr>
  );
});

export default function ApiLogsPanel({
  logs = [],
  filteredLogs = [],
  paginatedLogs = [],
  loading = false,
  totalCalls = 0,
  count200 = 0,
  count400 = 0,
  count500 = 0,
  activeTab = 'all',
  setActiveTab,
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
  logsPage = 1,
  setLogsPage,
  logsPageSize = 20,
  setLogsPageSize,
  onOpenDetail,
  viewUserTimeline,
}) {
  return (
    <section className="log-panel" aria-labelledby="telemetry-log-title">
      <div className="log-panel-header">
        <div className="log-title-group">
          <h2 id="telemetry-log-title">Nhật ký API Telemetry</h2>
          <span className="count-pill">{filteredLogs.length} yêu cầu</span>
        </div>

        <div className="log-controls">
          <div className="filter-tabs" role="tablist" aria-label="Lọc trạng thái HTTP">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              className={`filter-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => { setActiveTab('all'); setMonitorQuery({ status: null }); }}
            >
              Tất cả <span className="tab-count">{totalCalls}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === '200'}
              className={`filter-tab tab-success ${activeTab === '200' ? 'active' : ''}`}
              onClick={() => { setActiveTab('200'); setMonitorQuery({ status: '200' }); }}
            >
              <span className="dot dot-success" /> 200 OK <span className="tab-count">{count200}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === '400'}
              className={`filter-tab tab-warning ${activeTab === '400' ? 'active' : ''}`}
              onClick={() => { setActiveTab('400'); setMonitorQuery({ status: '400' }); }}
            >
              <span className="dot dot-warning" /> 4xx Lỗi Client <span className="tab-count">{count400}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === '500'}
              className={`filter-tab tab-danger ${activeTab === '500' ? 'active' : ''}`}
              onClick={() => { setActiveTab('500'); setMonitorQuery({ status: '500' }); }}
            >
              <span className="dot dot-danger" /> 5xx Lỗi Server <span className="tab-count">{count500}</span>
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
            <span className="sr-only">Tìm kiếm telemetry</span>
            <input
              type="search"
              placeholder="Tìm endpoint, user, thiết bị..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="secondary-btn"
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            onClick={() => exportToCsv('logs', filteredLogs)}
            title="Xuất danh sách API Logs đang xem ra file CSV"
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
              <th style={{ width: '22%' }}>Nguồn (Job / Client)</th>
              <th style={{ width: '70px' }}>Method</th>
              <th>Endpoint & URL</th>
              <th style={{ width: '75px' }}>Status</th>
              <th>Tóm tắt phản hồi</th>
              <th style={{ width: '85px' }}>Độ trễ</th>
              <th style={{ width: '80px' }}><span className="sr-only">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 && (
              <SkeletonRows columns={8} rows={6} />
            )}

            {filteredLogs.length === 0 && !loading && (
              <tr>
                <td colSpan="8">
                  <div className="empty-state">
                    <h3>{logs.length === 0 ? 'Chưa có telemetry nào' : 'Không tìm thấy request phù hợp'}</h3>
                    <p>
                      {logs.length === 0
                        ? 'Kết nối client Mobile hoặc Web để theo dõi các lệnh gọi API theo thời gian thực.'
                        : 'Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {paginatedLogs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                onOpenDetail={onOpenDetail}
                onViewTimeline={viewUserTimeline}
                onFilterUser={setSearchTerm}
                onFilterDevice={setSearchTerm}
                onFilterIp={setSearchTerm}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PaginationDock
        currentPage={logsPage}
        totalItems={filteredLogs.length}
        pageSize={logsPageSize}
        onPageChange={setLogsPage}
        onPageSizeChange={(newSize) => {
          setLogsPageSize(newSize);
          setLogsPage(1);
          setMonitorQuery({ size: newSize });
        }}
      />
    </section>
  );
}
