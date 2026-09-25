import React from 'react';
import CustomSelect from '../ui/CustomSelect';
import { formatMs, OUTCOME_COLORS, RANGE_OPTIONS } from '../../utils/format';

export default function EventFunnelsPanel({
  funnelStats,
  statsLoading,
  statsError,
  activeFunnel,
  setActiveFunnel,
  funnels = [],
  statsRange,
  setStatsRange,
  openFunnelSetup,
}) {
  return (
    <section className="log-panel" aria-labelledby="funnel-stats-title">
      <div className="log-panel-header">
        <div className="log-title-group">
          <h2 id="funnel-stats-title">
            {funnelStats?.funnel?.name || 'Thống kê sự kiện'}
          </h2>
          <span className="count-pill">
            {statsLoading ? 'Đang tính…' : `${funnelStats?.totals?.attempts ?? 0} lượt thử`}
          </span>
        </div>

        <div className="log-controls">
          <CustomSelect
            className="select-mini"
            value={activeFunnel}
            onChange={(val) => setActiveFunnel(val)}
            options={funnels.map((item) => ({
              value: item.funnel_key,
              label: `${item.status === 'inactive' ? '⏸ ' : ''}${item.name}`,
            }))}
            ariaLabel="Chọn luồng sự kiện cần thống kê"
            placeholder="Chưa có luồng nào…"
          />
          <CustomSelect
            className="select-mini"
            value={statsRange}
            onChange={(val) => setStatsRange(Number(val))}
            options={RANGE_OPTIONS}
            ariaLabel="Khoảng thời gian thống kê"
          />
          <button type="button" className="view-btn" onClick={() => openFunnelSetup()}>
            ＋ Thêm luồng
          </button>
          {activeFunnel && (
            <button
              type="button"
              className="view-btn"
              onClick={() => openFunnelSetup(activeFunnel)}
              title="Sửa cấu hình luồng đang chọn"
            >
              ⚙️ Cấu hình
            </button>
          )}
        </div>
      </div>

      {statsError && (
        <div className="funnel-alert" role="alert">
          ⚠️ {statsError}
        </div>
      )}

      {!statsError && !funnelStats && !statsLoading && (
        <div className="empty-state" style={{ padding: '2.5rem 1.25rem' }}>
          <h3>Chưa có luồng sự kiện nào để thống kê</h3>
          <p>
            Bấm “Thêm luồng”, nhập tiền tố sự kiện (ví dụ <code>ekyb_</code>) và hệ thống sẽ
            tự dò các sự kiện bắt đầu / thành công / thất bại tương ứng.
          </p>
        </div>
      )}

      {funnelStats && funnelStats.totals.attempts === 0 && (
        <div className="empty-state" style={{ padding: '2.5rem 1.25rem' }}>
          <h3>Không có lượt thử nào trong khoảng đã chọn</h3>
          <p>
            Đã quét {funnelStats.totals.events} sự kiện thuộc luồng này từ{' '}
            {funnelStats.range.day_from} đến {funnelStats.range.day_to}. Thử mở rộng khoảng
            thời gian, hoặc kiểm tra lại tên sự kiện tương quan trong phần Cấu hình.
          </p>
        </div>
      )}

      {funnelStats && funnelStats.totals.attempts > 0 && (
        <div className="funnel-body">
          {/* Phân bố kết quả cuối cùng */}
          <div className="funnel-block">
            <div className="funnel-block-head">
              <h3>Kết quả cuối cùng</h3>
              <span>
                {funnelStats.totals.completed}/{funnelStats.totals.attempts} lượt đã kết thúc
              </span>
            </div>

            <div className="outcome-bar" role="img" aria-label="Phân bố kết quả">
              {funnelStats.outcomes
                .filter((item) => item.count > 0)
                .map((item) => (
                  <div
                    key={item.key}
                    className="outcome-bar-slice"
                    style={{
                      width: `${item.pct_of_attempts}%`,
                      backgroundColor: OUTCOME_COLORS[item.key] || 'var(--line-strong)',
                    }}
                    title={`${item.label}: ${item.count} (${item.pct_of_attempts}%)`}
                  />
                ))}
            </div>

            <ul className="outcome-legend">
              {funnelStats.outcomes
                .filter((item) => item.count > 0 || item.key !== 'other')
                .map((item) => (
                  <li key={item.key}>
                    <span
                      className="legend-dot"
                      style={{ backgroundColor: OUTCOME_COLORS[item.key] || 'var(--line-strong)' }}
                    />
                    <span className="legend-label">{item.label}</span>
                    <strong>{item.count}</strong>
                    <small>
                      {item.pct_of_attempts}% lượt thử
                      {item.pct_of_completed !== null && item.pct_of_completed !== undefined
                        ? ` · ${item.pct_of_completed}% lượt đã kết thúc`
                        : ''}
                    </small>
                  </li>
                ))}
            </ul>
          </div>

          {/* Phễu theo từng bước */}
          <div className="funnel-block">
            <div className="funnel-block-head">
              <h3>Phễu theo từng bước</h3>
              <span>Tỷ lệ tính trên số lượt đã có kết quả ở bước đó</span>
            </div>

            <div className="step-list">
              {funnelStats.steps.map((step) => {
                const resolved = step.succeeded + step.failed;
                const widthBase = Math.max(1, funnelStats.steps[0]?.started || step.started || 1);
                return (
                  <div className="step-row" key={step.step}>
                    <div className="step-name">
                      <strong>{step.label}</strong>
                      <code>{step.step}</code>
                    </div>
                    <div className="step-bar-wrap">
                      <div
                        className="step-bar"
                        style={{ width: `${Math.max(2, (step.started / widthBase) * 100)}%` }}
                      >
                        <div
                          className="step-bar-ok"
                          style={{ width: `${resolved ? (step.succeeded / resolved) * 100 : 0}%` }}
                        />
                        <div
                          className="step-bar-fail"
                          style={{ width: `${resolved ? (step.failed / resolved) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="step-numbers">
                      <span title="Số lượt bắt đầu bước này">▶ {step.started}</span>
                      <span className="ok" title="Thành công">✓ {step.succeeded}</span>
                      <span className={step.failed ? 'fail' : ''} title="Thất bại">
                        ✕ {step.failed}
                      </span>
                      <span className="pctcell">{step.success_pct}%</span>
                      <span className="latency" title={`${step.samples} mẫu đo`}>
                        p50 {formatMs(step.p50_ms)} · p95 {formatMs(step.p95_ms)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Nguyên nhân lỗi */}
          {funnelStats.top_failures.length > 0 && (
            <div className="funnel-block">
              <div className="funnel-block-head">
                <h3>Nguyên nhân thất bại hay gặp</h3>
                <span>% tính trên tổng số bước lỗi</span>
              </div>
              <div className="reason-table-wrap">
                <table className="reason-table">
                  <thead>
                    <tr>
                      <th>Bước</th>
                      <th>Lý do</th>
                      <th>Mã lỗi</th>
                      <th>HTTP</th>
                      <th style={{ textAlign: 'right' }}>Số lần</th>
                      <th style={{ textAlign: 'right' }}>Tỷ lệ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnelStats.top_failures.map((row, index) => (
                      <tr key={`${row.step}-${row.reason}-${row.error_code}-${index}`}>
                        <td>{row.label || '—'}</td>
                        <td><code>{row.reason || '—'}</code></td>
                        <td>{row.error_code || '—'}</td>
                        <td>{row.status_code || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.count}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{row.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lý do chuyển duyệt tay */}
          {funnelStats.manual_fallbacks.length > 0 && (
            <div className="funnel-block">
              <div className="funnel-block-head">
                <h3>Lý do bị chuyển sang duyệt tay</h3>
                <span>Số liệu cho SLA xử lý hồ sơ thủ công</span>
              </div>
              <ul className="fallback-list">
                {funnelStats.manual_fallbacks.map((row, index) => (
                  <li key={`${row.step}-${row.reason}-${index}`}>
                    <span className="fallback-step">{row.label || '—'}</span>
                    <code>{row.reason || 'không ghi lý do'}</code>
                    <strong>{row.count}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Diễn biến theo ngày */}
          {funnelStats.series.length > 0 && (
            <div className="funnel-block">
              <div className="funnel-block-head">
                <h3>Diễn biến theo ngày</h3>
                <span>
                  Giờ Việt Nam
                  {funnelStats.history_days
                    ? ` · ${funnelStats.history_days} ngày lấy từ bảng tổng hợp`
                    : ''}
                </span>
              </div>
              <div className="series-chart">
                {funnelStats.series.map((point) => {
                  const peak = Math.max(...funnelStats.series.map((p) => p.attempts), 1);
                  return (
                    <div className="series-col" key={point.bucket}>
                      <div
                        className="series-stack"
                        style={{ height: `${Math.max(4, (point.attempts / peak) * 100)}%` }}
                        title={`${point.bucket}: ${point.attempts} lượt thử`}
                      >
                        {['success_auto', 'success_manual', 'failed', 'abandoned', 'open'].map(
                          (key) =>
                            point[key] > 0 ? (
                              <div
                                key={key}
                                style={{
                                  height: `${(point[key] / point.attempts) * 100}%`,
                                  backgroundColor: OUTCOME_COLORS[key],
                                }}
                              />
                            ) : null
                        )}
                      </div>
                      <span className="series-value">{point.attempts}</span>
                      <span className="series-label">{point.bucket.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
