import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import { db as database, type Db } from './db';
import { AppError, type Actor, audit } from './core';
import { supabaseParticipantAction } from './supabase-auth';
import { environmentWordPressBridge, verifyWordPressActor, wordPressParticipantAction, type WordPressBridge } from './wordpress-auth';

const derive = (value: string, salt: string, length: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(value, salt, length, options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const COOKIE = 'yes_session';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (data: unknown, status = 200) => Response.json({ data }, { status, headers: { 'Cache-Control': 'no-store' } });
type Delivery = (contact: string, code: string) => Promise<void>;
export interface AuthOptions {
  secret: string;
  origin: string;
  secureCookies?: boolean;
  sendOtp?: Delivery;
  sendEmail?: (contact: string, subject: string, body: string) => Promise<void>;
  wordpressBridge?: WordPressBridge;
  /** Configure only behind a proxy that overwrites this header. */
  trustedIpHeader?: string;
}
type User = Actor & { active: boolean; password_hash: string | null; totp_secret: string | null; totp_last_counter: string | number; auth_version: number };

function key(secret: string) {
  if (secret.length < 32) throw new AppError(503, 'Authentication is not configured.');
  return createHash('sha256').update(secret).digest();
}
function encrypt(value: string, secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
function decrypt(value: string, secret: string) {
  const bytes = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key(secret), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
}
function totp(secret: string, contact: string) {
  return new TOTP({ issuer: 'Youth Eco Summit', label: contact, algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) });
}
function counter(secret: string, contact: string, code: unknown) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const now = Date.now(), delta = totp(secret, contact).validate({ token: code, timestamp: now, window: 1 });
  return delta === null ? null : Math.floor(now / 30_000) + delta;
}
function contact(value: unknown, phone = false) {
  if (typeof value !== 'string' || value.length > 254) throw new AppError(400, 'A valid contact is required.');
  const normalized = value.trim().toLowerCase();
  if (!(phone ? /^\+[1-9]\d{7,14}$/ : /^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(normalized)) throw new AppError(400, phone ? 'Use a phone number with country code.' : 'A valid email is required.');
  return normalized;
}
function password(value: unknown) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) throw new AppError(400, 'Use a password between 12 and 256 characters.');
  return value;
}
export async function hashPassword(value: string) {
  password(value);
  const salt = randomBytes(16).toString('hex');
  const result = await derive(value, salt, 64, SCRYPT_OPTIONS) as Buffer;
  return `scrypt-32768-8-3$${salt}$${result.toString('hex')}`;
}
async function verifyPassword(value: unknown, hash: string | null) {
  if (typeof value !== 'string' || value.length > 256) return false;
  const [, salt, expected] = (hash || `scrypt-32768-8-3$${'0'.repeat(32)}$${'0'.repeat(128)}`).split('$');
  const actual = await derive(value, salt, 64, SCRYPT_OPTIONS) as Buffer;
  return !!hash && same(actual.toString('hex'), expected);
}
function sessionToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
}
export function assertSameOrigin(request: Request, configuredOrigin = process.env.APP_ORIGIN || '') {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  if (!configuredOrigin) throw new AppError(503, 'Application origin is not configured.');
  if (request.headers.get('origin') !== new URL(configuredOrigin).origin) throw new AppError(403, 'Request origin is not allowed.');
}

export function createAuth(db: Db, options: AuthOptions) {
  const wordpressBridge = options.wordpressBridge ?? environmentWordPressBridge();
  const cookie = (value: string, seconds: number) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${options.secureCookies !== false ? '; Secure' : ''}`;
  const otpHash = (phone: string, code: string) => createHmac('sha256', key(options.secret)).update(`${phone}:${code}`).digest('hex');
  async function getActor(request: Request): Promise<Actor | null> {
    const token = sessionToken(request);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const query = `SELECT u.id,u.role,u.contact,EXISTS(SELECT 1 FROM wordpress_account_identities w WHERE w.user_id=u.id) AS wordpress_bound
      FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active=true
      AND s.auth_version=u.auth_version AND (u.role='participant' OR (s.mfa_verified=true AND u.totp_secret IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM supabase_identities si WHERE si.user_id=u.id AND si.recovery_nonce IS NOT NULL)`;
    const tokenHash = digest(token);
    const { rows: [found] } = await db.query<Actor & {wordpress_bound: boolean}>(query, [tokenHash]);
    if (!found) return null;
    const { wordpress_bound: wordpressBound, ...actor } = found;
    if (!wordpressBound) return actor;
    if (!await verifyWordPressActor(db, actor, wordpressBridge)) return null;
    // Source checks cross a process boundary. Recheck local revocation/version
    // after that wait so a concurrent logout or password reset takes effect.
    const { rows: [current] } = await db.query<Actor & {wordpress_bound: boolean}>(query, [tokenHash]);
    if (!current?.wordpress_bound || current.id !== actor.id || current.role !== actor.role || current.contact !== actor.contact) return null;
    return actor;
  }
  async function rate(request: Request, purpose: string, identity: string, limit = 10) {
    const network = options.trustedIpHeader ? request.headers.get(options.trustedIpHeader)?.split(',')[0]?.trim() || 'unknown' : 'untrusted';
    for (const [scope, value, ceiling] of [['contact', identity, limit], ['network', network, limit * 8]] as const) {
      const rateKey = `${purpose}:${scope}:${digest(value)}`;
      const { rows } = await db.query<{count: number}>(`INSERT INTO auth_rates(key,count,resets_at) VALUES($1,1,now()+interval '15 minutes')
        ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_rates.resets_at<=now() THEN 1 ELSE auth_rates.count+1 END,
        resets_at=CASE WHEN auth_rates.resets_at<=now() THEN now()+interval '15 minutes' ELSE auth_rates.resets_at END RETURNING count`, [rateKey]);
      if (rows[0].count > ceiling) throw new AppError(429, 'Too many attempts. Please try again later.');
    }
  }
  async function startSession(user: User, mfa: boolean) {
    const token = randomBytes(32).toString('hex'), seconds = user.role === 'participant' ? 43_200 : 28_800;
    await db.transaction(async tx => {
      // Serialize issuance with recovery's credential-version change. An identity
      // lookup performed before recovery started must not create a new session.
      const { rows: [current] } = await tx.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id]);
      if (!current?.active || current.role !== user.role || current.auth_version !== user.auth_version
        || (current.role !== 'participant' && (!mfa || !current.totp_secret))) throw new AppError(403, 'This account changed. Sign in again.');
      const pending = await tx.query('SELECT auth_user_id FROM supabase_identities WHERE user_id=$1 AND recovery_nonce IS NOT NULL', [user.id]);
      if (pending.rows.length) throw new AppError(403, 'Password recovery is pending. Contact support to reconcile account access.');
      await tx.query('INSERT INTO auth_sessions(token_hash,user_id,auth_version,mfa_verified,expires_at) VALUES($1,$2,$3,$4,$5)', [digest(token), user.id, current.auth_version, mfa, new Date(Date.now() + seconds * 1000)]);
    });
    const response = json({ actor: { id: user.id, role: user.role, contact: user.contact } });
    response.headers.set('Set-Cookie', cookie(token, seconds));
    return response;
  }
  async function consumeMfa(user: User, code: unknown, target: Db = db) {
    if (!user.totp_secret) return false;
    const step = counter(decrypt(user.totp_secret, options.secret), user.contact || '', code);
    if (step === null) return false;
    const { rows } = await target.query('UPDATE users SET totp_last_counter=$2 WHERE id=$1 AND active=true AND totp_last_counter<$2 RETURNING id', [user.id, step]);
    return rows.length === 1;
  }
  async function body(request: Request): Promise<Record<string, unknown>> {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 32_768) throw new AppError(413, 'Request is too large.');
    try { const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; }
    catch { throw new AppError(400, 'A JSON object is required.'); }
  }
  async function authAction(request: Request, path: string[]): Promise<Response | null> {
    if (path[0] !== 'auth') return null;
    try {
      assertSameOrigin(request, options.origin);
      key(options.secret);
      const route = path.slice(1).join('/');
      if (route === 'session' && request.method === 'GET') return json({ actor: await getActor(request) });
      if (request.method !== 'POST') throw new AppError(405, 'Method not allowed.');
      const input = await body(request);
      if (['participant/signup','participant/login','participant/verify','participant/resend','participant/recovery/request','participant/recovery/complete'].includes(route)) {
        const participantProvider = process.env.AUTH_PARTICIPANT_PROVIDER === 'wordpress' ? 'wordpress' : 'supabase';
        await rate(request,participantProvider+'-'+route,String(input.contact||'').trim().toLowerCase(),5);
        if (process.env.AUTH_PARTICIPANT_PROVIDER === 'wordpress') return await wordPressParticipantAction(db,route,input,wordpressBridge,startSession,{...options,request});
        return await supabaseParticipantAction(db,route,input,startSession);
      }
      if (route === 'otp/request') {
        const phone = contact(input.contact, true);
        await rate(request, 'otp-send', phone, 5);
        if (!options.sendOtp) throw new AppError(503, 'SMS delivery is not configured. Please contact support.');
        const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
        const { rows } = await db.query(`INSERT INTO auth_otps(contact,code_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')
          ON CONFLICT(contact) DO UPDATE SET code_hash=EXCLUDED.code_hash,attempts=0,created_at=now(),expires_at=EXCLUDED.expires_at,consumed_at=NULL
          WHERE auth_otps.created_at<now()-interval '60 seconds' RETURNING contact`, [phone, otpHash(phone, code)]);
        if (!rows.length) throw new AppError(429, 'Wait 60 seconds before requesting another code.');
        try { await options.sendOtp(phone, code); }
        catch { await db.query('UPDATE auth_otps SET consumed_at=now() WHERE contact=$1 AND code_hash=$2', [phone, otpHash(phone,code)]); throw new AppError(503, 'SMS delivery is unavailable. Please try again later.'); }
        return json({ sent: true, expiresIn: 300, retryAfter: 60 });
      }
      if (route === 'otp/verify') {
        const phone = contact(input.contact, true);
        await rate(request, 'otp-verify', phone, 20);
        const { rows } = await db.query<{ code_hash: string }>(`UPDATE auth_otps SET attempts=attempts+1 WHERE contact=$1 AND consumed_at IS NULL AND expires_at>now() AND attempts<5 RETURNING code_hash`, [phone]);
        if (!rows.length || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code) || !same(rows[0].code_hash, otpHash(phone, input.code))) throw new AppError(401, 'Code is invalid or expired.');
        const user = await db.transaction(async tx => {
          const claimed = await tx.query('UPDATE auth_otps SET consumed_at=now() WHERE contact=$1 AND code_hash=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING contact', [phone, rows[0].code_hash]);
          if (!claimed.rows.length) throw new AppError(401, 'Code is invalid or expired.');
          const users = await tx.query<User>(`INSERT INTO users(id,contact,role) VALUES($1,$2,'participant') ON CONFLICT(contact) DO UPDATE SET updated_at=now() RETURNING *`, [randomUUID(), phone]);
          if (!users.rows[0].active || users.rows[0].role !== 'participant') throw new AppError(401, 'This account cannot use contact sign-in.');
          await tx.query("INSERT INTO contact_verifications(id,user_id,contact,method) VALUES($1,$2,$3,'sms_otp')", [randomUUID(), users.rows[0].id, phone]);
          return users.rows[0];
        });
        return startSession(user, false);
      }
      if (route === 'login') {
        const email = contact(input.contact);
        await rate(request, 'login', email);
        const user = (await db.query<User>('SELECT * FROM users WHERE contact=$1', [email])).rows[0];
        const validPassword = await verifyPassword(input.password, user?.password_hash || null);
        if (!user?.active || user.role === 'participant' || !validPassword || !await consumeMfa(user, input.totp)) throw new AppError(401, 'Sign-in failed. Check your password and current authenticator code.');
        return startSession(user, true);
      }
      if (route === 'logout') {
        await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1', [digest(sessionToken(request))]);
        const response = json({ signedOut: true }); response.headers.set('Set-Cookie', cookie('', 0)); return response;
      }
      if (route === 'invitations') {
        const actor = await getActor(request);
        const email = contact(input.contact), role = input.role;
        if (!actor || (actor.role !== 'owner' && !(actor.role === 'admin' && role === 'judge'))) throw new AppError(403, 'Owners can invite staff; admins can invite judges.');
        if (!['owner','admin','judge'].includes(String(role))) throw new AppError(400, 'Choose an invited staff role.');
        await rate(request, 'invite', actor.id, 20);
        if (!options.sendEmail) throw new AppError(503, 'Email delivery is not configured.');
        if ((await db.query('SELECT id FROM users WHERE contact=$1', [email])).rows.length) throw new AppError(409, 'An account already exists for this contact.');
        const token = randomBytes(32).toString('hex'), invitationId = randomUUID();
        const name = typeof input.name === 'string' ? input.name.trim().slice(0, 160) : '';
        await db.query(`INSERT INTO auth_invitations(id,token_hash,contact,name,role,totp_secret,invited_by,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours')`, [invitationId, digest(token), email, name, role, encrypt(new Secret({size:20}).base32, options.secret), actor.id]);
        try { await options.sendEmail(email, 'Your Youth Eco Summit invitation', `${options.origin}/invite?token=${token}`); }
        catch { await db.query('UPDATE auth_invitations SET consumed_at=now() WHERE id=$1', [invitationId]); throw new AppError(503, 'Invitation delivery is unavailable.'); }
        await audit(db, actor, 'auth.invite', 'user', invitationId, {role});
        return json({ invited: true });
      }
      if (route === 'invitation/setup' || route === 'invitation/accept') {
        const token = typeof input.token === 'string' ? input.token.slice(0, 128) : '';
        await rate(request, 'invitation', digest(token), 20);
        const invitation = (await db.query<{id:string;contact:string;name:string;role:Actor['role'];totp_secret:string}>(`SELECT i.* FROM auth_invitations i JOIN users inviter ON inviter.id=i.invited_by
          WHERE i.token_hash=$1 AND i.consumed_at IS NULL AND i.expires_at>now() AND inviter.active=true
          AND (inviter.role='owner' OR (inviter.role='admin' AND i.role='judge'))`, [digest(token)])).rows[0];
        if (!invitation) throw new AppError(401, 'Invitation is invalid or expired.');
        const seed = decrypt(invitation.totp_secret, options.secret);
        if (route === 'invitation/setup') return json({ provisioningUri: totp(seed, invitation.contact).toString(), contact: invitation.contact });
        const hash = await hashPassword(password(input.password));
        const step = counter(seed, invitation.contact, input.totp);
        if (step === null) throw new AppError(401, 'Authenticator code is invalid.');
        await db.transaction(async tx => {
          const claimed = await tx.query(`UPDATE auth_invitations SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at>now()
            AND EXISTS(SELECT 1 FROM users WHERE id=auth_invitations.invited_by AND active=true AND (role='owner' OR (role='admin' AND auth_invitations.role='judge'))) RETURNING id`, [invitation.id]);
          if (!claimed.rows.length) throw new AppError(401, 'Invitation is invalid or expired.');
          const created = await tx.query(`INSERT INTO users(id,contact,name,role,password_hash,totp_secret,totp_last_counter) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(contact) DO NOTHING RETURNING id`, [randomUUID(), invitation.contact, invitation.name, invitation.role, hash, invitation.totp_secret, step]);
          if (!created.rows.length) throw new AppError(409, 'An account already exists for this contact.');
        });
        return json({ accepted: true, message: 'Account created. Sign in with the next authenticator code.' });
      }
      if (route === 'recovery/request') {
        const email = contact(input.contact);
        await rate(request, 'recover-send', email, 5);
        if (!options.sendEmail) throw new AppError(503, 'Email delivery is not configured.');
        const user = (await db.query<User>('SELECT * FROM users WHERE contact=$1 AND active=true AND role<>\'participant\'', [email])).rows[0];
        if (user) {
          const token = randomBytes(32).toString('hex');
          await db.query("INSERT INTO auth_recovery(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')", [digest(token), user.id]);
          try { await options.sendEmail(email, 'Reset your Youth Eco Summit password', `${options.origin}/recover?token=${token}`); }
          catch { await db.query('UPDATE auth_recovery SET consumed_at=now() WHERE token_hash=$1', [digest(token)]); }
        }
        return json({ message: 'If an active staff account exists, recovery instructions have been sent.' });
      }
      if (route === 'recovery/complete') {
        const token = typeof input.token === 'string' ? input.token.slice(0,128) : '';
        await rate(request, 'recover', digest(token), 10);
        const hash = await hashPassword(password(input.password));
        await db.transaction(async tx => {
          const found = await tx.query<User>(`SELECT u.* FROM auth_recovery r JOIN users u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.consumed_at IS NULL AND r.expires_at>now() AND u.active=true FOR UPDATE OF r,u`, [digest(token)]);
          const user = found.rows[0];
          if (!user || user.role === 'participant' || !await consumeMfa(user, input.totp, tx)) throw new AppError(401, 'Recovery link or authenticator code is invalid.');
          await tx.query('UPDATE users SET password_hash=$2,auth_version=auth_version+1,updated_at=now() WHERE id=$1', [user.id, hash]);
          await tx.query('UPDATE auth_recovery SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL', [user.id]);
          await tx.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1', [user.id]);
          await audit(tx, user, 'auth.recover', 'user', user.id, {});
        });
        return json({ recovered: true, message: 'Password reset. Sign in with the next authenticator code.' });
      }
      return null;
    } catch (error) {
      if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
      throw error;
    }
  }
  return { getActor, authAction };
}

export async function bootstrapOwner(db: Db, input: {contact:string;name:string;password:string;secret:string}) {
  const email = contact(input.contact), hash = await hashPassword(input.password), seed = new Secret({size:20}).base32;
  const userId = randomUUID(), encrypted = encrypt(seed, input.secret);
  await db.transaction(async tx => {
    await tx.query('LOCK TABLE users IN EXCLUSIVE MODE');
    if ((await tx.query("SELECT id FROM users WHERE role='owner'")).rows.length) throw new AppError(409, 'An owner already exists. Use owner-managed invitations.');
    await tx.query("INSERT INTO users(id,contact,name,role,password_hash,totp_secret) VALUES($1,$2,$3,'owner',$4,$5)", [userId,email,input.name,hash,encrypted]);
  });
  return { id: userId, provisioningUri: totp(seed,email).toString() };
}

function environmentOptions(): AuthOptions {
  const enabled = process.env.AUTH_DELIVERY_ENABLED === 'true';
  const deliver = (url: string, token: string) => async (payload: unknown) => {
    if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) throw new AppError(503, 'Delivery requires HTTPS.');
    const result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000), redirect: 'error' });
    if (!result.ok) throw new Error('Delivery failed');
  };
  const sms = enabled && process.env.SMS_WEBHOOK_URL && process.env.SMS_WEBHOOK_TOKEN ? deliver(process.env.SMS_WEBHOOK_URL,process.env.SMS_WEBHOOK_TOKEN) : null;
  const wordpressBridge = environmentWordPressBridge();
  let email: ((payload: unknown) => Promise<void>) | null = null;
  if (enabled) {
    if (process.env.AUTH_PARTICIPANT_PROVIDER === 'wordpress') {
      if (wordpressBridge) email = async (payload: unknown) => { await wordpressBridge.call('mail', payload as Record<string, unknown>); };
    } else if (process.env.EMAIL_WEBHOOK_URL && process.env.EMAIL_WEBHOOK_TOKEN) email = deliver(process.env.EMAIL_WEBHOOK_URL,process.env.EMAIL_WEBHOOK_TOKEN);
  }
  return { secret: process.env.AUTH_SECRET || '', origin: process.env.APP_ORIGIN || '', secureCookies: process.env.NODE_ENV === 'production', trustedIpHeader: process.env.AUTH_TRUSTED_IP_HEADER,
    wordpressBridge,
    ...(sms ? {sendOtp: async (contact: string, code: string) => sms({to:contact,code,expiresIn:300})} : {}),
    ...(email ? {sendEmail: async (contact: string, subject: string, body: string) => email({to:contact,subject,body})} : {}),
  };
}
export const getActor = (request: Request) => createAuth(database, environmentOptions()).getActor(request);
export const authAction = (request: Request, path: string[]) => createAuth(database, environmentOptions()).authAction(request,path);
