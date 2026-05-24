/**
 * Auth module tests — AuthContext, SignIn page, Callback page, ProtectedRoute.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock auth API
// ---------------------------------------------------------------------------

vi.mock('./authApi.js', () => ({
  exchangeCodeForToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  logoutRequest: vi.fn(),
}));

import { exchangeCodeForToken, refreshAccessToken, logoutRequest } from './authApi.js';

const mockExchangeCode = vi.mocked(exchangeCodeForToken);
const mockRefreshToken = vi.mocked(refreshAccessToken);
const mockLogout = vi.mocked(logoutRequest);

// ---------------------------------------------------------------------------
// Mock authToken service
// ---------------------------------------------------------------------------

vi.mock('../../services/authToken.js', () => ({
  setToken: vi.fn(),
  getToken: vi.fn(),
  clearToken: vi.fn(),
  msUntilExpiry: vi.fn(() => 3600000), // 1 hour
  decodeJwtPayload: vi.fn(),
}));

import { setToken, clearToken, msUntilExpiry, decodeJwtPayload } from '../../services/authToken.js';
import { FIXTURE_JWT_PAYLOAD } from './fixtures.js';

const mockSetToken = vi.mocked(setToken);
const mockClearToken = vi.mocked(clearToken);
const mockDecodeJwtPayload = vi.mocked(decodeJwtPayload);

// ---------------------------------------------------------------------------
// Import components under test
// ---------------------------------------------------------------------------

import { AuthContextProvider, useAuth } from '../../context/AuthContext.js';
import SignIn from './SignIn.js';
import Callback from './Callback.js';
import { ProtectedRoute } from '../../components/ProtectedRoute/ProtectedRoute.js';
import {
  FIXTURE_CALLBACK_RESPONSE,
  FIXTURE_REFRESH_RESPONSE,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function renderWithAuth(ui: React.ReactNode, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthContextProvider>
        {ui}
      </AuthContextProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// AuthContext
// ---------------------------------------------------------------------------

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: silent refresh fails (user is not previously logged in)
    mockRefreshToken.mockRejectedValue(new Error('No session'));
    vi.mocked(msUntilExpiry).mockReturnValue(3600000);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  function TestConsumer() {
    const { isAuthenticated, isLoading, user, error } = useAuth();
    return (
      <div>
        <span data-testid="loading">{String(isLoading)}</span>
        <span data-testid="authenticated">{String(isAuthenticated)}</span>
        <span data-testid="user">{user?.email ?? 'null'}</span>
        <span data-testid="error">{error ?? 'null'}</span>
      </div>
    );
  }

  it('starts with isLoading=true', () => {
    mockRefreshToken.mockReturnValue(new Promise(() => { /* never resolves */ }));
    renderWithAuth(<TestConsumer />);
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('sets isLoading=false after silent refresh completes', async () => {
    renderWithAuth(<TestConsumer />);
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    );
  });

  it('isAuthenticated=false when silent refresh fails', async () => {
    renderWithAuth(<TestConsumer />);
    await waitFor(() =>
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    );
  });

  it('isAuthenticated=true after successful signIn', async () => {
    mockExchangeCode.mockResolvedValue(FIXTURE_CALLBACK_RESPONSE);

    function SignInConsumer() {
      const { signIn, isAuthenticated, isLoading } = useAuth();
      return (
        <div>
          <span data-testid="loading">{String(isLoading)}</span>
          <span data-testid="authenticated">{String(isAuthenticated)}</span>
          <button onClick={() => void signIn('test-code')} data-testid="sign-in">Sign In</button>
        </div>
      );
    }

    renderWithAuth(<SignInConsumer />);
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    );

    fireEvent.click(screen.getByTestId('sign-in'));
    await waitFor(() =>
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    );
  });

  it('stores token in memory via setToken on signIn', async () => {
    mockExchangeCode.mockResolvedValue(FIXTURE_CALLBACK_RESPONSE);

    function TestSignIn() {
      const { signIn } = useAuth();
      return <button onClick={() => void signIn('code')} data-testid="sign-in">Sign In</button>;
    }

    renderWithAuth(<TestSignIn />);
    await waitFor(() => expect(screen.getByTestId('sign-in')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('sign-in'));
    await waitFor(() =>
      expect(mockSetToken).toHaveBeenCalledWith(FIXTURE_CALLBACK_RESPONSE.access_token)
    );
  });

  it('clears token on signOut via clearToken', async () => {
    mockExchangeCode.mockResolvedValue(FIXTURE_CALLBACK_RESPONSE);
    mockLogout.mockResolvedValue(undefined);

    function TestSignOut() {
      const { signIn, signOut, isAuthenticated } = useAuth();
      return (
        <div>
          <span data-testid="authenticated">{String(isAuthenticated)}</span>
          <button onClick={() => void signIn('code')} data-testid="sign-in">Sign In</button>
          <button onClick={() => void signOut()} data-testid="sign-out">Sign Out</button>
        </div>
      );
    }

    renderWithAuth(<TestSignOut />);
    await waitFor(() => expect(screen.getByTestId('sign-in')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('sign-in'));
    await waitFor(() =>
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    );
    fireEvent.click(screen.getByTestId('sign-out'));
    await waitFor(() =>
      expect(mockClearToken).toHaveBeenCalled()
    );
  });

  it('restores session via silent refresh on mount', async () => {
    mockRefreshToken.mockResolvedValue(FIXTURE_REFRESH_RESPONSE);
    mockDecodeJwtPayload.mockReturnValue(FIXTURE_JWT_PAYLOAD as unknown as Record<string, unknown>);

    function TestConsumer2() {
      const { isAuthenticated, isLoading } = useAuth();
      return (
        <div>
          <span data-testid="loading">{String(isLoading)}</span>
          <span data-testid="authenticated">{String(isAuthenticated)}</span>
        </div>
      );
    }

    renderWithAuth(<TestConsumer2 />);
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    );
    // After silent refresh, token is set in memory
    expect(mockSetToken).toHaveBeenCalledWith(FIXTURE_REFRESH_RESPONSE.access_token);
  });

  it('sets error state when signIn fails', async () => {
    mockExchangeCode.mockRejectedValue(new Error('OAuth error'));

    function TestError() {
      const { signIn, error, isLoading } = useAuth();
      return (
        <div>
          <span data-testid="loading">{String(isLoading)}</span>
          <span data-testid="error">{error ?? 'null'}</span>
          <button onClick={() => signIn('bad-code').catch(() => null)} data-testid="sign-in">Sign In</button>
        </div>
      );
    }

    renderWithAuth(<TestError />);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    fireEvent.click(screen.getByTestId('sign-in'));
    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('OAuth error')
    );
  });
});

// ---------------------------------------------------------------------------
// SignIn page
// ---------------------------------------------------------------------------

describe('SignIn page', () => {
  it('renders the sign-in page', () => {
    render(<MemoryRouter><SignIn /></MemoryRouter>);
    expect(screen.getByTestId('signin-page')).toBeInTheDocument();
  });

  it('renders BOBA app name', () => {
    render(<MemoryRouter><SignIn /></MemoryRouter>);
    expect(screen.getByText('BOBA')).toBeInTheDocument();
  });

  it('renders the Google sign-in button', () => {
    render(<MemoryRouter><SignIn /></MemoryRouter>);
    expect(screen.getByTestId('google-signin-button')).toBeInTheDocument();
    expect(screen.getByTestId('google-signin-button')).toHaveTextContent('Sign in with Google');
  });

  it('redirects to Google OAuth on button click', () => {
    const originalHref = window.location.href;
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: originalHref },
      writable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: hrefSetter,
      get: () => originalHref,
      configurable: true,
    });

    render(<MemoryRouter><SignIn /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('google-signin-button'));
    expect(hrefSetter).toHaveBeenCalledWith(
      expect.stringContaining('accounts.google.com/o/oauth2/v2/auth')
    );
  });
});

// ---------------------------------------------------------------------------
// Callback page
// ---------------------------------------------------------------------------

describe('Callback page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshToken.mockRejectedValue(new Error('No session'));
  });

  it('renders the callback page with loading indicator', () => {
    mockExchangeCode.mockReturnValue(new Promise(() => { /* pending */ }));

    render(
      <MemoryRouter initialEntries={['/auth/callback?code=test-code']}>
        <AuthContextProvider>
          <Routes>
            <Route path="/auth/callback" element={<Callback />} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
            <Route path="/signin" element={<div>SignIn</div>} />
          </Routes>
        </AuthContextProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('callback-page')).toBeInTheDocument();
  });

  it('navigates to /dashboard after successful code exchange', async () => {
    mockExchangeCode.mockResolvedValue(FIXTURE_CALLBACK_RESPONSE);

    render(
      <MemoryRouter initialEntries={['/auth/callback?code=test-code']}>
        <AuthContextProvider>
          <Routes>
            <Route path="/auth/callback" element={<Callback />} />
            <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
            <Route path="/signin" element={<div>SignIn</div>} />
          </Routes>
        </AuthContextProvider>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId('dashboard')).toBeInTheDocument()
    );
  });

  it('navigates to /signin when no code in URL', async () => {
    render(
      <MemoryRouter initialEntries={['/auth/callback']}>
        <AuthContextProvider>
          <Routes>
            <Route path="/auth/callback" element={<Callback />} />
            <Route path="/signin" element={<div data-testid="signin">SignIn</div>} />
          </Routes>
        </AuthContextProvider>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId('signin')).toBeInTheDocument()
    );
  });

  it('navigates to /signin when OAuth error param is present', async () => {
    render(
      <MemoryRouter initialEntries={['/auth/callback?error=access_denied']}>
        <AuthContextProvider>
          <Routes>
            <Route path="/auth/callback" element={<Callback />} />
            <Route path="/signin" element={<div data-testid="signin">SignIn</div>} />
          </Routes>
        </AuthContextProvider>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId('signin')).toBeInTheDocument()
    );
  });
});

// ---------------------------------------------------------------------------
// ProtectedRoute
// ---------------------------------------------------------------------------

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading indicator while auth is resolving', () => {
    mockRefreshToken.mockReturnValue(new Promise(() => { /* pending */ }));

    render(
      <MemoryRouter>
        <AuthContextProvider>
          <ProtectedRoute>
            <div data-testid="protected-content">Protected</div>
          </ProtectedRoute>
        </AuthContextProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('protected-route-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('redirects to /signin when user is not authenticated', async () => {
    mockRefreshToken.mockRejectedValue(new Error('No session'));

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthContextProvider>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div data-testid="protected-content">Protected</div>
                </ProtectedRoute>
              }
            />
            <Route path="/signin" element={<div data-testid="signin-page">SignIn</div>} />
          </Routes>
        </AuthContextProvider>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId('signin-page')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('renders children when user is authenticated', async () => {
    mockRefreshToken.mockResolvedValue(FIXTURE_REFRESH_RESPONSE);
    // Decode returns the fixture payload so AuthContext can construct user from token
    mockDecodeJwtPayload.mockReturnValue(FIXTURE_JWT_PAYLOAD as unknown as Record<string, unknown>);

    render(
      <MemoryRouter>
        <AuthContextProvider>
          <ProtectedRoute>
            <div data-testid="protected-content">Protected Content</div>
          </ProtectedRoute>
        </AuthContextProvider>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    );
  });

  it('supports custom redirectTo prop', async () => {
    mockRefreshToken.mockRejectedValue(new Error('No session'));

    render(
      <MemoryRouter initialEntries={['/secret']}>
        <AuthContextProvider>
          <Routes>
            <Route
              path="/secret"
              element={
                <ProtectedRoute redirectTo="/login">
                  <div>Secret</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          </Routes>
        </AuthContextProvider>
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    );
  });
});

// ---------------------------------------------------------------------------
// authToken module (unit)
// ---------------------------------------------------------------------------

describe('authToken module', () => {
  it('decodes JWT payload correctly', async () => {
    // Re-import the actual module (not mocked)
    vi.doUnmock('../../services/authToken.js');
    const { decodeJwtPayload } = await import('../../services/authToken.js');

    const payload = { sub: 'user-1', exp: 9999999999, iat: 1700000000 };
    const encoded = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
      '.' + btoa(JSON.stringify(payload)) + '.sig';
    const decoded = decodeJwtPayload(encoded);
    expect(decoded).toMatchObject(payload);
  });

  it('returns null for malformed JWT', async () => {
    vi.doUnmock('../../services/authToken.js');
    const { decodeJwtPayload } = await import('../../services/authToken.js');
    expect(decodeJwtPayload('not.a.jwt.with.too.many.parts')).toBeNull();
  });

  it('msUntilExpiry returns positive value for future expiry', async () => {
    vi.doUnmock('../../services/authToken.js');
    const { msUntilExpiry: realMsUntilExpiry, decodeJwtPayload } = await import('../../services/authToken.js');

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const payload = { sub: 'u', exp: futureExp, iat: 0 };
    const token = btoa(JSON.stringify({})) + '.' + btoa(JSON.stringify(payload)) + '.sig';
    expect(realMsUntilExpiry(token)).toBeGreaterThan(0);
    void decodeJwtPayload; // used above
  });
});
