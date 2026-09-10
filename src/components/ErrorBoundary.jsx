import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#070c12',
          color: '#edf4fa',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: "'IBM Plex Sans', -apple-system, sans-serif"
        }}>
          <div style={{
            maxWidth: '520px',
            background: '#0d151f',
            border: '1px solid #ff7785',
            borderRadius: '14px',
            padding: '2rem',
            boxShadow: '0 12px 36px rgba(0,0,0,0.6)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ff7785', marginBottom: '0.75rem' }}>
              Ứng dụng vừa gặp sự cố hiển thị
            </h2>
            <p style={{ color: '#93a4b8', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Một tiến trình trong WebView đã gặp lỗi ngoại lệ. Nhấn nút bên dưới để khôi phục lại màn hình làm việc.
            </p>
            {this.state.error && (
              <pre style={{
                background: '#070c12',
                color: '#ff9aa5',
                padding: '0.75rem',
                borderRadius: '8px',
                fontSize: '0.78rem',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '1.5rem',
                maxHeight: '120px'
              }}>
                <code>{this.state.error.toString()}</code>
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                background: '#5e7eea',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9px',
                padding: '0.65rem 1.5rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(94, 126, 234, 0.4)'
              }}
            >
              🔄 Tải lại trang (Reload)
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
