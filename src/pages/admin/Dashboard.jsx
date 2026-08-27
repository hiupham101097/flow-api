import React, { useState, useEffect, useMemo } from 'react';
import '../../styles/global.css';

function Dashboard() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // UI States
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'success', 'error'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null); // For Modal

  const fetchLogs = async () => {
    try {
      const apiUrl = import.meta.env.VITE_WORKER_URL || 'http://127.0.0.1:8787';
      const response = await fetch(`${apiUrl}/logs`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      setLogs(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const categorizeEndpoint = (url) => {
    const lowerUrl = (url || '').toLowerCase();
    if (lowerUrl.includes('viettelpost')) return { name: 'ViettelPost', color: '#f97316' };
    if (lowerUrl.includes('ekyb')) return { name: 'eKYB', color: '#8b5cf6' };
    if (lowerUrl.includes('esco')) return { name: 'Esco KYC', color: '#06b6d4' };
    if (lowerUrl.includes('traceability')) return { name: 'Traceability', color: '#84cc16' };
    if (lowerUrl.includes('sign')) return { name: 'Digital Sign', color: '#ec4899' };
    return { name: 'Other', color: '#64748b' };
  };

  // Filter Logic
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // 1. Tab Filter
      if (activeTab === 'success' && log.status_code >= 400) return false;
      if (activeTab === 'error' && log.status_code < 400) return false;
      
      // 2. Search Filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const endpointMatch = (log.endpoint || '').toLowerCase().includes(searchLower);
        const serviceMatch = categorizeEndpoint(log.endpoint).name.toLowerCase().includes(searchLower);
        if (!endpointMatch && !serviceMatch) return false;
      }
      
      return true;
    });
  }, [logs, activeTab, searchTerm]);

  // Stats calculation based on ALL logs (not filtered)
  const totalCalls = logs.length;
  const errorCalls = logs.filter(log => log.status_code >= 400).length;
  const successCalls = totalCalls - errorCalls;
  const avgDuration = totalCalls > 0 
    ? Math.round(logs.reduce((acc, log) => acc + (log.duration_ms || 0), 0) / totalCalls) 
    : 0;

  return (
    <div className="dashboard-container">
      <header className="header">
        <div>
          <h1>Fizahub API Monitor</h1>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Live Telemetry Dashboard
          </div>
        </div>
        <button className="refresh-btn" onClick={() => { setLoading(true); fetchLogs(); }}>
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-title">Total API Calls</div>
          <div className="stat-value">{totalCalls}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Successful</div>
          <div className="stat-value success">{successCalls}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Errors</div>
          <div className="stat-value error">{errorCalls}</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Avg Duration</div>
          <div className="stat-value">{avgDuration}ms</div>
        </div>
      </div>

      <div className="table-container">
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <div className="controls-container">
            <div className="tabs">
              <button 
                className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All APIs
              </button>
              <button 
                className={`tab-btn ${activeTab === 'success' ? 'active' : ''}`}
                onClick={() => setActiveTab('success')}
              >
                Success
              </button>
              <button 
                className={`tab-btn ${activeTab === 'error' ? 'active' : ''}`}
                onClick={() => setActiveTab('error')}
              >
                Errors
              </button>
            </div>
            
            <input 
              type="text" 
              className="search-input"
              placeholder="Search endpoint or service..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {error && <div style={{ color: 'var(--error-color)', fontSize: '0.875rem' }}>Error loading data: {error}</div>}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Service</th>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 && !loading && (
                <tr>
                  <td colSpan="7" className="empty-state">
                    {logs.length === 0 ? 'No API logs recorded yet.' : 'No logs match your filter.'}
                  </td>
                </tr>
              )}
              {filteredLogs.map((log) => {
                const service = categorizeEndpoint(log.endpoint);
                const isError = log.status_code >= 400;
                return (
                  <tr 
                    key={log.id} 
                    className={`row-clickable ${isError ? 'row-error' : ''}`}
                    onClick={() => setSelectedLog(log)}
                  >
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      {formatDate(log.created_at)}
                    </td>
                    <td>
                      <span style={{ 
                        backgroundColor: service.color + '20', 
                        color: service.color, 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '0.25rem', 
                        fontSize: '0.75rem', 
                        fontWeight: 600 
                      }}>
                        {service.name}
                      </span>
                    </td>
                    <td>
                      <span className={`method-badge ${(log.method || '').toLowerCase()}`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="endpoint-text" style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.endpoint}>
                      {log.endpoint}
                    </td>
                    <td>
                      <span className={`status-badge ${isError ? 'error' : 'success'}`}>
                        {log.status_code}
                      </span>
                    </td>
                    <td>{log.duration_ms}ms</td>
                    <td>
                      <button className="btn-detail" onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}>
                        View Log
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Detailed Log */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Log Details</h2>
              <button className="close-btn" onClick={() => setSelectedLog(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="log-section">
                <h3>Request Info</h3>
                <div className="log-code">
                  <span style={{ color: '#60a5fa' }}>{selectedLog.method}</span> {selectedLog.endpoint}{'\n'}
                  Status Code: {selectedLog.status_code}{'\n'}
                  Duration: {selectedLog.duration_ms}ms{'\n'}
                  Time: {formatDate(selectedLog.created_at)}
                </div>
              </div>
              
              {selectedLog.error_message && (
                <div className="log-section">
                  <h3>Error Message</h3>
                  <div className="log-code error-highlight">
                    {selectedLog.error_message}
                  </div>
                </div>
              )}
              
              {/* Optional: if you add request_payload/response_payload in the future */}
              {selectedLog.request_payload && (
                <div className="log-section">
                  <h3>Request Payload</h3>
                  <div className="log-code">{selectedLog.request_payload}</div>
                </div>
              )}
              {selectedLog.response_payload && (
                <div className="log-section">
                  <h3>Response Payload</h3>
                  <div className="log-code">{selectedLog.response_payload}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
