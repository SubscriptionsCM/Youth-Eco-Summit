const localOrigin = 'https://youth-eco.local';

/** Accept a local page destination without allowing an open redirect. */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, localOrigin);
    const decodedPath = decodeURIComponent(url.pathname);
    if (url.origin !== localOrigin || decodedPath.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decodedPath)) return null;
    // These are endpoints or sign-in/setup pages, not a post-login destination.
    if (/^\/(?:api|login|invite|recover)(?:\/|$)/.test(decodedPath)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

export function dashboardPath(role?: string): string {
  return role === 'judge' ? '/judge' : role === 'owner' || role === 'admin' ? '/admin' : '/dashboard';
}

export function dashboardLabel(role?: string): string {
  return role === 'judge' ? 'Judging dashboard' : role === 'owner' || role === 'admin' ? 'Administration' : 'My dashboard';
}

export function loginPath(destination?: unknown): string {
  const next = safeReturnPath(destination);
  return next ? `/login?${new URLSearchParams({ next })}` : '/login';
}

export function afterLoginPath(role: string, destination?: unknown): string {
  const next = safeReturnPath(destination);
  if (!next) return dashboardPath(role);
  const pathname = decodeURIComponent(new URL(next, localOrigin).pathname);
  if (/^\/admin(?:\/|$)/.test(pathname) && !['owner', 'admin'].includes(role)) return dashboardPath(role);
  if (/^\/judge(?:\/|$)/.test(pathname) && !['owner', 'admin', 'judge'].includes(role)) return dashboardPath(role);
  if (/^\/(?:register|dashboard|teams)(?:\/|$)/.test(pathname) && role !== 'participant') return dashboardPath(role);
  if (/^\/schools\/register(?:\/|$)/.test(pathname) && role !== 'participant') return dashboardPath(role);
  if (/^\/entries(?:\/|$)/.test(pathname) && role === 'judge') return dashboardPath(role);
  return next;
}
