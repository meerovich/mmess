// Thin wrapper: all API calls use this instead of raw fetch
// Handles: credentials: 'include' (sends httpOnly cookies)
//          401 → try POST /api/auth/refresh once → retry original
//          If refresh also 401 → throw AuthError (caller redirects to /login)

import type { UploadedFile } from '../types/chat';

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

/**
 * Upload a file via XHR to POST /api/files.
 * Uses XHR (not fetch) for upload progress events (D-24).
 * Integrates with AbortController via signal.addEventListener('abort').
 */
export function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.open('POST', '/api/files');
    xhr.withCredentials = true; // send httpOnly cookies (same as apiFetch)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        // Cap at 99% — 100% is set only when server confirms (xhr.load)
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadedFile);
        } catch {
          reject(new Error('Invalid server response'));
        }
      } else if (xhr.status === 413) {
        reject(new Error('file too large (25 MB max)'));
      } else if (xhr.status === 400) {
        reject(new Error('file type not allowed'));
      } else {
        reject(new Error(xhr.responseText || 'Upload failed. Please try again.'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('network error')));
    xhr.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));

    signal.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(formData);
  });
}
