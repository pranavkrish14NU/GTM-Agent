/* eslint-disable react-refresh/only-export-components */
// Router config files export route data alongside JSX helpers — this is by design.
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout/index.js';
import { ProtectedRoute } from './components/ProtectedRoute/index.js';

const Dashboard = lazy(() => import('./modules/Dashboard/index.js'));
const Drive = lazy(() => import('./modules/Drive/index.js'));
const Brand = lazy(() => import('./modules/Brand/index.js'));
const Personas = lazy(() => import('./modules/Personas/index.js'));
const Competitors = lazy(() => import('./modules/Competitors/index.js'));
const Ask = lazy(() => import('./modules/Ask/index.js'));
const WinLoss = lazy(() => import('./modules/WinLoss/index.js'));
const Campaigns = lazy(() => import('./modules/Campaigns/index.js'));
const Content = lazy(() => import('./modules/Content/index.js'));
const Analytics = lazy(() => import('./modules/Analytics/index.js'));
const Settings = lazy(() => import('./modules/Settings/index.js'));
const SignIn = lazy(() => import('./modules/Auth/SignIn.js'));
const Callback = lazy(() => import('./modules/Auth/Callback.js'));

function PageLoader() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#94a3b8',
        fontSize: '0.875rem',
      }}
    >
      Loading…
    </div>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>;
}

function withAuth(element: ReactNode) {
  return withSuspense(<ProtectedRoute>{element}</ProtectedRoute>);
}

/** Friendly fallback for thrown route errors (replaces React Router's dev page). */
function RouteError() {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '0.75rem',
        color: '#475569',
        fontSize: '0.95rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <h1 style={{ fontSize: '1.1rem', margin: 0 }}>Something went wrong</h1>
      <p style={{ margin: 0 }}>The page failed to load. Try again, or head back to your dashboard.</p>
      <a href="/dashboard" style={{ color: '#2563eb', fontWeight: 600 }}>Go to Command Center →</a>
    </div>
  );
}

export const router = createBrowserRouter([
  // ---------------------------------------------------------------------------
  // Public routes — accessible without authentication
  // ---------------------------------------------------------------------------
  {
    path: '/signin',
    element: withSuspense(<SignIn />),
    errorElement: <RouteError />,
  },
  {
    path: '/auth/callback',
    element: withSuspense(<Callback />),
    errorElement: <RouteError />,
  },

  // ---------------------------------------------------------------------------
  // Protected routes — wrapped with ProtectedRoute
  // ---------------------------------------------------------------------------
  {
    path: '/',
    element: withAuth(<Layout />),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',  element: withSuspense(<Dashboard />) },
      { path: 'drive',      element: withSuspense(<Drive />) },
      { path: 'brand',      element: withSuspense(<Brand />) },
      { path: 'personas',   element: withSuspense(<Personas />) },
      { path: 'competitors', element: withSuspense(<Competitors />) },
      { path: 'ask',        element: withSuspense(<Ask />) },
      { path: 'win-loss',   element: withSuspense(<WinLoss />) },
      { path: 'campaigns',  element: withSuspense(<Campaigns />) },
      { path: 'content',    element: withSuspense(<Content />) },
      { path: 'analytics',  element: withSuspense(<Analytics />) },
      { path: 'settings',   element: withSuspense(<Settings />) },
    ],
  },

  // ---------------------------------------------------------------------------
  // Catch-all — unknown URLs fall back to the app root (which routes to
  // /dashboard when authenticated, or /signin when not) instead of a 404.
  // ---------------------------------------------------------------------------
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
