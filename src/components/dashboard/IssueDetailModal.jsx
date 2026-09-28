import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../../constants/api';

function IssueDetailModal({ issueId, isOpen, onClose, onStatusChanged, onViewUserTimeline }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'breadcrumbs' | 'events'
  const [activePayloadTab, setActivePayloadTab] = useState('request'); // 'request' | 'response' | 'stack'
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [expandedBreadcrumbId, setExpandedBreadcrumbId] = useState(null);

  useEffect(() => {
    if (isOpen && issueId) {
      fetchDetail();
      setActiveTab('overview');
      setActivePayloadTab('request');
      setExpandedEventId(null);
      setExpandedBreadcrumbId(null);
    }
  }, [isOpen, issueId]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl(`/issues/${issueId}`), {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
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
      const res = await fetch(getApiUrl(`/issues/${issueId}`), {
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

  const copyText = (text, key = 'generic') => {
    if (!text) return;
    navigator.clipboard.writeText(typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatJson = (content) => {
    if (!content) return '';
    if (typeof content === 'object') {
      try {
        return JSON.stringify(content, null, 2);
      } catch (_) {
        return String(content);
      }
    }
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch (_) {
      return String(content);
    }
  };

  if (!isOpen) return null;

  const issue = data?.issue;
  const failedRequest = data?.failed_request || {};
  const events = data?.recent_events || [];
  const breadcrumbs = data?.breadcrumbs || [];

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

  const getMethodBadge = (m = 'GET') => {
    const method = String(m).toUpperCase();
    switch (method) {
      case 'GET':
        return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: 'rgba(16, 185, 129, 0.35)' };
      case 'POST':
        return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.35)' };
      case 'PUT':
        return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.35)' };
      case 'DELETE':
        return { bg: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', border: 'rgba(244, 63, 94, 0.35)' };
      case 'PATCH':
        return { bg: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', border: 'rgba(192, 132, 252, 0.35)' };
      default:
        return { bg: 'rgba(156, 163, 175, 0.15)', color: '#9ca3af', border: 'rgba(156, 163, 175, 0.35)' };
    }
  };

  const getStatusBadgeStyle = (statusCode) => {
    const code = Number(statusCode) || 0;
    if (code >= 500) {
      return { bg: 'rgba(255, 119, 133, 0.15)', color: '#ff7785', border: 'rgba(255, 119, 133, 0.35)', label: `${code} Server Error` };
    }
    if (code >= 400) {
      return { bg: 'rgba(255, 171, 0, 0.15)', color: '#ffb300', border: 'rgba(255, 171, 0, 0.35)', label: `${code} Client Error` };
    }
    if (code >= 200 && code < 300) {
      return { bg: 'rgba(97, 229, 189, 0.15)', color: '#61e5bd', border: 'rgba(97, 229, 189, 0.35)', label: `${code} OK` };
    }
    return { bg: 'rgba(156, 163, 175, 0.15)', color: '#9ca3af', border: 'rgba(156, 163, 175, 0.35)', label: `${code || 'ERR'}` };
  };

  // Determine what request/response bodies to display
  const requestBodyStr = formatJson(failedRequest.request_payload);
  const responseBodyStr = formatJson(failedRequest.response_payload);
  const stackTraceStr = failedRequest.stack_trace || (typeof failedRequest.sample_payload === 'string' ? failedRequest.sample_payload : '');

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(980px, 95%)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
          border: '1px solid var(--line-strong)',
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--line)' }}>
          <div className="modal-header-info" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
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
                  {issue.app_identifier && (
                    <span
                      style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: 'rgba(125, 156, 255, 0.1)',
                        color: 'var(--accent)',
                        border: '1px solid rgba(125, 156, 255, 0.25)',
                      }}
                    >
                      {issue.app_identifier}
                    </span>
                  )}
                </>
              )}
            </div>

            <h2
              style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                margin: 0,
                color: 'var(--text)',
                lineHeight: 1.35,
                wordBreak: 'break-word',
              }}
            >
              {loading ? 'Đang phân tích chi tiết sự cố…' : (issue?.title || `Issue #${issueId}`)}
            </h2>

            {issue?.culprit && (
              <p
                style={{
                  margin: '0.35rem 0 0',
                  fontSize: '0.82rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  wordBreak: 'break-all',
                }}
              >
                📍 Nguồn gốc: <span style={{ color: '#ffb300' }}>{issue.culprit}</span>
              </p>
            )}
          </div>

          <div className="modal-header-actions" style={{ marginLeft: '1rem' }}>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          </div>
        </div>

        {/* Status bar actions & Main Navigation Tabs */}
        {issue && (
          <div
            style={{
              padding: '0.65rem 1.4rem',
              background: 'var(--surface)',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            {/* Quick status actions */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Trạng thái:</span>
              {issue.status !== 'resolved' && (
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('resolved')}
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.75rem',
                    color: '#61e5bd',
                    borderColor: 'rgba(97, 229, 189, 0.4)',
                    background: 'rgba(97, 229, 189, 0.08)',
                  }}
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
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.75rem',
                    color: '#ff7785',
                    borderColor: 'rgba(255, 119, 133, 0.4)',
                    background: 'rgba(255, 119, 133, 0.08)',
                  }}
                >
                  ↩ Mở lại sự cố (Reopen)
                </button>
              )}
              {issue.status !== 'ignored' ? (
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('ignored')}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', color: 'var(--text-dim)' }}
                >
                  👁️ Bỏ qua (Ignore)
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('unresolved')}
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                >
                  Khôi phục theo dõi
                </button>
              )}
            </div>

            {/* 3 Main Tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <button
                type="button"
                className={`filter-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
                style={{ fontSize: '0.8rem', padding: '0.38rem 0.85rem' }}
              >
                🔍 Request Lỗi & Payload
              </button>
              <button
                type="button"
                className={`filter-tab ${activeTab === 'breadcrumbs' ? 'active' : ''}`}
                onClick={() => setActiveTab('breadcrumbs')}
                style={{ fontSize: '0.8rem', padding: '0.38rem 0.85rem' }}
                title="Chuỗi request trước khi xảy ra sự cố"
              >
                🧭 Vết Request Trước Lỗi ({breadcrumbs.length})
              </button>
              <button
                type="button"
                className={`filter-tab ${activeTab === 'events' ? 'active' : ''}`}
                onClick={() => setActiveTab('events')}
                style={{ fontSize: '0.8rem', padding: '0.38rem 0.85rem' }}
              >
                🕒 Lịch sử nổ lỗi ({events.length})
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="modal-body" style={{ overflowY: 'auto', padding: '1.3rem', flex: 1 }}>
          {loading ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem', width: '32px', height: '32px' }} />
              <p style={{ margin: 0 }}>Đang phân tích các request và nguyên nhân lỗi...</p>
            </div>
          ) : !issue ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Không tìm thấy thông tin sự cố này trong cơ sở dữ liệu.
            </div>
          ) : activeTab === 'overview' ? (
            /* TAB 1: Failed Request Overview & Payload Inspector */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Quick stats strip */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                <div style={{ background: 'var(--surface)', padding: '0.75rem 0.9rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Tổng lần lặp</span>
                  <strong style={{ fontSize: '1.35rem', color: 'var(--danger)' }}>{issue.total_occurrences?.toLocaleString()}</strong>
                  <small style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)' }}>lần nổ sự cố</small>
                </div>
                <div style={{ background: 'var(--surface)', padding: '0.75rem 0.9rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Users ảnh hưởng</span>
                  <strong style={{ fontSize: '1.35rem', color: 'var(--accent)' }}>{issue.user_count || 1}</strong>
                  <small style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)' }}>người dùng</small>
                </div>
                <div style={{ background: 'var(--surface)', padding: '0.75rem 0.9rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Phát hiện lần đầu</span>
                  <strong style={{ fontSize: '0.84rem', color: 'var(--text)', display: 'block', marginTop: '0.35rem' }}>
                    {issue.first_seen}
                  </strong>
                </div>
                <div style={{ background: 'var(--surface)', padding: '0.75rem 0.9rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Gần đây nhất</span>
                  <strong style={{ fontSize: '0.84rem', color: '#ffb300', display: 'block', marginTop: '0.35rem' }}>
                    {issue.last_seen}
                  </strong>
                </div>
              </div>

              {/* CARD 1: Failed Request Hero Details */}
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid rgba(255, 119, 133, 0.4)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(255, 119, 133, 0.08)',
                }}
              >
                {/* Hero Title Bar */}
                <div
                  style={{
                    background: 'rgba(255, 119, 133, 0.1)',
                    padding: '0.9rem 1.25rem',
                    borderBottom: '1px solid rgba(255, 119, 133, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#ff7785', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ⚡ YÊU CẦU HTTP GÂY LỖI:
                    </span>
                    {/* Method badge */}
                    <span
                      style={{
                        padding: '0.22rem 0.65rem',
                        borderRadius: '4px',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: getMethodBadge(failedRequest.method).bg,
                        color: getMethodBadge(failedRequest.method).color,
                        border: `1px solid ${getMethodBadge(failedRequest.method).border}`,
                      }}
                    >
                      {(failedRequest.method || 'POST').toUpperCase()}
                    </span>
                    {/* Endpoint */}
                    <span
                      style={{
                        fontSize: '0.96rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        color: '#fff',
                        wordBreak: 'break-all',
                      }}
                    >
                      {failedRequest.endpoint || issue.culprit || 'Endpoint không xác định'}
                    </span>
                    {/* Status code badge */}
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        backgroundColor: getStatusBadgeStyle(failedRequest.status_code).bg,
                        color: getStatusBadgeStyle(failedRequest.status_code).color,
                        border: `1px solid ${getStatusBadgeStyle(failedRequest.status_code).border}`,
                      }}
                    >
                      {getStatusBadgeStyle(failedRequest.status_code).label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {failedRequest.duration_ms !== null && failedRequest.duration_ms !== undefined && (
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                        ⏱️ {failedRequest.duration_ms}ms
                      </span>
                    )}
                    <span>🕒 {failedRequest.created_at || issue.last_seen}</span>
                  </div>
                </div>

                {/* Metadata details strip */}
                <div
                  style={{
                    padding: '0.85rem 1.25rem',
                    background: 'rgba(0, 0, 0, 0.15)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.8rem',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>👤 NGƯỜI DÙNG</span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--text)' }}>
                      {failedRequest.user_name || 'Khách (Chưa đăng nhập)'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>📱 THIẾT BỊ / CLIENT</span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--text)' }}>
                      {failedRequest.device_name || 'Thiết bị di động'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>🌐 ĐỊA CHỈ IP</span>
                    <code style={{ fontSize: '0.84rem', color: 'var(--accent)' }}>
                      {failedRequest.ip_address || '—'}
                    </code>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>📦 GÓI ỨNG DỤNG</span>
                    <code style={{ fontSize: '0.84rem', color: 'var(--text)' }}>
                      {issue.app_identifier || 'Chung'}
                    </code>
                  </div>
                </div>

                {/* Error message callout */}
                {failedRequest.error_message && (
                  <div
                    style={{
                      margin: '1rem 1.25rem',
                      padding: '0.85rem 1.1rem',
                      background: 'rgba(255, 77, 79, 0.08)',
                      borderLeft: '4px solid #ff4d4f',
                      borderRadius: '0 6px 6px 0',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '0.8rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#ff7785', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                        Thông điệp lỗi trả về (Error Message):
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#ffb300', fontFamily: 'var(--font-mono)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                        {failedRequest.error_message}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => copyText(failedRequest.error_message, 'err_msg')}
                      style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', flexShrink: 0 }}
                    >
                      {copiedKey === 'err_msg' ? '✓ Đã chép' : 'Copy'}
                    </button>
                  </div>
                )}

                {/* Sub-tabs for Payload Inspection */}
                <div style={{ padding: '0 1.25rem 1.25rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--line)',
                      marginBottom: '0.8rem',
                      paddingBottom: '0.4rem',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className={`filter-tab ${activePayloadTab === 'request' ? 'active' : ''}`}
                        onClick={() => setActivePayloadTab('request')}
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                      >
                        📤 Dữ liệu gửi lên (Request Body)
                      </button>
                      <button
                        type="button"
                        className={`filter-tab ${activePayloadTab === 'response' ? 'active' : ''}`}
                        onClick={() => setActivePayloadTab('response')}
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                      >
                        📥 Phản hồi lỗi (Response Body)
                      </button>
                      {stackTraceStr && (
                        <button
                          type="button"
                          className={`filter-tab ${activePayloadTab === 'stack' ? 'active' : ''}`}
                          onClick={() => setActivePayloadTab('stack')}
                          style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                        >
                          📄 Dấu vết mã (Stack Trace)
                        </button>
                      )}
                    </div>

                    <div>
                      {activePayloadTab === 'request' && (
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={!requestBodyStr}
                          onClick={() => copyText(requestBodyStr, 'req_payload')}
                          style={{ fontSize: '0.74rem', padding: '0.28rem 0.65rem' }}
                        >
                          {copiedKey === 'req_payload' ? '✓ Đã sao chép' : '📋 Copy Request Payload'}
                        </button>
                      )}
                      {activePayloadTab === 'response' && (
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={!responseBodyStr}
                          onClick={() => copyText(responseBodyStr, 'res_payload')}
                          style={{ fontSize: '0.74rem', padding: '0.28rem 0.65rem' }}
                        >
                          {copiedKey === 'res_payload' ? '✓ Đã sao chép' : '📋 Copy Response Payload'}
                        </button>
                      )}
                      {activePayloadTab === 'stack' && (
                        <button
                          type="button"
                          className="secondary-btn"
                          disabled={!stackTraceStr}
                          onClick={() => copyText(stackTraceStr, 'stack_trace')}
                          style={{ fontSize: '0.74rem', padding: '0.28rem 0.65rem' }}
                        >
                          {copiedKey === 'stack_trace' ? '✓ Đã sao chép' : '📋 Copy Stack Trace'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active Payload Box */}
                  {activePayloadTab === 'request' && (
                    <div>
                      {requestBodyStr ? (
                        <pre
                          style={{
                            background: '#0d1117',
                            color: '#e6edf3',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '1rem',
                            maxHeight: '280px',
                            overflowY: 'auto',
                            fontSize: '0.8rem',
                            fontFamily: 'var(--font-mono)',
                            lineHeight: 1.5,
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {requestBodyStr}
                        </pre>
                      ) : (
                        <div
                          style={{
                            padding: '1.5rem',
                            textAlign: 'center',
                            background: 'var(--surface-muted)',
                            borderRadius: '8px',
                            border: '1px dashed var(--line)',
                            color: 'var(--text-dim)',
                            fontSize: '0.82rem',
                          }}
                        >
                          Không có payload gửi kèm (Request GET hoặc body rỗng).
                        </div>
                      )}
                    </div>
                  )}

                  {activePayloadTab === 'response' && (
                    <div>
                      {responseBodyStr ? (
                        <pre
                          style={{
                            background: '#0d1117',
                            color: '#ff7785',
                            border: '1px solid rgba(255, 119, 133, 0.3)',
                            borderRadius: '8px',
                            padding: '1rem',
                            maxHeight: '280px',
                            overflowY: 'auto',
                            fontSize: '0.8rem',
                            fontFamily: 'var(--font-mono)',
                            lineHeight: 1.5,
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {responseBodyStr}
                        </pre>
                      ) : (
                        <div
                          style={{
                            padding: '1.5rem',
                            textAlign: 'center',
                            background: 'var(--surface-muted)',
                            borderRadius: '8px',
                            border: '1px dashed var(--line)',
                            color: 'var(--text-dim)',
                            fontSize: '0.82rem',
                          }}
                        >
                          Không có dữ liệu phản hồi trả về từ máy chủ.
                        </div>
                      )}
                    </div>
                  )}

                  {activePayloadTab === 'stack' && (
                    <div>
                      <pre
                        style={{
                          background: '#0d1117',
                          color: '#f0883e',
                          border: '1px solid var(--line)',
                          borderRadius: '8px',
                          padding: '1rem',
                          maxHeight: '320px',
                          overflowY: 'auto',
                          fontSize: '0.78rem',
                          fontFamily: 'var(--font-mono)',
                          lineHeight: 1.55,
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {stackTraceStr}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 2: Preceding Requests Snapshot (Breadcrumb preview) */}
              {breadcrumbs.length > 0 && (
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '1rem 1.25rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.85rem',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                        🧭 Vết Request Ngay Trước Đó ({breadcrumbs.length} bước dẫn đến lỗi):
                      </strong>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
                        Trình tự các API được gọi trên cùng thiết bị / user này trước khi xảy ra sự cố.
                      </span>
                    </div>

                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => setActiveTab('breadcrumbs')}
                      style={{ fontSize: '0.78rem', color: 'var(--accent)' }}
                    >
                      Xem chi tiết chuỗi request →
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {breadcrumbs.slice(-4).map((b, idx) => {
                      const isLast = idx === breadcrumbs.slice(-4).length - 1;
                      const isError = Number(b.status_code) >= 500;
                      return (
                        <div
                          key={b.id || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.45rem 0.75rem',
                            borderRadius: '6px',
                            background: isError ? 'rgba(255, 119, 133, 0.1)' : 'var(--surface-raised)',
                            border: isError ? '1px solid rgba(255, 119, 133, 0.3)' : '1px solid var(--line)',
                            fontSize: '0.78rem',
                            gap: '0.6rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                            <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                              #{idx + 1}
                            </span>
                            <span
                              style={{
                                padding: '0.1rem 0.4rem',
                                borderRadius: '3px',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                backgroundColor: getMethodBadge(b.method).bg,
                                color: getMethodBadge(b.method).color,
                              }}
                            >
                              {(b.method || 'GET').toUpperCase()}
                            </span>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                color: isError ? '#ff7785' : 'var(--text)',
                                fontWeight: isLast ? 700 : 500,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {b.endpoint}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                            <span
                              style={{
                                padding: '0.1rem 0.45rem',
                                borderRadius: '3px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                backgroundColor: getStatusBadgeStyle(b.status_code).bg,
                                color: getStatusBadgeStyle(b.status_code).color,
                              }}
                            >
                              {b.status_code || 200}
                            </span>
                            {b.duration_ms !== undefined && (
                              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                                {b.duration_ms}ms
                              </span>
                            )}
                            {isLast && isError && (
                              <span style={{ fontSize: '0.72rem', color: '#ff7785', fontWeight: 700 }}>
                                💥 NỔ LỖI
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CARD 3: Fingerprint info box */}
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
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                    MÃ HASH FINGERPRINT ĐỊNH DANH SỰ CỐ
                  </span>
                  <code style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>{issue.fingerprint}</code>
                </div>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => copyText(issue.fingerprint, 'fingerprint')}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                >
                  {copiedKey === 'fingerprint' ? '✓ Đã sao chép' : 'Copy Hash'}
                </button>
              </div>
            </div>
          ) : activeTab === 'breadcrumbs' ? (
            /* TAB 2: Full Request Breadcrumbs Trail */
            <div>
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.2rem', fontSize: '1rem', color: 'var(--text)' }}>
                    🧭 Chuỗi Request Trước Sự Cố (Breadcrumbs Trail)
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Các yêu cầu HTTP được gọi trước khi lỗi nổ ra. Nhấp vào bất kỳ request nào để xem chi tiết Body & Response.
                  </p>
                </div>
                <span
                  style={{
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.74rem',
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--line)',
                    color: 'var(--accent)',
                    fontWeight: 700,
                  }}
                >
                  {breadcrumbs.length} Bước
                </span>
              </div>

              {breadcrumbs.length === 0 ? (
                <div
                  style={{
                    padding: '3rem 1.5rem',
                    textAlign: 'center',
                    background: 'var(--surface)',
                    borderRadius: '8px',
                    border: '1px dashed var(--line)',
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                  <h4 style={{ margin: '0 0 0.4rem', color: 'var(--text)' }}>Không tìm thấy request tiền sự cố</h4>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                    Đây có thể là request đầu tiên trong phiên làm việc của người dùng, hoặc các request trước đó đã hết hạn lưu trữ.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {breadcrumbs.map((bc, idx) => {
                    const isExpanded = expandedBreadcrumbId === (bc.id || idx);
                    const isFailedStep = Number(bc.status_code) >= 500 || idx === breadcrumbs.length - 1;
                    const reqStr = formatJson(bc.request_payload);
                    const resStr = formatJson(bc.response_payload);

                    return (
                      <div
                        key={bc.id || idx}
                        style={{
                          background: isFailedStep ? 'rgba(255, 119, 133, 0.06)' : 'var(--surface)',
                          border: isFailedStep ? '1px solid rgba(255, 119, 133, 0.35)' : '1px solid var(--line)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          transition: 'border-color 0.15s ease',
                        }}
                      >
                        {/* Step Header */}
                        <div
                          onClick={() => setExpandedBreadcrumbId(isExpanded ? null : (bc.id || idx))}
                          style={{
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.8rem',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
                            <span
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: isFailedStep ? '#ff7785' : 'var(--line-strong)',
                                color: isFailedStep ? '#fff' : 'var(--text)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                flexShrink: 0,
                              }}
                            >
                              {idx + 1}
                            </span>

                            <span
                              style={{
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                backgroundColor: getMethodBadge(bc.method).bg,
                                color: getMethodBadge(bc.method).color,
                                border: `1px solid ${getMethodBadge(bc.method).border}`,
                              }}
                            >
                              {(bc.method || 'GET').toUpperCase()}
                            </span>

                            <span
                              style={{
                                fontSize: '0.85rem',
                                fontWeight: isFailedStep ? 700 : 500,
                                fontFamily: 'var(--font-mono)',
                                color: isFailedStep ? '#ff7785' : 'var(--text)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {bc.endpoint}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexShrink: 0 }}>
                            <span
                              style={{
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                backgroundColor: getStatusBadgeStyle(bc.status_code).bg,
                                color: getStatusBadgeStyle(bc.status_code).color,
                              }}
                            >
                              {bc.status_code || 200}
                            </span>

                            {bc.duration_ms !== undefined && (
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                                {bc.duration_ms}ms
                              </span>
                            )}

                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                              🕒 {bc.created_at?.split(' ')[1] || bc.created_at}
                            </span>

                            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          </div>
                        </div>

                        {/* Step Expanded Content */}
                        {isExpanded && (
                          <div
                            style={{
                              padding: '1rem',
                              borderTop: '1px solid var(--line)',
                              background: 'var(--surface-raised)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.75rem',
                            }}
                          >
                            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.76rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                              <span>👤 User: <strong style={{ color: 'var(--text)' }}>{bc.user_name || 'Khách'}</strong></span>
                              <span>📱 Device: <strong style={{ color: 'var(--text)' }}>{bc.device_name || 'Thiết bị'}</strong></span>
                              <span>🌐 IP: <code style={{ color: 'var(--accent)' }}>{bc.ip_address || '—'}</code></span>
                              {bc.error_message && (
                                <span style={{ color: '#ff7785' }}>
                                  ⚠️ Lỗi: <strong>{bc.error_message}</strong>
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                              {/* Request Payload */}
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    📤 REQUEST PAYLOAD
                                  </span>
                                  {reqStr && (
                                    <button
                                      type="button"
                                      className="text-btn"
                                      onClick={() => copyText(reqStr, `bc_req_${idx}`)}
                                      style={{ fontSize: '0.7rem' }}
                                    >
                                      {copiedKey === `bc_req_${idx}` ? '✓ Đã chép' : 'Copy'}
                                    </button>
                                  )}
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '0.7rem',
                                    borderRadius: '6px',
                                    background: '#0d1117',
                                    color: '#e6edf3',
                                    fontSize: '0.74rem',
                                    fontFamily: 'var(--font-mono)',
                                    maxHeight: '160px',
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {reqStr || '// Không có body'}
                                </pre>
                              </div>

                              {/* Response Payload */}
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    📥 RESPONSE PAYLOAD
                                  </span>
                                  {resStr && (
                                    <button
                                      type="button"
                                      className="text-btn"
                                      onClick={() => copyText(resStr, `bc_res_${idx}`)}
                                      style={{ fontSize: '0.7rem' }}
                                    >
                                      {copiedKey === `bc_res_${idx}` ? '✓ Đã chép' : 'Copy'}
                                    </button>
                                  )}
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '0.7rem',
                                    borderRadius: '6px',
                                    background: '#0d1117',
                                    color: isFailedStep ? '#ff7785' : '#7ee787',
                                    fontSize: '0.74rem',
                                    fontFamily: 'var(--font-mono)',
                                    maxHeight: '160px',
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {resStr || '// Không có dữ liệu phản hồi'}
                                </pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* TAB 3: Recent Events Occurrences List */
            <div>
              <div style={{ marginBottom: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Hiển thị {events.length} lần xuất hiện gần nhất của sự cố này. Nhấp vào mỗi lần để kiểm tra chi tiết Request Payload & Server Response:
                </span>
              </div>

              {events.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-dim)', background: 'var(--surface)', borderRadius: '8px' }}>
                  Chưa có lần nổ lỗi cụ thể nào được ghi nhận gần đây.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {events.map((ev, idx) => {
                    const isExpanded = expandedEventId === (ev.id || idx);
                    const evReqStr = formatJson(ev.request_payload);
                    const evResStr = formatJson(ev.response_payload);
                    const evStackStr = ev.stack_trace || '';

                    return (
                      <div
                        key={ev.id || idx}
                        style={{
                          background: 'var(--surface)',
                          border: isExpanded ? '1px solid var(--accent)' : '1px solid var(--line)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Event Row Header */}
                        <div
                          onClick={() => setExpandedEventId(isExpanded ? null : (ev.id || idx))}
                          style={{
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.8rem',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent)' }}>
                                #{ev.id}
                              </span>
                              {ev.method && (
                                <span
                                  style={{
                                    padding: '0.12rem 0.45rem',
                                    borderRadius: '3px',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-mono)',
                                    backgroundColor: getMethodBadge(ev.method).bg,
                                    color: getMethodBadge(ev.method).color,
                                  }}
                                >
                                  {ev.method.toUpperCase()}
                                </span>
                              )}
                              {ev.status_code && (
                                <span
                                  style={{
                                    padding: '0.12rem 0.45rem',
                                    borderRadius: '3px',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    backgroundColor: getStatusBadgeStyle(ev.status_code).bg,
                                    color: getStatusBadgeStyle(ev.status_code).color,
                                  }}
                                >
                                  {ev.status_code}
                                </span>
                              )}
                              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                🕒 {ev.created_at}
                              </span>
                            </div>

                            <div
                              style={{
                                fontSize: '0.84rem',
                                color: 'var(--text)',
                                fontFamily: 'var(--font-mono)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {ev.endpoint || ev.error_message || 'Sự cố'}
                            </div>

                            <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                              📱 {ev.device_name || ev.device_info || 'Thiết bị'} · 👤 {ev.user_name || 'Khách'}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            {onViewUserTimeline && (ev.user_name || ev.device_name) && (
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClose();
                                  onViewUserTimeline({
                                    user: ev.user_name || '',
                                    device: ev.device_name || '',
                                    app: ev.app_identifier || '',
                                  });
                                }}
                                style={{ fontSize: '0.72rem', padding: '0.28rem 0.55rem', whiteSpace: 'nowrap' }}
                              >
                                🧭 Hành trình User
                              </button>
                            )}

                            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          </div>
                        </div>

                        {/* Event Row Expanded Accordion */}
                        {isExpanded && (
                          <div
                            style={{
                              padding: '1rem',
                              borderTop: '1px solid var(--line)',
                              background: 'var(--surface-raised)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.75rem',
                            }}
                          >
                            {ev.error_message && (
                              <div style={{ fontSize: '0.78rem', color: '#ffb300', fontFamily: 'var(--font-mono)', background: 'rgba(255, 171, 0, 0.08)', padding: '0.5rem 0.75rem', borderRadius: '4px' }}>
                                ⚠️ {ev.error_message}
                              </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                              {/* Request Payload */}
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    📤 REQUEST PAYLOAD
                                  </span>
                                  {evReqStr && (
                                    <button
                                      type="button"
                                      className="text-btn"
                                      onClick={() => copyText(evReqStr, `ev_req_${idx}`)}
                                      style={{ fontSize: '0.7rem' }}
                                    >
                                      {copiedKey === `ev_req_${idx}` ? '✓ Đã chép' : 'Copy'}
                                    </button>
                                  )}
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '0.7rem',
                                    borderRadius: '6px',
                                    background: '#0d1117',
                                    color: '#e6edf3',
                                    fontSize: '0.74rem',
                                    fontFamily: 'var(--font-mono)',
                                    maxHeight: '160px',
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {evReqStr || '// Không có body'}
                                </pre>
                              </div>

                              {/* Response Payload */}
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    📥 RESPONSE PAYLOAD
                                  </span>
                                  {evResStr && (
                                    <button
                                      type="button"
                                      className="text-btn"
                                      onClick={() => copyText(evResStr, `ev_res_${idx}`)}
                                      style={{ fontSize: '0.7rem' }}
                                    >
                                      {copiedKey === `ev_res_${idx}` ? '✓ Đã chép' : 'Copy'}
                                    </button>
                                  )}
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '0.7rem',
                                    borderRadius: '6px',
                                    background: '#0d1117',
                                    color: '#ff7785',
                                    fontSize: '0.74rem',
                                    fontFamily: 'var(--font-mono)',
                                    maxHeight: '160px',
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {evResStr || '// Không có response body'}
                                </pre>
                              </div>
                            </div>

                            {evStackStr && (
                              <div>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>
                                  📄 STACK TRACE
                                </span>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '0.7rem',
                                    borderRadius: '6px',
                                    background: '#0d1117',
                                    color: '#f0883e',
                                    fontSize: '0.74rem',
                                    fontFamily: 'var(--font-mono)',
                                    maxHeight: '160px',
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {evStackStr}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.85rem 1.4rem',
            borderTop: '1px solid var(--line)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
            Flow APM • Giám sát & Bắt vết lỗi thời gian thực
          </div>
          <button type="button" className="primary-btn" onClick={onClose} style={{ padding: '0.45rem 1.2rem', fontSize: '0.85rem' }}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

export default IssueDetailModal;
