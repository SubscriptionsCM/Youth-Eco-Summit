import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../src/server/auth';
import { AppError } from '../src/server/core';
import { archiveWordPress } from '../src/server/wordpress-migration';
import { historicalEntries } from '../src/server/wordpress-projection';
import { testDb } from './helpers/db';
import type { Db } from '../src/server/db';
import { EmailAccount } from '../src/components/email-account';
import { createWordPressBridge } from '../src/server/wordpress-auth';
import path from 'node:path';

const subprocess = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: subprocess.execFile }));

describe('private WordPress participant authentication', () => {
  let fixture: Awaited<ReturnType<typeof testDb>>;
  let auth: ReturnType<typeof createAuth>;
  const origin = 'http://localhost:3000';
  const source = 'https://wordpress.example.org';
  const identity = { source, sourceUserId: '123', email: 'participant@example.org', username: 'participant', name: 'Synthetic participant', credentialFingerprint: 'a'.repeat(64) };
  const bridge = { call: vi.fn() };
  let deliveredCode = '';
  const request = (path: string, input: unknown = {}, cookie?: string) => new Request(`${origin}/api/auth/${path}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(input),
  });
  const action = (path: string, input: unknown = {}, cookie?: string) => auth.authAction(request(path, input, cookie), ['auth', ...path.split('/')]);
  const login = () => action('participant/login', { contact: 'participant', password: 'private test passphrase' });
  beforeEach(async () => {
    fixture = await testDb();
    vi.stubEnv('AUTH_PARTICIPANT_PROVIDER', 'wordpress');
    vi.stubEnv('WORDPRESS_ORIGIN', source);
    bridge.call.mockReset().mockResolvedValue(identity);
    deliveredCode = '';
    auth = createAuth(fixture.db, { secret: 'wordpress-test-secret-at-least-32-characters', origin, secureCookies: false, wordpressBridge: bridge,
      sendEmail: async (_to, _subject, body) => { deliveredCode = body.match(/\b\d{6}\b/)?.[0] ?? ''; },
    });
  });
  afterEach(async () => { await fixture?.close(); vi.unstubAllEnvs(); });

  it('authenticates a source username and binds a participant without storing credentials', async () => {
    const response = await login();
    expect(response?.status).toBe(200);
    const { data } = await response!.json();
    expect(data.actor).toMatchObject({ role: 'participant', contact: identity.email });
    expect(bridge.call).toHaveBeenCalledWith('login', { contact: 'participant', password: 'private test passphrase' });
    expect(response!.headers.get('set-cookie')).toContain('HttpOnly');
    const user = (await fixture.db.query('SELECT * FROM users')).rows[0];
    expect(user.role).toBe('participant');
    expect(user.password_hash).toBeNull();
    expect(user.totp_secret).toBeNull();
    expect(JSON.stringify((await fixture.db.query('SELECT * FROM wordpress_account_identities')).rows)).not.toContain('private test passphrase');
    expect((await fixture.db.query('SELECT * FROM supabase_identities')).rows).toHaveLength(0);
  });

  it('retries login idempotently using source identity', async () => {
    const first = await login(), second = await login();
    expect(first?.status).toBe(200);
    expect(second?.status).toBe(200);
    expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(1);
    expect((await fixture.db.query('SELECT * FROM wordpress_account_identities')).rows).toHaveLength(1);
  });

  it('rejects an existing local contact instead of merging or upgrading its role', async () => {
    await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner',$2)", [randomUUID(), identity.email]);
    expect((await login())?.status).toBe(409);
    expect((await fixture.db.query('SELECT role FROM users')).rows).toEqual([{ role: 'owner' }]);
    expect((await fixture.db.query('SELECT * FROM wordpress_account_identities')).rows).toHaveLength(0);
  });

  it('verifies source status on every session read and revokes old sessions after credential changes', async () => {
    const response = await login();
    expect(response?.status).toBe(200);
    const cookie = response!.headers.get('set-cookie')!;
    expect(await auth.getActor(request('session', {}, cookie))).toMatchObject({ role: 'participant' });
    expect(bridge.call).toHaveBeenLastCalledWith('status', { sourceUserId: '123' });
    bridge.call.mockResolvedValue({ ...identity, credentialFingerprint: 'b'.repeat(64) });
    expect(await auth.getActor(request('session', {}, cookie))).toBeNull();
    expect((await fixture.db.query('SELECT revoked_at FROM auth_sessions')).rows.every(row => row.revoked_at)).toBe(true);
    const renewed = await login();
    expect(renewed?.status).toBe(200);
    expect(await auth.getActor(request('session', {}, cookie))).toBeNull();
    expect(await auth.getActor(request('session', {}, renewed!.headers.get('set-cookie')!))).toMatchObject({ role: 'participant' });
  });

  it('fails closed for blocked source accounts and unavailable source status', async () => {
    const response = await login();
    expect(response?.status).toBe(200);
    const cookie = response!.headers.get('set-cookie')!;
    bridge.call.mockRejectedValue(new AppError(503, 'private provider diagnostics'));
    expect(await auth.getActor(request('session', {}, cookie))).toBeNull();
    bridge.call.mockRejectedValue(new AppError(401, 'Source account unavailable'));
    expect(await auth.getActor(request('session', {}, cookie))).toBeNull();
    expect((await fixture.db.query('SELECT revoked_at FROM auth_sessions')).rows.every(row => row.revoked_at)).toBe(true);
  });

  it('does not authorize a cookie revoked while its source status check is in flight', async () => {
    const response = await login();
    expect(response?.status).toBe(200);
    const cookie = response!.headers.get('set-cookie')!;
    let release!: (value: unknown) => void;
    let started!: () => void;
    const checking = new Promise<void>(resolve => { started = resolve; });
    bridge.call.mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
    const actor = auth.getActor(request('session', {}, cookie));
    await checking;
    expect((await action('logout', {}, cookie))?.status).toBe(200);
    release(identity);
    expect(await actor).toBeNull();
  });

  it('rejects changed source emails and additional privileged provider fields', async () => {
    expect((await login())?.status).toBe(200);
    bridge.call.mockResolvedValue({ ...identity, email: 'changed@example.org' });
    expect((await login())?.status).toBe(409);
    bridge.call.mockResolvedValue({ ...identity, role: 'owner', user_pass: 'private-source-hash' });
    const response = await login();
    expect(response?.status).toBe(503);
    expect(await response!.text()).not.toMatch(/private-source-hash|user_pass|owner/);
    expect((await fixture.db.query('SELECT role FROM users')).rows).toEqual([{ role: 'participant' }]);
  });

  it('redacts unexpected provider exceptions without persisting a claim', async () => {
    bridge.call.mockRejectedValue(new Error('private password and subprocess stderr'));
    const response = await login();
    expect(response?.status).toBe(503);
    expect(await response!.text()).not.toMatch(/private password|subprocess stderr/);
    expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(0);
  });

  it('uses native recovery with a generic link confirmation and no local recovery code', async () => {
    bridge.call.mockResolvedValue({ sent: true });
    const response = await action('participant/recovery/request', { contact: 'participant' });
    expect(response?.status).toBe(200);
    expect(await response!.json()).toMatchObject({ data: { sent: true, recovery: 'link' } });
    expect(bridge.call).toHaveBeenCalledWith('recovery', { contact: 'participant' });
    expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(0);
  });

  it('issues a bound hashed registration challenge without retaining passwords or creating accounts', async () => {
    const response = await action('participant/signup', { contact: 'new@example.org', username: 'new-participant', formKey: 'student' });
    expect(response?.status).toBe(200);
    expect(deliveredCode).toMatch(/^\d{6}$/);
    expect(response!.headers.get('set-cookie')).toContain('HttpOnly');
    const challenge = (await fixture.db.query('SELECT * FROM wordpress_registration_challenges')).rows[0];
    expect(challenge.code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.code_hash).not.toBe(deliveredCode);
    expect(challenge).not.toHaveProperty('password');
    expect(bridge.call).not.toHaveBeenCalled();
    expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(0);
  });

  it('enforces the email resend interval across different browsers and registration forms', async () => {
    const profile = { contact: 'new@example.org', username: 'new-participant', formKey: 'student' };
    expect((await action('participant/signup', profile))?.status).toBe(200);
    expect((await action('participant/signup', { ...profile, formKey: 'teacher' }))?.status).toBe(429);
    expect((await fixture.db.query('SELECT * FROM wordpress_registration_challenges')).rows).toHaveLength(1);
  });

  it('requires the same browser, form, username, recipient and code before source creation', async () => {
    const profile = { contact: 'new@example.org', username: 'new-participant', formKey: 'student' };
    const response = await action('participant/signup', profile);
    expect(response?.status).toBe(200);
    const cookie = response!.headers.get('set-cookie')!;
    const verified = { ...profile, code: deliveredCode, password: 'p!' };
    expect((await action('participant/verify', verified))?.status).toBe(401);
    expect((await action('participant/verify', { ...verified, formKey: 'teacher' }, cookie))?.status).toBe(401);
    expect((await action('participant/verify', { ...verified, username: 'different' }, cookie))?.status).toBe(401);
    expect((await action('participant/verify', { ...verified, contact: 'different@example.org' }, cookie))?.status).toBe(401);
    expect(bridge.call).not.toHaveBeenCalled();
    bridge.call.mockResolvedValue({ ...identity, sourceUserId: '777', email: profile.contact, username: profile.username });
    const completed = await action('participant/verify', verified, cookie);
    expect(completed?.status).toBe(200);
    expect(bridge.call).toHaveBeenCalledWith('create', expect.objectContaining({ email: profile.contact, username: profile.username, formKey: 'student', password: verified.password, registrationNonce: expect.any(String) }));
    expect((await action('participant/verify', verified, cookie))?.status).toBe(401);
    expect(JSON.stringify((await fixture.db.query('SELECT * FROM wordpress_registration_challenges')).rows)).not.toContain(verified.password);
  });

  it('reuses a source registration nonce when source creation succeeds but local commit fails', async () => {
    const profile = { contact: 'new@example.org', username: 'new-participant', formKey: 'teacher' };
    const response = await action('participant/signup', profile);
    expect(response?.status).toBe(200);
    const cookie = response!.headers.get('set-cookie')!;
    const verified = { ...profile, code: deliveredCode, password: 'private chosen passphrase' };
    bridge.call.mockResolvedValue({ ...identity, sourceUserId: '777', email: profile.contact, username: profile.username });
    let fail = true;
    const failing = (db: Db): Db => ({
      query: (sql, params) => {
        if (fail && sql.startsWith('INSERT INTO wordpress_account_identities')) { fail = false; throw new Error('Injected local commit failure'); }
        return db.query(sql, params);
      },
      transaction: operation => db.transaction(tx => operation(failing(tx))),
    });
    const retryAuth = createAuth(failing(fixture.db), { secret: 'wordpress-test-secret-at-least-32-characters', origin, secureCookies: false, wordpressBridge: bridge });
    const verify = () => retryAuth.authAction(request('participant/verify', verified, cookie), ['auth', 'participant', 'verify']);
    expect((await verify())?.status).toBe(503);
    expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(0);
    expect((await verify())?.status).toBe(200);
    const creates = bridge.call.mock.calls.filter(([operation]) => operation === 'create');
    expect(creates).toHaveLength(2);
    expect(creates[0][1].registrationNonce).toBe(creates[1][1].registrationNonce);
    expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(1);
  });

  it('does not bypass verification attempt limits', async () => {
    const profile = { contact: 'new@example.org', username: 'new-participant', formKey: 'student' };
    const response = await action('participant/signup', profile);
    expect(response?.status).toBe(200);
    const cookie = response!.headers.get('set-cookie')!;
    const wrong = deliveredCode === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) expect((await action('participant/verify', { ...profile, code: wrong, password: 'private chosen passphrase' }, cookie))?.status).toBe(401);
    expect((await action('participant/verify', { ...profile, code: deliveredCode, password: 'private chosen passphrase' }, cookie))?.status).toBe(429);
    expect(bridge.call).not.toHaveBeenCalled();
    expect((await action('participant/resend', profile, cookie))?.status).toBe(429);
  });

  it('never claims preexisting source accounts by email proof alone', async () => {
    const profile = { contact: 'existing@example.org', username: 'existing-name', formKey: 'student' };
    const response = await action('participant/signup', profile);
    expect(response?.status).toBe(200);
    bridge.call.mockRejectedValue(new AppError(409, 'private source account collision details'));
    const completed = await action('participant/verify', { ...profile, code: deliveredCode, password: 'private chosen passphrase' }, response!.headers.get('set-cookie')!);
    expect(completed?.status).toBe(409);
    expect(await completed!.text()).not.toContain('private source');
    expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(0);
    expect((await fixture.db.query('SELECT consumed_at FROM wordpress_registration_challenges')).rows[0].consumed_at).toBeNull();
  });

  it('expires failed delivery proofs and keeps resend tied to the original profile', async () => {
    const profile = { contact: 'new@example.org', username: 'new-participant', formKey: 'teacher' };
    auth = createAuth(fixture.db, { secret: 'wordpress-test-secret-at-least-32-characters', origin, secureCookies: false, wordpressBridge: bridge,
      sendEmail: async () => { throw new Error('private mail provider details'); },
    });
    const response = await action('participant/signup', profile);
    expect(response?.status).toBe(503);
    expect(await response!.text()).not.toContain('private mail');
    expect((await fixture.db.query('SELECT expires_at<=now() AS expired FROM wordpress_registration_challenges')).rows[0].expired).toBe(true);
    expect(bridge.call).not.toHaveBeenCalled();
  });

  it('rejects expired proofs and preserves the nonce across a bound resend', async () => {
    const profile = { contact: 'new@example.org', username: 'new-participant', formKey: 'student' };
    const response = await action('participant/signup', profile);
    expect(response?.status).toBe(200);
    const cookie = response!.headers.get('set-cookie')!;
    const first = (await fixture.db.query('SELECT * FROM wordpress_registration_challenges')).rows[0];
    await fixture.db.query("UPDATE wordpress_registration_challenges SET expires_at=now()-interval '1 minute',updated_at=now()-interval '2 minutes'");
    expect((await action('participant/verify', { ...profile, code: deliveredCode, password: 'private chosen passphrase' }, cookie))?.status).toBe(401);
    expect((await action('participant/resend', { ...profile, username: 'different-name' }, cookie))?.status).toBe(401);
    expect((await action('participant/resend', profile, cookie))?.status).toBe(200);
    const resent = (await fixture.db.query('SELECT * FROM wordpress_registration_challenges')).rows[0];
    expect(resent.registration_nonce).toBe(first.registration_nonce);
    expect(resent.attempts).toBe(0);
    expect(bridge.call).not.toHaveBeenCalled();
  });

  it('authorizes archived entries only through the directly authenticated source ID', async () => {
    const response = await login();
    expect(response?.status).toBe(200);
    const actor = (await response!.json()).data.actor;
    const records = [
      { kind: 'user', sourceId: '123', payload: { user_email: 'old-address@example.org', roles: ['administrator'] } },
      { kind: 'entry', sourceId: 'owned', payload: { form_id: '48542', meta: [{ meta_key: '_yes_entry_account_id', meta_value: '123' }] } },
      { kind: 'entry', sourceId: 'email-only', payload: { form_id: '48542', meta: [{ meta_key: 'email-1', meta_value: identity.email }] } },
      { kind: 'entry', sourceId: 'conflicting', payload: { meta: [{ meta_key: '_yes_entry_account_id', meta_value: '123' }, { meta_key: '_yes_owner_user_id', meta_value: '999' }] } },
    ];
    await archiveWordPress(fixture.db, { format: 'yes-wordpress-export/v1', source, capturedAt: '2026-11-10T00:00:00Z', counts: { records: records.length, attachments: 0 }, records, attachments: [] }, { commit: true });
    expect((await historicalEntries(fixture.db, actor)).items.map(entry => entry.sourceId)).toEqual(['owned']);
    await fixture.db.query("UPDATE wordpress_records SET payload=payload || '{\"changed\":true}'::jsonb WHERE kind='user'");
    expect((await historicalEntries(fixture.db, actor)).items).toEqual([]);
  });
});

describe('WordPress participant account UI', () => {
  it('accepts an existing username and keeps native recovery discoverable', () => {
    const html = renderToStaticMarkup(createElement(EmailAccount, { provider: 'wordpress', onSignedIn() {} }));
    expect(html).toContain('Username or email');
    expect(html).toContain('Forgot your password?');
    expect(html).toContain('Create a new account');
    expect(html).not.toContain('type="email"');
  });
});

describe('private PHP bridge transport', () => {
  const config = { bridgePath: path.resolve('private-account-bridge/bridge.php'), root: path.resolve('public-wordpress-root'), origin: 'https://wordpress.example.org' };
  beforeEach(() => subprocess.execFile.mockReset());

  it('sends credentials only over stdin with bounded shell-free execution', async () => {
    const write = vi.fn();
    subprocess.execFile.mockImplementation((_binary, _args, _options, callback) => ({ stdin: {
      on: vi.fn(), end: (body: string) => { write(body); queueMicrotask(() => callback(null, JSON.stringify({ ok: true, data: { sent: true } }))); },
    } }));
    const response = await createWordPressBridge(config).call('login', { contact: 'synthetic', password: 'private password' });
    expect(response).toEqual({ sent: true });
    const [binary, args, options] = subprocess.execFile.mock.calls[0];
    expect(binary).toBe('php');
    expect(args).toEqual([config.bridgePath]);
    expect(options).toMatchObject({ shell: false, windowsHide: true, timeout: 15000, maxBuffer: 16384 });
    expect(JSON.stringify(args)).not.toContain('private password');
    expect(write).toHaveBeenCalledWith(JSON.stringify({ action: 'login', input: { contact: 'synthetic', password: 'private password' } }));
  });

  it('redacts subprocess errors and malformed output', async () => {
    for (const fail of [true, false]) {
      subprocess.execFile.mockImplementation((_binary, _args, _options, callback) => ({ stdin: {
        on: vi.fn(), end: () => queueMicrotask(() => callback(fail ? new Error('private stderr') : null, 'private stdout', 'private stderr')),
      } }));
      await expect(createWordPressBridge(config).call('status', { sourceUserId: '123' })).rejects.toMatchObject({ status: 503, message: expect.not.stringContaining('private') });
    }
  });

  it('rejects oversized requests and a bridge inside the public WordPress root', async () => {
    await expect(createWordPressBridge(config).call('mail', { body: 'x'.repeat(33000) })).rejects.toMatchObject({ status: 413 });
    expect(() => createWordPressBridge({ ...config, bridgePath: path.join(config.root, 'bridge.php') })).toThrow();
    expect(subprocess.execFile).not.toHaveBeenCalled();
  });
});
