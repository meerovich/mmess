import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// App version is injected at build time via VITE_APP_VERSION env var (set by
// scripts/deploy.sh). Falls back to 'dev' for local `vite dev` / `vite build`.
const APP_VERSION = process.env.VITE_APP_VERSION ?? 'dev';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: process.env.WS_URL || 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
