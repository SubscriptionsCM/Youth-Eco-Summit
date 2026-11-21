'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, json, type Row } from './api';
import { Errors, Field, Notice, PageTitle, ResourceState, useResource } from './shared';
import { afterLoginPath, loginAudienceFromSearch, safeReturnPath, signedOutPath } from './auth-navigation';
import { EmailAccount, LoginErrors } from './email-account';
import { loginAudienceLabels, type LoginAudience } from '../domain/login-audience';

export function LoginPage({ provider: fixedProvider }: { provider?: 'supabase'|'wordpress'|'native' } = {}) {
  const configuration = useResource<Row>('/api/forms/config');
  const [audience, setAudience] = useState<LoginAudience>('student'), [contact, setContact] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [cooldown, setCooldown] = useState(0);
  const [destination, setDestination] = useState<string | null>(null);
  const staff = audience === 'admin';
  const registrationForm = audience === 'educator' ? 'teacher' : audience === 'school' ? 'school' : 'student';
  useEffect(() => { setDestination(safeReturnPath(new URLSearchParams(window.location.search).get('next'))); setAudience(loginAudienceFromSearch(window.location.search)); }, []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  function changeAudience(next:LoginAudience) {
    setAudience(next); setSent(false); setCooldown(0); setError(null);
    const parameters=new URLSearchParams(window.location.search),destination=safeReturnPath(parameters.get('next'));
    parameters.set('type',next);
    if(destination)parameters.set('next',destination);else parameters.delete('next');
    window.history.replaceState(window.history.state,'',`${window.location.pathname}?${parameters}${window.location.hash}`);
  }
  async function requestCode() { setBusy(true); setError(null); try { const result = await api<Row>('/api/auth/otp/request', json('POST', { contact })); setSent(true); setCooldown(result.retryAfter || 60); } catch (e) { setError(e); } finally { setBusy(false); } }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!staff && !sent) return requestCode(); setBusy(true); setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try { const response = await api<Row>(staff ? '/api/auth/login' : '/api/auth/otp/verify', json('POST', { ...form, contact, ...staff ? {loginAudience:'admin'} : {} })); const actor = response.actor || response; window.location.assign(afterLoginPath(actor.role, destination, actor.participantKind)); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  async function emailSignedIn() {
    const response = await api<Row>('/api/auth/session');
    if (!response.actor?.role) throw new Error('Your sign-in could not be confirmed. Please sign in again.');
    window.location.assign(afterLoginPath(response.actor.role, destination, response.actor.participantKind));
  }
  return <>
    <PageTitle title={`${loginAudienceLabels[audience]} sign in`}>{loginPurposes[audience]}</PageTitle>
    <div className="actions login-role-switch" role="group" aria-label="Choose your account type">{(Object.keys(loginAudienceLabels) as LoginAudience[]).map(type=><button key={type} type="button" aria-pressed={audience===type} disabled={busy} onClick={()=>changeAudience(type)}>{loginAudienceLabels[type]}</button>)}</div>
    {!staff && !fixedProvider && (configuration.loading || configuration.error) ? <ResourceState {...configuration} retry={configuration.reload} /> : !staff && (fixedProvider || configuration.data?.emailAccounts === true) ? <EmailAccount key={audience} provider={fixedProvider || (configuration.data?.accountProvider === 'wordpress' ? 'wordpress' : configuration.data?.accountProvider === 'supabase' ? 'supabase' : 'native')} registrationForm={registrationForm} loginAudience={audience} initialIdentifier={contact} onIdentifierChange={setContact} onAudienceChange={changeAudience} onBusyChange={setBusy} onSignedIn={emailSignedIn} /> : <form key={audience} className="form panel" onSubmit={submit}>
      <h2>{staff ? 'Your admin or judge account' : `Your ${loginAudienceLabels[audience].toLowerCase()} account`}</h2>
      <LoginErrors error={error} onAudienceChange={changeAudience} />
      <Field name="contact" title={staff ? 'Staff email or username' : 'Verified contact phone'} type={staff ? 'text' : 'tel'} required value={contact} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setContact(e.target.value); setSent(false); }} autoComplete={staff ? 'username' : 'tel'} hint={staff ? 'Use your staff email address or the username on your invitation.' : 'Include the country code, for example +91.'} />
      {staff ? <><Field name="password" title="Password" type="password" required autoComplete="current-password" /><Link href="/recover">Recover admin or judge access</Link></> : sent && <><Notice>A verification code has been sent. It expires in 5 minutes.</Notice><Field name="code" title="Verification code" required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" /><button type="button" className="secondary" disabled={busy || cooldown > 0} onClick={requestCode}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</button></>}
      <div className="actions"><button disabled={busy}>{busy ? 'Please wait…' : staff || sent ? 'Sign in' : 'Send verification code'}</button></div>
    </form>}
  </>;
}
const loginPurposes:Record<LoginAudience,string> = {
  student:'Access your student registrations, competition entries, drafts and receipts.',
  educator:'Manage student participation and return to your educator registrations and entries.',
  school:'Manage your school registration and approved school workspace.',
  admin:'Use your invitation account to administer the summit or review assigned entries.'
};
export function AccountSetup({ recovery = false }: { recovery?: boolean }) {
  const [token, setToken] = useState(''), [setup, setSetup] = useState<Row | null>(null), [error, setError] = useState<unknown>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get('token') || ''); }, []);
  async function begin() { setBusy(true); setError(null); try { setSetup(await api('/api/auth/invitation/setup', json('POST', { token }))); } catch (e) { setError(e); } finally { setBusy(false); } }
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(null); try { const data = Object.fromEntries(new FormData(e.currentTarget)); if ((!recovery || token) && data.password !== data.confirmPassword) throw new Error('The passwords must match.'); const path = recovery ? token ? 'recovery/complete' : 'recovery/request' : 'invitation/accept'; const result = await api<Row>(`/api/auth/${path}`, json('POST', { ...data, token })); setMessage(!recovery ? `Your account is ready. Sign in with your ${setup?.staffUsername ? 'email or username' : 'email'} and password.` : result.message || (token ? 'Account updated. You can now sign in.' : 'If the account is eligible, recovery instructions will be sent.')); } catch (e) { setError(e); } finally { setBusy(false); } }
  return <><PageTitle title={recovery ? 'Recover account access' : 'Set up your account'}>{!recovery && 'Create a password to activate your staff or judge account.'}</PageTitle><Errors error={error} />{!recovery && setup?.staffUsername && <Notice>Your staff username is <strong>{setup.staffUsername}</strong>. You can also sign in with {setup.contact}. Keep this email address for account recovery.</Notice>}{message ? <Notice>{message} <Link href={recovery ? '/login' : signedOutPath(setup?.role || 'judge')}>Sign in</Link></Notice> : !recovery && !setup ? <div className="panel"><p>Choose a password for your staff or judge account. You can sign in with your email or, if provided, the staff username on your invitation.</p><button disabled={busy || !token} onClick={begin}>{busy ? 'Loading…' : 'Begin setup'}</button>{!token && <p>Open the private invitation link sent to your email to begin.</p>}</div> : <form className={`form ${!recovery ? 'account-setup-form' : ''}`} onSubmit={submit}>{recovery && !token ? <Field name="contact" title="Staff email" type="email" required /> : <><section className={!recovery ? 'account-setup-step' : undefined}>{!recovery&&<h2>Create your password</h2>}<Field name="password" title="New password" type="password" required minLength={12} autoComplete="new-password" hint="Use at least 12 characters. You will use this password when you sign in." /></section><Field name="confirmPassword" title="Confirm new password" type="password" required minLength={12} autoComplete="new-password" hint="Enter the same password again." /></>}<button disabled={busy}>{busy ? 'Saving…' : recovery ? !token ? 'Send recovery instructions' : 'Save new password' : 'Create my account'}</button></form>}</>;
}
