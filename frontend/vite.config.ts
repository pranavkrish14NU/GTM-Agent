/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
