export type Row = Record<string, any>;
export type PublicConfig = { configured?: boolean; editions: Row[]; competitions: Row[]; content: Row[] };
export class ApiError extends Error {
  fields?: Record<string, string>;
  status?: number;
  constructor(message: string, fields?: Record<string, string>, status?: number) { super(message); this.fields = fields; this.status = status; }
}
export async function api<T = Row>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: 'same-origin', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, cache: 'no-store' });
  let result;
  try { result = await response.json(); } catch { throw new ApiError('The service could not respond. Please try again.'); }
  if (!response.ok || result.error) {
    const fields = result.fields?.fieldErrors ? Object.fromEntries(Object.entries(result.fields.fieldErrors).map(([key, value]) => [key, Array.isArray(value) ? value.join(' ') : String(value)])) : result.fields;
    throw new ApiError(typeof result.error === 'string' ? result.error : result.error?.message || 'The request could not be completed.', fields, response.status);
  }
  return result.data as T;
}
export const json = (method: string, value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });
export function label(value: unknown): string { return String(value ?? '').replaceAll('_', ' '); }
export function date(value: unknown): string { if (!value) return 'Not announced'; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? 'Not announced' : d.toLocaleString(); }
export function contentFor(config: PublicConfig | null, key: string): Row | undefined { return config?.content.find(item => item.slug === key || item.key === key); }
