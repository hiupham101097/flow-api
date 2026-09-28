import React from 'react';

export default function PageLoading({ message = 'Đang tải dữ liệu quan sát...' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        width: '100%',
        padding: '2rem',
        color: 'var(--text-muted)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '56px',
          height: '56px',
          marginBottom: '1.25rem',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid rgba(99, 102, 241, 0.15)',
            borderTopColor: 'var(--accent)',
            borderRightColor: 'var(--cyan)',
            animation: 'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '8px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
            animation: 'pulse 1.8s ease-in-out infinite alternate',
          }}
        />
      </div>
      <p
        style={{
          fontSize: '0.88rem',
          fontWeight: 500,
          letterSpacing: '0.02em',
          color: 'var(--text-muted)',
        }}
      >
        {message}
      </p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { transform: scale(0.85); opacity: 0.4; }
          100% { transform: scale(1.15); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
