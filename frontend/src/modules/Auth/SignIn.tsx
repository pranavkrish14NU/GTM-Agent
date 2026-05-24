/**
 * Sign-in page — presents a "Sign in with Google" button.
 *
 * Clicking the button redirects the browser to Google's OAuth consent screen.
 * After the user grants access, Google redirects to /auth/callback with a code.
 *
 * The Google OAuth redirect URI and client_id are read from Vite env vars:
 *   VITE_GOOGLE_CLIENT_ID
 *   VITE_OAUTH_REDIRECT_URI (defaults to <origin>/auth/callback)
 */

/// <reference types="vite/client" />

import styles from './SignIn.module.css';

const CLIENT_ID = (import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string | undefined) ?? '';
const REDIRECT_URI =
  (import.meta.env['VITE_OAUTH_REDIRECT_URI'] as string | undefined) ??
  `${window.location.origin}/auth/callback`;

const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'openid profile email';

/**
 * Generate a cryptographically random OAuth state value (RFC 6749 §10.12).
 * Stored in sessionStorage before redirect and verified in Callback.tsx
 * to prevent Login CSRF attacks.
 */
function generateOAuthState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildGoogleOAuthUrl(): string {
  const state = generateOAuthState();
  // Persist state for verification in the callback (sessionStorage cleared on tab close)
  sessionStorage.setItem('oauth_state', state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_OAUTH_URL}?${params.toString()}`;
}

export default function SignIn() {
  const handleSignIn = () => {
    window.location.href = buildGoogleOAuthUrl();
  };

  return (
    <div className={styles.page} data-testid="signin-page">
      <div className={styles.card}>
        <div className={styles.logo}>🤖</div>
        <h1 className={styles.appName}>BOBA</h1>
        <p className={styles.tagline}>
          AI-native GTM intelligence for B2B marketing and sales teams.
        </p>

        <button
          type="button"
          className={styles.googleButton}
          onClick={handleSignIn}
          data-testid="google-signin-button"
        >
          {/* Google G logo SVG */}
          <svg className={styles.googleIcon} viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          Sign in with Google
        </button>

        <p className={styles.footer}>
          By signing in you agree to the BOBA Terms of Service.
        </p>
      </div>
    </div>
  );
}
