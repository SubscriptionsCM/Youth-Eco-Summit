/** Real HTTP acceptance checks. Refuses the production database and external mail. */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SMTPServer } from 'smtp-server';
import { hashPassword } from '../src/server/auth';
import { db } from '../src/server/db';
import { sendTransactionalEmail } from '../src/server/email';
import { submitFormRecord } from '../src/server/portal-forms';
import { fingerprint } from '../src/server/wordpress-migration';
import { nameParts } from '../src/domain/reference-values';
import { enabled, fieldOptions, referenceForms, validateReferenceAnswers } from '../src/domain/wordpress-forms';
import { participationWindowStatus } from '../src/data/participation-window';

type Row = Record<string, any>;
const origin = process.env.APP_ORIGIN || '';
const database = new URL(process.env.DATABASE_URL || 'http://invalid');
const loopback = (host: string) => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host);
assert.equal(process.env.YES_MIGRATION_QA, 'true', 'Explicit migration QA mode is required.');
assert.equal(process.env.YES_MIGRATION_QA_CAPTURE_ONLY, 'true', 'Capture-only delivery is required.');
assert.ok(loopback(new URL(origin).hostname) && loopback(database.hostname));
assert.equal(database.pathname, '/yes_local_migration', 'Refusing a production or shared database.');
assert.equal(process.env.AUTH_PARTICIPANT_PROVIDER, 'native');
assert.equal(process.env.SMTP_TEST_MODE, 'true');
assert.ok(loopback(process.env.SMTP_HOST || ''));
assert.equal(process.env.SMTP_PORT, '1025');
assert.ok(!process.env.WORDPRESS_ROOT && !process.env.WORDPRESS_BRIDGE_PATH, 'QA must use native services.');
process.umask(0o077);
const directory = resolve('.local/migration-qa');
const inboxPath = resolve(directory, 'messages.jsonl');
const reportPath = resolve(directory, 'report.json');
const accessPath = resolve(directory, 'access.json');
const checks: string[] = [];
const stamp = Date.now().toString(36);
const prefix = `YES-MIGRATION-QA-${stamp}`;
const wait = (milliseconds: number) => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
const password = () => randomBytes(24).toString('base64url');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const checked = (description: string) => { checks.push(description); console.log(`PASS ${description}`); };

async function captureSmtp() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await appendFile(inboxPath, '', { mode: 0o600 });
  const server = new SMTPServer({
    secure: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'], logger: false,
    onConnect(session, callback) { callback(loopback(session.remoteAddress.replace('::ffff:', '')) ? undefined : new Error('Loopback only')); },
    onAuth(auth, _session, callback) {
      callback(auth.username === process.env.SMTP_USER && auth.password === process.env.SMTP_PASSWORD ? null : new Error('Invalid QA credentials'), { user: 'migration-qa' });
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = []; let bytes = 0;
      stream.on('data', chunk => { bytes += chunk.length; if (bytes <= 50 * 1024 * 1024) chunks.push(Buffer.from(chunk)); });
      stream.on('end', () => {
        if (bytes > 50 * 1024 * 1024) return callback(new Error('QA message exceeds its capture limit'));
        const to = session.envelope.rcptTo.map(recipient => recipient.address);
        void appendFile(inboxPath, JSON.stringify({ to, raw: Buffer.concat(chunks).toString('utf8'), receivedAt: new Date().toISOString() }) + '\n', { mode: 0o600 })
          .then(() => callback(null), () => callback(new Error('Private capture failed')));
      });
      stream.on('error', () => callback(new Error('Capture stream failed')));
    },
  });
  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(1025, '127.0.0.1', ok); });
  console.log('Migration QA SMTP capture listening on 127.0.0.1:1025; no external delivery.');
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}

function client() {
  const cookies = new Map<string, { pair: string; path: string }>();
  const cookieHeader = (path: string) => [...cookies.values()].filter(value => path.startsWith(value.path)).map(value => value.pair).join('; ');
  async function raw(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
    const cookie = cookieHeader(path);
    const response = await fetch(new URL(path, origin), { method, redirect: 'error', headers: {
      Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';', 1)[0], name = pair.slice(0, pair.indexOf('='));
      if (/Max-Age=0(?:;|$)/i.test(header)) cookies.delete(name);
      else cookies.set(name, { pair, path: /(?:^|;)\s*Path=([^;]+)/i.exec(header)?.[1] || '/' });
    }
    return response;
  }
  return { raw, async bytes(address: string, bytes: Uint8Array<ArrayBuffer>) {
    const url = new URL(address); assert.equal(url.origin, origin);
    const cookie = cookieHeader(url.pathname);
    return fetch(url, { method: 'PUT', redirect: 'error', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: bytes });
  }, async request(path: string, method = 'GET', body?: unknown, extra?: Record<string, string>): Promise<Row> {
    const response = await raw(path, method, body, extra); const payload = await response.json();
    assert.ok(response.ok && !payload.error, `${method} ${path}: ${response.status} ${payload.error || ''}`);
    return payload.data;
  } };
}
type Client = ReturnType<typeof client>;
function decoded(raw: string) { return raw.replace(/=\r?\n/g, '').replace(/=([A-Fa-f0-9]{2})/g, (_match, value) => String.fromCharCode(parseInt(value, 16))); }
async function message(to: string, after = 0) {
  assert.ok(to.endsWith('.test'), 'Only synthetic account addresses may be queried.');
  for (let attempt = 0; attempt < 100; attempt++) {
    const messages = (await readFile(inboxPath, 'utf8').catch(() => '')).split('\n').slice(0, -1).filter(Boolean).map(line => JSON.parse(line));
    const found = messages.reverse().find(item => item.to.includes(to) && Date.parse(item.receivedAt) >= after);
    if (found) return decoded(found.raw as string);
    await wait(100);
  }
  throw new Error('Expected captured email did not arrive.');
}
function code(raw: string) { const found = raw.match(/\b(\d{6})\b/); assert.ok(found, 'Captured verification email has no code.'); return found[1]; }
function token(raw: string, route: 'invite' | 'recover') {
  const found = raw.match(new RegExp(`${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${route}\\?token=([a-f0-9]+)`));
  assert.ok(found, 'Captured account email has no private setup link.'); return found[1];
}
async function staffInvite(owner: Client, role: 'admin' | 'judge') {
  const account = { contact: `${prefix}-${role}@example.test`.toLowerCase(), password: password(), name: `${prefix} ${role}`, role };
  const after = Date.now(); await owner.request('/api/auth/invitations', 'POST', account);
  const invitationToken = token(await message(account.contact, after), 'invite');
  const session = client();
  assert.equal((await session.request('/api/auth/invitation/setup', 'POST', { token: invitationToken })).contact, account.contact);
  await session.request('/api/auth/invitation/accept', 'POST', { token: invitationToken, password: account.password, confirmPassword: account.password });
  const actor = (await session.request('/api/auth/login', 'POST', account)).actor;
  assert.equal(actor.role, role); assert.equal((await client().raw('/api/auth/invitation/accept', 'POST', { token: invitationToken, password: password() })).status, 401);
  return { account: { ...account, id: actor.id }, session };
}
async function nativeAccount(role: 'school' | 'student' | 'educator') {
  const account = { contact: `${prefix}-${role}@example.test`.toLowerCase(), username: `yes_migration_qa_${role}_${stamp}`, password: password(), name: `${prefix} ${role}`, formKey: role === 'student' ? 'student' : 'teacher', role };
  const profile = { contact: account.contact, username: account.username, formKey: account.formKey };
  const session = client(); const after = Date.now();
  assert.equal((await session.request('/api/auth/participant/signup', 'POST', profile)).sent, true);
  assert.equal((await session.raw('/api/auth/participant/resend', 'POST', profile)).status, 429);
  const verify = { ...profile, password: account.password, code: code(await message(account.contact, after)), confirmPassword: account.password };
  assert.ok(!(await client().raw('/api/auth/participant/verify', 'POST', verify)).ok, 'A different browser must not redeem another browser challenge.');
  const actor = (await session.request('/api/auth/participant/verify', 'POST', verify)).actor;
  assert.equal(actor.role, 'participant'); assert.equal(actor.contact, account.contact);
  const login = client();
  assert.equal((await login.raw('/api/auth/participant/login', 'POST', { contact: account.username, password: 'incorrect-password' })).status, 401);
  assert.equal((await login.request('/api/auth/participant/login', 'POST', { contact: account.username, password: account.password })).actor.id, actor.id);
  assert.equal((await login.raw('/api/admin/students')).status, 403);
  return { account: { ...account, id: actor.id }, session };
}
function person(fieldId: string) {
  const field = referenceForms.find(form => form.key === 'school')!.fields.find(field => field.id === fieldId)!;
  return enabled(field.multiple_name) ? Object.fromEntries(nameParts(field).map(part => [part.key, part.key.includes('last') ? `QA${stamp}` : 'YES-MIGRATION'])) : `${prefix} Representative`;
}
async function uploadPortal(session: Client, recordId: string, fieldId: string, filename: string, bytes: Buffer, tokenValue?: string): Promise<Row> {
  const headers = tokenValue ? { 'X-Draft-Key': tokenValue } : undefined;
  const file = await session.request('/api/forms/files/begin', 'POST', { recordId, fieldId, filename, size: bytes.length, checksum: sha(bytes) }, headers);
  const part = await session.request(`/api/forms/files/${file.id}/part`, 'POST', { partNumber: 1 }, headers);
  assert.equal(new URL(part.url).origin, origin, 'Private uploads must remain inside the isolated app.');
  const truncated = await session.bytes(part.url, new Uint8Array(bytes.subarray(0, bytes.length - 1)));
  assert.ok([400, 413, 422].includes(truncated.status), 'Signed upload length must be enforced before accepting bytes.');
  assert.ok((await session.bytes(part.url, new Uint8Array(bytes))).ok);
  await session.request(`/api/forms/files/${file.id}/complete`, 'POST', {}, headers);
  for (let attempt = 0; attempt < 180; attempt++) {
    const record = await session.request(`/api/forms/records/${recordId}`, 'GET', undefined, headers);
    const status = record.files.find((item: Row) => item.id === file.id)?.status;
    if (status === 'ready' || status === 'rejected') return { ...file, status };
    await wait(500);
  }
  throw new Error('Private file verification did not finish.');
}
function syntheticPdf() {
  const words = Array.from({ length: 550 }, (_value, index) => ['youth', 'sustainability', 'synthetic', 'migration', 'testing'][index % 5]);
  const lines = Array.from({ length: Math.ceil(words.length / 14) }, (_value, index) => words.slice(index * 14, index * 14 + 14).join(' '));
  const stream = `BT /F1 7 Tf 12 TL 20 770 Td ${lines.map((line, index) => `${index ? 'T* ' : ''}(${line}) Tj`).join('\n')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let document = '%PDF-1.4\n'; const offsets = [0];
  for (const [index, value] of objects.entries()) { offsets.push(Buffer.byteLength(document)); document += `${index + 1} 0 obj\n${value}\nendobj\n`; }
  const xref = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(document);
}

async function main() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  assert.equal((await db.query('SELECT current_database() name')).rows[0].name, 'yes_local_migration');
  const pending = Number((await db.query("SELECT count(*) count FROM jobs WHERE status IN ('pending','running')")).rows[0].count);
  assert.equal(pending, 0, 'Use a fresh test DB or seal copied jobs before starting the QA worker.');
  await db.query('DELETE FROM auth_rates'); // This guarded, isolated DB is reused across QA runs.
  const anonymous = client();
  assert.equal((await anonymous.request('/api/health')).configured, true);
  const formsConfig = await anonymous.request('/api/forms/config');
  assert.equal(formsConfig.accountProvider, 'native'); assert.equal(formsConfig.emailAccounts, true);
  for (const path of ['/api/participant', '/api/admin/students', '/api/judging']) assert.equal((await anonymous.raw(path)).status, 401);
  assert.equal((await anonymous.raw('/api/public/nominations', 'POST', {}, { Origin: 'https://unrelated.example' })).status, 403);
  checked('Native readiness, anonymous access and same-origin enforcement');
  const notificationForms: Record<string, string> = {};
  const formSource = `https://yes-migration-qa.test/${stamp}`;
  for (const form of referenceForms.filter(form => ['school', 'teacher', 'open-letter'].includes(form.key))) {
    const payload = { post_title: form.title, definition: { fields: form.fields, settings: form.settings, notifications: [{ slug: `qa-${form.key}`, recipients: form.key === 'open-letter' ? '{email-yes-guardian-1}' : '{email-1}', 'email-subject': `${prefix} receipt {submission_id}`, 'email-editor': `<p>${prefix} native notification</p>{all_fields}`, 'email-attachment': 'true' }] } };
    const checksum = fingerprint(payload); notificationForms[String(form.id)] = checksum;
    await db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,$2,'form',$3,$4,$5,now())", [randomUUID(), formSource, String(form.id), JSON.stringify(payload), checksum]);
  }
  const manifest = { format: 'yes-native-form-snapshot/v1', forms: notificationForms };
  await db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,$2,'option',$3,$4,$5,now())", [randomUUID(), formSource, `native-current-forms:${stamp}`, JSON.stringify(manifest), fingerprint(manifest)]);

  const ownerAccount = { id: randomUUID(), contact: `${prefix}-owner@example.test`.toLowerCase(), password: password(), name: `${prefix} owner`, role: 'owner' };
  await db.query("INSERT INTO users(id,role,contact,name,password_hash) VALUES($1,'owner',$2,$3,$4)", [ownerAccount.id, ownerAccount.contact, ownerAccount.name, await hashPassword(ownerAccount.password)]);
  const owner = client(); assert.equal((await owner.request('/api/auth/login', 'POST', ownerAccount)).actor.role, 'owner');
  const admin = await staffInvite(owner, 'admin'), judge = await staffInvite(admin.session, 'judge');
  assert.equal((await admin.session.raw('/api/auth/invitations', 'POST', { contact: `${prefix}-forbidden@example.test`, role: 'owner' })).status, 403);
  assert.equal((await judge.session.raw('/api/admin/students')).status, 403);
  checked('Owner, admin and judge invitation/setup/login and staff role isolation');
  const oldAdminSession = admin.session, adminRecovery = client(), adminRecoveryAfter = Date.now();
  const knownRecovery = await adminRecovery.request('/api/auth/recovery/request', 'POST', { contact: admin.account.contact });
  const missingRecovery = await client().request('/api/auth/recovery/request', 'POST', { contact: `${prefix}-missing@example.test`.toLowerCase() });
  assert.deepEqual(knownRecovery, missingRecovery, 'Recovery must not disclose whether a staff account exists.');
  const staffToken = token(await message(admin.account.contact, adminRecoveryAfter), 'recover');
  const newAdminPassword = password();
  await adminRecovery.request('/api/auth/recovery/complete', 'POST', { token: staffToken, password: newAdminPassword, confirmPassword: newAdminPassword });
  assert.equal((await oldAdminSession.request('/api/auth/session')).actor, null);
  assert.ok(!(await client().raw('/api/auth/login', 'POST', { contact: admin.account.contact, password: admin.account.password })).ok);
  admin.account.password = newAdminPassword; admin.session = client();
  assert.equal((await admin.session.request('/api/auth/login', 'POST', admin.account)).actor.role, 'admin');
  assert.ok(!(await adminRecovery.raw('/api/auth/recovery/complete', 'POST', { token: staffToken, password: password() })).ok);
  checked('Staff recovery conceals account existence, rotates credentials and revokes prior sessions');

  const school = await nativeAccount('school'), student = await nativeAccount('student'), educator = await nativeAccount('educator');
  checked('School, student and educator native email signup, browser-bound verification, resend cooldown and username login');
  const collision = [0, 1].map(index => ({ id: randomUUID(), contact: `${prefix}-legacy-${index}@example.test`.toLowerCase(), password: password() }));
  for (const [index, account] of collision.entries()) {
    await db.query("INSERT INTO users(id,role,contact,name,password_hash) VALUES($1,'participant',$2,$3,$4)", [account.id, account.contact, `${prefix} legacy collision ${index}`, await hashPassword(account.password)]);
    await db.query('INSERT INTO native_participant_accounts(user_id,username,verified_contact) VALUES($1,$2,$3)', [account.id, index ? collision[0].contact : `yes_migration_qa_legacy_${stamp}`, account.contact]);
  }
  for (const account of collision) {
    const signedIn = await client().request('/api/auth/participant/login', 'POST', { contact: collision[0].contact, password: account.password });
    assert.equal(signedIn.actor.id, account.id, 'Legacy username/email collisions must never merge accounts.');
  }
  assert.equal((await client().raw('/api/auth/participant/signup', 'POST', { contact: `${prefix}-new-collision@example.test`.toLowerCase(), username: collision[0].contact, formKey: 'student' })).status, 409);
  const collisionRecovery = client(), collisionAfter = Date.now();
  await collisionRecovery.request('/api/auth/participant/recovery/request', 'POST', { contact: collision[0].contact });
  const collisionCode = code(await message(collision[0].contact, collisionAfter));
  const replacementCollisionPassword = password();
  await collisionRecovery.request('/api/auth/participant/recovery/complete', 'POST', { contact: collision[0].contact, code: collisionCode, password: replacementCollisionPassword, confirmPassword: replacementCollisionPassword });
  assert.equal((await client().request('/api/auth/participant/login', 'POST', { contact: collision[0].contact, password: replacementCollisionPassword })).actor.id, collision[0].id);
  assert.equal((await client().request('/api/auth/participant/login', 'POST', { contact: collision[0].contact, password: collision[1].password })).actor.id, collision[1].id);
  checked('Imported cross-identifier accounts remain separate, email recovery selects its actual owner and new collisions are blocked');
  const oldSession = client(); await oldSession.request('/api/auth/participant/login', 'POST', { contact: school.account.username, password: school.account.password });
  const recovery = client(), after = Date.now(), newPassword = password();
  await recovery.request('/api/auth/participant/recovery/request', 'POST', { contact: school.account.username });
  const recoveryCode = code(await message(school.account.contact, after));
  await recovery.request('/api/auth/participant/recovery/complete', 'POST', { contact: school.account.username, code: recoveryCode, password: newPassword, confirmPassword: newPassword });
  assert.equal((await oldSession.request('/api/auth/session')).actor, null);
  assert.equal((await client().raw('/api/auth/participant/login', 'POST', { contact: school.account.username, password: school.account.password })).status, 401);
  school.account.password = newPassword;
  school.session = client(); await school.session.request('/api/auth/participant/login', 'POST', { contact: school.account.contact, password: newPassword });
  assert.ok(!(await recovery.raw('/api/auth/participant/recovery/complete', 'POST', { contact: school.account.username, code: recoveryCode, password: password() })).ok);
  checked('Participant recovery retains identity, revokes old sessions and refuses consumed codes');

  const draft = await anonymous.request('/api/forms/records', 'POST', { formKey: 'school' });
  const draftHeaders = { 'X-Draft-Key': draft.token };
  assert.equal((await client().raw(`/api/forms/records/${draft.record.id}`)).status, 404);
  const schoolAnswers = { 'select-1': 'Others', 'text-1': `${prefix} School`, 'address-1': { street_address: `${prefix} Street`, address_city: 'QA City', address_state: 'Delhi', address_zip: '110001', address_country: 'India' }, 'name-2': person('name-2'), 'phone-1': '+919999000111', 'email-1': school.account.contact };
  const saved = await anonymous.request(`/api/forms/records/${draft.record.id}`, 'PUT', { answers: schoolAnswers, currentStep: 0, lockVersion: 0 }, draftHeaders);
  assert.equal((await anonymous.request(`/api/forms/records/${draft.record.id}`, 'GET', undefined, draftHeaders)).answers['text-1'], schoolAnswers['text-1']);
  assert.equal((await anonymous.raw(`/api/forms/records/${draft.record.id}`, 'PUT', { answers: schoolAnswers, currentStep: 0, lockVersion: 0 }, draftHeaders)).status, 409);
  const receipt = await anonymous.request(`/api/forms/records/${draft.record.id}/submit`, 'POST', { answers: schoolAnswers, lockVersion: saved.lock_version }, draftHeaders);
  assert.equal(receipt.schoolStatus, 'pending');
  assert.equal((await anonymous.request(`/api/public/schools?q=${encodeURIComponent(schoolAnswers['text-1'])}`)).total, 0);
  await owner.request(`/api/admin/schools/${receipt.schoolId}`, 'PATCH', { action: 'approve', reason: `${prefix} branch verification` });
  const registeredSchool = (await anonymous.request(`/api/public/schools?q=${encodeURIComponent(schoolAnswers['text-1'])}`)).items[0];
  assert.ok(registeredSchool?.reference);
  const alias = `${prefix}-IMPORTED-ID`.toUpperCase();
  await db.query("INSERT INTO school_identifiers(reference,school_id,kind) VALUES($1,$2,'imported')", [alias, receipt.schoolId]);
  assert.equal((await anonymous.request(`/api/public/schools?q=${alias}`)).items[0].id, receipt.schoolId);
  const duplicate = await school.session.request('/api/forms/records', 'POST', { formKey: 'school' });
  assert.equal((await school.session.raw(`/api/forms/records/${duplicate.record.id}/submit`, 'POST', { answers: schoolAnswers, lockVersion: 0 })).status, 409);
  checked('Public school private draft, optimistic locking, final receipt, staff approval, duplicate prevention and permanent/imported IDs');

  const request = await school.session.request('/api/school-workspace/requests', 'POST', { schoolId: registeredSchool.reference, reason: `${prefix} representative` });
  assert.equal((await school.session.raw(`/api/school-workspace/schools/${receipt.schoolId}`)).status, 403);
  await owner.request(`/api/school-workspace/admin/${request.id}`, 'PATCH', { status: 'approved', expectedStatus: 'pending', reason: `${prefix} verified representative` });
  assert.equal((await school.session.raw(`/api/school-workspace/schools/${receipt.schoolId}`)).status, 200);
  assert.equal((await student.session.raw(`/api/school-workspace/schools/${receipt.schoolId}`)).status, 403);
  checked('School representative request, approval and school-scoped access');

  const teacherForm = referenceForms.find(form => form.key === 'teacher')!;
  const teacher = await educator.session.request('/api/forms/records', 'POST', { formKey: 'teacher' });
  const teacherAnswers = { 'select-3': registeredSchool.name, 'registered-school-id': alias, 'text-9': 'QA City', 'select-2': 'Delhi', 'number-1': '110001', 'text-1': educator.account.username, 'email-1': educator.account.contact, 'phone-4': '+919999000112', 'select-1': 'open-letter', 'radio-1': fieldOptions(teacherForm.fields.find(field => field.id === 'radio-1')!)[0].value, 'consent-1': true };
  assert.deepEqual(validateReferenceAnswers(teacherForm, teacherAnswers, { final: true }).errors, {});
  const teacherReceipt = await educator.session.request(`/api/forms/records/${teacher.record.id}/submit`, 'POST', { lockVersion: 0, answers: teacherAnswers });
  assert.equal(teacherReceipt.schoolId, receipt.schoolId);
  const studentDraft = await student.session.request('/api/forms/records', 'POST', { formKey: 'student' });
  const studentSaved = await student.session.request(`/api/forms/records/${studentDraft.record.id}`, 'PUT', { lockVersion: 0, currentStep: 0, answers: { 'text-1': student.account.username, 'password-1': 'must-not-be-retained', 'consent-1': true } });
  assert.equal(studentSaved.answers['password-1'], undefined); assert.equal(studentSaved.answers['consent-1'], undefined);
  assert.equal((await educator.session.raw(`/api/forms/records/${studentDraft.record.id}`)).status, 404);
  if (!participationWindowStatus().isOpen) {
    const denied = await student.session.raw(`/api/forms/records/${studentDraft.record.id}/submit`, 'POST', { lockVersion: studentSaved.lock_version, answers: {} });
    assert.equal(denied.status, 422); assert.ok((await denied.json()).fields._form);
  }
  checked('Educator submission, verified account contact, native saved forms, draft privacy and approved student cutoff');

  const entry = await student.session.request('/api/forms/records', 'POST', { formKey: 'open-letter', context: { 'hidden-yes-submitter': 'student', 'radio-yes-entry-mode': 'individual' } });
  assert.equal((await educator.session.raw(`/api/forms/records/${entry.record.id}`)).status, 404);
  const retained = await student.session.request(`/api/forms/records/${entry.record.id}`, 'PUT', { lockVersion: 0, currentStep: 0, answers: { 'hidden-yes-submitter': 'student', 'radio-yes-entry-mode': 'individual', 'text-yes-name': `${prefix} Student` } });
  assert.equal(retained.answers['hidden-yes-submitter'], 'student');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
  const invalidFile = await uploadPortal(student.session, entry.record.id, 'upload-yes-1', `${prefix}.png`, png);
  assert.equal(invalidFile.status, 'rejected', 'A PNG must not pass a PDF field policy.');
  assert.equal((await educator.session.raw(`/api/forms/files/${invalidFile.id}/download`, 'POST', {})).status, 404);
  assert.equal((await student.session.raw('/api/forms/files/begin', 'POST', { recordId: entry.record.id, fieldId: 'upload-yes-1', filename: 'oversize.pdf', size: 10 ** 12, checksum: '0'.repeat(64) })).status, 422);
  checked('Competition draft ownership, real multipart transfer, worker MIME rejection and upload size enforcement');

  const completeEntry = await student.session.request('/api/forms/records', 'POST', { formKey: 'open-letter', context: { 'hidden-yes-submitter': 'student', 'radio-yes-entry-mode': 'individual' } });
  const pdf = syntheticPdf();
  const validFile = await uploadPortal(student.session, completeEntry.record.id, 'upload-yes-1', `${prefix}.pdf`, pdf);
  assert.equal(validFile.status, 'ready', 'A valid 550-word PDF must pass signature, checksum, scanning and metadata checks.');
  const entryForm = referenceForms.find(form => form.key === 'open-letter')!;
  const entryAnswers = { 'hidden-yes-submitter': 'student', 'radio-yes-entry-mode': 'individual', 'text-yes-name': `${prefix} Student`, 'text-yes-school': registeredSchool.name, 'text-yes-school-id': alias, 'select-yes-class': '6', 'email-yes-guardian-1': `${prefix}-guardian@example.test`.toLowerCase(), 'phone-yes-guardian-1': '+919999000113', 'text-yes-title': `YES_MIGRATION_QA_6_OpenLetter_${stamp}`, 'select-yes-topic': fieldOptions(entryForm.fields.find(field => field.id === 'select-yes-topic')!)[0].value, 'select-yes-language': 'English', 'number-yes-word-count': '550', 'consent-yes-originality': true, 'consent-yes-registration': true };
  if (!participationWindowStatus().isOpen) {
    const closed = await student.session.raw(`/api/forms/records/${completeEntry.record.id}/submit`, 'POST', { lockVersion: 0, answers: entryAnswers });
    assert.equal(closed.status, 422); assert.ok((await closed.json()).fields._form);
  }
  // Exercise the approved open-window branch without changing production dates.
  const accepted = await submitFormRecord(db, { id: student.account.id, role: 'participant', contact: student.account.contact }, completeEntry.record.id, { lockVersion: 0, answers: entryAnswers }, undefined, new Date('2026-11-14T12:00:00Z'));
  assert.equal(accepted.status, 'submitted');
  const round = await owner.request('/api/judging/admin/rounds', 'POST', { formKey: 'open-letter', edition: '2027', name: `${prefix} review`, open: true });
  const assigned = await admin.session.request('/api/judging/admin/assignments', 'POST', { roundId: round.id, judgeId: judge.account.id, entries: [{ source: 'portal', id: completeEntry.record.id }], reason: `${prefix} isolated review` });
  const assignmentId = assigned.items[0].id;
  assert.ok((await judge.session.request('/api/judging')).items.some((item: Row) => item.id === assignmentId));
  assert.equal((await educator.session.raw(`/api/judging/assignments/${assignmentId}`)).status, 403);
  assert.equal((await admin.session.raw(`/api/judging/assignments/${assignmentId}`)).status, 404);
  const detail = await judge.session.request(`/api/judging/assignments/${assignmentId}`);
  assert.ok(!JSON.stringify(detail).includes(entryAnswers['email-yes-guardian-1']), 'Judging snapshots must hide participant contact fields.');
  const criteria = detail.round.rubric.criteria as { id: string; max: number }[];
  const scores = Object.fromEntries(criteria.map(criterion => [criterion.id, Math.floor(criterion.max / 2)]));
  assert.equal((await judge.session.raw(`/api/judging/assignments/${assignmentId}`, 'PUT', { scores: { ...scores, [criteria[0].id]: criteria[0].max + 1 }, comment: prefix, lockVersion: 0 })).status, 422);
  const review = await judge.session.request(`/api/judging/assignments/${assignmentId}`, 'PUT', { scores, comment: prefix, lockVersion: 0 });
  assert.equal(review.status, 'draft');
  assert.equal((await judge.session.raw(`/api/judging/assignments/${assignmentId}`, 'PUT', { scores, comment: prefix, lockVersion: 999 })).status, 409);
  const finalReview = await judge.session.request(`/api/judging/assignments/${assignmentId}/submit`, 'POST', { scores, comment: prefix, lockVersion: review.lock_version });
  assert.equal(finalReview.status, 'submitted');
  const assignedFile = await judge.session.raw(`/api/judging/assignments/${assignmentId}/files/${validFile.id}`);
  assert.equal(assignedFile.status, 200); assert.deepEqual(Buffer.from(await assignedFile.arrayBuffer()), pdf);
  await owner.request(`/api/judging/admin/assignments/${assignmentId}`, 'PATCH', { action: 'reopen', reason: `${prefix} reviewed correction` });
  assert.equal((await judge.session.request(`/api/judging/assignments/${assignmentId}`)).review.status, 'draft');
  await owner.request(`/api/judging/admin/assignments/${assignmentId}`, 'PATCH', { action: 'revoke', reason: `${prefix} completed test` });
  assert.equal((await judge.session.raw(`/api/judging/assignments/${assignmentId}`)).status, 404);
  assert.equal((await judge.session.raw(`/api/judging/assignments/${assignmentId}/files/${validFile.id}`)).status, 404);
  checked('Valid PDF verification, injected open-window submission, native judge assignment/scoring, private files, review history and revocation');

  // The separate showcase model is exercised with synthetic student fixtures;
  // this does not reopen the closed public reference-registration programme.
  for (const key of ['privacy', 'terms']) {
    await owner.request('/api/admin/content', 'POST', { key, title: `${prefix} ${key}`, body: `${prefix} synthetic consent and legal fixture only.`, approved: true });
  }
  const starts = new Date(Date.now() - 86_400_000).toISOString(), ends = new Date(Date.now() + 86_400_000).toISOString();
  const edition = await owner.request('/api/admin/editions', 'POST', { label: `${prefix} showcase`, state: 'open', registrationOpens: starts, registrationCloses: ends, config: { registrationApproved: true, schoolVerificationApproved: true, consentVersion: 'qa-1', consentText: `${prefix} participation`, publicationConsentVersion: 'qa-publication-1', publicationConsentText: `${prefix} separate publication consent` } });
  const competition = await owner.request('/api/admin/competitions', 'POST', { editionId: edition.id, slug: `qa-${stamp}`, title: `${prefix} showcase fixture`, guidelines: `${prefix} synthetic PNG fixture.`, opensAt: starts, closesAt: ends, config: { mode: 'individual', entryLimit: 3, minMembers: 1, maxMembers: 1, categories: [{ id: 'qa', label: 'QA class', classes: [6] }], fields: [{ key: 'title', label: 'Title', type: 'text', required: true, maxLength: 200 }], files: { minCount: 1, maxCount: 1, maxBytes: 1000000, types: ['image/png'] } } });
  await owner.request(`/api/admin/competitions/${competition.id}`, 'PATCH', { action: 'approve', reason: `${prefix} isolated showcase` });
  const fixtureStudentId = randomUUID(), fixtureParticipationId = randomUUID();
  await db.query('INSERT INTO students(id,reference,name,guardian_contact) VALUES($1,$2,$3,$4)', [fixtureStudentId, `${prefix}-STUDENT`, `${prefix} showcase student`, student.account.contact]);
  await db.query('INSERT INTO participant_access(user_id,student_id) VALUES($1,$2)', [student.account.id, fixtureStudentId]);
  await db.query('INSERT INTO student_participations(id,student_id,school_id,edition_id,class,snapshot) VALUES($1,$2,$3,$4,6,$5)', [fixtureParticipationId, fixtureStudentId, receipt.schoolId, edition.id, JSON.stringify({ studentName: `${prefix} showcase student` })]);
  const coreEntry = await student.session.request('/api/entries', 'POST', { participationId: fixtureParticipationId, competitionId: competition.id, answers: {}, memberIds: [] });
  assert.equal((await educator.session.raw(`/api/entries/${coreEntry.id}`)).status, 404);
  const coreSaved = await student.session.request(`/api/entries/${coreEntry.id}`, 'PUT', { answers: { title: prefix }, memberIds: [], lockVersion: coreEntry.lock_version });
  assert.equal((await student.session.raw(`/api/entries/${coreEntry.id}/submit`, 'POST', { lockVersion: coreSaved.lock_version })).status, 422);
  const asset = await student.session.request('/api/uploads/start', 'POST', { submissionId: coreEntry.id, originalName: `${prefix}.png`, byteSize: png.length, checksum: sha(png) });
  const assetPart = await student.session.request(`/api/uploads/${asset.id}/parts`, 'POST', { partNumber: 1 });
  assert.equal(new URL(assetPart.url).origin, origin);
  assert.ok((await student.session.bytes(assetPart.url, new Uint8Array(png))).ok);
  await student.session.request(`/api/uploads/${asset.id}/complete`, 'POST', {});
  let assetStatus = '';
  for (let attempt = 0; attempt < 180; attempt++) {
    assetStatus = (await student.session.request(`/api/uploads/${asset.id}`)).status;
    if (['ready', 'failed', 'quarantined'].includes(assetStatus)) break;
    await wait(500);
  }
  assert.equal(assetStatus, 'ready');
  assert.equal((await anonymous.raw(`/api/media/${asset.id}`)).status, 401);
  const coreReceipt = await student.session.request(`/api/entries/${coreEntry.id}/submit`, 'POST', { lockVersion: coreSaved.lock_version });
  assert.equal(coreReceipt.state, 'submitted');
  assert.equal((await student.session.request(`/api/entries/${coreEntry.id}/submit`, 'POST', { lockVersion: coreSaved.lock_version })).reference, coreReceipt.reference);
  const publicationInput = { entryId: coreEntry.id, title: `${prefix} public example`, summary: `${prefix} synthetic public summary`, active: true, assetIds: [asset.id], mediaApproved: true };
  assert.equal((await admin.session.raw('/api/admin/publications', 'POST', publicationInput)).status, 422);
  await student.session.request('/api/consents/publication', 'POST', { studentId: fixtureStudentId, editionId: edition.id, accepted: true, version: 'qa-publication-1' });
  assert.equal((await judge.session.raw('/api/admin/publications', 'POST', publicationInput)).status, 403);
  const publication = await admin.session.request('/api/admin/publications', 'POST', publicationInput);
  const showcase = await anonymous.request('/api/public/showcase');
  assert.ok(showcase.items.some((item: Row) => item.id === publication.id));
  assert.ok(!JSON.stringify(showcase).includes(student.account.contact));
  const publicFile = await anonymous.raw(`/api/public/showcase/${publication.id}/media/${asset.id}`);
  assert.equal(publicFile.status, 200); assert.deepEqual(Buffer.from(await publicFile.arrayBuffer()), png);
  await student.session.request('/api/consents/publication', 'POST', { studentId: fixtureStudentId, editionId: edition.id, accepted: false, version: 'qa-publication-1' });
  assert.ok(!(await anonymous.request('/api/public/showcase')).items.some((item: Row) => item.id === publication.id));
  assert.equal((await anonymous.raw(`/api/public/showcase/${publication.id}/media/${asset.id}`)).status, 404);
  checked('Saved entry, real private PNG, submission idempotence, moderation, separate publication consent and public withdrawal');

  const notifiedRecords = [draft.record.id, teacher.record.id, completeEntry.record.id];
  let notificationState: Row[] = [];
  for (let attempt = 0; attempt < 120; attempt++) {
    notificationState = (await db.query(`SELECT r.record_id,r.planned_at,count(d.id)::int deliveries,
      count(d.id) FILTER(WHERE d.status='delivered')::int delivered,
      count(d.id) FILTER(WHERE d.status='review')::int review
      FROM portal_form_notification_runs r LEFT JOIN portal_form_notification_deliveries d ON d.record_id=r.record_id
      WHERE r.record_id=ANY($1::uuid[]) GROUP BY r.record_id,r.planned_at`, [notifiedRecords])).rows;
    if (notificationState.length === notifiedRecords.length && notificationState.every(row => row.planned_at && row.deliveries > 0 && row.delivered === row.deliveries && row.review === 0)) break;
    await wait(500);
  }
  assert.equal(notificationState.length, notifiedRecords.length);
  assert.ok(notificationState.every(row => row.planned_at && row.deliveries > 0 && row.delivered === row.deliveries && row.review === 0), 'Every QA form notification must reach SMTP capture without retry/review failures.');
  const guardianMail = await message(entryAnswers['email-yes-guardian-1']);
  assert.match(guardianMail, /Content-Disposition: attachment/i);
  checked('Durable native school, educator and competition notifications deliver verified PDF attachments');

  const attachmentAfter = Date.now();
  await sendTransactionalEmail({ to: ownerAccount.contact, subject: `${prefix} attachment capture`, body: 'Synthetic migration attachment check.', attachments: [{ filename: `${prefix}.txt`, content: Buffer.from(prefix), contentType: 'text/plain' }] });
  assert.match(await message(ownerAccount.contact, attachmentAfter), /Content-Disposition: attachment/i);
  checked('Native SMTP authentication, message submission and attachments captured without external delivery');

  await educator.session.request('/api/auth/logout', 'POST', {});
  assert.equal((await educator.session.raw('/api/forms/records')).status, 401);
  checked('Logout revokes native participant access');
  const access = { prefix, origin, accounts: { owner: ownerAccount, admin: admin.account, judge: judge.account, school: school.account, student: student.account, educator: educator.account }, fixtures: { schoolId: receipt.schoolId, schoolReference: registeredSchool.reference, teacherRecordId: teacher.record.id, studentDraftId: studentDraft.record.id, entryDraftId: entry.record.id } };
  await writeFile(accessPath, JSON.stringify(access, null, 2), { mode: 0o600 });
  await writeFile(reportPath, JSON.stringify({ verifiedAt: new Date().toISOString(), prefix, origin, checks, limitations: ['SMTP messages captured locally; actual Hostinger delivery is a separate approved test.', 'QA form notifications use synthetic .test recipient templates; production template parity is checked separately.', 'Production participation dates were preserved; closed student/competition submissions were checked as closed.', 'Synthetic fixtures remain only in the isolated yes_local_migration database.'] }, null, 2), { mode: 0o600 });
  console.log(`${checks.length} native acceptance groups passed; private report: .local/migration-qa/report.json`);
}

if (process.argv.includes('--capture-smtp')) captureSmtp().catch(error => { console.error(error.message); process.exit(1); });
else main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : 'Native verification failed.'); process.exit(1); });
