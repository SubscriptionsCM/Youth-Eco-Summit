'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type ReactElement, type ReactNode, type ChangeEvent } from 'react';
import { api, ApiError, type Row } from './api';
import { dashboardPath, loginPath } from './auth-navigation';

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(path));
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) { setLoading(false); return; }
    let active = true; setLoading(true); setError('');
    api<T>(path).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, version]);
  return { data, error, loading, reload: () => setVersion(v => v + 1), setData };
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  return <div ref={ref} tabIndex={error ? -1 : undefined} className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;
}
export function ResourceState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <p role="status">Loading…</p>;
  if (error) return <Notice error>{error} <button type="button" onClick={retry}>Try again</button></Notice>;
  return null;
}
const FormMemory = createContext<{ current: Record<string, string> } | null>(null);
export function RememberForm({ children }: { children: ReactNode }) { const values = useRef<Record<string, string>>({}); return <FormMemory.Provider value={values}>{children}</FormMemory.Provider>; }
export function Field({ name, title, type = 'text', required = false, children, hint, ...props }: { name: string; title: string; type?: string; required?: boolean; children?: ReactNode; hint?: string; [key: string]: any }) {
  const memory = useContext(FormMemory);
  const generatedId = useId();
  const fieldId = props.id || generatedId;
  const control = isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { id: fieldId, 'aria-describedby': hint ? `${fieldId}-hint` : undefined }) : children;
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => { if (memory) memory.current[name] = event.target.value; props.onChange?.(event); };
  return <div className="field"><label htmlFor={fieldId}>{title}{required ? ' (required)' : ''}</label>{control || <input name={name} type={type} required={required} {...props} id={fieldId} aria-describedby={hint ? `${fieldId}-hint` : undefined} defaultValue={props.value === undefined ? memory?.current[name] ?? props.defaultValue : undefined} onChange={handleChange} />}{hint && <small id={`${fieldId}-hint`}>{hint}</small>}</div>;
}
export function Errors({ error }: { error: unknown }) {
  if (!error) return null;
  const value = error as ApiError;
  return <Notice error><p>{value.message || String(error)}</p>{value.fields && <ul>{Object.entries(value.fields).map(([key, message]) => <li key={key}>{key}: {String(message)}</li>)}</ul>}</Notice>;
}
export function AuthGate({ roles, children }: { roles?: string[]; children: (actor: Row) => ReactNode }) {
  const pathname = usePathname();
  const [signInHref, setSignInHref] = useState(() => loginPath(pathname));
  const session = useResource<{ actor: Row | null }>('/api/auth/session');
  useEffect(() => { setSignInHref(loginPath(`${window.location.pathname}${window.location.search}${window.location.hash}`)); }, [pathname, session.loading]);
  if (session.loading || session.error) return <ResourceState {...session} retry={session.reload} />;
  if (!session.data?.actor) return <Notice>Please <Link href={signInHref}>sign in</Link> to continue. Your records are available only through your verified account.</Notice>;
  if (roles && !roles.includes(session.data.actor.role)) return <Notice error>This account does not have access to this page. <Link href={dashboardPath(session.data.actor.role)}>Go to your dashboard</Link>.</Notice>;
  return <>{children(session.data.actor)}</>;
}
export function PageTitle({ title, children }: { title: string; children?: ReactNode }) { return <header className="page-heading"><h1>{title}</h1>{children && <p>{children}</p>}</header>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
export function Pagination({ page, pageSize = 25, total, onPage }: { page: number; pageSize?: number; total: number; onPage: (page: number) => void }) { return <nav className="actions" aria-label="Pagination"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} · {total} records</span><button type="button" disabled={page * pageSize >= total} onClick={() => onPage(page + 1)}>Next</button></nav>; }
