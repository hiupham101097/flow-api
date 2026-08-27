import React, { useEffect, useMemo, useState } from 'react';
import '../../styles/global.css';

const API_MONITOR_URL = 'https://flow-api.hieupham101097.workers.dev';
const FLUTTER_ENV = `API_MONITOR_URL=${API_MONITOR_URL}`;
const FLUTTER_RUN = `flutter run --dart-define=API_MONITOR_URL=${API_MONITOR_URL}`;
const FLUTTER_CONFIG = `class EnvConfig {
  static const apiMonitorUrl = String.fromEnvironment(
    'API_MONITOR_URL',
    defaultValue: '${API_MONITOR_URL}',
  );
}`;
const ANDROID_PERMISSION = '<uses-permission android:name="android.permission.INTERNET" />';
const FLUTTER_CLIENT = `import 'package:http/http.dart' as http;
import 'api_logger.dart';

// You can pass an appId to distinguish between multiple apps
final http.Client client = LoggingClient(
  http.Client(), 
  appId: 'my_flutter_app',
);`;

function CodeBlock({ label, value, copyKey, copiedItem, onCopy }) {
  return (
    <div className="code-block">
      <div className="code-caption">
        <span>{label}</span>
        <button type="button" onClick={() => onCopy(value, copyKey)}>
          {copiedItem === copyKey ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{value}</code></pre>
    </div>
  );
}

function Dashboard() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [copiedItem, setCopiedItem] = useState(null);
  const [integrationOpen, setIntegrationOpen] = useState(true);
  const [setupTab, setSetupTab] = useState('environment');

  const copyToClipboard = async (value, item) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedItem(item);
      window.setTimeout(() => {
        setCopiedItem((current) => current === item ? null : current);
      }, 1600);
    } catch {
      setCopiedItem(null);
    }
  };

  const fetchLogs = async () => {
    try {
      const apiUrl = import.meta.env.VITE_WORKER_URL || 'http://127.0.0.1:8787';
      const response = await fetch(`${apiUrl}/logs`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      setLogs(data);
      setError(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = window.setInterval(fetchLogs, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedLog) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedLog(null);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selectedLog]);

  const formatDate = (dateString) => new Date(dateString).toLocaleString();

  const categorizeEndpoint = (url) => {
    const lowerUrl = (url || '').toLowerCase();
    if (lowerUrl.includes('viettelpost')) return { name: 'ViettelPost', color: '#fb923c' };
    if (lowerUrl.includes('ekyb')) return { name: 'eKYB', color: '#a78bfa' };
    if (lowerUrl.includes('esco')) return { name: 'Esco KYC', color: '#22d3ee' };
    if (lowerUrl.includes('traceability')) return { name: 'Traceability', color: '#a3e635' };
    if (lowerUrl.includes('sign')) return { name: 'Digital Sign', color: '#f472b6' };
    return { name: 'Other', color: '#94a3b8' };
  };

  const filteredLogs = useMemo(() => logs.filter((log) => {
    if (activeTab === 'success' && log.status_code >= 400) return false;
    if (activeTab === 'error' && log.status_code < 400) return false;

    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      const endpointMatch = (log.endpoint || '').toLowerCase().includes(query);
      const serviceMatch = categorizeEndpoint(log.endpoint).name.toLowerCase().includes(query);
      if (!endpointMatch && !serviceMatch) return false;
    }

    return true;
  }), [logs, activeTab, searchTerm]);

  const totalCalls = logs.length;
  const errorCalls = logs.filter((log) => log.status_code >= 400).length;
  const successCalls = totalCalls - errorCalls;
  const successRate = totalCalls ? Math.round((successCalls / totalCalls) * 100) : null;
  const avgDuration = totalCalls
    ? Math.round(logs.reduce((sum, log) => sum + (log.duration_ms || 0), 0) / totalCalls)
    : 0;

  const openIntegration = () => {
    setIntegrationOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById('flutter-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" role="img">
              <path d="M7 22V10m0 6h7m4-6v12m0-6h7" />
              <circle cx="7" cy="10" r="2" />
              <circle cx="7" cy="22" r="2" />
              <circle cx="18" cy="10" r="2" />
              <circle cx="18" cy="22" r="2" />
              <circle cx="25" cy="16" r="2" />
            </svg>
          </div>
          <div>
            <h1>Fizahub Monitor</h1>
            <p>API telemetry, without the noise.</p>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="live-indicator"><span aria-hidden="true" /> Live · 5s</span>
          <button type="button" className="secondary-btn" onClick={openIntegration}>Flutter setup</button>
          <button type="button" className="primary-btn" disabled={loading} onClick={() => { setLoading(true); fetchLogs(); }}>
            {loading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
      </header>

      <main>
        <section className="metrics-strip" aria-label="API telemetry summary">
          <div className="metric-item metric-lead">
            <span>Total calls</span>
            <strong>{totalCalls}</strong>
            <small>Latest 100 requests</small>
          </div>
          <div className="metric-item">
            <span>Success rate</span>
            <strong className="metric-success">{successRate === null ? '—' : `${successRate}%`}</strong>
            <small>{totalCalls ? `${successCalls} healthy responses` : 'Waiting for first response'}</small>
          </div>
          <div className="metric-item">
            <span>Errors</span>
            <strong className={errorCalls ? 'metric-error' : ''}>{errorCalls}</strong>
            <small>{errorCalls ? 'Needs attention' : 'No failures detected'}</small>
          </div>
          <div className="metric-item">
            <span>Average latency</span>
            <strong>{avgDuration}<em>ms</em></strong>
            <small>Across monitored calls</small>
          </div>
        </section>

        <section id="flutter-setup" className={`integration-dock ${integrationOpen ? 'is-open' : ''}`} aria-labelledby="integration-title">
          <div className="integration-bar">
            <div className="integration-title-group">
              <span className="platform-tag">Flutter</span>
              <div>
                <h2 id="integration-title">Connect mobile telemetry</h2>
                <p>Production endpoint · <code>{API_MONITOR_URL}</code></p>
              </div>
            </div>
            <div className="integration-actions">
              <button type="button" className="text-btn" onClick={() => copyToClipboard(API_MONITOR_URL, 'url')}>
                {copiedItem === 'url' ? 'URL copied' : 'Copy endpoint'}
              </button>
              <button
                type="button"
                className="collapse-btn"
                aria-expanded={integrationOpen}
                aria-controls="integration-content"
                onClick={() => setIntegrationOpen((open) => !open)}
              >
                {integrationOpen ? 'Hide guide' : 'Show guide'}
              </button>
            </div>
          </div>

          {integrationOpen && (
            <div id="integration-content" className="integration-content">
              <nav className="setup-tabs" aria-label="Flutter integration steps">
                <button type="button" className={setupTab === 'environment' ? 'active' : ''} onClick={() => setSetupTab('environment')}>
                  <span>01</span><strong>Environment</strong><small>Set the endpoint</small>
                </button>
                <button type="button" className={setupTab === 'config' ? 'active' : ''} onClick={() => setSetupTab('config')}>
                  <span>02</span><strong>App config</strong><small>Read the Dart define</small>
                </button>
                <button type="button" className={setupTab === 'client' ? 'active' : ''} onClick={() => setSetupTab('client')}>
                  <span>03</span><strong>HTTP client</strong><small>Start sending logs</small>
                </button>
              </nav>

              <div className="setup-content">
                {setupTab === 'environment' && (
                  <div className="setup-pane">
                    <div className="pane-heading">
                      <h3>Define the production endpoint</h3>
                      <p>Pass the URL at compile time. Keep it without a trailing slash.</p>
                    </div>
                    <div className="code-grid">
                      <CodeBlock label="Environment value" value={FLUTTER_ENV} copyKey="env" copiedItem={copiedItem} onCopy={copyToClipboard} />
                      <CodeBlock label="Run locally" value={FLUTTER_RUN} copyKey="run" copiedItem={copiedItem} onCopy={copyToClipboard} />
                    </div>
                  </div>
                )}

                {setupTab === 'config' && (
                  <div className="setup-pane setup-pane-split">
                    <div>
                      <div className="pane-heading">
                        <h3>Create one source of truth</h3>
                        <p>Save this as <code>lib/core/config/env_config.dart</code>.</p>
                      </div>
                      <CodeBlock label="env_config.dart" value={FLUTTER_CONFIG} copyKey="config" copiedItem={copiedItem} onCopy={copyToClipboard} />
                    </div>
                    <aside className="platform-note">
                      <span>Android release</span>
                      <h4>Allow network access</h4>
                      <p>Add this line to <code>android/app/src/main/AndroidManifest.xml</code>.</p>
                      <CodeBlock label="AndroidManifest.xml" value={ANDROID_PERMISSION} copyKey="android" copiedItem={copiedItem} onCopy={copyToClipboard} />
                    </aside>
                  </div>
                )}

                {setupTab === 'client' && (
                  <div className="setup-pane setup-pane-split">
                    <div>
                      <div className="pane-heading">
                        <h3>Route requests through the logger</h3>
                        <p>Run <code>flutter pub add http</code>, then place the logger in your services directory.</p>
                      </div>
                      <div className="client-actions">
                        <a className="download-btn" href="/flutter/api_logger.dart" download>Download api_logger.dart</a>
                        <span>POST requests are sent to <code>/logs</code> in the background.</span>
                      </div>
                    </div>
                    <CodeBlock label="Repository or service" value={FLUTTER_CLIENT} copyKey="client" copiedItem={copiedItem} onCopy={copyToClipboard} />
                  </div>
                )}

                <div className="privacy-note">
                  Send operational metadata only. Never include passwords, access tokens, or personal data in telemetry payloads.
                </div>
              </div>
            </div>
          )}
          <span className="sr-only" aria-live="polite">{copiedItem ? 'Configuration copied to clipboard.' : ''}</span>
        </section>

        <section className="log-panel" aria-labelledby="log-title">
          <div className="log-toolbar">
            <div className="log-title-group">
              <h2 id="log-title">Request stream</h2>
              <span>{filteredLogs.length} shown</span>
            </div>

            <div className="log-controls">
              <div className="filter-tabs" aria-label="Filter API logs">
                <button type="button" className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>All</button>
                <button type="button" className={activeTab === 'success' ? 'active' : ''} onClick={() => setActiveTab('success')}>Success</button>
                <button type="button" className={activeTab === 'error' ? 'active' : ''} onClick={() => setActiveTab('error')}>Errors</button>
              </div>
              <label className="search-field">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
                <span className="sr-only">Search logs</span>
                <input
                  type="search"
                  placeholder="Search service or endpoint"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
            </div>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span>Could not refresh telemetry: {error}</span>
              <button type="button" onClick={fetchLogs}>Try again</button>
            </div>
          )}

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Service</th>
                  <th>Method</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {loading && logs.length === 0 && (
                  <tr><td colSpan="7" className="table-message">Listening for telemetry…</td></tr>
                )}

                {filteredLogs.length === 0 && !loading && (
                  <tr>
                    <td colSpan="7">
                      <div className="empty-state">
                        <h3>{logs.length === 0 ? 'No telemetry yet' : 'No matching requests'}</h3>
                        <p>{logs.length === 0 ? 'Connect your Flutter client to see requests arrive here in real time.' : 'Try another search or clear the active filter.'}</p>
                        {logs.length === 0 && <button type="button" onClick={openIntegration}>Open Flutter setup</button>}
                      </div>
                    </td>
                  </tr>
                )}

                {filteredLogs.map((log) => {
                  const service = categorizeEndpoint(log.endpoint);
                  const isError = log.status_code >= 400;
                  return (
                    <tr key={log.id} className={isError ? 'row-error' : ''} onClick={() => setSelectedLog(log)}>
                      <td className="timestamp-cell">{formatDate(log.created_at)}</td>
                      <td><span className="service-badge" style={{ '--service-color': service.color }}>{service.name}</span></td>
                      <td><span className={`method-badge ${(log.method || '').toLowerCase()}`}>{log.method}</span></td>
                      <td className="endpoint-cell" title={log.endpoint}>{log.endpoint}</td>
                      <td><span className={`status-badge ${isError ? 'error' : 'success'}`}>{log.status_code}</span></td>
                      <td className="duration-cell">{log.duration_ms} ms</td>
                      <td><button type="button" className="view-btn" onClick={(event) => { event.stopPropagation(); setSelectedLog(log); }}>Inspect</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {selectedLog && (
        <div className="modal-overlay" role="presentation" onMouseDown={() => setSelectedLog(null)}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="log-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span>Request detail</span>
                <h2 id="log-detail-title">{categorizeEndpoint(selectedLog.endpoint).name}</h2>
              </div>
              <button type="button" className="close-btn" aria-label="Close log details" onClick={() => setSelectedLog(null)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <section className="log-section">
                <h3>Request</h3>
                <div className="log-code"><span>{selectedLog.method}</span> {selectedLog.endpoint}{'\n'}Status: {selectedLog.status_code}{'\n'}Duration: {selectedLog.duration_ms} ms{'\n'}Time: {formatDate(selectedLog.created_at)}</div>
              </section>
              {selectedLog.error_message && (
                <section className="log-section"><h3>Error</h3><div className="log-code error-highlight">{selectedLog.error_message}</div></section>
              )}
              {selectedLog.request_payload && (
                <section className="log-section"><h3>Request payload</h3><div className="log-code">{selectedLog.request_payload}</div></section>
              )}
              {selectedLog.response_payload && (
                <section className="log-section"><h3>Response payload</h3><div className="log-code">{selectedLog.response_payload}</div></section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
