/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-only reverse proxy: the SPA calls the API on its own origin (e.g.
    // /v1/...), and Vite forwards to the backend on :8080. This keeps requests
    // same-origin in development — so no CORS is needed and the HttpOnly
    // refresh-token + CSRF cookies are stored/sent normally — while matching
    // the same-origin (single-ingress) topology the API's CSP assumes in prod.
    // Set VITE_API_URL='' (see .env.example) so fetch() uses relative paths.
    proxy: {
      '/v1': { target: 'http://localhost:8080', changeOrigin: true },
      '/health': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    // Exclude Playwright E2E tests — they run via `npm run test:e2e`, not vitest
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  build: {
    // Target under 500KB initial load — split vendor chunk
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
        },
      },
    },
    // Warn if any chunk exceeds 400KB
    chunkSizeWarningLimit: 400,
  },
});
