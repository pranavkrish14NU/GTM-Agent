import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout/index.js';

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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: withSuspense(<Dashboard />) },
      { path: 'drive', element: withSuspense(<Drive />) },
      { path: 'brand', element: withSuspense(<Brand />) },
      { path: 'personas', element: withSuspense(<Personas />) },
      { path: 'competitors', element: withSuspense(<Competitors />) },
      { path: 'ask', element: withSuspense(<Ask />) },
      { path: 'win-loss', element: withSuspense(<WinLoss />) },
      { path: 'campaigns', element: withSuspense(<Campaigns />) },
      { path: 'content', element: withSuspense(<Content />) },
      { path: 'analytics', element: withSuspense(<Analytics />) },
      { path: 'settings', element: withSuspense(<Settings />) },
    ],
  },
]);
