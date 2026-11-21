import { safeReturnPath } from './auth-navigation';

/** A nomination may return only to student registration, including its saved draft. */
export function studentRegistrationReturnPath(value: unknown): string | null {
 const path = safeReturnPath(value);
 if (!path) return null;
 const pathname = new URL(path, 'https://youth-eco.local').pathname;
 return ['/register', '/forms/student'].includes(pathname) ? path : null;
}

export function schoolNominationHref(returnTo?: unknown): string {
 const path = studentRegistrationReturnPath(returnTo);
 return path ? `/schools/nominate?${new URLSearchParams({ returnTo: path })}` : '/schools/nominate';
}
