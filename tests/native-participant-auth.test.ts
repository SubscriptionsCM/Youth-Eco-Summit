import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth, hashPassword } from '../src/server/auth';
import { importNativeParticipantCredentials, verifyImportedPassword } from '../src/server/native-participant-auth';
import { testDb } from './helpers/db';

// Generated independently with PHP password_hash(base64_encode(hash_hmac('sha384', password, 'wp-sha384', true)), PASSWORD_BCRYPT).
const legacyPassword = 'Legacy participant password 123!';
const legacyBcrypt = '$wp$2y$10$D8D97Zm8WlMLGLcTC1VPl.P/fPQck4PAB7oNhf6A2Sylqv9IPbPCy';
const longBcrypt = '$wp$2y$10$23TujqBs/Tx6oC9JC47Hc.T.RmXCTdm0uhwKbzDWxbj8NjTP5Y5rW';
// WordPress's published PHPass example: plaintext "test".
const legacyPhpass = '$P$B55D6LjfHDkINU5wF.v2BuuzO0/XPk/';

describe('imported participant password compatibility', () => {
 it('checks independent WordPress bcrypt/PHPass vectors and rejects malformed or excessive work factors', async () => {
  expect(await verifyImportedPassword(legacyPassword, legacyBcrypt)).toBe(true);
  expect(await verifyImportedPassword('wrong password', legacyBcrypt)).toBe(false);
  expect(await verifyImportedPassword('x'.repeat(100) + '1', longBcrypt)).toBe(true);
  expect(await verifyImportedPassword('x'.repeat(100) + '2', longBcrypt)).toBe(false);
  expect(await verifyImportedPassword('test', legacyPhpass)).toBe(true);
  expect(await verifyImportedPassword('Test', legacyPhpass)).toBe(false);
  expect(await verifyImportedPassword('x'.repeat(4097), legacyBcrypt)).toBe(false);
  expect(await verifyImportedPassword(legacyPassword, legacyBcrypt.replace('$10$', '$31$'))).toBe(false);
  expect(await verifyImportedPassword('test', legacyPhpass.replace('$P$B', '$P$z'))).toBe(false);
  expect(await verifyImportedPassword('test', 'malformed')).toBe(false);
 });
});

describe('native participant authentication', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>;
 let auth: ReturnType<typeof createAuth>;
 const origin = 'https://native.example.org';
 const secret = 'native-test-only-auth-secret-with-more-than-32-characters';
 const password = 'A unique participant password 123!';
 const profile = { contact: 'participant@example.org', username: 'participant', formKey: 'student' };
 const delivered: { to: string; body: string; code: string }[] = [];
 const bridge = { call: vi.fn() };
 const request = (path: string, input: unknown = {}, cookie?: string, from = origin) => new Request(`${origin}/api/auth/${path}`, {
  method: 'POST', headers: { origin: from, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(input),
 });
 const action = (path: string, input: unknown = {}, cookie?: string) => auth.authAction(request(path, input, cookie), ['auth', ...path.split('/')]);
 async function signup(details = profile) {
  const sent = await action('participant/signup', details);
  expect(sent?.status).toBe(200);
  return { cookie: sent!.headers.get('set-cookie')!, code: delivered.at(-1)!.code };
 }
 async function register(details = profile) {
  const challenge = await signup(details);
  const verified = await action('participant/verify', { ...details, code: challenge.code, password }, challenge.cookie);
  expect(verified?.status).toBe(200);
  return { cookie: verified!.headers.get('set-cookie')!, actor: (await verified!.json()).data.actor };
 }
 beforeEach(async () => {
  fixture = await testDb();
  vi.stubEnv('AUTH_PARTICIPANT_PROVIDER', 'native');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External auth must not run'); }));
  bridge.call.mockReset().mockRejectedValue(new Error('PHP bridge must not run'));
  delivered.length = 0;
  auth = createAuth(fixture.db, { secret, origin, wordpressBridge: bridge,
   sendEmail: async (to, _subject, body) => { delivered.push({ to, body, code: body.match(/\b\d{6}\b/)?.[0] || '' }); },
  });
 });
 afterEach(async () => {
  expect(bridge.call).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  await fixture?.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
 });

 it('verifies student and educator accounts in the initiating browser and creates only participant sessions', async () => {
  const details = { contact: '  PARTICIPANT@example.org ', username: ' Participant ', formKey: 'student' };
  const challenge = await signup(details);
  expect(challenge.cookie).toContain('HttpOnly'); expect(challenge.cookie).toContain('Secure'); expect(challenge.cookie).toContain('SameSite=Lax');
  const stored = (await fixture.db.query('SELECT * FROM native_participant_challenges')).rows[0];
  expect(stored.code_hash).not.toBe(challenge.code); expect(stored).not.toHaveProperty('password');
  const verified = await action('participant/verify', { ...details, code: challenge.code, password, role: 'owner' }, challenge.cookie);
  expect(verified?.status).toBe(200);
  const cookie = verified!.headers.get('set-cookie')!;
  expect(await auth.getActor(request('session', {}, cookie))).toMatchObject({ role: 'participant', contact: profile.contact,participantKind:'student' });
  expect((await fixture.db.query('SELECT password_hash FROM users')).rows[0].password_hash).toMatch(/^scrypt-32768-8-3\$/);
  expect((await fixture.db.query('SELECT username FROM native_participant_accounts')).rows).toEqual([{ username: profile.username }]);
  expect((await action('invitations', { contact: 'staff@example.org', role: 'owner' }, cookie))?.status).toBe(403);
  const educator = await register({ contact: 'educator@example.org', username: 'educator', formKey: 'teacher' });
  expect(educator.actor).toMatchObject({role:'participant',participantKind:'educator'});
  const school=await register({contact:'school@example.org',username:'school',formKey:'school'});
  expect(school.actor).toMatchObject({role:'participant',participantKind:'school'});
  expect((await fixture.db.query('SELECT * FROM supabase_identities')).rows).toHaveLength(0);
  expect((await fixture.db.query('SELECT * FROM wordpress_account_identities')).rows).toHaveLength(0);
 });

 it('normalizes duplicate emails and usernames without merging accounts or granting elevated roles', async () => {
  const account = await register();
  for (const details of [
   { ...profile, contact: 'PARTICIPANT@EXAMPLE.ORG', username: 'another' },
   { ...profile, contact: 'another@example.org', username: ' PARTICIPANT ' },
   { ...profile, contact: 'another@example.org', username: 'PARTICIPANT@example.org' },
  ]) expect((await action('participant/signup', details))?.status).toBe(409);
  await fixture.db.query("INSERT INTO users(id,contact,role) VALUES($1,'admin@example.org','admin')", [randomUUID()]);
  expect((await action('participant/signup', { ...profile, contact: 'admin@example.org', username: 'admin' }))?.status).toBe(409);
  expect((await fixture.db.query('SELECT id FROM users WHERE role=$1', ['participant'])).rows).toEqual([{ id: account.actor.id }]);
  expect((await action('participant/login', { contact: ' PARTICIPANT ', password }))?.status).toBe(200);
 });

 it('binds verification to the exact browser and profile and consumes a successful code once', async () => {
  const challenge = await signup();
  expect((await action('participant/verify', { ...profile, code: challenge.code, password }))?.status).toBe(401);
  expect((await action('participant/verify', { ...profile, code: challenge.code, password }, `yes_native_participant=${'a'.repeat(64)}`))?.status).toBe(401);
  expect((await action('participant/verify', { ...profile, username: 'different', code: challenge.code, password }, challenge.cookie))?.status).toBe(401);
  expect((await action('participant/verify', { ...profile, code: challenge.code, password: { unexpected: true } }, challenge.cookie))?.status).toBe(400);
  expect((await action('participant/verify', { ...profile, code: challenge.code, password }, challenge.cookie))?.status).toBe(200);
  await fixture.db.query('DELETE FROM auth_rates');
  expect((await action('participant/verify', { ...profile, code: challenge.code, password }, challenge.cookie))?.status).toBe(401);
  expect((await fixture.db.query('SELECT * FROM users')).rows).toHaveLength(1);
 });

 it('enforces resend cooldown, code expiry and five verification attempts', async () => {
  const challenge = await signup();
  expect((await action('participant/resend', profile, challenge.cookie))?.status).toBe(429);
  const wrong = challenge.code === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < 5; attempt++) expect((await action('participant/verify', { ...profile, password, code: wrong }, challenge.cookie))?.status).toBe(401);
  await fixture.db.query('DELETE FROM auth_rates');
  expect((await action('participant/verify', { ...profile, password, code: challenge.code }, challenge.cookie))?.status).toBe(401);
  expect((await fixture.db.query('SELECT attempts FROM native_participant_challenges')).rows[0].attempts).toBe(5);
  await fixture.db.query("UPDATE native_participant_challenges SET updated_at=now()-interval '2 minutes'");
  expect((await action('participant/resend', profile, challenge.cookie))?.status).toBe(200);
  const refreshed = delivered.at(-1)!.code;
  await fixture.db.query("UPDATE native_participant_challenges SET expires_at=now()-interval '1 second'");
  expect((await action('participant/verify', { ...profile, password, code: refreshed }, challenge.cookie))?.status).toBe(401);
 });

 it('preserves imported identities and upgrades bcrypt and short PHPass passwords without any provider calls', async () => {
  for (const [index, stored, original] of [[1, legacyBcrypt, legacyPassword], [2, legacyPhpass, 'test']] as const) {
   const userId = randomUUID(), contact = `legacy${index}@example.org`, username = `legacy${index}`;
   await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'participant',$2)", [userId, contact]);
   await fixture.db.query('INSERT INTO wordpress_account_identities(source,source_user_id,user_id,credential_fingerprint) VALUES($1,$2,$3,$4)', ['https://legacy.example.org', String(index), userId, 'a'.repeat(64)]);
   await fixture.db.transaction(tx => importNativeParticipantCredentials(tx, userId, { username, email: contact, passwordHash: stored }));
   const oldToken = randomBytes(32).toString('hex');
   await fixture.db.query("INSERT INTO auth_sessions(token_hash,user_id,auth_version,expires_at) SELECT $1,id,auth_version,now()+interval '1 hour' FROM users WHERE id=$2", [createHash('sha256').update(oldToken).digest('hex'), userId]);
   const login = await action('participant/login', { contact: username.toUpperCase(), password: original });
   expect(login?.status).toBe(200);
   expect((await login!.json()).data.actor.id).toBe(userId);
   const newHash = (await fixture.db.query('SELECT password_hash FROM users WHERE id=$1', [userId])).rows[0].password_hash;
   expect(newHash).toMatch(/^scrypt-32768-8-3\$/);
   expect(await auth.getActor(request('session', {}, `yes_session=${oldToken}`))).toBeNull();
   expect(await auth.getActor(request('session', {}, login!.headers.get('set-cookie')!))).toMatchObject({ id: userId });
   expect(await fixture.db.transaction(tx => importNativeParticipantCredentials(tx, userId, { username, email: contact, passwordHash: stored }))).toEqual({ imported: false });
   expect((await fixture.db.query('SELECT password_hash FROM users WHERE id=$1', [userId])).rows[0].password_hash).toBe(newHash);
   expect((await action('participant/login', { contact, password: original }))?.status).toBe(200);
  }
 });

 it('preserves legacy cross-identifiers, accepts exactly one password match and recovers the verified email owner', async () => {
  const emailOwner = randomUUID(), usernameOwner = randomUUID(), shared = 'shared@example.org';
  await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'participant',$2),($3,'participant','username-owner@example.org')", [emailOwner, shared, usernameOwner]);
  await fixture.db.transaction(async tx => {
   await importNativeParticipantCredentials(tx, emailOwner, { username: 'email-owner', email: shared, passwordHash: legacyBcrypt });
   await importNativeParticipantCredentials(tx, usernameOwner, { username: shared, email: 'username-owner@example.org', passwordHash: legacyPhpass });
  });
  for (const [entered, expectedId] of [[legacyPassword, emailOwner], ['test', usernameOwner]]) {
   const login = await action('participant/login', { contact: shared, password: entered });
   expect(login?.status).toBe(200);
   expect((await login!.json()).data.actor.id).toBe(expectedId);
  }
  const usernameHash = (await fixture.db.query('SELECT password_hash FROM users WHERE id=$1', [usernameOwner])).rows[0].password_hash;
  const recovery = await action('participant/recovery/request', { contact: shared });
  expect(recovery?.status).toBe(200); expect(delivered.at(-1)!.to).toBe(shared);
  const completed = await action('participant/recovery/complete', { contact: shared, code: delivered.at(-1)!.code, password: 'A new email owner password 789!' }, recovery!.headers.get('set-cookie')!);
  expect(completed?.status).toBe(200);
  expect((await fixture.db.query('SELECT password_hash FROM users WHERE id=$1', [usernameOwner])).rows[0].password_hash).toBe(usernameHash);
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1', [emailOwner]);
  await fixture.db.query("UPDATE native_participant_challenges SET updated_at=now()-interval '2 minutes'");
  const sentCount = delivered.length;
  expect((await action('participant/recovery/request', { contact: shared }))?.status).toBe(200);
  expect(delivered).toHaveLength(sentCount);
  const commonHash = await hashPassword(password);
  await fixture.db.query('UPDATE users SET active=true,password_hash=$1 WHERE id IN ($2,$3)', [commonHash, emailOwner, usernameOwner]);
  const ambiguous = await action('participant/login', { contact: shared, password });
  expect(ambiguous?.status).toBe(401); expect(ambiguous!.headers.get('set-cookie')).toBeNull();
  for (const [contact, expectedId] of [['email-owner', emailOwner], ['username-owner@example.org', usernameOwner]]) {
   const login = await action('participant/login', { contact, password });
   expect(login?.status).toBe(200); expect((await login!.json()).data.actor.id).toBe(expectedId);
  }
  expect((await action('participant/signup', { ...profile, username: shared }))?.status).toBe(409);
  expect((await fixture.db.query('SELECT id FROM users WHERE role=$1', ['participant'])).rows.map(row => row.id).sort()).toEqual([emailOwner, usernameOwner].sort());
 });

 it('keeps owner, admin and judge login separate from participant credentials and rejects inactive accounts', async () => {
  const stored = await hashPassword(password);
  for (const role of ['owner', 'admin', 'judge']) {
   const userId = randomUUID(), contact = `${role}@example.org`;
   await fixture.db.query('INSERT INTO users(id,contact,role,password_hash) VALUES($1,$2,$3,$4)', [userId, contact, role, stored]);
   await fixture.db.query('INSERT INTO wordpress_account_identities(source,source_user_id,user_id,credential_fingerprint) VALUES($1,$2,$3,$4)', ['https://legacy.example.org', String(100 + ['owner', 'admin', 'judge'].indexOf(role)), userId, 'a'.repeat(64)]);
   await expect(fixture.db.transaction(tx => importNativeParticipantCredentials(tx, userId, { username: role, email: contact, passwordHash: legacyBcrypt }))).rejects.toMatchObject({ status: 409 });
   expect((await action('participant/login', { contact, password }))?.status).toBe(401);
   const staff = await action('login', { contact, password });
   expect(staff?.status).toBe(200);
   expect(await auth.getActor(request('session', {}, staff!.headers.get('set-cookie')!))).toMatchObject({ role });
  }
  const account = await register();
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1', [account.actor.id]);
  expect((await action('participant/login', { contact: profile.contact, password }))?.status).toBe(401);
  expect(await auth.getActor(request('session', {}, account.cookie))).toBeNull();
 });

 it('invalidates changed contacts and denies incompletely imported legacy sessions without PHP lookups', async () => {
  const account = await register();
  await fixture.db.query("UPDATE users SET contact='changed@example.org' WHERE id=$1", [account.actor.id]);
  expect(await auth.getActor(request('session', {}, account.cookie))).toBeNull();
  const sourceId = randomUUID(), token = randomBytes(32).toString('hex');
  await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'participant','unimported@example.org')", [sourceId]);
  await fixture.db.query('INSERT INTO wordpress_account_identities(source,source_user_id,user_id,credential_fingerprint) VALUES($1,$2,$3,$4)', ['https://legacy.example.org', '99', sourceId, 'a'.repeat(64)]);
  await fixture.db.query("INSERT INTO auth_sessions(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,0,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), sourceId]);
  expect(await auth.getActor(request('session', {}, `yes_session=${token}`))).toBeNull();
 });

 it('recovers by browser-bound email code, revokes sessions and prevents code reuse', async () => {
  const account = await register();
  const recovery = await action('participant/recovery/request', { contact: profile.username });
  expect(recovery?.status).toBe(200); expect((await recovery!.json()).data.recovery).toBe('code');
  const recoveryCookie = recovery!.headers.get('set-cookie')!, code = delivered.at(-1)!.code;
  const input = { contact: profile.username, code, password: 'A replacement strong password 456!', confirmPassword: 'A replacement strong password 456!' };
  expect((await action('participant/recovery/request', { contact: profile.contact }))?.status).toBe(429);
  expect((await action('participant/recovery/complete', input))?.status).toBe(401);
  expect((await action('participant/recovery/complete', { ...input, confirmPassword: 'different' }, recoveryCookie))?.status).toBe(400);
  const completed = await action('participant/recovery/complete', input, recoveryCookie);
  expect(completed?.status).toBe(200); expect(completed!.headers.get('set-cookie')).toBeNull();
  expect(await auth.getActor(request('session', {}, account.cookie))).toBeNull();
  expect((await action('participant/recovery/complete', input, recoveryCookie))?.status).toBe(401);
  expect((await action('participant/login', { contact: profile.contact, password }))?.status).toBe(401);
  expect((await action('participant/login', { contact: profile.contact, password: input.password }))?.status).toBe(200);
 });

 it('returns generic recovery results for unknown and staff accounts without sending their mail', async () => {
  await fixture.db.query("INSERT INTO users(id,contact,role) VALUES($1,'staff@example.org','owner')", [randomUUID()]);
  for (const contact of ['unknown@example.org', 'staff@example.org']) {
   const result = await action('participant/recovery/request', { contact });
   expect(result?.status).toBe(200); expect((await result!.json()).data.recovery).toBe('code');
   expect((await action('participant/recovery/complete', { contact, code: '000000', password }, result!.headers.get('set-cookie')!))?.status).toBe(401);
  }
  expect(delivered).toHaveLength(0);
 });

 it('fails closed on mail errors, unsupported credentials, origin violations and excessive login attempts', async () => {
  const disabled = createAuth(fixture.db, { secret, origin });
  expect((await disabled.authAction(request('participant/signup', profile), ['auth', 'participant', 'signup']))?.status).toBe(503);
  const unavailable = createAuth(fixture.db, { secret, origin, sendEmail: async () => { throw new Error('private SMTP detail'); } });
  const failed = await unavailable.authAction(request('participant/signup', profile), ['auth', 'participant', 'signup']);
  expect(failed?.status).toBe(503); expect(await failed!.text()).not.toContain('private SMTP');
  expect(new Date((await fixture.db.query('SELECT expires_at FROM native_participant_challenges')).rows[0].expires_at).getTime()).toBeLessThanOrEqual(Date.now());
  expect((await auth.authAction(request('participant/login', { contact: profile.contact, password }, undefined, 'https://evil.example'), ['auth', 'participant', 'login']))?.status).toBe(403);
  for (let attempt = 0; attempt < 5; attempt++) expect((await action('participant/login', { contact: profile.contact, password }))?.status).toBe(401);
  expect((await action('participant/login', { contact: profile.contact, password }))?.status).toBe(429);
 });
});
