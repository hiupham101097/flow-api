import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const WORKER_TARGET = process.env.VITE_WORKER_URL || 'https://flow-api.hieupham101097.workers.dev';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/telemetry': {
        target: WORKER_TARGET,
        changeOrigin: true,
      },
      '/issues': {
        target: WORKER_TARGET,
        changeOrigin: true,
      },
      '/crashes': {
        target: WORKER_TARGET,
        changeOrigin: true,
      },
      '/logs': {
        target: WORKER_TARGET,
        changeOrigin: true,
      },
      '/events': {
        target: WORKER_TARGET,
        changeOrigin: true,
      },
      '/funnels': {
        target: WORKER_TARGET,
        changeOrigin: true,
      },
      '/settings': {
        target: WORKER_TARGET,
        changeOrigin: true,
      },
      '/users': {
        target: WORKER_TARGET,
        changeOrigin: true,
      },
    },
  },
});
