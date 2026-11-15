/**
 * Resolves API URL with optional external cloud backend support (e.g. for GitHub Pages).
 * Set `window.SPX_API_URL = 'https://your-backend.onrender.com'` before loading the bundle,
 * or leave undefined/empty when running locally with server.py (same-origin).
 */
export function getApiBase(): string {
  if (typeof window !== 'undefined' && (window as any).SPX_API_URL) {
    return String((window as any).SPX_API_URL).replace(/\/+$/, '');
  }
  return '';
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : '/' + path;
  return getApiBase() + p;
}
