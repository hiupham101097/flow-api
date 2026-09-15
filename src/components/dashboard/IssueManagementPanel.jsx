import React, { useState, useEffect, useCallback } from 'react';
import IssueDetailModal from './IssueDetailModal';

function IssueManagementPanel({ selectedApp = '', activeUserJob = null, onViewUserTimeline }) {
  const [issues, setIssues] = useState([]);
  const [counts, setCounts] = useState({ total: 0, unresolved: 0, resolved: 0, ignored: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState('unresolved'); // 'unresolved' | 'resolved' | 'ignored' | 'all'
  const [typeFilter, setTypeFilter] = useState(''); // '' | 'crash' | 'api_error'
  const [sortBy, setSortBy] = useState('last_seen'); // 'last_seen' | 'total_occurrences' | 'first_seen'
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const limit = 25;

  // Selected issue for detail modal
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (selectedApp) params.set('app_identifier', selectedApp);
      else if (activeUserJob?.id) params.set('job_id', activeUserJob.id);
      params.set('sort_by', sortBy);
      params.set('order', 'desc');
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const res = await fetch(`/issues?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIssues(data.issues || []);
      if (data.counts) {
        setCounts(data.counts);
      }
    } catch (err) {
      console.error('Failed to fetch issues:', err);
      setError('Không thể tải danh sách sự cố. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, selectedApp, activeUserJob, sortBy, page]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleQuickStatusChange = async (issueId, newStatus, e) => {
    if (e) e.stopPropagation();
    setActionLoadingId(issueId);
    try {
      const res = await fetch(`/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        // Cập nhật state cục bộ để giao diện phản hồi tức thì
        setIssues((prev) =>
          prev.map((it) => (it.id === issueId ? { ...it, status: newStatus } : it))
        );
        // Tải lại để cập nhật strip count chính xác
        fetchIssues();
      }
    } catch (err) {
      console.error('Failed to update issue status:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const openDetail = (issueId) => {
    setSelectedIssueId(issueId);
    setIsModalOpen(true);
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '—';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
  };

  // Client-side search filtering if user enters search text
  const filteredIssues = issues.filter((issue) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (issue.title && issue.title.toLowerCase().includes(term)) ||
      (issue.culprit && issue.culprit.toLowerCase().includes(term)) ||
      (issue.fingerprint && issue.fingerprint.toLowerCase().includes(term)) ||
      (issue.app_identifier && issue.app_identifier.toLowerCase().includes(term))
    );
  });

  const getSeverityStyle = (sev) => {
    switch (sev) {
      case 'fatal':
        return { label: 'FATAL', bg: 'rgba(255, 119, 133, 0.15)', color: '#ff7785', border: '#ff7785' };
      case 'error':
        return { label: 'ERROR', bg: 'rgba(255, 171, 0, 0.15)', color: '#ffb300', border: '#ffb300' };
      case 'warning':
        return { label: 'WARNING', bg: 'rgba(242, 195, 109, 0.15)', color: '#f2c36d', border: '#f2c36d' };
      default:
        return { label: 'INFO', bg: 'rgba(125, 156, 255, 0.15)', color: '#7d9cff', border: '#7d9cff' };
    }
  };

  return (
    <div className="issues-management-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {/* 1. Top Metrics Strip */}
      <section className="metrics-strip" aria-label="Issue APM summary" style={{ margin: 0 }}>
        <div
          className="metric-item metric-lead"
          style={{ cursor: 'pointer' }}
          onClick={() => { setStatusFilter('unresolved'); setPage(0); }}
        >
          <span>🚨 Chưa giải quyết</span>
          <strong style={{ color: counts.unresolved > 0 ? '#ff7785' : 'inherit' }}>
            {counts.unresolved}
          </strong>
          <small>{counts.unresolved > 0 ? 'Cần ưu tiên khắc phục' : 'Tất cả sự cố đã kiểm soát'}</small>
        </div>
        <div
          className="metric-item"
          style={{ cursor: 'pointer' }}
          onClick={() => { setStatusFilter('resolved'); setPage(0); }}
        >
          <span>✅ Đã giải quyết</span>
          <strong className="metric-success">{counts.resolved}</strong>
          <small>Sự cố đã được Fix</small>
        </div>
        <div
          className="metric-item"
          style={{ cursor: 'pointer' }}
          onClick={() => { setStatusFilter('ignored'); setPage(0); }}
        >
          <span>👁️ Đã bỏ qua</span>
          <strong style={{ color: 'var(--text-dim)' }}>{counts.ignored}</strong>
          <small>Không ảnh hưởng lớn</small>
        </div>
        <div
          className="metric-item"
          style={{ cursor: 'pointer' }}
          onClick={() => { setStatusFilter('all'); setPage(0); }}
        >
          <span>📊 Tổng nhóm sự cố (Fingerprints)</span>
          <strong>{counts.total}</strong>
          <small>{selectedApp ? `Lọc cho ${selectedApp}` : 'Toàn bộ ứng dụng'}</small>
        </div>
      </section>

      {/* 2. Controls & Search Toolbar */}
      <div
        className="filter-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.8rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface)',
          padding: '0.9rem 1.1rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--line)',
        }}
      >
        {/* Left: Status Filter Pills */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {[
            { key: 'unresolved', label: '🚨 Chưa xử lý', count: counts.unresolved },
            { key: 'resolved', label: '✅ Đã sửa', count: counts.resolved },
            { key: 'ignored', label: '👁️ Bỏ qua', count: counts.ignored },
            { key: 'all', label: '📋 Tất cả', count: counts.total },
          ].map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setStatusFilter(tab.key); setPage(0); }}
                style={{
                  padding: '0.42rem 0.85rem',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: active ? '1px solid var(--accent)' : '1px solid var(--line-strong)',
                  background: active ? 'var(--accent-glow, rgba(125, 156, 255, 0.15))' : 'var(--surface-raised)',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '999px',
                    background: active ? 'var(--accent)' : 'var(--line-strong)',
                    color: active ? '#fff' : 'var(--text-dim)',
                    fontWeight: 700,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Type, Sort & Search */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Type dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
            style={{
              padding: '0.42rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-raised)',
              color: 'var(--text)',
              border: '1px solid var(--line-strong)',
              fontSize: '0.8rem',
            }}
          >
            <option value="">Tất cả nguồn lỗi</option>
            <option value="crash">📱 App Crash (Crashlytics)</option>
            <option value="api_error">⚠️ API Error (500s)</option>
          </select>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(0); }}
            style={{
              padding: '0.42rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-raised)',
              color: 'var(--text)',
              border: '1px solid var(--line-strong)',
              fontSize: '0.8rem',
            }}
          >
            <option value="last_seen">Mới xuất hiện gần nhất</option>
            <option value="total_occurrences">Tần suất lặp nhiều nhất</option>
            <option value="first_seen">Phát hiện lần đầu</option>
          </select>

          {/* Search input */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 Tìm tiêu đề, vị trí, hash..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '0.42rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-raised)',
                color: 'var(--text)',
                border: '1px solid var(--line-strong)',
                fontSize: '0.8rem',
                minWidth: '200px',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Refresh button */}
          <button
            type="button"
            className="action-btn"
            onClick={fetchIssues}
            disabled={loading}
            title="Làm mới danh sách"
            style={{ padding: '0.42rem 0.75rem', fontSize: '0.8rem' }}
          >
            {loading ? 'Đang tải...' : '🔄 Làm mới'}
          </button>
        </div>
      </div>

      {/* 3. Issues List */}
      <section
        className="log-panel"
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--line)',
          overflow: 'hidden',
        }}
      >
        {loading && issues.length === 0 ? (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem', width: '28px', height: '28px' }} />
            <p>Đang tổng hợp nhóm sự cố (Fingerprints)...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#ff7785' }}>
            <p style={{ fontWeight: 600 }}>{error}</p>
            <button
              type="button"
              className="action-btn"
              onClick={fetchIssues}
              style={{ marginTop: '0.8rem' }}
            >
              Thử lại
            </button>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.8rem' }}>🎉</div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--text)' }}>
              {statusFilter === 'unresolved'
                ? 'Tuyệt vời! Không có sự cố nào đang chờ xử lý'
                : 'Không tìm thấy sự cố nào phù hợp bộ lọc'}
            </h3>
            <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '0.88rem' }}>
              {statusFilter === 'unresolved'
                ? 'Hệ thống ứng dụng của bạn đang vận hành ổn định và không phát hiện bất thường mới.'
                : 'Thử điều chỉnh từ khóa tìm kiếm hoặc chuyển sang bộ lọc trạng thái khác.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredIssues.map((issue) => {
              const sev = getSeverityStyle(issue.severity);
              const isActionRunning = actionLoadingId === issue.id;

              return (
                <div
                  key={issue.id}
                  onClick={() => openDetail(issue.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--line)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    position: 'relative',
                    gap: '0.55rem',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-hover, rgba(255,255,255,0.03))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {/* Top Row: Badges, Title, Culprit & Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '280px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                          marginBottom: '0.35rem',
                        }}
                      >
                        {/* Severity badge */}
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.03em',
                            backgroundColor: sev.bg,
                            color: sev.color,
                            border: `1px solid ${sev.border}`,
                          }}
                        >
                          {sev.label}
                        </span>

                        {/* Type badge */}
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            backgroundColor: 'var(--surface-raised)',
                            border: '1px solid var(--line)',
                            color: 'var(--text)',
                          }}
                        >
                          {issue.type === 'crash' ? '📱 Crash' : '⚠️ API 500'}
                        </span>

                        {/* Job Name / App ID badge */}
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            backgroundColor: 'rgba(125, 156, 255, 0.1)',
                            border: '1px solid rgba(125, 156, 255, 0.25)',
                            color: 'var(--accent)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {issue.job_name || issue.app_identifier || 'Chung'}
                        </span>

                        {/* Fingerprint snippet */}
                        <span
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-dim)',
                            fontFamily: 'var(--font-mono)',
                          }}
                          title={`Fingerprint Hash: ${issue.fingerprint}`}
                        >
                          #{issue.fingerprint ? issue.fingerprint.slice(0, 10) : issue.id}
                        </span>
                      </div>

                      {/* Title */}
                      <h4
                        style={{
                          margin: '0 0 0.25rem',
                          fontSize: '0.98rem',
                          fontWeight: 700,
                          color: 'var(--text)',
                          lineHeight: 1.35,
                        }}
                      >
                        {issue.title || 'Lỗi không tên'}
                      </h4>

                      {/* Culprit */}
                      {issue.culprit && (
                        <div
                          style={{
                            fontSize: '0.78rem',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                            wordBreak: 'break-all',
                          }}
                        >
                          📍 {issue.culprit}
                        </div>
                      )}
                    </div>

                    {/* Right side: Quick stats and Action buttons */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1.2rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      {/* Occurrences & Users */}
                      <div style={{ textAlign: 'right', minWidth: '95px' }}>
                        <div
                          style={{
                            fontSize: '1.15rem',
                            fontWeight: 800,
                            color: issue.total_occurrences > 10 ? '#ff7785' : 'var(--text)',
                            lineHeight: 1.2,
                          }}
                        >
                          {issue.total_occurrences?.toLocaleString() || 1}
                          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-dim)', marginLeft: '3px' }}>
                            lần
                          </span>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          👥 {issue.user_count || 1} users
                        </div>
                      </div>

                      {/* Time badges */}
                      <div style={{ textAlign: 'right', minWidth: '105px', fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                        <div>Mới nhất: <strong style={{ color: 'var(--text)' }}>{timeAgo(issue.last_seen)}</strong></div>
                        <div style={{ marginTop: '2px' }}>Đầu tiên: {timeAgo(issue.first_seen)}</div>
                      </div>

                      {/* Quick status button */}
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {issue.status === 'unresolved' ? (
                          <>
                            <button
                              type="button"
                              className="action-btn"
                              disabled={isActionRunning}
                              onClick={(e) => handleQuickStatusChange(issue.id, 'resolved', e)}
                              title="Đánh dấu đã giải quyết"
                              style={{
                                padding: '0.38rem 0.75rem',
                                fontSize: '0.76rem',
                                background: 'rgba(97, 229, 189, 0.15)',
                                color: '#61e5bd',
                                border: '1px solid rgba(97, 229, 189, 0.3)',
                              }}
                            >
                              ✓ Giải quyết
                            </button>
                            <button
                              type="button"
                              className="action-btn"
                              disabled={isActionRunning}
                              onClick={(e) => handleQuickStatusChange(issue.id, 'ignored', e)}
                              title="Bỏ qua sự cố này"
                              style={{
                                padding: '0.38rem 0.65rem',
                                fontSize: '0.76rem',
                                background: 'transparent',
                                color: 'var(--text-dim)',
                                border: '1px solid var(--line)',
                              }}
                            >
                              👁️
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="action-btn"
                            disabled={isActionRunning}
                            onClick={(e) => handleQuickStatusChange(issue.id, 'unresolved', e)}
                            title="Mở lại sự cố"
                            style={{
                              padding: '0.38rem 0.75rem',
                              fontSize: '0.76rem',
                              background: 'rgba(255, 119, 133, 0.15)',
                              color: '#ff7785',
                              border: '1px solid rgba(255, 119, 133, 0.3)',
                            }}
                          >
                            ↺ Mở lại
                          </button>
                        )}
                        <button
                          type="button"
                          className="view-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(issue.id);
                          }}
                          style={{
                            padding: '0.38rem 0.75rem',
                            fontSize: '0.76rem',
                          }}
                        >
                          Chi tiết →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {issues.length > 0 && (
          <div
            style={{
              padding: '0.75rem 1.25rem',
              background: 'var(--surface-raised)',
              borderTop: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.82rem',
              color: 'var(--text-dim)',
            }}
          >
            <span>
              Hiển thị {page * limit + 1} - {page * limit + issues.length} trên tổng {counts.total} nhóm sự cố
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="action-btn"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
              >
                ← Trang trước
              </button>
              <button
                type="button"
                className="action-btn"
                disabled={issues.length < limit || loading}
                onClick={() => setPage((p) => p + 1)}
                style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
              >
                Trang tiếp →
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 4. Issue Detail Modal */}
      <IssueDetailModal
        issueId={selectedIssueId}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedIssueId(null);
        }}
        onStatusChanged={(id, newSt) => {
          setIssues((prev) =>
            prev.map((it) => (it.id === id ? { ...it, status: newSt } : it))
          );
          fetchIssues();
        }}
        onViewUserTimeline={(userParams) => {
          setIsModalOpen(false);
          if (onViewUserTimeline) onViewUserTimeline(userParams);
        }}
      />
    </div>
  );
}

export default IssueManagementPanel;
