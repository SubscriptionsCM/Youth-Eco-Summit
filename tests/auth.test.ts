import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { URI } from 'otpauth';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
import { createAuth, bootstrapOwner, hashPassword } from '../src/server/auth';

describe('database-backed authentication', () => {
  let fixture: Awaited<ReturnType<typeof testDb>>;
  let auth: ReturnType<typeof createAuth>;
  let otp = '';
  let mail = '';
  const secret = 'test-only-auth-secret-at-least-32-characters';
  const origin = 'http://localhost:3000';
  const request = (path: string, body: unknown = {}, cookie?: string, requestOrigin = origin) =>
    new Request(`${origin}/api/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: requestOrigin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const action = (path: string, body: unknown = {}, cookie?: string) => auth.authAction(request(path, body, cookie), ['auth', ...path.split('/')]);
  beforeEach(async () => {
    fixture = await testDb();
    auth = createAuth(fixture.db, { secret, origin, secureCookies: false,
      sendOtp: async (_contact, code) => { otp = code; },
      sendEmail: async (_contact, _subject, text) => { mail = text; },
    });
  });
  afterEach(async () => fixture?.close());

  it('stores hashed one-time OTPs and creates a revocable guardian session', async () => {
    expect((await action('otp/request', { contact: '+919876543210' }))?.status).toBe(200);
    expect(otp).toMatch(/^\d{6}$/);
    const stored = await fixture.db.query('select * from auth_otps');
    expect(stored.rows[0].code_hash).not.toBe(otp);
    expect(stored.rows[0]).not.toHaveProperty('code');
    const verified = await action('otp/verify', { contact: '+919876543210', code: otp });
    expect(verified?.status).toBe(200);
    const cookie = verified!.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    const actor = await auth.getActor(request('session', {}, cookie));
    expect(actor?.role).toBe('participant');
    expect((await action('otp/verify', { contact: '+919876543210', code: otp }))?.status).toBe(401);
    await fixture.db.query('update users set active=false where id=$1', [actor!.id]);
    expect(await auth.getActor(request('session', {}, cookie))).toBeNull();
    await fixture.db.query('update users set active=true where id=$1', [actor!.id]);
    expect(await auth.getActor(request('session', {}, cookie))).toBeNull();
  });

  it('enforces resend delay, attempt ceiling, expiry, and origin checks', async () => {
    await action('otp/request', { contact: '+919876543211' });
    expect((await action('otp/request', { contact: '+919876543211' }))?.status).toBe(429);
    for (let i=0; i<5; i++) expect((await action('otp/verify', { contact: '+919876543211', code: '000000' === otp ? '111111' : '000000' }))?.status).toBe(401);
    expect((await action('otp/verify', { contact: '+919876543211', code: otp }))?.status).toBe(401);
    await action('otp/request', { contact: '+919876543212' });
    await fixture.db.query("update auth_otps set expires_at=now()-interval '1 minute'");
    expect((await action('otp/verify', { contact: '+919876543212', code: otp }))?.status).toBe(401);
    expect((await auth.authAction(request('otp/request', {contact:'+919876543213'}, undefined, 'https://evil.example'), ['auth','otp','request']))?.status).toBe(403);
  });

  it('fails closed without a delivery service and never returns development codes', async () => {
    const disabled = createAuth(fixture.db, { secret, origin, secureCookies: false });
    const response = await disabled.authAction(request('otp/request', {contact:'+919876543210'}), ['auth','otp','request']);
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toMatch(/\d{6}/);
  });

  it('requires password plus fresh MFA for staff and revokes logout sessions', async () => {
    const enrollment = await bootstrapOwner(fixture.db, { contact: 'owner@example.org', name:'Owner', password:'Long unique password 123!', secret });
    expect((await action('login', {contact:'owner@example.org', password:'Long unique password 123!'}))?.status).toBe(401);
    const totp = URI.parse(enrollment.provisioningUri).generate();
    const response = await action('login', {contact:'owner@example.org', password:'Long unique password 123!', totp});
    expect(response?.status).toBe(200);
    const cookie = response!.headers.get('set-cookie')!;
    expect((await auth.getActor(request('session', {}, cookie)))?.role).toBe('owner');
    expect((await action('login', {contact:'owner@example.org', password:'Long unique password 123!', totp}))?.status).toBe(401);
    await action('logout', {}, cookie);
    expect(await auth.getActor(request('session', {}, cookie))).toBeNull();
  });

  it('rejects participant invitations and consumes invitations after MFA enrollment', async () => {
    await action('otp/request', {contact:'+919876543210'});
    const participant = await action('otp/verify', {contact:'+919876543210',code:otp});
    expect((await action('invitations', {contact:'judge@example.org',role:'judge'}, participant!.headers.get('set-cookie')!))?.status).toBe(403);
    const enrollment = await bootstrapOwner(fixture.db, {contact:'owner@example.org', name:'Owner',password:'Long unique password 123!',secret});
    const owner = await action('login', {contact:'owner@example.org',password:'Long unique password 123!',totp:URI.parse(enrollment.provisioningUri).generate()});
    expect((await action('invitations', {contact:'judge@example.org',role:'judge',name:'Judge'}, owner!.headers.get('set-cookie')!))?.status).toBe(200);
    const token = new URL(mail.match(/https?:\/\/\S+/)![0]).searchParams.get('token');
    const setup = await action('invitation/setup', {token});
    const {data} = await setup!.json();
    const accepted = await action('invitation/accept', {token,password:'Another secure password 123!',totp:URI.parse(data.provisioningUri).generate()});
    expect(accepted?.status).toBe(200);
    expect((await action('invitation/setup', {token}))?.status).toBe(401);
    expect((await fixture.db.query('select role from users where contact=$1',['judge@example.org'])).rows[0].role).toBe('judge');
  });

  it('allows admins to invite judges while reserving elevated roles for owners', async () => {
    const userId=randomUUID(),token=randomBytes(32).toString('hex');
    await fixture.db.query("insert into users(id,role,contact,totp_secret) values($1,'admin','admin@example.org','enrolled-fixture')",[userId]);
    await fixture.db.query("insert into auth_sessions(token_hash,user_id,auth_version,mfa_verified,expires_at) values($1,$2,0,true,now()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),userId]);
    const cookie=`yes_session=${token}`;
    expect((await action('invitations',{contact:'judge@example.org',role:'judge'},cookie))?.status).toBe(200);
    expect((await action('invitations',{contact:'other-admin@example.org',role:'admin'},cookie))?.status).toBe(403);
    expect((await action('invitations',{contact:'owner@example.org',role:'owner'},cookie))?.status).toBe(403);
    const invitationToken=new URL(mail.match(/https?:\/\/\S+/)![0]).searchParams.get('token');
    expect((await action('invitation/setup',{token:invitationToken}))?.status).toBe(200);
    await fixture.db.query('update users set active=false where id=$1',[userId]);
    expect((await action('invitation/setup',{token:invitationToken}))?.status).toBe(401);
  });

  it('hashes passwords using per-password salts', async () => {
    expect(await hashPassword('Strong passphrase 123!')).not.toBe(await hashPassword('Strong passphrase 123!'));
  });

  it('expires cookies server-side and rejects sessions after credential version changes', async () => {
    await action('otp/request', {contact:'+919876543210'});
    const first = await action('otp/verify', {contact:'+919876543210',code:otp});
    const cookie = first!.headers.get('set-cookie')!;
    const actor = await auth.getActor(request('session',{},cookie));
    await fixture.db.query('update users set auth_version=auth_version+1 where id=$1',[actor!.id]);
    expect(await auth.getActor(request('session',{},cookie))).toBeNull();
    await fixture.db.query('update users set auth_version=auth_version-1 where id=$1',[actor!.id]);
    await fixture.db.query("update auth_sessions set expires_at=now()-interval '1 second'");
    expect(await auth.getActor(request('session',{},cookie))).toBeNull();
  });

  it('enforces persistent contact rates even after the resend cooldown passes', async () => {
    for(let i=0;i<5;i++) {
      expect((await action('otp/request',{contact:'+919876543210'}))?.status).toBe(200);
      await fixture.db.query("update auth_otps set created_at=now()-interval '61 seconds'");
    }
    expect((await action('otp/request',{contact:'+919876543210'}))?.status).toBe(429);
    expect((await fixture.db.query("select count from auth_rates where key like 'otp-send:contact:%'")).rows[0].count).toBe(6);
  });

  it('requires MFA during recovery, revokes old sessions, and consumes recovery links', async () => {
    const enrollment = await bootstrapOwner(fixture.db,{contact:'owner@example.org',name:'Owner',password:'Long unique password 123!',secret});
    const generator = URI.parse(enrollment.provisioningUri);
    const login = await action('login',{contact:'owner@example.org',password:'Long unique password 123!',totp:generator.generate()});
    const cookie = login!.headers.get('set-cookie')!;
    await action('recovery/request',{contact:'owner@example.org'});
    const token = new URL(mail.match(/https?:\/\/\S+/)![0]).searchParams.get('token');
    expect((await action('recovery/complete',{token,password:'New unique password 456!'}))?.status).toBe(401);
    // Reset the fixture counter to represent the next valid authenticator interval without waiting.
    await fixture.db.query('update users set totp_last_counter=-1');
    expect((await action('recovery/complete',{token,password:'New unique password 456!',totp:generator.generate()}))?.status).toBe(200);
    expect(await auth.getActor(request('session',{},cookie))).toBeNull();
    expect((await action('recovery/complete',{token,password:'New unique password 456!',totp:generator.generate()}))?.status).toBe(401);
    await fixture.db.query('update users set totp_last_counter=-1');
    expect((await action('login',{contact:'owner@example.org',password:'Long unique password 123!',totp:generator.generate()}))?.status).toBe(401);
    expect((await action('login',{contact:'owner@example.org',password:'New unique password 456!',totp:generator.generate()}))?.status).toBe(200);
  });
});

