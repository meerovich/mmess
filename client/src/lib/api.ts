// Thin wrapper: all API calls use this instead of raw fetch
// Handles: credentials: 'include' (sends httpOnly cookies)
//          401 → try POST /api/auth/refresh once → retry original
//          If refresh also 401 → throw AuthError (caller redirects to /login)

export class AuthError extends Error {}

let isRefreshing = false;
let refreshQueue: Array<() => void> = [];

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (response.status !== 401) return response;

  // 401 — attempt token refresh (serialize concurrent 401s)
  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshQueue.push(() => resolve(apiFetch(url, options)));
    });
  }

  isRefreshing = true;
  try {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refreshRes.ok) throw new AuthError('Session expired');

    // Drain queued requests
    refreshQueue.forEach(fn => fn());
    refreshQueue = [];

    // Retry original
    return fetch(url, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } finally {
    isRefreshing = false;
    refreshQueue = [];
  }
}
