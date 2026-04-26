/**
 * auth.ts — Client-side authentication helpers.
 *
 * - Token is stored in localStorage under 'sar_token'.
 * - authFetch() wraps fetch() to automatically attach the Authorization header.
 * - If any API response returns 401, the session is cleared and the browser
 *   is redirected to /login (handles token expiry gracefully).
 */

const TOKEN_KEY = 'sar_token';
const USER_KEY  = 'sar_user';

export interface AuthUser {
  user_id: number;
  email:   string;
  role:    string;
}

/** Retrieve the stored JWT token, or null if not logged in. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Retrieve the stored user object, or null if not logged in. */
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Returns true when a token exists in localStorage. */
export function isAuthenticated(): boolean {
  return !!getToken();
}

/** Clear all auth state and redirect to the login page. */
export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Authenticated fetch wrapper.
 * - Automatically attaches `Authorization: Bearer <token>` header.
 * - If the server responds with 401 (missing/expired token), clears the
 *   session and hard-redirects to /login so the user can re-authenticate.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  // Token expired or missing — force re-login
  if (res.status === 401) {
    logout();
    window.location.href = '/login';
  }

  return res;
}
