// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: 'a' }));
const request = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ dirty: (() => false) as () => boolean }));
vi.mock('../src/components/unsaved-navigation', () => ({ useUnsavedNavigation: (dirty: () => boolean) => { navigation.dirty = dirty; } }));
vi.mock('../src/components/api', async original => ({ ...await original<typeof import('../src/components/api')>(), api: request }));
import { ApiError } from '../src/components/api';
import { ContactMessageForm } from '../src/components/contact-message-form';
import { ReferenceFormPage } from '../src/components/reference-form';

let host: HTMLDivElement, root: Root;
const answers = { 'name-3': { 'first-name': 'Asha', 'last-name': 'Singh' }, 'email-1': 'asha@example.test', 'phone-1': '+91 98765 43210', 'text-1': 'First line\nSecond line' };
const draft = { id: 'fixture', form_key: 'legacy-12146', status: 'draft', current_step: 0, lock_version: 0, answers, files: [] };
const receipt = { reference: 'YES-CONTACT-FIXTURE', submittedAt: '2026-11-21T12:00:00Z' };
const submitted = { ...draft, status: 'submitted', receipt, reference: receipt.reference };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
  window.history.replaceState(null, '', '/contact'); request.mockReset();
  request.mockImplementation(async (path: string, options: RequestInit = {}) => {
    if (path === '/api/forms/config') return { enabled: true, accountProvider: 'native' };
    if (path === '/api/auth/session') return { actor: null };
    if (path === '/api/forms/records') return { record: { ...draft, answers: {} }, token: 'private-fixture-key' };
    if (path.endsWith('/submit')) return receipt;
    if (path === '/api/forms/records/fixture') return options.method === 'PUT' ? { ...draft, answers: JSON.parse(String(options.body)).answers, lock_version: 1 } : draft;
    throw new Error('Unexpected request ' + path);
  });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount(strict = false) { await act(async () => root.render(strict ? createElement(StrictMode, null, createElement(ContactMessageForm)) : createElement(ContactMessageForm))); }
async function setField(name: string, value: string) {
  const control = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value); control.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function fill() {
  await setField('name-3-first-name', answers['name-3']['first-name']); await setField('name-3-last-name', answers['name-3']['last-name']);
  await setField('email-1', answers['email-1']); await setField('phone-1', answers['phone-1']); await setField('text-1', answers['text-1']);
}
async function click(label: string) { await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === label)!.click()); }
async function send() { await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }
it('shows editable fields directly, keeps the message optional and creates no draft on a StrictMode visit', async () => {
  await mount(true);
  expect(host.querySelector('input[name=name-3-first-name]')).not.toBeNull(); expect(host.querySelector('input[name=name-3-last-name]')).not.toBeNull();
  expect(host.querySelector('input[name=email-1]')?.hasAttribute('required')).toBe(true); expect(host.querySelector('input[name=phone-1]')?.hasAttribute('required')).toBe(true);
  expect(host.querySelector('textarea[name=text-1]')?.hasAttribute('required')).toBe(false);
  expect(host.querySelector('fieldset')?.disabled).toBe(false); expect(host.querySelectorAll('h1,h3')).toHaveLength(0);
  expect(host.textContent).not.toMatch(/Start form|Step 1|Before you begin/); expect(request.mock.calls.some(call => call[0] === '/api/forms/records')).toBe(false);
});
it('saves all entered data and retains the anonymous private key without duplicate creation', async () => {
  await mount(true); await fill(); expect(navigation.dirty()).toBe(true);
  await click('Save and continue later');
  expect(request.mock.calls.filter(call => call[0] === '/api/forms/records')).toHaveLength(1);
  const saved = request.mock.calls.find(call => call[1]?.method === 'PUT')!;
  expect(JSON.parse(saved[1].body)).toEqual({ answers, currentStep: 0, lockVersion: 0 });
  expect(saved[1].headers).toEqual({ 'X-Draft-Key': 'private-fixture-key' });
  expect(window.location.pathname).toBe('/contact'); expect(window.location.hash).toBe('#saved=fixture.private-fixture-key'); expect(navigation.dirty()).toBe(false);
  expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(answers['text-1']);
  await click('Save and continue later'); expect(request.mock.calls.filter(call => call[0] === '/api/forms/records')).toHaveLength(1);
});
it('submits through the existing API and shows the complete received message without an account link', async () => {
  const implementation = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options?: RequestInit) => path === '/api/forms/records/fixture' && !options?.method ? submitted : implementation(path, options));
  await mount(); await fill(); await send();
  const sent = request.mock.calls.find(call => call[0].endsWith('/submit'))!;
  expect(JSON.parse(sent[1].body)).toEqual({ answers, lockVersion: 0 }); expect(sent[1].headers).toEqual({ 'X-Draft-Key': 'private-fixture-key' });
  expect(host.textContent).toContain('Message received'); expect(host.textContent).toContain(receipt.reference); expect(host.textContent).toContain('asha@example.test'); expect(host.textContent).toContain('First line'); expect(host.textContent).not.toContain('View your account'); expect(host.querySelector('form')).toBeNull(); expect(navigation.dirty()).toBe(false);
});
it('keeps the immediate receipt if submitted-information readback fails', async () => {
  const implementation = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === '/api/forms/records/fixture' && !options?.method) throw new Error('Readback unavailable');
    return implementation(path, options);
  });
  await mount(); await fill(); await send();
  expect(host.textContent).toContain('Message received'); expect(host.textContent).toContain(receipt.reference); expect(host.textContent).toContain('Reload this page'); expect(host.querySelector('form')).toBeNull(); expect(host.textContent).not.toContain('Readback unavailable');
});
it.each(['draft', 'submitted'])('restores an existing %s message with its private key', async status => {
  window.history.replaceState(null, '', '/contact#saved=fixture.existing-private-key');
  const implementation = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options?: RequestInit) => path === '/api/forms/records/fixture' ? status === 'submitted' ? submitted : draft : implementation(path, options));
  await mount();
  expect(request.mock.calls.find(call => call[0] === '/api/forms/records/fixture')?.[1].headers).toEqual({ 'X-Draft-Key': 'existing-private-key' });
  expect(request.mock.calls.some(call => call[0] === '/api/forms/records')).toBe(false);
  if (status === 'draft') { expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value).toBe(answers['email-1']); expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(answers['text-1']); }
  else { expect(host.textContent).toContain('Message received'); expect(host.textContent).toContain(answers['email-1']); }
});
it.each(['invalid', 'unavailable', 'mismatch', 'session'])('fails closed for a %s saved message or session', async failure => {
  window.history.replaceState(null, '', failure === 'invalid' ? '/contact#saved=' : '/contact#saved=fixture.private-key');
  const implementation = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options?: RequestInit) => {
    if (failure === 'session' && path === '/api/auth/session') throw new Error('Session lookup failed.');
    if (path === '/api/forms/records/fixture') { if (failure === 'mismatch') return { ...draft, form_key: 'partner' }; throw new ApiError('This saved message is unavailable.', undefined, 404); }
    return implementation(path, options);
  });
  await mount(); await send(); await click('Save and continue later');
  expect(host.querySelector('fieldset')?.disabled).toBe(true); expect(request.mock.calls.some(call => call[0] === '/api/forms/records' || call[1]?.method === 'PUT' || call[0].endsWith('/submit'))).toBe(false);
  expect(window.location.hash).toBe(failure === 'invalid' ? '#saved=' : '#saved=fixture.private-key');
});
it('validates before creating and shows human-readable API field errors without losing input', async () => {
  await mount(); await send(); expect(request.mock.calls.some(call => call[0] === '/api/forms/records')).toBe(false); expect(host.textContent).toContain('Last Name is required.');
  await fill();
  const implementation = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options?: RequestInit) => { if (path.endsWith('/submit')) throw new ApiError('Check the highlighted information.', { 'email-1': 'Enter a valid email address.' }, 422); return implementation(path, options); });
  await send(); expect(host.textContent).toContain('Enter a valid email address.'); expect(host.textContent).not.toContain('email-1:'); expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value).toBe(answers['email-1']); expect(navigation.dirty()).toBe(true);
});
it('keeps the existing start screen for generic contact, partner and nomination routes', async () => {
  for (const formKey of ['legacy-12146', 'partner', 'nomination']) {
    await act(async () => root.render(createElement(ReferenceFormPage, { formKey, key: formKey })));
    expect(host.textContent).toContain('Start form'); expect(host.querySelector('form')).toBeNull();
  }
});

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
it.each(['create', 'save', 'submit', 'readback'])('discards a deferred %s result after an account change or logout', async phase => {
  const delayed = deferred<any>(); let actor: any = { id: 'first-account', role: 'participant' }, reads = 0;
  if (phase !== 'create') window.history.replaceState(null, '', '/contact#saved=fixture.private-key');
  const implementation = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options: RequestInit = {}) => {
    if (path === '/api/auth/session') return { actor };
    if (phase === 'create' && path === '/api/forms/records') return delayed.promise;
    if (phase === 'save' && options.method === 'PUT') return delayed.promise;
    if (phase === 'submit' && path.endsWith('/submit')) return delayed.promise;
    if (path === '/api/forms/records/fixture' && !options.method) {
      reads++; if (phase === 'readback' && reads === 2) return delayed.promise;
      if (actor?.id !== 'first-account') throw new ApiError('This message belongs to the previous account.', undefined, 404);
      return draft;
    }
    return implementation(path, options);
  });
  await mount(); if (phase === 'create') await fill();
  if (phase === 'save') await click('Save and continue later'); else await send();
  actor = phase === 'save' || phase === 'readback' ? null : { id: 'second-account', role: 'participant' };
  await act(async () => { window.dispatchEvent(new Event('yes-auth-changed')); });
  const afterSwitchHash = window.location.hash;
  await act(async () => delayed.resolve(phase === 'create' ? { record: draft, token: 'old-private-key' } : phase === 'save' ? draft : phase === 'submit' ? receipt : submitted));
  expect(window.location.hash).toBe(afterSwitchHash);
  expect(host.textContent).not.toContain(answers['email-1']); expect(host.textContent).not.toContain(receipt.reference);
  expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value || '').toBe('');
  if (phase !== 'create') expect(host.querySelector('fieldset')?.disabled).toBe(true);
});
it('restores a newly selected private link and clears old data when the next link is invalid', async () => {
  window.history.replaceState(null, '', '/contact#saved=fixture.first-key');
  const implementation = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options?: RequestInit) => path === '/api/forms/records/second' ? { ...draft, id: 'second', answers: { ...answers, 'email-1': 'second@example.test' } } : implementation(path, options));
  await mount(); expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value).toBe(answers['email-1']);
  await act(async () => { window.history.pushState(null, '', '/contact#saved=second.second-key'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value).toBe('second@example.test');
  await click('Save and continue later');
  expect(request.mock.calls.find(call => call[1]?.method === 'PUT')?.[0]).toBe('/api/forms/records/second');
  await act(async () => { window.history.replaceState(null, '', '/contact#saved='); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value).toBe(''); expect(host.querySelector('fieldset')?.disabled).toBe(true); expect(host.textContent).toContain('link is invalid');
  expect(request.mock.calls.some(call => call[0] === '/api/forms/records')).toBe(false);
});
it('ignores an old saved-link read after navigating to another private message', async () => {
  const delayed = deferred<any>(); window.history.replaceState(null, '', '/contact#saved=fixture.first-key');
  const implementation = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options?: RequestInit) => path === '/api/forms/records/fixture' ? delayed.promise : path === '/api/forms/records/second' ? { ...draft, id: 'second', answers: { ...answers, 'email-1': 'second@example.test' } } : implementation(path, options));
  await mount();
  await act(async () => { window.history.pushState(null, '', '/contact#saved=second.second-key'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await act(async () => delayed.resolve(draft));
  expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value).toBe('second@example.test'); expect(window.location.hash).toBe('#saved=second.second-key');
});

it('invalidates a mutation in the same event turn as an account change', async () => {
  const delayed = deferred<any>(); let actor: any = { id: 'first-account', role: 'participant' };
  const implementation = request.getMockImplementation()!;
  request.mockImplementation(async (path: string, options?: RequestInit) => path === '/api/auth/session' ? { actor } : path === '/api/forms/records' ? delayed.promise : implementation(path, options));
  await mount(); await fill(); await send();
  await act(async () => {
    actor = null; window.dispatchEvent(new Event('yes-auth-changed'));
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    delayed.resolve({ record: draft, token: 'previous-account-key' });
  });
  expect(window.location.hash).toBe(''); expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value).toBe('');
  expect(request.mock.calls.filter(call => call[0] === '/api/forms/records')).toHaveLength(1);
  expect(request.mock.calls.some(call => call[0].endsWith('/submit'))).toBe(false); expect(host.textContent).not.toContain('Message received');
});

it('keeps typed unsaved answers when Skip to content changes only the page anchor', async () => {
  await mount(); await fill();
  await act(async () => { window.history.pushState(null, '', '/contact#main'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value).toBe(answers['email-1']); expect(navigation.dirty()).toBe(true);
  await click('Save and continue later');
  const saved = request.mock.calls.find(call => call[1]?.method === 'PUT')!;
  expect(JSON.parse(saved[1].body).answers).toEqual(answers); expect(window.location.hash).toBe('#saved=fixture.private-fixture-key');
});
it('keeps a saved message and copies its private locator after Back to top changes the anchor', async () => {
  const copied = vi.fn(async (_value: string) => {}); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copied } });
  window.history.replaceState(null, '', '/contact#saved=fixture.existing-private-key'); await mount();
  await act(async () => { window.history.pushState(null, '', '/contact#main'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(host.querySelector<HTMLInputElement>('[name=email-1]')?.value).toBe(answers['email-1']);
  await click('Copy private message link'); expect(copied.mock.calls[0][0]).toContain('/contact#saved=fixture.existing-private-key');
  await click('Save and continue later'); expect(request.mock.calls.find(call => call[1]?.method === 'PUT')?.[1].headers).toEqual({ 'X-Draft-Key': 'existing-private-key' });
});
