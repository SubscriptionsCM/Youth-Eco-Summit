// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('../src/components/unsaved-navigation', () => ({ useUnsavedNavigation: () => {} }));
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/components/api', async original => ({ ...await original<typeof import('../src/components/api')>(), api: request }));
import { ReferenceFormPage } from '../src/components/reference-form';
import { SchoolAutocomplete, SchoolsPage } from '../src/components/registration';
import { StudentWizard } from '../src/components/registration-wizard';
import { schoolNominationHref, studentRegistrationReturnPath } from '../src/components/school-nomination-navigation';

let host: HTMLDivElement, root: Root;
const actor = { id: 'student-fixture', role: 'participant', participantKind: 'student', contact: 'fixture@example.test' };
const record = { id: 'student-draft', form_key: 'student', status: 'draft', current_step: 0, lock_version: 2, answers: { 'text-1': 'Saved student name' }, files: [] };
beforeEach(() => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
 request.mockReset(); window.history.replaceState(null, '', '/register?competitionId=fixture#saved=student-draft.private-key');
 host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const nominate = () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Nominate your school')!;
function mockReference(save: (options: RequestInit) => unknown = () => ({ lock_version: 3 })) {
 request.mockImplementation(async (path: string, options?: RequestInit) => {
  if (path === '/api/forms/config') return { enabled: true };
  if (path === '/api/auth/session') return { actor };
  if (path === '/api/forms/records/student-draft') return options?.method === 'PUT' ? save(options) : record;
  if (path.startsWith('/api/public/schools?')) return { items: [], total: 0 };
  throw new Error('Unexpected request ' + path);
 });
}

it('preserves only student registration destinations and their private saved context', () => {
 for (const path of ['/register?competitionId=one#saved=student.private', '/forms/student#saved=student.private']) {
  expect(studentRegistrationReturnPath(path)).toBe(path);
  expect(new URL(schoolNominationHref(path), 'https://local.test').searchParams.get('returnTo')).toBe(path);
 }
 for (const path of ['https://outside.test/register', '//outside.test/register', '/%2foutside.test/register', '/\\outside.test/register', '/admin', '/schools/register', '/forms/teacher', '/forms/painting', '/competitions/enter?submitter=student', '/register/other', null]) {
  expect(studentRegistrationReturnPath(path)).toBeNull(); expect(schoolNominationHref(path)).toBe('/schools/nominate');
 }
});
it('keeps a real nomination button available before searching and after zero results', async () => {
 request.mockResolvedValue({ items: [], total: 0 }); vi.useFakeTimers();
 await act(async () => root.render(createElement(SchoolAutocomplete, { onSelect: vi.fn() })));
 expect(nominate()?.type).toBe('button'); expect(host.querySelector('a[href="/schools/register"]')).toBeNull();
 const input = host.querySelector<HTMLInputElement>('[role=combobox]')!;
 await act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Missing School');
  input.dispatchEvent(new Event('input', { bubbles: true }));
 });
 await act(async () => { await vi.advanceTimersByTimeAsync(300); });
 expect(host.textContent).toContain('0 matching schools'); expect(nominate()?.type).toBe('button');
 const focused = host.querySelector<HTMLInputElement>('[role=combobox]')!; await act(async () => focused.focus()); expect(document.activeElement).toBe(focused);
});
it('saves the student draft before navigating to the canonical nomination with its saved link', async () => {
 const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {}); let finish!: (value: unknown) => void;
 mockReference(() => new Promise(resolve => { finish = resolve; }));
 await act(async () => root.render(createElement(ReferenceFormPage, { formKey: 'student' })));
 expect(host.querySelector('a[href="/schools/register"]')).toBeNull();
 await act(async () => nominate().click()); expect(assign).not.toHaveBeenCalled();
 const saved = request.mock.calls.find(call => call[1]?.method === 'PUT')!;
 expect(saved[1].headers).toEqual({ 'X-Draft-Key': 'private-key' });
 expect(JSON.parse(saved[1].body)).toMatchObject({ answers: record.answers, currentStep: 0, lockVersion: 2 });
 await act(async () => finish({ lock_version: 3 }));
 expect(assign).toHaveBeenCalledOnce();
 expect(new URL(assign.mock.calls[0][0] as string, 'https://local.test').searchParams.get('returnTo')).toBe('/register?competitionId=fixture#saved=student-draft.private-key');
 expect(request.mock.calls.some(call => String(call[0]).endsWith('/submit'))).toBe(false);
});
it('keeps the student and all answers on the page when saving before nomination fails', async () => {
 const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
 mockReference(() => { throw new Error('The draft could not be saved. Try again.'); });
 await act(async () => root.render(createElement(ReferenceFormPage, { formKey: 'student' })));
 await act(async () => nominate().click());
 expect(assign).not.toHaveBeenCalled(); expect(host.textContent).toContain('The draft could not be saved');
 expect(host.querySelector<HTMLInputElement>('[name=text-1]')?.value).toBe('Saved student name'); expect(nominate().disabled).toBe(false);
});
it('saves the legacy student wizard without offering school registration or completing the student record', async () => {
 const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
 const edition = { id: 'edition', label: 'Fixture edition', state: 'open', registration_opens: '2020-01-01', registration_closes: '2099-01-01', config: { registrationApproved: true, consentText: 'Fixture consent', consentVersion: 'fixture' } };
 request.mockImplementation(async (path: string, options?: RequestInit) => {
  if (path === '/api/public/config') return { editions: [edition], competitions: [], content: [] };
  if (path === '/api/participant') return { students: [] };
  if (path.startsWith('/api/registration-drafts?')) return { items: [{ id: 'legacy-draft', payload: { name: 'Legacy student' }, current_step: 0, lock_version: 1 }] };
  if (path === '/api/registration-drafts' && options?.method === 'PUT') return { id: 'legacy-draft', payload: { name: 'Legacy student' }, current_step: 0, lock_version: 2 };
  if (path.startsWith('/api/public/schools?')) return { items: [], total: 0 };
  throw new Error('Unexpected request ' + path);
 });
 await act(async () => root.render(createElement(StudentWizard, { actor })));
 expect(host.querySelector('a[href="/schools/register"]')).toBeNull(); await act(async () => nominate().click());
 expect(request.mock.calls.some(call => call[0] === '/api/registration-drafts' && call[1]?.method === 'PUT')).toBe(true);
 expect(assign).toHaveBeenCalledOnce(); expect(request.mock.calls.some(call => String(call[0]).endsWith('/complete'))).toBe(false);
});
it('routes the public directory to the working nomination form while hiding school registration from students', async () => {
 request.mockImplementation(async (path: string) => path === '/api/auth/session' ? { actor } : { items: [], total: 0 });
 await act(async () => root.render(createElement(SchoolsPage)));
 expect(host.querySelector('a[href="/schools/nominate"]')?.textContent).toBe('Nominate your school');
 expect(host.querySelector('a[href="/schools/register"]')).toBeNull(); expect(host.querySelector('[name=nominatorContact]')).toBeNull();
 expect(request.mock.calls.some(call => call[0] === '/api/public/config')).toBe(false);
});
it('waits for the account before offering school registration and keeps judge actions role-specific', async () => {
 let resolveSession!: (value: unknown) => void;
 request.mockImplementation(async (path: string) => path === '/api/auth/session' ? new Promise(resolve => { resolveSession = resolve; }) : { items: [], total: 0 });
 await act(async () => root.render(createElement(SchoolsPage)));
 expect(host.querySelector('a[href="/schools/register"]')).toBeNull();
 await act(async () => resolveSession({ actor: { id: 'judge-fixture', role: 'judge' } }));
 expect(host.querySelector('a[href="/schools/register"]')).toBeNull(); expect(host.querySelector('a[href="/schools/nominate"]')).toBeNull();
});
it('shows the native school contact fields, conditional designation, optional nominator and clear submit action', async () => {
 window.history.replaceState(null, '', '/schools/nominate#saved=nomination.private');
 request.mockImplementation(async (path: string) => {
  if (path === '/api/forms/config') return { enabled: true };
  if (path === '/api/auth/session') return { actor: null };
  return { id: 'nomination', form_key: 'nomination', status: 'draft', current_step: 0, lock_version: 0, answers: { 'select-2': 'Other' }, files: [] };
 });
 await act(async () => root.render(createElement(ReferenceFormPage, { formKey: 'nomination' })));
 const input = (name: string) => host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
 expect(input('select-1').type).toBe('text'); expect(input('select-1').required).toBe(true); expect(input('select-1').maxLength).toBe(200);
 expect(input('name-2').required).toBe(true); expect(input('name-2').maxLength).toBe(160);
 expect(input('text-2').required).toBe(true); expect(input('text-2').maxLength).toBe(100);
 expect(input('email-2').maxLength).toBe(254); expect(input('email-2').required).toBe(false); expect(input('phone-2').required).toBe(false);
 for (const name of ['name-1', 'email-1', 'phone-1']) expect(input(name).required).toBe(false);
 expect(host.textContent).toContain('Provide at least one school contact email or phone');
 expect([...host.querySelectorAll('button')].some(button => button.textContent === 'Submit nomination')).toBe(true);
 expect(host.querySelector('[list]')).toBeNull(); expect(host.querySelector('a[href="/schools/register"]')).toBeNull();
});
it('restores and saves the actual school from a legacy Other-school nomination draft', async () => {
 window.history.replaceState(null, '', '/schools/nominate#saved=nomination.private');
 const legacyAnswers = { 'select-1': 'Others', 'text-1': 'Actual School', 'email-1': 'legacy@example.test' };
 request.mockImplementation(async (path: string, options?: RequestInit) => {
  if (path === '/api/forms/config') return { enabled: true };
  if (path === '/api/auth/session') return { actor: null };
  if (path === '/api/forms/records/nomination') return { id: 'nomination', form_key: 'nomination', status: 'draft', current_step: 0, lock_version: options?.method === 'PUT' ? 1 : 0, answers: options?.method === 'PUT' ? { 'select-1': 'Actual School', 'email-1': 'legacy@example.test' } : legacyAnswers, files: [] };
  throw new Error('Unexpected request ' + path);
 });
 await act(async () => root.render(createElement(ReferenceFormPage, { formKey: 'nomination' })));
 expect(host.querySelector<HTMLInputElement>('[name="select-1"]')?.value).toBe('Actual School');
 expect(host.querySelector<HTMLInputElement>('[name="email-1"]')?.value).toBe('legacy@example.test');
 await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Save and continue later')!.click());
 const saved = request.mock.calls.find(call => call[1]?.method === 'PUT')!;
 expect(JSON.parse(saved[1].body).answers).toEqual({ ...legacyAnswers, 'select-1': 'Actual School' });
 expect(host.querySelector<HTMLInputElement>('[name="select-1"]')?.value).toBe('Actual School');
 expect(host.textContent).toContain('Your progress is saved.');
 expect(request.mock.calls.some(call => String(call[0]).endsWith('/submit'))).toBe(false);
});
it.each(['/register?competitionId=fixture#saved=student-draft.private-key', 'https://outside.test/register', '/admin', ''])('shows an honest nomination receipt and a safe return for %s', async returnTo => {
 window.history.replaceState(null, '', `/schools/nominate?${new URLSearchParams({ returnTo })}#saved=nomination.private`);
 request.mockImplementation(async (path: string) => {
  if (path === '/api/forms/config') return { enabled: true };
  if (path === '/api/auth/session') return { actor: null };
  return { id: 'nomination', form_key: 'nomination', status: 'submitted', reference: 'NOM-FIXTURE', answers: {}, current_step: 0, files: [], submitted_at: '2026-11-21T00:00:00Z', receipt: { schoolStatus: 'pending' }, current_school_status: 'active' };
 });
 await act(async () => root.render(createElement(ReferenceFormPage, { formKey: 'nomination' })));
 expect(host.querySelector('h2')?.textContent).toBe('Nomination received'); expect(host.textContent).toContain('contact the school representative');
 expect(host.textContent).toContain('does not register the school or enable participation'); expect(host.textContent).not.toContain('registration is approved');
 const link = host.querySelector<HTMLAnchorElement>('.receipt a.button')!;
 expect(link.getAttribute('href')).toBe(studentRegistrationReturnPath(returnTo) || '/register');
 expect(link.textContent).toBe(studentRegistrationReturnPath(returnTo) ? 'Return to student registration' : 'Back to student registration');
});
