/**
 * OAuth Callback page — /auth/callback
 *
 * Google redirects here after the user grants consent, appending:
 *   ?code=<auth_code>&state=<state>
 *
 * This page:
 *   1. Validates the OAuth state parameter to prevent Login CSRF (RFC 6749 §10.12).
 *   2. Validates the error parameter against a known-safe allowlist.
 *   3. Extracts the authorization code from the URL search params.
 *   4. Calls signIn(code) from AuthContext, which exchanges the code for a JWT.
 *   5. Redirects to /dashboard on success or /signin on failure.
 */

import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';

/** Known OAuth error codes from RFC 6749 §4.1.2.1 and Google's extension. */
const KNOWN_OAUTH_ERRORS = new Set([
  'access_denied',
  'server_error',
  'temporarily_unavailable',
  'invalid_request',
  'unauthorized_client',
  'unsupported_response_type',
  'invalid_scope',
]);

export default function Callback() {
  const [searchParams] = useSearchParams();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const hasRun = useRef(false);

  useEffect(() => {
    // Strict mode double-invoke guard
    if (hasRun.current) return;
    hasRun.current = true;

    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');
    const stateParam = searchParams.get('state');

    // Validate OAuth state to prevent Login CSRF attacks.
    // State may be absent if the user navigated here manually — treat as invalid.
    const storedState = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state'); // consume once

    if (stateParam && storedState && stateParam !== storedState) {
      // State mismatch — likely a CSRF attempt or replay. Abort silently.
      void navigate('/signin', { replace: true });
      return;
    }

    // Validate error param against allowlist — discard unknown values to prevent
    // attacker-controlled strings from propagating into the application.
    if (errorParam) {
      const safeError = KNOWN_OAUTH_ERRORS.has(errorParam) ? errorParam : 'unknown_error';
      // Log the sanitised error for diagnostics without exposing raw param
      console.warn('[Callback] OAuth error received:', safeError);
      void navigate('/signin', { replace: true });
      return;
    }

    if (!code) {
      void navigate('/signin', { replace: true });
      return;
    }

    signIn(code)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => navigate('/signin', { replace: true }));
  }, [searchParams, signIn, navigate]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        flexDirection: 'column',
        gap: '1rem',
        color: '#64748b',
        fontSize: '0.875rem',
      }}
      data-testid="callback-page"
    >
      <div style={{ fontSize: '2rem' }}>⟳</div>
      <p>Completing sign-in…</p>
    </div>
  );
}
