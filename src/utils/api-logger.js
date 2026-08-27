/**
 * API Monitor Integration Guide
 * 
 * Replace the `WORKER_URL` with your deployed Cloudflare Worker URL.
 */

const WORKER_URL = 'https://flow-api.hieupham101097.workers.dev/logs'; // Replace with live URL after deployment

/**
 * Utility to log API telemetry to the monitor in the background.
 */
const sendTelemetry = async (logData, appId) => {
  try {
    // Send in background, don't await/block the main thread
    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, ...logData }),
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
export const createMonitoredFetch = (appId = 'default_web') => async (url, options = {}) => {
  const startTime = performance.now();
  const method = options.method || 'GET';
  
  try {
    const response = await fetch(url, options);
    const duration = Math.round(performance.now() - startTime);

    sendTelemetry({
      endpoint: url,
      method: method,
      status_code: response.status,
      error_message: response.ok ? null : `HTTP Error ${response.status}`,
      request_payload: options.body,
      response_payload: null,
      duration_ms: duration,
    }, appId);

    return response;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    
    sendTelemetry({
      endpoint: url,
      method: method,
      status_code: 500,
      error_message: error.message,
      request_payload: options.body,
      duration_ms: duration,
    }, appId);

    throw error;
  }
};

/**
 * Example 2: Axios Interceptor Setup
 * Call this function once when your app starts: `setupAxiosMonitor(axios, 'my_web_app')`
 */
export const setupAxiosMonitor = (axiosInstance, appId = 'default_web') => {
  axiosInstance.interceptors.request.use((config) => {
    config.metadata = { startTime: performance.now() };
    return config;
  });

  axiosInstance.interceptors.response.use(
    (response) => {
      const duration = Math.round(performance.now() - response.config.metadata.startTime);
      sendTelemetry({
        endpoint: response.config.url,
        method: (response.config.method || 'GET').toUpperCase(),
        status_code: response.status,
        request_payload: response.config.data,
        duration_ms: duration,
      }, appId);
      return response;
    },
    (error) => {
      const duration = Math.round(performance.now() - error.config.metadata.startTime);
      sendTelemetry({
        endpoint: error.config.url,
        method: (error.config.method || 'GET').toUpperCase(),
        status_code: error.response?.status || 500,
        error_message: error.message,
        request_payload: error.config.data,
        duration_ms: duration,
      }, appId);
      return Promise.reject(error);
    }
  );
};
