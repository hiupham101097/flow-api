import React, { useState, useEffect } from 'react';

function TelegramSettingsModal({ isOpen, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [alertCrashes, setAlertCrashes] = useState(true);
  const [alertApi500, setAlertApi500] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [maskedToken, setMaskedToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/settings/telegram');
      if (res.ok) {
        const data = await res.json();
        setIsConfigured(Boolean(data.configured));
        setMaskedToken(data.bot_token_masked || '');
        setBotToken(data.bot_token_masked || '');
        setChatId(data.chat_id || '');
        setAlertCrashes(data.alert_crashes !== false);
        setAlertApi500(Boolean(data.alert_api500));
      }
    } catch (err) {
      console.error('Failed to load telegram settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/settings/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: botToken,
          chat_id: chatId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({ type: 'success', text: data.message || 'Gửi tin nhắn thử nghiệm thành công! Vui lòng kiểm tra Telegram của bạn.' });
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Gửi thử nghiệm thất bại. Vui lòng kiểm tra lại Bot Token và Chat ID.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: `Lỗi kết nối: ${err.message}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/settings/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: botToken,
          chat_id: chatId,
          alert_crashes: alertCrashes,
          alert_api500: alertApi500,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({ type: 'success', text: 'Đã lưu cấu hình Telegram thành công!' });
        setIsConfigured(Boolean(botToken && chatId));
        if (onSaved) onSaved();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Không thể lưu cấu hình' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: `Lỗi: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '92%' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🔔</span>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Cấu hình Cảnh báo Telegram Bot
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Tự động gửi thông báo sự cố tức thời đến Telegram khi ứng dụng gặp lỗi sập (Crash) hoặc API 500
              </span>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {/* Status Message Banner */}
          {statusMsg && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                marginBottom: '1.25rem',
                fontSize: '0.85rem',
                background: statusMsg.type === 'success' ? 'rgba(97, 229, 189, 0.15)' : 'rgba(255, 119, 133, 0.15)',
                border: `1px solid ${statusMsg.type === 'success' ? '#61e5bd' : '#ff7785'}`,
                color: statusMsg.type === 'success' ? '#61e5bd' : '#ff7785',
              }}
            >
              {statusMsg.type === 'success' ? '✓ ' : '⚠️ '} {statusMsg.text}
            </div>
          )}

          {/* Quick Guide */}
          <div
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--line)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
              fontSize: '0.82rem',
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: '0.35rem' }}>
              📖 Hướng dẫn nhanh cách tạo Bot Telegram (2 phút):
            </div>
            <ol style={{ paddingLeft: '1.2rem', margin: 0, color: 'var(--text-muted)' }}>
              <li>
                Mở Telegram, chat với <strong>@BotFather</strong>, gửi lệnh <code>/newbot</code>, đặt tên và nhận <strong>API Token</strong>.
              </li>
              <li>
                Mở link bot vừa tạo trên Telegram và bấm <strong>Start</strong> (hoặc thêm bot vào Group của bạn).
              </li>
              <li>
                Chat với <strong>@userinfobot</strong> hoặc <strong>@getmyid_bot</strong> để lấy <strong>Chat ID</strong> của bạn (hoặc Chat ID của Group).
              </li>
            </ol>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Bot Token Field */}
            <div>
              <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Telegram Bot Token <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Ví dụ: 7812345678:AAHxyZ...ABCDEF"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    paddingRight: '4.5rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--line-strong)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '0.88rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    padding: '0.2rem 0.5rem',
                  }}
                >
                  {showToken ? 'Ẩn' : 'Hiện'}
                </button>
              </div>
            </div>

            {/* Chat ID Field */}
            <div>
              <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Telegram Chat ID (Cá nhân hoặc Nhóm) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Ví dụ: 987654321 hoặc -1001234567890 (nếu là nhóm)"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--surface)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '0.88rem',
                  fontFamily: 'var(--font-mono)',
                }}
                required
              />
            </div>

            {/* Notification triggers */}
            <div style={{ background: 'var(--surface-muted)', padding: '0.85rem 1rem', borderRadius: '8px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.6rem' }}>
                🔔 Tùy chọn gửi thông báo:
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.84rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={alertCrashes}
                  onChange={(e) => setAlertCrashes(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                />
                <span>
                  <strong>Báo cáo sự cố Sập ứng dụng (Fatal Crash)</strong> — <span style={{ color: 'var(--text-muted)' }}>Gửi ngay khi app crash kèm stack trace, user và máy</span>
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.84rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={alertApi500}
                  onChange={(e) => setAlertApi500(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                />
                <span>
                  <strong>Báo cáo khi API trả về mã lỗi 500 (Server Error)</strong> — <span style={{ color: 'var(--text-muted)' }}>Gửi khi máy chủ backend gặp ngoại lệ</span>
                </span>
              </label>

              {/* Overload & Anti-Spam Indicator */}
              <div
                style={{
                  marginTop: '0.85rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}
              >
                🛡️ <strong>Cơ chế chống bão lỗi & quá tải (Anti-Storm & Anti-Spam):</strong> Hệ thống tự động chuẩn hoá lỗi, nén tần suất lặp lại, và ngắt mạch chống ngập (Storm Circuit Breaker) để không bao giờ bị Telegram chặn mã 429 hay làm phiền nhóm của bạn.
              </div>
            </div>
          </form>
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="secondary-btn"
            disabled={testing || !botToken || !chatId}
            onClick={handleTest}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {testing ? 'Đang gửi thử…' : '🚀 Gửi tin nhắn thử (Test)'}
          </button>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button type="button" className="secondary-btn" onClick={onClose}>
              Đóng
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={saving || !botToken || !chatId}
              onClick={handleSave}
            >
              {saving ? 'Đang lưu…' : '✓ Lưu cấu hình'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TelegramSettingsModal;
