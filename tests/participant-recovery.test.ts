import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
import { createAuth } from '../src/server/auth';
import type { Db } from '../src/server/db';
import { linkVerifiedSupabaseIdentity } from '../src/server/supabase-auth';

describe('participant password recovery', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>;
 let auth: ReturnType<typeof createAuth>;
 const origin = 'http://localhost:3000';
 const identity = { id: randomUUID(), email: 'student@example.org', email_confirmed_at: '2026-11-04T00:00:00Z' };
 const newPassword = 'New unique passphrase 123!';
 const request = (path: string, input: unknown = {}, requestOrigin = origin) => new Request(`${origin}/api/auth/${path}`, {
  method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(input),
 });
 const action = (path: string, input: unknown = {}) => auth.authAction(request(path, input), ['auth', ...path.split('/')]);
 beforeEach(async () => {
  fixture = await testDb();
  auth = createAuth(fixture.db, { secret: 'recovery-test-secret-longer-than-32-characters', origin, secureCookies: false });
  vi.stubEnv('SUPABASE_URL', 'https://provider.example.test');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
  vi.stubEnv('AUTH_PARTICIPANT_PROVIDER', 'supabase');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected provider request'); }));
 });
 afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await fixture?.close(); });

 it('returns the same recovery response for linked and unknown emails without creating accounts', async () => {
  await linkVerifiedSupabaseIdentity(fixture.db, identity);
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
   expect(String(url)).toBe('https://provider.example.test/auth/v1/recover');
   expect(init.method).toBe('POST');
   expect(init.headers.apikey).toBe('test-publishable-key');
   expect(JSON.parse(init.body)).toEqual({ email: expect.stringMatching(/^(student|unknown)@example.org$/) });
   return Response.json({});
  }));
  const known = await action('participant/recovery/request', { contact: identity.email });
  const unknown = await action('participant/recovery/request', { contact: 'unknown@example.org' });
  expect(known?.status).toBe(200);
  expect(unknown?.status).toBe(200);
  expect(await known!.json()).toEqual(await unknown!.json());
  expect(known!.headers.get('cache-control')).toBe('no-store');
  expect((await fixture.db.query('SELECT id FROM users')).rows).toHaveLength(1);
 });

 it('verifies a recovery code server-side, updates the provider password and revokes every local session', async () => {
  const user = await linkVerifiedSupabaseIdentity(fixture.db, identity);
  const cookies: string[] = [];
  for (let n = 0; n < 2; n++) {
   const token = randomBytes(32).toString('hex'); cookies.push(`yes_session=${token}`);
   await fixture.db.query("INSERT INTO auth_sessions(token_hash,user_id,auth_version,mfa_verified,expires_at) VALUES($1,$2,0,false,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), user.id]);
  }
  expect(await auth.getActor(new Request(origin, { headers: { cookie: cookies[0] } }))).toMatchObject({ id: user.id });
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
   if (String(url).endsWith('/verify')) {
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: identity.email, token: '123456', type: 'recovery' });
    return Response.json({ user: identity, access_token: 'private-recovery-token', refresh_token: 'private-refresh-token', token_type: 'bearer', expires_in: 3600 });
   }
   expect(String(url)).toBe('https://provider.example.test/auth/v1/user');
   expect(init.method).toBe('PUT');
   expect(init.headers.Authorization).toBe('Bearer private-recovery-token');
   expect(JSON.parse(init.body)).toEqual({ password: newPassword });
   return Response.json(identity);
  }));
  const response = await action('participant/recovery/complete', { contact: identity.email, code: '123456', password: newPassword });
  expect(response?.status).toBe(200);
  expect(await response!.json()).toMatchObject({ data: { recovered: true } });
  expect(response!.headers.get('set-cookie')).toBeNull();
  for (const cookie of cookies) expect(await auth.getActor(new Request(origin, { headers: { cookie } }))).toBeNull();
  const persisted = (await fixture.db.query('SELECT * FROM users WHERE id=$1', [user.id])).rows[0];
  expect(persisted.auth_version).toBe(1);
  expect(persisted.password_hash).toBeNull();
  expect((await fixture.db.query('SELECT revoked_at FROM auth_sessions')).rows.every(row => row.revoked_at)).toBe(true);
  expect(JSON.stringify((await fixture.db.query('SELECT * FROM audit_events')).rows)).not.toMatch(/private-|New unique/);
 });

 it('refuses invalid or expired recovery codes without changing local credentials', async () => {
  const user = await linkVerifiedSupabaseIdentity(fixture.db, identity);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'otp_expired' }, { status: 403 })));
  const response = await action('participant/recovery/complete', { contact: identity.email, code: '999999', password: newPassword });
  expect(response?.status).toBe(400);
  expect((await fixture.db.query('SELECT auth_version FROM users WHERE id=$1', [user.id])).rows[0].auth_version).toBe(0);
 });

 it('fails safely when provider password update fails, without claiming a completed reset', async () => {
  const user = await linkVerifiedSupabaseIdentity(fixture.db, identity);
  vi.stubGlobal('fetch', vi.fn(async (url) => String(url).endsWith('/verify')
   ? Response.json({ user: identity, access_token: 'private-recovery-token' })
   : Response.json({ error: 'service failure with private provider details' }, { status: 503 })));
  const response = await action('participant/recovery/complete', { contact: identity.email, code: '123456', password: newPassword });
  expect(response?.status).toBe(503);
  expect(await response!.text()).not.toContain('private');
  expect((await fixture.db.query('SELECT auth_version FROM users WHERE id=$1', [user.id])).rows[0].auth_version).toBe(1);
 });

 it('commits revocation before provider update and blocks sign-in while recovery is in flight', async () => {
  const user = await linkVerifiedSupabaseIdentity(fixture.db, identity);
  let transactionOpen = false;
  const tracked: Db = { query: fixture.db.query, transaction: fn => fixture.db.transaction(async tx => {
   transactionOpen = true;
   try { return await fn(tx); } finally { transactionOpen = false; }
  }) };
  const trackedAuth = createAuth(tracked, { secret: 'recovery-test-secret-longer-than-32-characters', origin, secureCookies: false });
  vi.stubGlobal('fetch', vi.fn(async (url) => {
   if (String(url).endsWith('/verify') || String(url).includes('/token?')) return Response.json({ user: identity, access_token: 'private-token' });
   // Querying a second connection while the old implementation's transaction is open
   // would deadlock PGlite. Fail here first, then check real committed state.
   expect(transactionOpen).toBe(false);
   expect((await fixture.db.query('SELECT auth_version FROM users WHERE id=$1', [user.id])).rows[0].auth_version).toBe(1);
   await expect(linkVerifiedSupabaseIdentity(fixture.db, identity)).rejects.toMatchObject({ status: 403 });
   expect((await action('participant/login', { contact: identity.email, password: 'Old valid passphrase!' }))?.status).toBe(403);
   return Response.json(identity);
  }));
  const response = await trackedAuth.authAction(request('participant/recovery/complete', { contact: identity.email, code: '123456', password: newPassword }), ['auth', 'participant', 'recovery', 'complete']);
  expect(response?.status).toBe(200);
 });

 it('keeps an uncertain provider update blocked even after another valid recovery code', async () => {
  const user = await linkVerifiedSupabaseIdentity(fixture.db, identity);
  const oldToken = randomBytes(32).toString('hex');
  await fixture.db.query("INSERT INTO auth_sessions(token_hash,user_id,auth_version,mfa_verified,expires_at) VALUES($1,$2,0,false,now()+interval '1 hour')", [createHash('sha256').update(oldToken).digest('hex'), user.id]);
  vi.stubGlobal('fetch', vi.fn(async (url) => {
   if (String(url).endsWith('/verify') || String(url).includes('/token?')) return Response.json({ user: identity, access_token: 'private-token' });
   // The provider applied the password, but its response was lost.
   throw new DOMException('Provider update response timed out', 'TimeoutError');
  }));
  const uncertain = await action('participant/recovery/complete', { contact: identity.email, code: '123456', password: newPassword });
  expect(uncertain?.status).toBe(503);
  expect((await fixture.db.query('SELECT auth_version FROM users WHERE id=$1', [user.id])).rows[0].auth_version).toBe(1);
  expect((await fixture.db.query('SELECT revoked_at FROM auth_sessions')).rows[0].revoked_at).toBeTruthy();
  expect(await auth.getActor(new Request(origin, { headers: { cookie: `yes_session=${oldToken}` } }))).toBeNull();
  const pendingNonce = (await fixture.db.query("SELECT to_jsonb(s)->>'recovery_nonce' AS nonce FROM supabase_identities s")).rows[0].nonce;
  expect(pendingNonce).toBeTruthy();
  await expect(linkVerifiedSupabaseIdentity(fixture.db, identity)).rejects.toMatchObject({ status: 403 });
  // Even a session matching the current credential version cannot bypass pending recovery.
  const token = randomBytes(32).toString('hex');
  await fixture.db.query("INSERT INTO auth_sessions(token_hash,user_id,auth_version,mfa_verified,expires_at) VALUES($1,$2,1,false,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), user.id]);
  expect(await auth.getActor(new Request(origin, { headers: { cookie: `yes_session=${token}` } }))).toBeNull();
  let passwordUpdates = 0;
  vi.stubGlobal('fetch', vi.fn(async (url) => {
   if (String(url).endsWith('/verify')) return Response.json({ user: identity, access_token: 'fresh-recovery-token' });
   passwordUpdates++; return Response.json(identity);
  }));
  const retry = await action('participant/recovery/complete', { contact: identity.email, code: '654321', password: 'Entirely different recovery password B!' });
  expect(retry?.status).toBe(409);
  expect(passwordUpdates).toBe(0);
  expect(await retry!.text()).toMatch(/contact support/i);
  expect(await uncertain!.text()).toMatch(/contact support/i);
  expect((await fixture.db.query("SELECT to_jsonb(s)->>'recovery_nonce' AS nonce FROM supabase_identities s")).rows[0].nonce).toBe(pendingNonce);
  expect((await fixture.db.query('SELECT auth_version FROM users WHERE id=$1', [user.id])).rows[0].auth_version).toBe(1);
  await expect(linkVerifiedSupabaseIdentity(fixture.db, identity)).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/contact support/i) });
 });

 it('keeps the committed safety lock if the database fails after provider success', async () => {
  const user = await linkVerifiedSupabaseIdentity(fixture.db, identity);
  const failing = (target: Db): Db => ({
   query: (sql, params) => {
    if (/SET recovery_nonce\s*=\s*NULL/i.test(sql)) throw new Error('Injected database clear failure');
    return target.query(sql, params);
   },
   transaction: fn => target.transaction(tx => fn(failing(tx))),
  });
  const failingAuth = createAuth(failing(fixture.db), { secret: 'recovery-test-secret-longer-than-32-characters', origin, secureCookies: false });
  vi.stubGlobal('fetch', vi.fn(async (url) => String(url).endsWith('/verify')
   ? Response.json({ user: identity, access_token: 'private-token' }) : Response.json(identity)));
  const response = await failingAuth.authAction(request('participant/recovery/complete', { contact: identity.email, code: '123456', password: newPassword }), ['auth', 'participant', 'recovery', 'complete']);
  expect(response?.status).toBe(503);
  expect(await response!.text()).toMatch(/contact support/i);
  expect((await fixture.db.query('SELECT auth_version FROM users WHERE id=$1', [user.id])).rows[0].auth_version).toBe(1);
  expect((await fixture.db.query("SELECT to_jsonb(s)->>'recovery_nonce' AS nonce FROM supabase_identities s")).rows[0].nonce).toBeTruthy();
  await expect(linkVerifiedSupabaseIdentity(fixture.db, identity)).rejects.toMatchObject({ status: 403 });
 });

 it('rejects a distinct second password update while the first provider request is delayed', async () => {
  await linkVerifiedSupabaseIdentity(fixture.db, identity);
  const updates: string[] = [];
  let transactionOpen = false;
  const tracked: Db = { query: fixture.db.query, transaction: fn => fixture.db.transaction(async tx => {
   transactionOpen = true;
   try { return await fn(tx); } finally { transactionOpen = false; }
  }) };
  const trackedAuth = createAuth(tracked, { secret: 'recovery-test-secret-longer-than-32-characters', origin, secureCookies: false });
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
   if (String(url).endsWith('/verify')) return Response.json({ user: identity, access_token: 'private-token' });
   expect(transactionOpen).toBe(false);
   updates.push(JSON.parse(init.body).password);
   if (updates.length === 1) {
    const newer = await action('participant/recovery/complete', { contact: identity.email, code: '654321', password: 'Entirely different recovery password B!' });
    expect(newer?.status).toBe(409);
    expect(await newer!.text()).toMatch(/contact support/i);
   }
   return Response.json(identity);
  }));
  const response = await trackedAuth.authAction(request('participant/recovery/complete', { contact: identity.email, code: '123456', password: newPassword }), ['auth', 'participant', 'recovery', 'complete']);
  expect(response?.status).toBe(200);
  expect(updates).toEqual(['New unique passphrase 123!']);
  expect((await fixture.db.query("SELECT to_jsonb(s)->>'recovery_nonce' AS nonce FROM supabase_identities s")).rows[0].nonce).toBeNull();
 });

 it('denies session issuance if recovery starts after identity lookup but before session creation', async () => {
  await linkVerifiedSupabaseIdentity(fixture.db, identity);
  let interleave = true;
  const raced: Db = { query: fixture.db.query, transaction: async fn => {
   const value = await fixture.db.transaction(fn);
   if (interleave) {
    interleave = false;
    expect((await action('participant/recovery/complete', { contact: identity.email, code: '123456', password: newPassword }))?.status).toBe(503);
   }
   return value;
  } };
  const racedAuth = createAuth(raced, { secret: 'recovery-test-secret-longer-than-32-characters', origin, secureCookies: false });
  vi.stubGlobal('fetch', vi.fn(async (url) => {
   if (String(url).endsWith('/verify') || String(url).includes('/token?')) return Response.json({ user: identity, access_token: 'private-token' });
   throw new DOMException('Provider update uncertain', 'TimeoutError');
  }));
  const response = await racedAuth.authAction(request('participant/login', { contact: identity.email, password: 'Old valid passphrase!' }), ['auth', 'participant', 'login']);
  expect(response?.status).toBe(403);
  expect(response!.headers.get('set-cookie')).toBeNull();
  expect((await fixture.db.query('SELECT * FROM auth_sessions')).rows).toHaveLength(0);
 });

 it('rejects unlinked, staff, inactive, unverified and mismatched recovery identities', async () => {
  const user = await linkVerifiedSupabaseIdentity(fixture.db, identity);
  const complete = () => action('participant/recovery/complete', { contact: identity.email, code: '123456', password: newPassword });
  for (const changed of [{ ...identity, id: randomUUID() }, { ...identity, email_confirmed_at: undefined }, { ...identity, email: 'other@example.org' }]) {
   vi.stubGlobal('fetch', vi.fn(async (url) => { expect(String(url)).toContain('/verify'); return Response.json({ user: changed, access_token: 'private-token' }); }));
   expect((await complete())!.status).toBeGreaterThanOrEqual(400);
  }
  for (const sql of ["UPDATE users SET active=false WHERE id=$1", "UPDATE users SET active=true,role='owner' WHERE id=$1"]) {
   await fixture.db.query(sql, [user.id]);
   vi.stubGlobal('fetch', vi.fn(async (url) => { expect(String(url)).toContain('/verify'); return Response.json({ user: identity, access_token: 'private-token' }); }));
   expect((await complete())!.status).toBe(403);
  }
  expect((await fixture.db.query('SELECT id FROM users')).rows).toHaveLength(1);
 });

 it('rejects weak passwords, malformed recovery responses, cross-origin requests and repeated requests', async () => {
  await linkVerifiedSupabaseIdentity(fixture.db, identity);
  expect((await action('participant/recovery/complete', { contact: identity.email, code: '123456', password: 'short' }))?.status).toBe(400);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ user: identity })));
  expect((await action('participant/recovery/complete', { contact: identity.email, code: '123456', password: newPassword }))?.status).toBe(401);
  expect((await auth.authAction(request('participant/recovery/request', { contact: identity.email }, 'https://untrusted.example'), ['auth', 'participant', 'recovery', 'request']))?.status).toBe(403);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  for (let n=0; n<5; n++) expect((await action('participant/recovery/request', { contact: identity.email }))?.status).toBe(200);
  expect((await action('participant/recovery/request', { contact: identity.email }))?.status).toBe(429);
 });

 it('fails closed when recovery delivery is unavailable or disabled', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('provider network details'); }));
  const unavailable = await action('participant/recovery/request', { contact: identity.email });
  expect(unavailable?.status).toBe(503);
  expect(await unavailable!.text()).not.toContain('network details');
  vi.stubEnv('AUTH_PARTICIPANT_PROVIDER', 'disabled');
  expect((await action('participant/recovery/request', { contact: identity.email }))?.status).toBe(503);
 });
});
