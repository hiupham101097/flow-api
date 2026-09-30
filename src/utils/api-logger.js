/**
 * API Monitor Integration Guide
 * 
 * Replace the `WORKER_URL` with your deployed Cloudflare Worker URL.
 */

const WORKER_URL = 'https://flow-api.hieupham101097.workers.dev/logs'; // Replace with live URL after deployment
const PII_KEYS = /password|(^|_)pass(word)?($|_)|(^|_)pwd($|_)|token|authorization|bearer|secret|credit.?card|card.?number|cvv|pin|otp|email|phone|national.?id/i;

const sanitizeTelemetryValue = (value, key = '') => {
  if (PII_KEYS.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => sanitizeTelemetryValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      sanitizeTelemetryValue(childValue, childKey),
    ]));
  }
  if (typeof value !== 'string') return value;

  try {
    return JSON.stringify(sanitizeTelemetryValue(JSON.parse(value)));
  } catch (_) {
    return value
      .replace(/\bBearer\s+[\w./+=-]+/gi, 'Bearer [REDACTED]')
      .replace(/((?:password|passwd|pwd|token|authorization|secret|otp|cvv|pin)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,&]+)/gi, '$1[REDACTED]');
  }
};

const readTelemetryContext = (getContext) => {
  try {
    return typeof getContext === 'function' ? (getContext() || {}) : {};
  } catch (_) {
    return {};
  }
};

const createRequestId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const classifyError = (error, statusCode) => {
  if (Number(statusCode) === 408 || Number(statusCode) === 504) return 'timeout';
  if (Number(statusCode) >= 500) return 'server_error';
  if (Number(statusCode) >= 400) return 'http_error';
  const message = `${error?.name || ''} ${error?.message || error || ''}`.toLowerCase();
  if (/timeout|timed out|deadline exceeded/.test(message)) return 'timeout';
  if (Number(statusCode) === 0) return 'network_error';
  return null;
};

const getServerRequestId = (response) =>
  response?.headers?.get('x-request-id')
  || response?.headers?.get('cf-ray')
  || response?.headers?.get('request-id')
  || null;

const readErrorPayload = async (response) => {
  try {
    const reader = response.clone().body?.getReader();
    if (!reader) return null;

    const chunks = [];
    let totalBytes = 0;
    let streamEnded = false;
    while (totalBytes < 4000) {
      const { done, value } = await reader.read();
      if (done) {
        streamEnded = true;
        break;
      }
      const remaining = 4000 - totalBytes;
      const chunk = value.subarray(0, remaining);
      chunks.push(chunk);
      totalBytes += chunk.length;
      if (chunk.length < value.length) break;
    }
    if (!streamEnded) reader.cancel().catch(() => {});

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.length;
    });
    const text = new TextDecoder().decode(bytes).trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  } catch (_) {
    return null;
  }
};

const getResponseErrorMessage = (payload) => {
  if (payload && typeof payload === 'object') {
    for (const key of ['message', 'error', 'msg', 'detail', 'description', 'errorMessage']) {
      if (typeof payload[key] === 'string' && payload[key].trim()) return payload[key].trim().slice(0, 1000);
    }
  }
  if (typeof payload === 'string' && payload.trim()) return payload.trim().slice(0, 1000);
  return null;
};

/**
 * Utility to log API telemetry to the monitor in the background.
 */
const sendTelemetry = async (logData, appId, deviceName, userName) => {
  try {
    const resolvedDevice = deviceName || (typeof navigator !== 'undefined' ? (navigator.userAgent?.includes('Chrome') ? 'Google Chrome' : navigator.userAgent?.includes('Safari') ? 'Apple Safari' : navigator.userAgent?.includes('Firefox') ? 'Mozilla Firefox' : 'Trình duyệt Web') : 'Web Client');
    const sanitizedLog = {
      ...logData,
      request_payload: sanitizeTelemetryValue(logData.request_payload, 'request_payload'),
      response_payload: sanitizeTelemetryValue(logData.response_payload, 'response_payload'),
    };
    // Send in background, don't await/block the main thread
    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_identifier: appId,
        device_name: resolvedDevice,
        ...(userName ? { user_name: String(userName) } : {}),
        ...sanitizedLog,
      }),
      // keepalive ensures the request finishes even if the page is unloading
      keepalive: true, 
    }).catch(console.error); 
  } catch (err) {
    console.error('Failed to send telemetry:', err);
  }
};

/**
 * Example 1: Custom Fetch Wrapper
 * Use this instead of standard `fetch()` in your app.
 */
export const createMonitoredFetch = (appId = 'default_web', getContext = () => ({})) => async (url, options = {}) => {
  const startTime = performance.now();
  const method = options.method || 'GET';
  const requestId = createRequestId();
  
  try {
    const response = await fetch(url, options);
    const duration = Math.round(performance.now() - startTime);
    const responsePayload = response.ok ? null : await readErrorPayload(response);

    const context = readTelemetryContext(getContext);
    sendTelemetry({
      endpoint: url,
      method: method,
      status_code: response.status,
      error_message: response.ok ? null : (getResponseErrorMessage(responsePayload) || `HTTP Error ${response.status}`),
      error_type: response.ok ? null : classifyError(null, response.status),
      request_id: requestId,
      server_request_id: getServerRequestId(response) || responsePayload?.request_id || null,
      request_payload: options.body,
      response_payload: responsePayload,
      duration_ms: duration,
    }, appId, context.deviceName, context.userName);

    return response;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    
    const context = readTelemetryContext(getContext);
    sendTelemetry({
      endpoint: url,
      method: method,
      status_code: 0,
      error_message: error.message,
      error_type: classifyError(error, 0),
      error_code: error?.name || null,
      stack_trace: error?.stack || null,
      request_id: requestId,
      request_payload: options.body,
      duration_ms: duration,
    }, appId, context.deviceName, context.userName);

    throw error;
  }
};

/**
 * Example 2: Axios Interceptor Setup
 * Call this function once when your app starts: `setupAxiosMonitor(axios, 'my_web_app')`
 */
export const setupAxiosMonitor = (axiosInstance, appId = 'default_web', getContext = () => ({})) => {
  axiosInstance.interceptors.request.use((config) => {
    config.metadata = { ...config.metadata, startTime: performance.now(), requestId: createRequestId() };
    return config;
  });

  axiosInstance.interceptors.response.use(
    (response) => {
      const duration = Math.round(performance.now() - response.config.metadata.startTime);
      const context = readTelemetryContext(getContext);
      sendTelemetry({
        endpoint: response.config.url,
        method: (response.config.method || 'GET').toUpperCase(),
        status_code: response.status,
        request_id: response.config.metadata?.requestId,
        server_request_id: response.headers?.['x-request-id'] || response.headers?.['cf-ray'] || response.data?.request_id || null,
        request_payload: response.config.data,
        duration_ms: duration,
      }, appId, context.deviceName, context.userName);
      return response;
    },
    (error) => {
      const config = error.config || {};
      const duration = Math.round(performance.now() - (config.metadata?.startTime || performance.now()));
      const statusCode = error.response?.status ?? 0;
      const responsePayload = error.response?.data ?? null;
      const context = readTelemetryContext(getContext);
      sendTelemetry({
        endpoint: config.url,
        method: (config.method || 'GET').toUpperCase(),
        status_code: statusCode,
        error_type: classifyError(error, statusCode),
        error_code: error.code || error.name || null,
        stack_trace: error.stack || null,
        request_id: config.metadata?.requestId,
        server_request_id: error.response?.headers?.['x-request-id'] || error.response?.headers?.['cf-ray'] || responsePayload?.request_id || null,
        error_message: getResponseErrorMessage(responsePayload) || error.message,
        request_payload: config.data,
        response_payload: responsePayload,
        duration_ms: duration,
      }, appId, context.deviceName, context.userName);
      return Promise.reject(error);
    }
  );
};
