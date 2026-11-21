import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { compare as bcryptCompare } from 'bcryptjs';
import { z } from 'zod';
import { AppError, audit, id, type Actor } from './core';
import type { Db } from './db';
import { participantKind, type ParticipantKind } from '../domain/participant-access';
import { loginAudienceLabels, type LoginAudience } from '../domain/login-audience';

const registrationCookie = 'yes_native_participant';
const alphabet = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (left: string, right: string) => left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const response = (data: unknown) => Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const username = z.string().trim().toLowerCase().pipe(z.string().min(1).max(60).refine(value => !/[\u0000-\u001f\u007f]/.test(value)));
const profileSchema = z.object({ contact: email, username, formKey: z.enum(['student', 'teacher', 'school']) });
type Profile = z.infer<typeof profileSchema>;
type NativeUser = Actor & { contact: string; active: boolean; auth_version: number; password_hash: string | null; totp_secret: string | null; totp_last_counter: string | number; native_username: string; verified_contact: string; participant_kind: ParticipantKind };
type Challenge = { id: string; purpose: 'signup' | 'recovery'; browser_hash: string; form_key: string; identifier: string; recipient: string; username: string; user_id: string | null; code_hash: string; consumed_at: unknown; cooling?: boolean };
type NativeOptions = {
 request: Request; secret: string; secureCookies?: boolean;
 sendEmail?: (contact: string, subject: string, body: string) => Promise<void>;
 hashPassword: (value: string, existingPassword?: boolean) => Promise<string>;
 verifyPassword: (value: unknown, stored: string | null) => Promise<boolean>;
 rateLogin: (candidates: NativeUser[], login: string) => Promise<void>;
};

function identifier(value: unknown) {
 const parsed = z.string().trim().min(1).max(254).refine(text => !/[\u0000-\u001f\u007f]/.test(text)).safeParse(value);
 if (!parsed.success) throw new AppError(400, 'Enter your username or email address.');
 return parsed.data.toLowerCase();
}
function chosenPassword(value: unknown) {
 if (typeof value !== 'string' || value.length < 12 || value.length > 256) throw new AppError(400, 'Use a password between 12 and 256 characters.');
 return value;
}
function browserToken(request: Request) {
 const token = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${registrationCookie}=`))?.slice(registrationCookie.length + 1) || '';
 return /^[a-f0-9]{64}$/.test(token) ? token : '';
}
function challengeHash(secret: string, challenge: Omit<Challenge, 'code_hash' | 'consumed_at' | 'cooling'>, code: string) {
 return createHmac('sha256', secret).update(JSON.stringify([challenge.id, challenge.purpose, challenge.browser_hash, challenge.form_key, challenge.identifier, challenge.recipient, challenge.username, challenge.user_id, code])).digest('hex');
}
function withBrowserCookie(result: Response, token: string, options: NativeOptions) {
 result.headers.append('Set-Cookie', `${registrationCookie}=${token}; Path=/api/auth/participant; HttpOnly; SameSite=Lax; Max-Age=86400${options.secureCookies !== false ? '; Secure' : ''}`);
 return result;
}

/** Compatibility follows WordPress core's wp_check_password; successful logins replace these hashes with scrypt. */
export async function verifyImportedPassword(value: unknown, stored: string) {
 if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 4096) return false;
 if (/^\$wp\$2[aby]\$(0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(stored)) {
  const prehashed = createHmac('sha384', 'wp-sha384').update(value).digest('base64');
  return bcryptCompare(prehashed, stored.slice(3).replace(/^\$2y\$/, '$2b$'));
 }
 if (!/^\$P\$[./0-9A-Za-z]{31}$/.test(stored)) return false;
 const iterations = alphabet.indexOf(stored[3]);
 if (iterations < 7 || iterations > 20) return false;
 const password = Buffer.from(value), salt = stored.slice(4, 12);
 let current = createHash('md5').update(salt).update(password).digest();
 for (let count = 0; count < 2 ** iterations; count++) current = createHash('md5').update(current).update(password).digest();
 let encoded = '', accumulator = 0, bits = 0;
 for (const byte of current) {
  accumulator |= byte << bits; bits += 8;
  while (bits >= 6) { encoded += alphabet[accumulator & 63]; accumulator >>>= 6; bits -= 6; }
 }
 if (bits) encoded += alphabet[accumulator & 63];
 return same(stored, stored.slice(0, 12) + encoded);
}

/** Call only after the importer has established the immutable source-ID to user-ID mapping. */
export async function importNativeParticipantCredentials(db: Db, userId: string, identity: { username: string; email: string; passwordHash: string }): Promise<{ imported: boolean }> {
 const login = username.parse(identity.username), contact = email.parse(identity.email);
 if (!/^\$wp\$2[aby]\$(0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(identity.passwordHash) && !/^\$P\$[./0-9A-Za-z]{31}$/.test(identity.passwordHash)) throw new AppError(409, 'This legacy credential format requires account recovery.');
 const { rows: [user] } = await db.query<NativeUser>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId]);
 if (!user || user.role !== 'participant' || user.contact.trim().toLowerCase() !== contact) throw new AppError(409, 'The imported account identity does not match this participant.');
 const { rows: [existing] } = await db.query<{ username: string; verified_contact: string }>('SELECT username,verified_contact FROM native_participant_accounts WHERE user_id=$1', [userId]);
 if (existing) {
  if (existing.username !== login || existing.verified_contact !== contact) throw new AppError(409, 'The native account details changed after import.');
  return { imported: false };
 }
 // Historical source-ID imports may contain cross-account email/username collisions.
 // Login disambiguates those by credentials; new registrations still forbid them.
 await db.query('INSERT INTO native_participant_accounts(user_id,username,verified_contact) VALUES($1,$2,$3)', [userId, login, contact]);
 await db.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1 AND password_hash IS NULL', [userId, identity.passwordHash]);
 return { imported: true };
}

async function findCandidates(db: Db, login: string) {
 const { rows } = await db.query<NativeUser>(`SELECT u.*,a.username AS native_username,a.verified_contact FROM users u
  LEFT JOIN native_participant_accounts a ON a.user_id=u.id WHERE lower(u.contact)=$1 OR lower(a.username)=$1 LIMIT 3`, [login]);
 // Unique normalized email and username indexes bound valid data to two candidates.
 return rows.length <= 2 ? rows : [];
}
const eligible = (user: NativeUser | undefined): user is NativeUser => !!user?.active && user.role === 'participant' && user.verified_contact === user.contact && !!user.password_hash;

const loginFailure = () => new AppError(401, 'Sign-in failed. Check your username or email, password and selected sign-in option.');
export function readLoginAudience(value: unknown): LoginAudience | undefined {
 if (value === undefined) return undefined;
 if (typeof value !== 'string' || !Object.hasOwn(loginAudienceLabels, value)) throw new AppError(400, 'Choose a valid sign-in option.');
 return value as LoginAudience;
}

/** Login alone checks all three unique identifiers; recovery keeps its email-owner rules. */
export async function localPasswordLogin(db: Db, input: Record<string, unknown>, endpoint: 'participant' | 'staff', startSession: (user: NativeUser, mfa: boolean) => Promise<Response>, options: Pick<NativeOptions, 'verifyPassword' | 'hashPassword' | 'rateLogin'>) {
 const audience = readLoginAudience(input.loginAudience), login = identifier(input.contact), value = input.password;
 const { rows: candidates } = await db.query<NativeUser>(`SELECT u.*,a.username AS native_username,a.verified_contact FROM users u
  LEFT JOIN native_participant_accounts a ON a.user_id=u.id
  WHERE lower(u.contact)=$1 OR lower(a.username)=$1 OR lower(u.staff_username)=$1 LIMIT 3`, [login]);
 await options.rateLogin(candidates, login);
 const possible = candidates.filter(user => (user.active && ['owner','admin','judge'].includes(user.role) && !!user.password_hash) || eligible(user));
 const matches: { user: NativeUser; stored: string; native: boolean }[] = [];
 if (!possible.length) await options.verifyPassword(value, null);
 for (const user of possible) {
  const stored = user.password_hash!, native = /^scrypt-32768-8-3\$/.test(stored);
  const validNative = await options.verifyPassword(value, native ? stored : null);
  if (native ? validNative : user.role === 'participant' && await verifyImportedPassword(value, stored)) matches.push({ user, stored, native });
 }
 if (matches.length !== 1) throw loginFailure();
 const { user, stored, native } = matches[0];
 const current = await db.transaction(async tx => {
  const { rows: [locked] } = await tx.query<NativeUser>(`SELECT u.*,a.username AS native_username,a.verified_contact FROM users u
   LEFT JOIN native_participant_accounts a ON a.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u`, [user.id]);
  if (!locked?.active || locked.role !== user.role || locked.password_hash !== stored || locked.contact !== user.contact || locked.auth_version !== user.auth_version || (locked.role === 'participant' && !eligible(locked))) throw loginFailure();
  const kind = participantKind({role:locked.role,participantKind:locked.participant_kind});
  const actual: LoginAudience | undefined = locked.role === 'participant' ? kind === 'unclassified' ? undefined : kind : 'admin';
  const wrongEndpoint = (endpoint === 'participant') !== (locked.role === 'participant');
  if (wrongEndpoint || (actual && audience !== undefined && audience !== actual)) {
   if (!actual) throw loginFailure();
   throw new AppError(409, `Use the ${loginAudienceLabels[actual]} sign-in option for this account.`, {code:'LOGIN_AUDIENCE_MISMATCH',loginAudience:actual});
  }
  if (!native) {
   const newHash = await options.hashPassword(value as string, true);
   const { rows: [updated] } = await tx.query<NativeUser>('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1 RETURNING *', [user.id, newHash]);
   await tx.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [user.id]);
   return updated;
  }
  return locked;
 });
 return startSession(current, false);
}
async function assertAvailable(db: Db, profile: Profile) {
 const found = await db.query(`SELECT id FROM users WHERE lower(contact) IN ($1,$2)
  UNION ALL SELECT user_id AS id FROM native_participant_accounts WHERE lower(username) IN ($1,$2) LIMIT 1`, [profile.contact, profile.username]);
 if (found.rows.length) throw new AppError(409, 'An existing account uses these details. Sign in or recover your account.');
}

async function sendChallenge(db: Db, values: { purpose: 'signup' | 'recovery'; profile?: Profile; identifier: string; user?: NativeUser }, options: NativeOptions, resend = false) {
 if (!options.sendEmail) throw new AppError(503, 'Email delivery is not configured.');
 let token = browserToken(options.request);
 if (!token && resend) throw new AppError(401, 'Start registration again in this browser before requesting another code.');
 if (!token) token = randomBytes(32).toString('hex');
 const browser = hash(token), code = randomInt(0, 1_000_000).toString().padStart(6, '0');
 const profile = values.profile, recipient = profile?.contact || values.user?.contact || values.identifier;
 const challenge = await db.transaction(async tx => {
  await tx.query('LOCK TABLE native_participant_challenges IN EXCLUSIVE MODE');
  const { rows: [old] } = await tx.query<Challenge>(`SELECT *,updated_at>now()-interval '60 seconds' AS cooling FROM native_participant_challenges
   WHERE browser_hash=$1 AND purpose=$2 AND form_key=$3 FOR UPDATE`, [browser, values.purpose, profile?.formKey || '']);
  if (resend && (!old || old.recipient !== recipient || old.username !== profile?.username)) throw new AppError(401, 'Start registration again with the same account details.');
  if (profile) await assertAvailable(tx, profile);
  const recent = await tx.query("SELECT id FROM native_participant_challenges WHERE purpose=$1 AND recipient=$2 AND updated_at>now()-interval '60 seconds' LIMIT 1", [values.purpose, recipient]);
  if (old?.cooling || recent.rows.length) throw new AppError(429, 'Wait 60 seconds before requesting another email code.');
  const row = { id: old?.id || id(), purpose: values.purpose, browser_hash: browser, form_key: profile?.formKey || '', identifier: values.identifier, recipient, username: profile?.username || '', user_id: values.user?.id || null };
  const codeHash = challengeHash(options.secret, row, code);
  await tx.query(`INSERT INTO native_participant_challenges(id,purpose,browser_hash,form_key,identifier,recipient,username,user_id,code_hash,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '10 minutes') ON CONFLICT(browser_hash,purpose,form_key) DO UPDATE SET
   identifier=EXCLUDED.identifier,recipient=EXCLUDED.recipient,username=EXCLUDED.username,user_id=EXCLUDED.user_id,code_hash=EXCLUDED.code_hash,
   attempts=0,expires_at=EXCLUDED.expires_at,consumed_at=NULL,updated_at=now()`, [row.id, row.purpose, browser, row.form_key, row.identifier, recipient, row.username, row.user_id, codeHash]);
  return { ...row, code_hash: codeHash };
 });
 if (profile || values.user) {
  try { await options.sendEmail(recipient, profile ? 'Verify your Youth Eco Summit registration email' : 'Reset your Youth Eco Summit password',
   `Your Youth Eco Summit ${profile ? 'email verification' : 'password recovery'} code is ${code}. It expires in 10 minutes. Use it only in the browser where you requested it.`); }
  catch {
   await db.query('UPDATE native_participant_challenges SET expires_at=now() WHERE id=$1 AND code_hash=$2', [challenge.id, challenge.code_hash]);
   throw new AppError(503, 'Email delivery is temporarily unavailable. Please try again later.');
  }
 }
 return withBrowserCookie(response({ sent: true, retryAfter: 60, expiresIn: 600, ...(profile ? {} : { recovery: 'code' }), message: profile
  ? 'Check your email for the confirmation code. Keep this registration open in the same browser.'
  : 'If an eligible account exists, a recovery code has been emailed. Enter it in this browser and choose a new password.' }), token, options);
}

async function claimChallenge(db: Db, purpose: 'signup' | 'recovery', input: Record<string, unknown>, options: NativeOptions, profile?: Profile) {
 const token = browserToken(options.request), code = input.code;
 if (!token || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new AppError(401, 'The email code is invalid or expired. Request a new code in this browser.');
 const login = profile?.contact || identifier(input.contact);
 const { rows: [challenge] } = await db.query<Challenge>(`UPDATE native_participant_challenges SET attempts=attempts+1
  WHERE browser_hash=$1 AND purpose=$2 AND form_key=$3 AND identifier=$4 AND consumed_at IS NULL AND expires_at>now() AND attempts<5 RETURNING *`, [hash(token), purpose, profile?.formKey || '', login]);
 if (!challenge || (profile && (challenge.recipient !== profile.contact || challenge.username !== profile.username)) || !same(challenge.code_hash, challengeHash(options.secret, challenge, code))) throw new AppError(401, 'The email code is invalid or expired.');
 return challenge;
}

export async function nativeParticipantAction(db: Db, route: string, input: Record<string, unknown>, startSession: (user: NativeUser, mfa: boolean) => Promise<Response>, options: NativeOptions) {
 try {
  if (['participant/signup', 'participant/resend', 'participant/verify'].includes(route)) {
   const parsed = profileSchema.safeParse(input);
   if (!parsed.success) throw new AppError(400, 'Enter your username, email and student or educator registration form.');
   const profile = parsed.data;
   if (route !== 'participant/verify') return sendChallenge(db, { purpose: 'signup', profile, identifier: profile.contact }, options, route === 'participant/resend');
   const challenge = await claimChallenge(db, 'signup', input, options, profile);
   const passwordHash = await options.hashPassword(chosenPassword(input.password));
   const user = await db.transaction(async tx => {
    const { rows: [current] } = await tx.query<Challenge>('SELECT * FROM native_participant_challenges WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE', [challenge.id]);
    if (!current || current.code_hash !== challenge.code_hash) throw new AppError(401, 'The email code is invalid or expired.');
    await tx.query('LOCK TABLE users,native_participant_accounts IN EXCLUSIVE MODE');
    await assertAvailable(tx, profile);
    const kind=profile.formKey==='teacher'?'educator':profile.formKey;
    const { rows: [created] } = await tx.query<NativeUser>("INSERT INTO users(id,contact,name,role,password_hash,participant_kind) VALUES($1,$2,$3,'participant',$4,$5) RETURNING *", [id(), profile.contact, profile.username, passwordHash,kind]);
    await tx.query('INSERT INTO native_participant_accounts(user_id,username,verified_contact) VALUES($1,$2,$3)', [created.id, profile.username, profile.contact]);
    await tx.query('UPDATE native_participant_challenges SET consumed_at=now(),user_id=$2 WHERE id=$1', [challenge.id, created.id]);
    await audit(tx, created, 'auth.participant.register', 'user', created.id, { formKey: profile.formKey });
    return created;
   });
   return startSession(user, false);
  }
  if (route === 'participant/login') {
   return localPasswordLogin(db, input, 'participant', startSession, options);
  }
  if (route === 'participant/recovery/request') {
   const login = identifier(input.contact), candidates = await findCandidates(db, login);
   const emailOwner = candidates.find(candidate => candidate.contact.toLowerCase() === login);
   const possible = candidates.filter(eligible);
   // An email address always refers to its owner, even when that account is blocked.
   const user = emailOwner ? eligible(emailOwner) ? emailOwner : undefined : possible.length === 1 ? possible[0] : undefined;
   return sendChallenge(db, { purpose: 'recovery', identifier: login, user }, options);
  }
  if (route === 'participant/recovery/complete') {
   const challenge = await claimChallenge(db, 'recovery', input, options);
   const passwordHash = await options.hashPassword(chosenPassword(input.password));
   await db.transaction(async tx => {
    const { rows: [current] } = await tx.query<Challenge>('SELECT * FROM native_participant_challenges WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE', [challenge.id]);
    if (!current || current.code_hash !== challenge.code_hash || !current.user_id) throw new AppError(401, 'The recovery code is invalid or expired.');
    const { rows: [user] } = await tx.query<NativeUser>(`SELECT u.*,a.verified_contact FROM users u JOIN native_participant_accounts a ON a.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u`, [current.user_id]);
    if (!user?.active || user.role !== 'participant' || user.contact !== current.recipient || user.verified_contact !== user.contact) throw new AppError(401, 'The recovery code is invalid or expired.');
    await tx.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1', [user.id, passwordHash]);
    await tx.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [user.id]);
    await tx.query("UPDATE native_participant_challenges SET consumed_at=now() WHERE purpose='recovery' AND user_id=$1 AND consumed_at IS NULL", [user.id]);
    await audit(tx, user, 'auth.participant.recover', 'user', user.id, {});
   });
   return response({ recovered: true, message: 'Password updated. Sign in with your new password.' });
  }
  throw new AppError(404, 'Account action not found.');
 } catch (error) {
  if ((error as { code?: string }).code === '23505') throw new AppError(409, 'An existing account uses these details. Sign in or recover your account.');
  throw error;
 }
}
