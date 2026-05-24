/**
 * Design token system — single source of truth for colors, typography, and spacing.
 * Consumed by components and injected as CSS custom properties.
 */

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

export const colors = {
  // Brand
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    DEFAULT: '#2563eb',
  },
  secondary: {
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
    DEFAULT: '#7c3aed',
  },
  success: {
    light: '#d1fae5',
    DEFAULT: '#10b981',
    dark: '#065f46',
  },
  warning: {
    light: '#fef3c7',
    DEFAULT: '#f59e0b',
    dark: '#92400e',
  },
  error: {
    light: '#fee2e2',
    DEFAULT: '#ef4444',
    dark: '#991b1b',
  },
  // Neutral
  neutral: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const typography = {
  fontFamily: {
    sans: [
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      'sans-serif',
    ].join(', '),
    mono: [
      '"JetBrains Mono"',
      '"Fira Code"',
      'Consolas',
      'monospace',
    ].join(', '),
  },
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
  },
} as const;

// ---------------------------------------------------------------------------
// Spacing scale (4px base unit)
// ---------------------------------------------------------------------------

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
} as const;

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

export const borderRadius = {
  none: '0',
  sm: '0.125rem',
  DEFAULT: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  full: '9999px',
} as const;

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
} as const;

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ---------------------------------------------------------------------------
// Z-index scale
// ---------------------------------------------------------------------------

export const zIndex = {
  sidebar: 100,
  header: 200,
  drawer: 300,
  modal: 400,
  toast: 500,
} as const;

// ---------------------------------------------------------------------------
// CSS custom properties injection
// ---------------------------------------------------------------------------

export function injectDesignTokens(): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', colors.primary.DEFAULT);
  root.style.setProperty('--color-primary-50', colors.primary[50]);
  root.style.setProperty('--color-primary-100', colors.primary[100]);
  root.style.setProperty('--color-secondary', colors.secondary.DEFAULT);
  root.style.setProperty('--color-success', colors.success.DEFAULT);
  root.style.setProperty('--color-warning', colors.warning.DEFAULT);
  root.style.setProperty('--color-error', colors.error.DEFAULT);
  root.style.setProperty('--color-neutral-50', colors.neutral[50]);
  root.style.setProperty('--color-neutral-100', colors.neutral[100]);
  root.style.setProperty('--color-neutral-200', colors.neutral[200]);
  root.style.setProperty('--color-neutral-700', colors.neutral[700]);
  root.style.setProperty('--color-neutral-800', colors.neutral[800]);
  root.style.setProperty('--color-neutral-900', colors.neutral[900]);
  root.style.setProperty('--font-family-sans', typography.fontFamily.sans);
  root.style.setProperty('--font-family-mono', typography.fontFamily.mono);
}
