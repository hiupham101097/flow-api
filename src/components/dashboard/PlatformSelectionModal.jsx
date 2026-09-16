import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';

export default function PlatformSelectionModal() {
  const {
    platformScope,
    hasInitialChoice,
    isPlatformModalOpen,
    selectPlatform,
    closePlatformModal,
  } = usePlatform();

  const [rememberCookie, setRememberCookie] = useState(true);
  const [hoveredCard, setHoveredCard] = useState(null);

  if (!isPlatformModalOpen) return null;

  const handleSelect = (scope) => {
    selectPlatform(scope, rememberCookie);
  };

  return (
    <div
      className="modal-overlay platform-selection-overlay"
      style={{
        zIndex: 2000,
        backgroundColor: 'rgba(5, 9, 15, 0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
      onClick={() => {
        if (hasInitialChoice) closePlatformModal();
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(780px, 98%)',
          maxHeight: '92vh',
          background: 'linear-gradient(180deg, #0e1724 0%, #09101a 100%)',
          border: '1px solid rgba(125, 156, 255, 0.25)',
          boxShadow: '0 30px 80px -20px rgba(0, 0, 0, 0.85), 0 0 40px rgba(94, 126, 234, 0.15)',
          borderRadius: '18px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'platformModalFadeIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.75rem 2rem 1.25rem',
            borderBottom: '1px solid var(--line)',
            position: 'relative',
            background: 'radial-gradient(ellipse at top, rgba(94, 126, 234, 0.12) 0%, transparent 70%)',
          }}
        >
          {hasInitialChoice && (
            <button
              type="button"
              className="close-btn"
              onClick={closePlatformModal}
              style={{
                position: 'absolute',
                top: '1.25rem',
                right: '1.25rem',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--line)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
              }}
              title="Đóng hộp thoại"
            >
              ✕
            </button>
          )}

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.3rem 0.75rem', borderRadius: '20px', background: 'rgba(125, 156, 255, 0.12)', border: '1px solid rgba(125, 156, 255, 0.25)', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.9rem' }}>🎯</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Không Gian Quản Lý (Platform Scope)
            </span>
          </div>

          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: '#fff', letterSpacing: '-0.02em' }}>
            Bạn muốn quản lý hệ thống nào?
          </h2>
          <p style={{ margin: '0.45rem 0 0', color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.55 }}>
            Chọn không gian giám sát phù hợp. Hệ thống sẽ tự động lọc dữ liệu, số liệu thống kê và hướng dẫn SDK tương ứng.
          </p>
        </div>

        {/* Body Cards */}
        <div style={{ padding: '1.75rem 2rem', overflowY: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* CARD 1: WEB APP (Angular / React / Vue) */}
            <div
              onMouseEnter={() => setHoveredCard('web')}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => handleSelect('web')}
              style={{
                borderRadius: '14px',
                padding: '1.5rem',
                cursor: 'pointer',
                background: platformScope === 'web'
                  ? 'linear-gradient(135deg, rgba(34, 211, 238, 0.12) 0%, rgba(13, 21, 31, 0.95) 100%)'
                  : hoveredCard === 'web'
                  ? 'rgba(34, 211, 238, 0.05)'
                  : 'var(--surface)',
                border: platformScope === 'web'
                  ? '2px solid #22d3ee'
                  : hoveredCard === 'web'
                  ? '2px solid rgba(34, 211, 238, 0.5)'
                  : '1px solid var(--line)',
                boxShadow: platformScope === 'web'
                  ? '0 10px 30px -10px rgba(34, 211, 238, 0.3)'
                  : 'none',
                transition: 'all 0.22s ease',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
              }}
            >
              {platformScope === 'web' && (
                <span
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '20px',
                    background: '#22d3ee',
                    color: '#071019',
                  }}
                >
                  ✓ Đang chọn
                </span>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #0284c7 0%, #22d3ee 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.45rem',
                    boxShadow: '0 6px 16px rgba(34, 211, 238, 0.25)',
                    flexShrink: 0,
                  }}
                >
                  🌐
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#fff' }}>
                    Quản lý Web App
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: '#67e8f9', fontWeight: 500 }}>
                    Angular · React · Vue · SPA
                  </span>
                </div>
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: '0 0 1.25rem', lineHeight: 1.5, flex: 1 }}>
                Chỉ hiển thị API logs từ trình duyệt web, bắt ngoại lệ JavaScript runtime, theo dõi độ trễ API và hỗ trợ tích hợp Angular HttpInterceptor.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.79rem', color: 'var(--text)' }}>
                  <span style={{ color: '#22d3ee' }}>✓</span> Bắt mọi API call qua Angular Interceptor / Axios / Fetch
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.79rem', color: 'var(--text)' }}>
                  <span style={{ color: '#22d3ee' }}>✓</span> Nhận diện chính xác Browser & Phiên bản OS
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.79rem', color: 'var(--text)' }}>
                  <span style={{ color: '#22d3ee' }}>✓</span> Mã nguồn SDK mẫu sẵn sàng cho Angular
                </div>
              </div>

              <button
                type="button"
                className="primary-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('web');
                }}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(6, 182, 212, 0.35)',
                }}
              >
                Vào Quản lý Web App →
              </button>
            </div>

            {/* CARD 2: MOBILE APP (Flutter / iOS / Android) */}
            <div
              onMouseEnter={() => setHoveredCard('app')}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => handleSelect('app')}
              style={{
                borderRadius: '14px',
                padding: '1.5rem',
                cursor: 'pointer',
                background: platformScope === 'app'
                  ? 'linear-gradient(135deg, rgba(167, 139, 250, 0.12) 0%, rgba(13, 21, 31, 0.95) 100%)'
                  : hoveredCard === 'app'
                  ? 'rgba(167, 139, 250, 0.05)'
                  : 'var(--surface)',
                border: platformScope === 'app'
                  ? '2px solid #a78bfa'
                  : hoveredCard === 'app'
                  ? '2px solid rgba(167, 139, 250, 0.5)'
                  : '1px solid var(--line)',
                boxShadow: platformScope === 'app'
                  ? '0 10px 30px -10px rgba(167, 139, 250, 0.3)'
                  : 'none',
                transition: 'all 0.22s ease',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
              }}
            >
              {platformScope === 'app' && (
                <span
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '20px',
                    background: '#a78bfa',
                    color: '#071019',
                  }}
                >
                  ✓ Đang chọn
                </span>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.45rem',
                    boxShadow: '0 6px 16px rgba(167, 139, 250, 0.25)',
                    flexShrink: 0,
                  }}
                >
                  📱
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#fff' }}>
                    Quản lý Mobile App
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: '#c4b5fd', fontWeight: 500 }}>
                    Flutter · iOS · Android
                  </span>
                </div>
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: '0 0 1.25rem', lineHeight: 1.5, flex: 1 }}>
                Chỉ hiển thị dữ liệu từ thiết bị di động: Báo cáo sự cố Fatal/Non-fatal Crashlytics, phễu eKYC Funnel và hành trình người dùng app.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.79rem', color: 'var(--text)' }}>
                  <span style={{ color: '#a78bfa' }}>✓</span> Giám sát lỗi sập Crashlytics (Fatal / Non-fatal)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.79rem', color: 'var(--text)' }}>
                  <span style={{ color: '#a78bfa' }}>✓</span> Phân tích tỷ lệ rớt eKYC & Hành trình người dùng
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.79rem', color: 'var(--text)' }}>
                  <span style={{ color: '#a78bfa' }}>✓</span> Lọc chính xác theo model máy (iPhone, Samsung...)
                </div>
              </div>

              <button
                type="button"
                className="secondary-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('app');
                }}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(109, 40, 217, 0.35)',
                }}
              >
                Vào Quản lý Mobile App →
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1.1rem 2rem',
            borderTop: '1px solid var(--line)',
            background: 'var(--surface-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.55rem',
              cursor: 'pointer',
              fontSize: '0.84rem',
              color: 'var(--text)',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={rememberCookie}
              onChange={(e) => setRememberCookie(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                accentColor: 'var(--accent)',
                cursor: 'pointer',
              }}
            />
            <span>
              Ghi nhớ lựa chọn của tôi (<strong>Lưu Cookie</strong> cho lần vô tới)
            </span>
          </label>

          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            💡 Bạn có thể đổi lại bất cứ lúc nào trên thanh menu
          </span>
        </div>
      </div>
    </div>
  );
}
