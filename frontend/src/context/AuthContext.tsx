/* eslint-disable react-refresh/only-export-components */
// Context files conventionally export the context, provider, and hook from one file.

/**
 * AuthContext — manages the full Google OAuth → BOBA JWT lifecycle.
 *
 * Architecture decisions:
 *   - Access token lives ONLY in React state + the authToken module variable.
 *     It is NEVER written to localStorage or sessionStorage.
 *   - The refresh token is an HttpOnly cookie managed entirely by the server.
 *   - Auto-refresh fires 2 minutes before access token expiry.
 *   - On mount, the context attempts a silent refresh to restore a session
 *     from a still-valid refresh token cookie.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import type { User } from '../types/index.js';
import type { AuthContextValue } from '../modules/Auth/types.js';
import { exchangeCodeForToken, refreshAccessToken, logoutRequest } from '../modules/Auth/authApi.js';
import { setToken, clearToken, msUntilExpiry, decodeJwtPayload } from '../services/authToken.js';
import type { JwtPayload } from '../modules/Auth/types.js';

/**
 * Derive a User object from the decoded JWT payload. Returns null on failure.
 *
 * ⚠️ SECURITY NOTE — The fields here (including `role` and `workspaceId`) are
 * decoded client-side WITHOUT signature verification and are used ONLY for UI
 * display (e.g., showing the user's name or navigating to the right workspace).
 * They MUST NOT be used for any authorization decision that gates data access.
 * Every protected API call is re-authorized server-side from the signed token.
 */
function userFromToken(token: string): User | null {
  const payload = decodeJwtPayload(token) as JwtPayload | null;
  if (!payload || !payload.sub) return null;
  return {
    id: payload.sub,
    email: payload.email,
    displayName: payload.displayName,
    role: payload.role,
    workspaceId: payload.workspaceId,
  };
}

/** 2 minutes before expiry — trigger a token refresh */
const REFRESH_BUFFER_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Context creation
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  signIn: async () => { /* noop default */ },
  signOut: async () => { /* noop default */ },
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthContextProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the mount silent-refresh against React StrictMode's double-invoke in
  // dev (and any remount), which would otherwise fire two concurrent refreshes
  // and race the single-use refresh-token rotation — one rotates, the other 401s
  // and spuriously logs the user out.
  const didInitRef = useRef(false);

  /** Store the token in React state AND the module singleton. */
  const storeToken = useCallback((token: string) => {
    setToken(token);
    setAccessToken(token);
  }, []);

  /** Clear the token from both React state and module singleton. */
  const eraseToken = useCallback(() => {
    clearToken();
    setAccessToken(null);
    setUser(null);
  }, []);

  /** Schedule an automatic refresh 2 min before the token expires. */
  const scheduleRefresh = useCallback(
    (token: string, doRefresh: () => Promise<void>) => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
      const ms = msUntilExpiry(token);
      const delay = Math.max(0, ms - REFRESH_BUFFER_MS);
      if (delay === 0) return; // Already expired or too close — skip scheduling
      refreshTimerRef.current = setTimeout(() => {
        void doRefresh();
      }, delay);
    },
    [],
  );

  /** Silently refresh the access token using the HttpOnly cookie. */
  const doRefresh = useCallback(async () => {
    try {
      const res = await refreshAccessToken();
      storeToken(res.access_token);
      // Decode user from the new token so isAuthenticated becomes true
      const decoded = userFromToken(res.access_token);
      if (decoded) setUser(decoded);
      scheduleRefresh(res.access_token, doRefresh);
    } catch {
      // Refresh failed — session expired, sign the user out
      eraseToken();
    }
  }, [storeToken, eraseToken, scheduleRefresh]);

  /** On mount: attempt a silent refresh to restore an existing session. */
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    doRefresh()
      .catch(() => { /* noop — user is not authenticated */ })
      .finally(() => setIsLoading(false));

    return () => {
      if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Exchange a Google OAuth code for a BOBA access token. */
  const signIn = useCallback(
    async (code: string, state: string, redirectUri: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await exchangeCodeForToken(code, state, redirectUri);
        storeToken(res.access_token);
        // The API derives identity from the signed JWT and returns no user
        // object, so decode it from the token — same as the refresh path.
        setUser(userFromToken(res.access_token));
        scheduleRefresh(res.access_token, doRefresh);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [storeToken, setUser, scheduleRefresh, doRefresh],
  );

  /** Sign the user out: clear token from memory + invalidate server-side cookie. */
  const signOut = useCallback(async () => {
    if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
    eraseToken();
    try {
      await logoutRequest();
    } catch {
      // Fire-and-forget: even if the logout API fails, the local state is cleared
    }
  }, [eraseToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: accessToken !== null && user !== null,
        isLoading,
        error,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
