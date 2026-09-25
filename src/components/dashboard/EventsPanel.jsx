import React, { memo } from 'react';
import CustomSelect from '../ui/CustomSelect';
import PaginationDock from '../ui/PaginationDock';
import { SkeletonRows } from '../ui/SkeletonTable';
import { formatVietnamDate, formatVietnamTime, parseJsonSafe } from '../../utils/format';
import { exportToCsv } from '../../utils/exportCsv';

/**
 * EventRow được bọc bởi React.memo để loại bỏ render thừa
 */
const EventRow = memo(function EventRow({
  event,
  onOpenDetail,
  onViewTimeline,
}) {
  const isScreen = event.event_type === 'screen_view' || event.event_name === 'screen_view';
  const paramsParsed = parseJsonSafe(event.parameters);

  return (
    <tr
      data-monitor-row
      tabIndex={0}
      onClick={() => onOpenDetail('event', event)}
      style={{ cursor: 'pointer' }}
      title="Nhấn để xem chi tiết tham số"
    >
      <td className="timestamp-cell" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', lineHeight: 1.4 }}>
        <div>{formatVietnamDate(event.created_at)}</div>
        <div style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{formatVietnamTime(event.created_at)}</div>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span
            className="type-badge"
            style={{ background: 'rgba(125, 156, 255, 0.12)', color: 'var(--accent)', width: 'fit-content', fontSize: '0.72rem' }}
          >
            {event.job_name || event.app_identifier || 'App/Web'}
          </span>
          <small style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
            <code>{event.app_identifier}</code>
          </small>
        </div>
      </td>
      <td>
        {isScreen ? (
          <span className="badge-screen-view">
            📱 screen_view
          </span>
        ) : (
          <span className="badge-event-name">
            ⚡ {event.event_name}
          </span>
        )}
      </td>
      <td style={{ fontSize: '0.82rem', color: event.screen_name ? 'var(--text)' : 'var(--text-dim)' }}>
        {event.screen_name ? <b>{event.screen_name}</b> : '—'}
      </td>
      <td>
        {event.user_id ? (
          <span className="user-tag">👤 {event.user_id}</span>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Ẩn danh</span>
        )}
      </td>
      <td className="parameters-cell">
        {paramsParsed && typeof paramsParsed === 'object' ? (
          <div className="key-value-pill-list">
            {Object.entries(paramsParsed).slice(0, 3).map(([k, v]) => (
              <span key={k} className="key-value-chip">
                <span>{k}:</span> <strong>{String(v)}</strong>
              </span>
            ))}
            {Object.keys(paramsParsed).length > 3 && (
              <span className="key-value-chip">+ {Object.keys(paramsParsed).length - 3} nữa</span>
            )}
          </div>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Không có params</span>
        )}
      </td>
      <td className="action-cell events-action-cell">
        <button
          type="button"
          className="view-btn"
          style={{ fontSize: '0.72rem', padding: '0.25rem 0.45rem', background: 'rgba(125, 156, 255, 0.12)', color: 'var(--accent)' }}
          title="Xem toàn bộ hành trình của người dùng này"
          onClick={(e) => {
            e.stopPropagation();
            onViewTimeline({
              user: event.user_name || event.user_id || '',
              device: event.device_name || '',
              app: event.app_identifier || '',
            });
          }}
        >
          🐾
        </button>
        <button
          type="button"
          className="view-btn"
          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail('event', event);
          }}
        >
          Chi tiết
        </button>
      </td>
    </tr>
  );
});

export default function EventsPanel({
  events = [],
  filteredEvents = [],
  paginatedEvents = [],
  loading = false,
  totalEvents = 0,
  customEventCount = 0,
  screenViewCount = 0,
  eventTab = 'all',
  setEventTab,
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
  eventPage = 1,
  setEventPage,
  eventPageSize = 20,
  setEventPageSize,
  onOpenDetail,
  viewUserTimeline,
}) {
  return (
    <section className="log-panel" aria-labelledby="analytics-log-title">
      <div className="log-panel-header">
        <div className="log-title-group">
          <h2 id="analytics-log-title">Nhật ký sự kiện Analytics & Luồng màn hình</h2>
          <span className="count-pill">{filteredEvents.length} sự kiện</span>
        </div>

        <div className="log-controls">
          <div className="filter-tabs" role="tablist" aria-label="Lọc loại sự kiện">
            <button
              type="button"
              role="tab"
              aria-selected={eventTab === 'all'}
              className={`filter-tab ${eventTab === 'all' ? 'active' : ''}`}
              onClick={() => { setEventTab('all'); setMonitorQuery({ type: null }); }}
            >
              Tất cả <span className="tab-count">{totalEvents}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={eventTab === 'custom'}
              className={`filter-tab tab-accent ${eventTab === 'custom' ? 'active' : ''}`}
              onClick={() => { setEventTab('custom'); setMonitorQuery({ type: 'custom' }); }}
            >
              ⚡ Custom Events <span className="tab-count">{customEventCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={eventTab === 'screen_view'}
              className={`filter-tab tab-success ${eventTab === 'screen_view' ? 'active' : ''}`}
              onClick={() => { setEventTab('screen_view'); setMonitorQuery({ type: 'screen_view' }); }}
            >
              {platformScope === 'web' ? '🌐 Route / Page Views' : '📱 Screen Views'} <span className="tab-count">{screenViewCount}</span>
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
            <span className="sr-only">Tìm kiếm sự kiện</span>
            <input
              type="search"
              placeholder="Tìm tên sự kiện, màn hình, user ID..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="secondary-btn"
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            onClick={() => exportToCsv('events', filteredEvents)}
            title="Xuất danh sách Analytics Events đang xem ra file CSV"
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
              <th style={{ width: '20%' }}>Mục tiêu (Job / App)</th>
              <th style={{ width: '20%' }}>Tên sự kiện (Event)</th>
              <th style={{ width: '16%' }}>Màn hình (Screen)</th>
              <th style={{ width: '14%' }}>Người dùng (User ID)</th>
              <th className="parameters-column">Tham số (Parameters)</th>
              <th className="events-actions-column"><span className="sr-only">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && events.length === 0 && (
              <SkeletonRows columns={7} rows={6} />
            )}

            {filteredEvents.length === 0 && !loading && (
              <tr>
                <td colSpan="7">
                  <div className="empty-state">
                    <h3>{events.length === 0 ? 'Chưa có sự kiện Analytics nào' : 'Không tìm thấy sự kiện phù hợp'}</h3>
                    <p>
                      {events.length === 0
                        ? 'Tích hợp AppTelemetry.logEvent() hoặc logScreenView() trong Flutter để ghi nhận hành vi người dùng.'
                        : 'Thử tìm kiếm với từ khóa khác hoặc chuyển tab lọc.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {paginatedEvents.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onOpenDetail={onOpenDetail}
                onViewTimeline={viewUserTimeline}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PaginationDock
        currentPage={eventPage}
        totalItems={filteredEvents.length}
        pageSize={eventPageSize}
        onPageChange={setEventPage}
        onPageSizeChange={(newSize) => {
          setEventPageSize(newSize);
          setEventPage(1);
          setMonitorQuery({ size: newSize });
        }}
      />
    </section>
  );
}
