/**
 * ProtectedRoute — redirects unauthenticated users to /signin.
 *
 * Usage in router:
 *   { path: 'dashboard', element: <ProtectedRoute><Dashboard /></ProtectedRoute> }
 *
 * While auth state is loading (initial session restore attempt), renders a
 * full-screen loading indicator so the UI doesn't flash the signin page.
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Override redirect destination. Defaults to '/signin'. */
  redirectTo?: string;
}

export function ProtectedRoute({ children, redirectTo = '/signin' }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#94a3b8',
          fontSize: '0.875rem',
        }}
        data-testid="protected-route-loading"
      >
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace data-testid="protected-route-redirect" />;
  }

  return <>{children}</>;
}
