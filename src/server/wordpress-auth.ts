import { execFile } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { AppError, audit, id, type Actor } from './core';
import type { Db } from './db';

export type WordPressAction = 'login' | 'status' | 'mail' | 'recovery' | 'create' | 'notification-plan' | 'notification-mail';
export interface WordPressBridge {
  call(action: WordPressAction, input: Record<string, unknown>): Promise<unknown>;
}
const identitySchema = z.object({
  source: z.url(), sourceUserId: z.string().regex(/^[1-9][0-9]{0,19}$/),
  email: z.email().max(254), username: z.string().min(1).max(60), name: z.string().max(254),
  credentialFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
type WordPressIdentity = z.infer<typeof identitySchema>;
type Binding = { source: string; source_user_id: string; user_id: string; credential_fingerprint: string };
const unavailable = () => new AppError(503, 'Account services are temporarily unavailable. Please try again later.');

async function accountCall(bridge: WordPressBridge, action: WordPressAction, input: Record<string, unknown>) {
  try { return await bridge.call(action, input); }
  catch (error) {
    if (error instanceof AppError && error.status === 401) throw new AppError(401, 'The account details were not accepted. Check your username or email and password.');
    if (error instanceof AppError && error.status === 409) throw new AppError(409, 'Registration could not be completed with these details. Sign in or contact support.');
    throw unavailable();
  }
}

function parseIdentity(value: unknown): WordPressIdentity {
  const parsed = identitySchema.safeParse(value);
  if (!parsed.success || parsed.data.source !== process.env.WORDPRESS_ORIGIN?.replace(/\/$/, '')) throw unavailable();
  return { ...parsed.data, email: parsed.data.email.trim().toLowerCase() };
}

/** The private PHP file and WordPress root are operator configuration, never request inputs. */
export function createWordPressBridge(config: { bridgePath: string; root: string; origin: string }): WordPressBridge {
  if (!path.isAbsolute(config.bridgePath) || !path.isAbsolute(config.root)) throw unavailable();
  const relative = path.relative(config.root, config.bridgePath);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw unavailable();
  const origin = new URL(config.origin);
  if (origin.protocol !== 'https:' || origin.origin !== config.origin.replace(/\/$/, '')) throw unavailable();
  return {
    async call(action, input) {
      const body = JSON.stringify({ action, input });
      const notification = action === 'notification-plan' || action === 'notification-mail';
      if (Buffer.byteLength(body) > (notification ? 1_048_576 : 32_768)) throw new AppError(413, 'The account request is too large.');
      const output = await new Promise<string>((resolve, reject) => {
        const child = execFile('php', [config.bridgePath], {
          encoding: 'utf8', shell: false, windowsHide: true, timeout: 15_000, maxBuffer: notification ? 2_097_152 : 16_384,
          env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WORDPRESS_ROOT: config.root, WORDPRESS_ORIGIN: origin.origin, WORDPRESS_MAIL_TEMP_ROOT: process.env.WORDPRESS_MAIL_TEMP_ROOT },
        }, (error, stdout) => { if (error) reject(unavailable()); else resolve(stdout); });
        child.stdin?.on('error', () => reject(unavailable()));
        child.stdin?.end(body);
      });
      let response: unknown;
      try { response = JSON.parse(output); } catch { throw unavailable(); }
      const result = z.object({ ok: z.boolean(), data: z.unknown().optional(), error: z.enum(['credentials', 'unavailable', 'conflict']).optional() }).strict().safeParse(response);
      if (!result.success) throw unavailable();
      if (!result.data.ok) {
        if (result.data.error === 'credentials') throw new AppError(401, 'The account details were not accepted. Check your username or email and password.');
        if (result.data.error === 'conflict') throw new AppError(409, 'Registration could not be completed with these details. Sign in or contact support.');
        throw unavailable();
      }
      return result.data.data;
    },
  };
}

export function wordPressAuthConfigured() {
  return process.env.AUTH_PARTICIPANT_PROVIDER === 'wordpress' && !!process.env.WORDPRESS_BRIDGE_PATH && !!process.env.WORDPRESS_ROOT && !!process.env.WORDPRESS_ORIGIN;
}
export function environmentWordPressBridge(): WordPressBridge | undefined {
  if (!wordPressAuthConfigured()) return undefined;
  try { return createWordPressBridge({ bridgePath: process.env.WORDPRESS_BRIDGE_PATH!, root: process.env.WORDPRESS_ROOT!, origin: process.env.WORDPRESS_ORIGIN! }); }
  catch { return undefined; }
}

async function revokeSessions(tx: Db, userId: string) {
  await tx.query('UPDATE users SET auth_version=auth_version+1,updated_at=now() WHERE id=$1', [userId]);
  await tx.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
}

async function bindIdentity(db: Db, identity: WordPressIdentity) {
  return db.transaction(tx => bindIdentityInTransaction(tx, identity));
}
async function bindIdentityInTransaction(tx: Db, identity: WordPressIdentity) {
    // Serialize claims with the existing Supabase account linker, which takes an
    // EXCLUSIVE lock on its identity table before checking local contacts.
    await tx.query('LOCK TABLE supabase_identities,wordpress_account_identities IN EXCLUSIVE MODE');
    const { rows: [linked] } = await tx.query(`SELECT u.*,w.credential_fingerprint FROM wordpress_account_identities w
      JOIN users u ON u.id=w.user_id WHERE w.source=$1 AND w.source_user_id=$2 FOR UPDATE OF u`, [identity.source, identity.sourceUserId]);
    if (linked) {
      if (!linked.active || linked.role !== 'participant') throw new AppError(403, 'This participant account is unavailable.');
      if (linked.contact !== identity.email) throw new AppError(409, 'Contact support to reconcile this changed email address.');
      if (linked.credential_fingerprint !== identity.credentialFingerprint) {
        await revokeSessions(tx, linked.id);
        await tx.query('UPDATE wordpress_account_identities SET credential_fingerprint=$3,updated_at=now() WHERE source=$1 AND source_user_id=$2', [identity.source, identity.sourceUserId, identity.credentialFingerprint]);
      }
      return (await tx.query('SELECT * FROM users WHERE id=$1', [linked.id])).rows[0];
    }
    if ((await tx.query('SELECT id FROM users WHERE lower(contact)=$1', [identity.email])).rows.length) throw new AppError(409, 'An existing account uses these details. Contact support to reconcile account access.');
    const { rows: [user] } = await tx.query<Actor>("INSERT INTO users(id,role,contact,name) VALUES($1,'participant',$2,$3) RETURNING *", [id(), identity.email, identity.name]);
    await tx.query('INSERT INTO wordpress_account_identities(source,source_user_id,user_id,credential_fingerprint) VALUES($1,$2,$3,$4)', [identity.source, identity.sourceUserId, user.id, identity.credentialFingerprint]);
    await audit(tx, user, 'auth.wordpress.link', 'user', user.id, { source: identity.source, sourceUserId: identity.sourceUserId });
    return user;
}

type RegistrationOptions = {
  request: Request; secret: string; secureCookies?: boolean;
  sendEmail?: (contact: string, subject: string, body: string) => Promise<void>;
};
const registrationCookie = 'yes_wp_registration';
const registrationProfile = z.object({
  contact: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  username: z.string().trim().min(1).max(60).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  formKey: z.enum(['student', 'teacher']),
});
type Profile = z.infer<typeof registrationProfile>;
type Challenge = { id: string; browser_hash: string; form_key: string; recipient: string; username: string; registration_nonce: string; code_hash: string; consumed_at: unknown; cooling?: boolean };
function browserToken(request: Request) {
  const value = request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(`${registrationCookie}=`))?.slice(registrationCookie.length + 1) ?? '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
}
const browserHash = (token: string) => createHash('sha256').update(token).digest('hex');
function challengeHash(secret: string, challenge: Pick<Challenge, 'id' | 'browser_hash' | 'form_key' | 'recipient' | 'username'>, code: string) {
  return createHmac('sha256', secret).update(JSON.stringify([challenge.id, challenge.browser_hash, challenge.form_key, challenge.recipient, challenge.username, code])).digest('hex');
}
async function sendRegistrationCode(db: Db, profile: Profile, options: RegistrationOptions, resend: boolean) {
  if (!options.sendEmail) throw new AppError(503, 'Email delivery is not configured.');
  let token = browserToken(options.request);
  if (!token && resend) throw new AppError(401, 'Start registration again in this browser before requesting another code.');
  if (!token) token = randomBytes(32).toString('hex');
  const hashedBrowser = browserHash(token), code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const challenge = await db.transaction(async tx => {
    await tx.query('LOCK TABLE wordpress_registration_challenges IN EXCLUSIVE MODE');
    const { rows: [old] } = await tx.query<Challenge>("SELECT *,updated_at>now()-interval '60 seconds' AS cooling FROM wordpress_registration_challenges WHERE browser_hash=$1 AND form_key=$2 FOR UPDATE", [hashedBrowser, profile.formKey]);
    if (resend && (!old || old.recipient !== profile.contact || old.username !== profile.username)) throw new AppError(401, 'Start registration again with the same account details.');
    const recent = await tx.query("SELECT id FROM wordpress_registration_challenges WHERE recipient=$1 AND updated_at>now()-interval '60 seconds' LIMIT 1", [profile.contact]);
    if (old?.cooling || recent.rows.length) throw new AppError(429, 'Wait 60 seconds before requesting another email code.');
    const sameProfile = old && !old.consumed_at && old.recipient === profile.contact && old.username === profile.username;
    const values = { id: old?.id ?? id(), browser_hash: hashedBrowser, form_key: profile.formKey, recipient: profile.contact, username: profile.username,
      registration_nonce: sameProfile ? old.registration_nonce : id(), code_hash: '' };
    values.code_hash = challengeHash(options.secret, values, code);
    await tx.query(`INSERT INTO wordpress_registration_challenges(id,browser_hash,form_key,recipient,username,registration_nonce,code_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes') ON CONFLICT(browser_hash,form_key) DO UPDATE SET
      recipient=EXCLUDED.recipient,username=EXCLUDED.username,registration_nonce=EXCLUDED.registration_nonce,code_hash=EXCLUDED.code_hash,
      attempts=0,expires_at=EXCLUDED.expires_at,consumed_at=NULL,updated_at=now()`, [values.id, values.browser_hash, values.form_key, values.recipient, values.username, values.registration_nonce, values.code_hash]);
    return values;
  });
  try { await options.sendEmail(profile.contact, 'Verify your Youth Eco Summit registration email', `Your Youth Eco Summit email verification code is ${code}. It expires in 10 minutes. Use it only in the browser where you started your ${profile.formKey} registration.`); }
  catch {
    await db.query('UPDATE wordpress_registration_challenges SET expires_at=now() WHERE id=$1 AND code_hash=$2', [challenge.id, challenge.code_hash]);
    throw new AppError(503, 'Email delivery is temporarily unavailable. Please try again later.');
  }
  return Response.json({ data: { sent: true, retryAfter: 60, message: 'Check your email for the account confirmation code. Keep this registration open in the same browser.' } }, {
    headers: { 'Cache-Control': 'no-store', 'Set-Cookie': `${registrationCookie}=${token}; Path=/api/auth/participant; HttpOnly; SameSite=Lax; Max-Age=86400${options.secureCookies !== false ? '; Secure' : ''}` },
  });
}

async function verifyRegistration(db: Db, profile: Profile, input: Record<string, unknown>, bridge: WordPressBridge, options: RegistrationOptions) {
  const parsed = z.object({ code: z.string().regex(/^\d{6}$/), password: z.string().min(1).max(4096).refine(value => Buffer.byteLength(value) <= 4096) }).safeParse(input);
  if (!parsed.success) throw new AppError(400, 'Enter the emailed code and your chosen password.');
  const token = browserToken(options.request);
  if (!token) throw new AppError(401, 'The registration code is invalid or expired. Start again in this browser.');
  const { rows: [challenge] } = await db.query<Challenge>(`UPDATE wordpress_registration_challenges SET attempts=attempts+1
    WHERE browser_hash=$1 AND form_key=$2 AND recipient=$3 AND username=$4 AND consumed_at IS NULL AND expires_at>now() AND attempts<5 RETURNING *`, [browserHash(token), profile.formKey, profile.contact, profile.username]);
  const expected = challenge && challengeHash(options.secret, challenge, parsed.data.code);
  if (!challenge || !expected || !timingSafeEqual(Buffer.from(challenge.code_hash, 'hex'), Buffer.from(expected, 'hex'))) throw new AppError(401, 'The registration code is invalid or expired.');
  try {
    return await db.transaction(async tx => {
      const { rows: [current] } = await tx.query<Challenge>('SELECT * FROM wordpress_registration_challenges WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE', [challenge.id]);
      if (!current || current.code_hash !== challenge.code_hash) throw new AppError(401, 'The registration code is invalid or expired.');
      await tx.query('LOCK TABLE supabase_identities,wordpress_account_identities IN EXCLUSIVE MODE');
      if ((await tx.query('SELECT id FROM users WHERE lower(contact)=$1', [profile.contact])).rows.length) throw new AppError(409, 'An existing account uses these details. Sign in or contact support.');
      const identity = parseIdentity(await accountCall(bridge, 'create', { email: profile.contact, username: profile.username, formKey: profile.formKey, password: parsed.data.password, registrationNonce: current.registration_nonce }));
      if (identity.email !== profile.contact || identity.username !== profile.username) throw unavailable();
      const user = await bindIdentityInTransaction(tx, identity);
      await tx.query('UPDATE wordpress_registration_challenges SET consumed_at=now() WHERE id=$1', [challenge.id]);
      return user;
    });
  } catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
}

/** Every cookie read rechecks authoritative credentials and account status. */
export async function verifyWordPressActor(db: Db, actor: Actor, bridge?: WordPressBridge) {
  const { rows: [binding] } = await db.query<Binding>('SELECT * FROM wordpress_account_identities WHERE user_id=$1', [actor.id]);
  if (!binding) return true;
  if (!bridge || actor.role !== 'participant') return false;
  try {
    const current = parseIdentity(await bridge.call('status', { sourceUserId: binding.source_user_id }));
    if (current.source === binding.source && current.sourceUserId === binding.source_user_id && current.email === actor.contact && current.credentialFingerprint === binding.credential_fingerprint) return true;
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 401) return false;
  }
  await db.transaction(async tx => {
    // A delayed credential check must not revoke a login using newer credentials.
    const { rows: [current] } = await tx.query<Binding>('SELECT * FROM wordpress_account_identities WHERE user_id=$1 FOR UPDATE', [actor.id]);
    if (current?.credential_fingerprint === binding.credential_fingerprint) await revokeSessions(tx, actor.id);
  });
  return false;
}

export async function wordPressParticipantAction(db: Db, route: string, input: Record<string, unknown>, bridge: WordPressBridge | undefined, startSession: (user: any, mfa: boolean) => Promise<Response>, registration: RegistrationOptions) {
  if (!bridge) throw unavailable();
  if (['participant/signup', 'participant/resend', 'participant/verify'].includes(route)) {
    const profile = registrationProfile.safeParse(input);
    if (!profile.success) throw new AppError(400, 'Enter your registration username, email and student or educator form.');
    if (route !== 'participant/verify') return sendRegistrationCode(db, profile.data, registration, route === 'participant/resend');
    return startSession(await verifyRegistration(db, profile.data, input, bridge, registration), false);
  }
  if (!['participant/login', 'participant/recovery/request'].includes(route)) throw new AppError(400, 'Follow the emailed password-reset link, then return to sign in.');
  const contact = z.string().trim().min(1).max(254).safeParse(input.contact);
  if (!contact.success) throw new AppError(400, 'Enter your username or email address.');
  if (route === 'participant/recovery/request') {
    await accountCall(bridge,'recovery', { contact: contact.data });
    return Response.json({ data: { sent: true, recovery: 'link', message: 'If an eligible account exists, a password-reset link has been emailed. Follow that link, then return here to sign in.' } }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const password = z.string().min(1).max(4096).refine(value => Buffer.byteLength(value) <= 4096).safeParse(input.password);
  if (!password.success) throw new AppError(400, 'Enter your password.');
  const identity = parseIdentity(await accountCall(bridge,'login', { contact: contact.data, password: password.data }));
  return startSession(await bindIdentity(db, identity), false);
}
