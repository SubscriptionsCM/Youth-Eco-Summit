'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, ApiError, json, type Row } from './api';
import { Errors, Notice, ResourceState, useResource } from './shared';
import { ReferenceControl } from './reference-form';
import { SubmittedFormAnswers } from './submitted-form-answers';
import { loadSubmittedRecord, pendingSubmittedRecord } from './reference-receipt';
import { useUnsavedNavigation } from './unsaved-navigation';
import { fieldLabel, isFieldVisible, referenceForms, validateReferenceAnswers, type Answers } from '../domain/wordpress-forms';
import './contact-message-form.css';

const form = referenceForms.find(item => item.key === 'legacy-12146')!;
const fields = form.fields.filter(field => !['section', 'html', 'group', 'page-break', 'hidden'].includes(field.type));

function savedLocator(hash: string): string | null {
  const params = new URLSearchParams(hash.slice(1));
  return params.has('saved') ? params.get('saved')! : null;
}

function addressMatches(hash: string) {
  const current = savedLocator(window.location.hash);
  return current === null || current === savedLocator(hash);
}

/** Contact alone opens immediately; other forms keep their existing start and step flow. */
export function ContactMessageForm() {
  const configuration = useResource<Row>('/api/forms/config'), session = useResource<Row>('/api/auth/session');
  const [record, setRecord] = useState<Row | null>(null), [answers, setAnswers] = useState<Answers>({});
  const [token, setToken] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>();
  const [message, setMessage] = useState(''), [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [restoration, setRestoration] = useState<'waiting' | 'loading' | 'ready' | 'failed'>('waiting');
  const dirty = useRef(false), submitting = useRef(false), formElement = useRef<HTMLFormElement>(null);
  const [savedHash, setSavedHash] = useState<string | null>(null), [authVersion, setAuthVersion] = useState(0);
  const identity = `${session.data?.actor?.id || 'anonymous'}:${session.data?.actor?.role || ''}`;
  const sessionSnapshot = useRef(session.data);
  const lifecycle = useRef({ generation: 0, initialized: false, identity: '', hash: '', pendingAuth: false, authSnapshot: session.data, restore: null as AbortController | null });
  useUnsavedNavigation(() => dirty.current);
  function invalidate() {
    lifecycle.current.generation++; lifecycle.current.initialized = false; lifecycle.current.restore?.abort();
    submitting.current = false; dirty.current = false;
    setRecord(null); setAnswers({}); setToken(''); setBusy(false); setError(undefined); setMessage(''); setFieldErrors({}); setRestoration('waiting');
  }
  useLayoutEffect(() => { sessionSnapshot.current = session.data; }, [session.data]);
  useEffect(() => {
    lifecycle.current.hash = window.location.hash; setSavedHash(window.location.hash);
    const locationChanged = () => {
      const next = savedLocator(window.location.hash);
      // Section anchors keep the open message; only another saved locator changes it.
      if (next === null || next === savedLocator(lifecycle.current.hash)) return;
      invalidate(); lifecycle.current.hash = window.location.hash; setSavedHash(window.location.hash);
    };
    const authChanged = () => {
      invalidate(); lifecycle.current.pendingAuth = true; lifecycle.current.authSnapshot = sessionSnapshot.current; setAuthVersion(value => value + 1);
    };
    window.addEventListener('hashchange', locationChanged); window.addEventListener('popstate', locationChanged); window.addEventListener('yes-auth-changed', authChanged);
    return () => {
      lifecycle.current.generation++; lifecycle.current.initialized = false; lifecycle.current.restore?.abort();
      window.removeEventListener('hashchange', locationChanged); window.removeEventListener('popstate', locationChanged); window.removeEventListener('yes-auth-changed', authChanged);
    };
  }, []);
  useLayoutEffect(() => {
    const scope = lifecycle.current;
    if (scope.initialized && scope.identity !== identity) invalidate();
    if (!session.dataPath || savedHash === null || session.loading || session.error || (scope.pendingAuth && session.data === scope.authSnapshot)) return;
    if (scope.initialized && scope.identity === identity && scope.hash === savedHash && !scope.pendingAuth) return;
    invalidate(); scope.pendingAuth = false; scope.initialized = true; scope.identity = identity; scope.hash = savedHash;
    const generation = scope.generation, controller = new AbortController(); scope.restore = controller;
    const current = () => !controller.signal.aborted && lifecycle.current.generation === generation && addressMatches(scope.hash);
    const params = new URLSearchParams(savedHash.slice(1));
    if (!params.has('saved')) { setRestoration('ready'); return; }
    const parts = (params.get('saved') || '').split('.'), [id, key = ''] = parts;
    if (!id || parts.length > 2 || /[\s/]/.test(id + key)) {
      setError(new Error('This saved message link is invalid. Open the complete private link.')); setRestoration('failed'); return;
    }
    setRestoration('loading'); setToken(key);
    api<Row>(`/api/forms/records/${encodeURIComponent(id)}`, { headers: key ? { 'X-Draft-Key': key } : {}, signal: controller.signal })
      .then(saved => {
        if (!current()) return;
        if (saved.form_key !== form.key) throw new Error('This saved link belongs to a different form. Open its original page.');
        setRecord(saved); setAnswers(saved.answers || {}); setRestoration('ready');
      })
      .catch(reason => { if (current()) { setError(reason); setRestoration('failed'); } });
  }, [identity, session.dataPath, session.data, session.loading, session.error, savedHash, authVersion]);

  const scoped = lifecycle.current.initialized && lifecycle.current.identity === identity && lifecycle.current.hash === savedHash && !lifecycle.current.pendingAuth && (typeof window === 'undefined' || addressMatches(lifecycle.current.hash));
  const shownRecord = scoped ? record : null, shownAnswers = scoped ? answers : {};

  const ready = scoped && restoration === 'ready' && !configuration.loading && !!configuration.data?.enabled && !configuration.error && !session.loading && !session.error;
  const headers = (key = token): Record<string, string> => key ? { 'X-Draft-Key': key } : {};
  function change(key: string, value: unknown) {
    dirty.current = true; setAnswers(previous => ({ ...previous, [key]: value })); setMessage('');
    setFieldErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
  }
  function showErrors(errors: Record<string, string>) {
    setFieldErrors(errors);
    requestAnimationFrame(() => {
      const first = fields.find(field => errors[field.id]);
      if (first) formElement.current?.querySelector<HTMLElement>(`[name="${first.id}"], [name^="${first.id}-"]`)?.focus();
    });
  }
  async function persist(submit: boolean) {
    if (!ready || submitting.current || !lifecycle.current.initialized || lifecycle.current.pendingAuth || lifecycle.current.identity !== identity || !addressMatches(lifecycle.current.hash) || record?.status === 'submitted') return;
    const checked = validateReferenceAnswers(form, answers, { final: submit });
    if (Object.keys(checked.errors).length) { showErrors(checked.errors); setError(new Error('Check the highlighted information.')); return; }
    const generation = lifecycle.current.generation;
    const currentOperation = () => lifecycle.current.generation === generation && lifecycle.current.initialized && !lifecycle.current.pendingAuth && addressMatches(lifecycle.current.hash);
    submitting.current = true; setBusy(true); setError(undefined); setFieldErrors({}); setMessage('');
    try {
      let current = record, key = token;
      if (!current) {
        // A page visit never creates an empty draft; the first explicit save or send does.
        const created = await api<Row>('/api/forms/records', json('POST', { formKey: form.key, context: {} }));
        if (!currentOperation()) return;
        current = created.record; key = created.token || ''; setRecord(current); setToken(key);
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#saved=${current!.id}${key ? '.' + key : ''}`);
        lifecycle.current.hash = window.location.hash; setSavedHash(window.location.hash);
        window.dispatchEvent(new Event('hashchange'));
      }
      if (submit) {
        const receipt = await api<Row>(`/api/forms/records/${current!.id}/submit`, { ...json('POST', { answers, lockVersion: current!.lock_version }), headers: headers(key) });
        if (!currentOperation()) return;
        setRecord(pendingSubmittedRecord(current!, receipt)); dirty.current = false; setMessage('Your message has been received.');
        const submitted = await loadSubmittedRecord(current!, receipt, () => api<Row>(`/api/forms/records/${current!.id}`, { headers: headers(key) }));
        if (currentOperation()) setRecord(submitted);
      } else {
        const saved = await api<Row>(`/api/forms/records/${current!.id}`, { ...json('PUT', { answers, currentStep: 0, lockVersion: current!.lock_version }), headers: headers(key) });
        if (!currentOperation()) return;
        setRecord({ ...current, ...saved }); dirty.current = false; setMessage('Your message is saved. Keep the private link to return later.');
      }
    } catch (reason) {
      if (!currentOperation()) return;
      setError(reason); if (reason instanceof ApiError) showErrors(reason.fields || {});
    } finally { if (currentOperation()) { submitting.current = false; setBusy(false); } }
  }
  async function copyLink() {
    if (!scoped || !lifecycle.current.initialized || lifecycle.current.pendingAuth || !addressMatches(lifecycle.current.hash)) return;
    const generation = lifecycle.current.generation;
    const current = () => lifecycle.current.generation === generation && addressMatches(lifecycle.current.hash);
    const link = new URL(window.location.href);
    if (savedLocator(lifecycle.current.hash) !== null) link.hash = lifecycle.current.hash;
    try { await navigator.clipboard.writeText(link.href); if (current()) setMessage('Private message link copied. Keep it safe.'); }
    catch { if (current()) setMessage('Copy the private link from your browser address bar.'); }
  }
  return <div className="contact-message-form reference-form">
    <ResourceState {...configuration} retry={configuration.reload} />
    <ResourceState {...session} retry={session.reload} />
    {restoration === 'loading' && <p role="status">Opening your saved message…</p>}
    <Errors error={error instanceof ApiError ? new Error(error.message) : error} />
    {message && <Notice>{message}</Notice>}
    {configuration.data && !configuration.data.enabled ? <Notice>The contact form is being prepared. Please try again later.</Notice> : shownRecord?.status === 'submitted' ? <section className="receipt" role="status">
      <h2>Message received</h2><p>Thank you for contacting the Youth Eco Summit team.</p>
      <p>Reference: <strong>{shownRecord.reference || shownRecord.receipt?.reference}</strong></p>
      {(shownRecord.receipt?.submittedAt || shownRecord.submitted_at) && <p>Submitted: {new Date(shownRecord.receipt?.submittedAt || shownRecord.submitted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>}
      <SubmittedFormAnswers form={form} record={shownRecord} />
      <button type="button" className="secondary" onClick={copyLink}>Copy private message link</button>
    </section> : <>
      <form className="form panel" ref={formElement} onSubmit={event => { event.preventDefault(); void persist(true); }}>
        <fieldset className="reference-fieldset" disabled={!ready || busy}><legend className="sr-only">Send a message</legend>
          {fields.filter(field => isFieldVisible(field, shownAnswers)).map(field => <ReferenceControl key={field.id} field={field.id === 'text-1' ? { ...field, type: 'textarea' } : field} answers={shownAnswers} change={change} formKey={form.key} record={shownRecord || {}} token={token} refresh={async () => {}} error={fieldErrors[field.id]} />)}
        </fieldset>
        {fieldErrors._form && <Notice error>{fieldErrors._form}</Notice>}
        {Object.entries(fieldErrors).filter(([key]) => !fields.some(field => field.id === key) && key !== '_form').map(([key, value]) => <Notice error key={key}>{fieldLabel(form.fields.find(field => field.id === key) || { id: key, type: 'text', field_label: 'Message' }, answers)}: {value}</Notice>)}
        <p className="contact-message-help">You can save your message and return using its private link. No account is required.</p>
        <div className="actions"><button type="submit" disabled={!ready || busy}>{busy ? 'Saving…' : 'Send message'}</button><button type="button" className="secondary" disabled={!ready || busy} onClick={() => void persist(false)}>Save and continue later</button></div>
      </form>
      {shownRecord && <button type="button" className="secondary" onClick={copyLink}>Copy private message link</button>}
    </>}
  </div>;
}
