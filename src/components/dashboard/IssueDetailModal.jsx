import React, { useState, useEffect } from 'react';

function IssueDetailModal({ issueId, isOpen, onClose, onStatusChanged, onViewUserTimeline }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'events'

  useEffect(() => {
    if (isOpen && issueId) {
      fetchDetail();
    }
  }, [isOpen, issueId]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/issues/${issueId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch issue details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      const res = await fetch(`/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const json = await res.json();
        setData((prev) => prev ? { ...prev, issue: json.issue || { ...prev.issue, status: newStatus } } : null);
        if (onStatusChanged) onStatusChanged(issueId, newStatus);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdating(false);
    }
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const issue = data?.issue;
  const events = data?.recent_events || [];

  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'fatal':
        return { label: 'FATAL CRASH', bg: 'rgba(255, 119, 133, 0.15)', color: '#ff7785', border: '#ff7785' };
      case 'error':
        return { label: 'ERROR', bg: 'rgba(255, 171, 0, 0.15)', color: '#ffb300', border: '#ffb300' };
      case 'warning':
        return { label: 'WARNING', bg: 'rgba(242, 195, 109, 0.15)', color: '#f2c36d', border: '#f2c36d' };
      default:
        return { label: 'INFO', bg: 'rgba(125, 156, 255, 0.15)', color: '#7d9cff', border: '#7d9cff' };
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case 'resolved':
        return { label: '✓ Đã giải quyết', bg: 'rgba(97, 229, 189, 0.15)', color: '#61e5bd' };
      case 'ignored':
        return { label: '👁️ Đã bỏ qua', bg: 'rgba(156, 163, 175, 0.15)', color: '#9ca3af' };
      default:
        return { label: '🚨 Chưa xử lý (Unresolved)', bg: 'rgba(255, 119, 133, 0.15)', color: '#ff7785' };
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(920px, 94%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-info" style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
              {issue && (
                <>
                  <span
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      backgroundColor: getSeverityBadge(issue.severity).bg,
                      color: getSeverityBadge(issue.severity).color,
                      border: `1px solid ${getSeverityBadge(issue.severity).border}`,
                    }}
                  >
                    {getSeverityBadge(issue.severity).label}
                  </span>
                  <span
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      backgroundColor: 'var(--surface-raised)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                    }}
                  >
                    {issue.type === 'crash' ? '📱 App Crash' : '⚠️ API 500'}
                  </span>
                  <span
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      backgroundColor: getStatusBadge(issue.status).bg,
                      color: getStatusBadge(issue.status).color,
                    }}
                  >
                    {getStatusBadge(issue.status).label}
                  </span>
                </>
              )}
            </div>
            <h2 style={{ fontSize: '1.18rem', fontWeight: 700, margin: 0, color: 'var(--text)', lineHeight: 1.4 }}>
              {loading ? 'Đang tải thông tin Issue…' : (issue?.title || `Issue #${issueId}`)}
            </h2>
            {issue?.culprit && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                📍 {issue.culprit}
              </p>
            )}
          </div>
          <div className="modal-header-actions">
            <button type="button" className="close-btn" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          </div>
        </div>

        {/* Status bar actions */}
        {issue && (
          <div
            style={{
              padding: '0.65rem 1.25rem',
              background: 'var(--surface)',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chuyển trạng thái:</span>
              {issue.status !== 'resolved' && (
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('resolved')}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem', color: '#61e5bd', borderColor: 'rgba(97, 229, 189, 0.4)' }}
                >
                  ✓ Đánh dấu đã sửa (Resolve)
                </button>
              )}
              {issue.status === 'resolved' && (
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('unresolved')}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem', color: '#ff7785', borderColor: 'rgba(255, 119, 133, 0.4)' }}
                >
                  ↩ Mở lại (Reopen)
                </button>
              )}
              {issue.status !== 'ignored' ? (
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('ignored')}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem', color: 'var(--text-dim)' }}
                >
                  👁️ Bỏ qua (Ignore)
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('unresolved')}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
                >
                  Khôi phục theo dõi
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
              <button
                type="button"
                className={`filter-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
              >
                Tổng quan
              </button>
              <button
                type="button"
                className={`filter-tab ${activeTab === 'events' ? 'active' : ''}`}
                onClick={() => setActiveTab('events')}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
              >
                Lịch sử nổ lỗi ({events.length})
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="modal-body" style={{ overflowY: 'auto', padding: '1.25rem', flex: 1 }}>
          {loading ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Đang tải chi tiết sự cố…
            </div>
          ) : !issue ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Không tìm thấy thông tin sự cố này.
            </div>
          ) : activeTab === 'overview' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Quick stats strip */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                <div style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Tổng lần xuất hiện</span>
                  <strong style={{ fontSize: '1.3rem', color: 'var(--danger)' }}>{issue.total_occurrences}</strong>
                  <small style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)' }}>lần lặp lại</small>
                </div>
                <div style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>User bị ảnh hưởng</span>
                  <strong style={{ fontSize: '1.3rem', color: 'var(--accent)' }}>{issue.user_count || 1}</strong>
                  <small style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)' }}>người dùng</small>
                </div>
                <div style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Lần đầu phát hiện</span>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--text)', display: 'block', marginTop: '0.35rem' }}>{issue.first_seen}</strong>
                </div>
                <div style={{ background: 'var(--surface)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Gần đây nhất</span>
                  <strong style={{ fontSize: '0.85rem', color: '#ffb300', display: 'block', marginTop: '0.35rem' }}>{issue.last_seen}</strong>
                </div>
              </div>

              {/* Fingerprint row */}
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>MÃ HASH FINGERPRINT (ĐỊNH DANH DUY NHẤT)</span>
                  <code style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>{issue.fingerprint}</code>
                </div>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => copyText(issue.fingerprint)}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                >
                  {copied ? '✓ Đã sao chép' : 'Copy Hash'}
                </button>
              </div>

              {/* Stack trace / Sample payload */}
              {issue.sample_payload && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.88rem' }}>Mẫu Dữ Liệu Lỗi & Stack Trace:</strong>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => copyText(issue.sample_payload)}
                      style={{ fontSize: '0.75rem' }}
                    >
                      Copy Payload
                    </button>
                  </div>
                  <pre
                    style={{
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '1rem',
                      maxHeight: '280px',
                      overflowY: 'auto',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {issue.sample_payload}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            /* Events list tab */
            <div>
              <div style={{ marginBottom: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Hiển thị tối đa 20 lần nổ lỗi gần đây nhất thuộc Issue này:
              </div>
              {events.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                  Chưa có sự kiện chi tiết nào được ghi nhận.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {events.map((ev, idx) => (
                    <div
                      key={ev.id || idx}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        padding: '0.75rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)' }}>
                            #{ev.id}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            🕒 {ev.created_at}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.error_message || (ev.endpoint ? `${ev.method || 'GET'} ${ev.endpoint} (${ev.status_code})` : 'Instance')}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                          📱 {ev.device_name || ev.device_info || 'Thiết bị di động'} · 👤 {ev.user_name || 'Khách'}
                        </div>
                      </div>

                      {onViewUserTimeline && (ev.user_name || ev.device_name) && (
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => {
                            onClose();
                            onViewUserTimeline({
                              user: ev.user_name || '',
                              device: ev.device_name || '',
                              app: ev.app_identifier || '',
                            });
                          }}
                          style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem', whiteSpace: 'nowrap' }}
                        >
                          🧭 Xem hành trình User
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', padding: '0.85rem 1.25rem', borderTop: '1px solid var(--line)' }}>
          <button type="button" className="primary-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

export default IssueDetailModal;
