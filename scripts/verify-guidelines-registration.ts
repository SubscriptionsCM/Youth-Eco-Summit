/** Real HTTP checks, confined to the explicitly marked local development runtime. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const origin = process.env.APP_ORIGIN || '';
const database = new URL(process.env.DATABASE_URL || 'http://invalid');
if (process.env.YES_LOCAL_RUNTIME !== 'true' || process.env.APP_ENV !== 'development' || process.env.NODE_ENV === 'production'
 || !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)
 || !['127.0.0.1', 'localhost'].includes(database.hostname) || !database.pathname.startsWith('/yes_local')) {
 throw new Error('Registration verification requires the isolated yes_local development runtime.');
}
type Row = Record<string, any>;
const checks: string[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function pass(value: string) { checks.push(value); console.log(`PASS ${value}`); }
function client(initialCookie = '') {
 let cookie = initialCookie;
 async function raw(path: string, method = 'GET', body?: unknown, requestOrigin = origin) {
  const response = await fetch(new URL(path, origin), { method, redirect: 'error', headers: {
   Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const received = response.headers.get('set-cookie'); if (received) cookie = received.split(';')[0];
  return response;
 }
 return { raw, clone: () => client(cookie), async request(path: string, method = 'GET', body?: unknown): Promise<Row> {
  const response = await raw(path, method, body), result = await response.json();
  assert.ok(response.ok && !result.error, `${method} ${path}: ${response.status} ${result.error || ''}`);
  return result.data;
 } };
}
async function participant(phone: string) {
 const session = client(), sentAt = Date.now();
 await session.request('/api/auth/otp/request', 'POST', { contact: phone });
 for (let i = 0; i < 60; i++) {
  const lines = (await readFile('.local/inbox/messages.jsonl', 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const message = lines.reverse().find(item => item.kind === 'sms' && item.to === phone && new Date(item.capturedAt || item.at || item.createdAt || sentAt).getTime() >= sentAt - 1000);
  if (message) { await session.request('/api/auth/otp/verify', 'POST', { contact: phone, code: message.code }); return session; }
  await pause(100);
 }
 throw new Error('No local test OTP was captured.');
}
async function main() {
 const anonymous = client(), config = await anonymous.request('/api/public/config');
 const edition = config.editions.find((e: Row) => e.label.startsWith('LOCAL TEST edition ') && e.state === 'open' && e.config?.registrationApproved && new Date(e.registration_opens).getTime() <= Date.now() && new Date(e.registration_closes).getTime() > Date.now());
 assert.ok(edition, 'Run local:verify first to create an approved synthetic edition. Real 2027 dates are never opened by this script.');
 const schools = await anonymous.request('/api/public/schools?q=LOCAL%20TEST');
 const school = schools.items.find((s: Row) => s.name.startsWith('LOCAL TEST'));
 assert.ok(school, 'A synthetic active school is required.');
 assert.equal((await anonymous.raw('/api/registration-drafts?kind=student')).status, 401);
 pass('Saved registration endpoints require an authenticated account');

 const stamp = Date.now().toString(36), phone = `+1997${Date.now().toString().slice(-7)}`;
 const parent = await participant(phone), stranger = await participant(`+1887${Date.now().toString().slice(-7)}`);
 const draftId = randomUUID(); let version = 0;
 const payload = { schoolId: school.id, schoolName: school.name, schoolReference: school.reference, schoolLocation: school.city, editionId: edition.id, name: `LOCAL TEST saved student ${stamp}`, class: 8, section: 'T' };
 for (let step = 0; step <= 3; step++) {
  const saved = await parent.request('/api/registration-drafts', 'PUT', { id: draftId, kind: 'student', scope: 'new', payload, currentStep: step, lockVersion: version }); version = saved.lock_version;
  const resumed = await parent.clone().request('/api/registration-drafts?kind=student&scope=new');
  const found = resumed.items.find((d: Row) => d.id === draftId);
  assert.equal(found.current_step, step); assert.equal(found.payload.name, payload.name); assert.equal(found.lock_version, version);
 }
 pass('All four student steps persist and resume through a fresh HTTP client');
 const input = { id: draftId, kind: 'student', scope: 'new', payload, currentStep: 3, lockVersion: version };
 assert.equal((await stranger.request('/api/registration-drafts?kind=student&scope=new')).items.length, 0);
 assert.equal((await stranger.raw('/api/registration-drafts', 'PUT', input)).status, 404);
 assert.equal((await parent.raw('/api/registration-drafts', 'PUT', { ...input, lockVersion: version - 1 })).status, 409);
 assert.equal((await parent.raw('/api/registration-drafts', 'PUT', input, 'https://unrelated.example')).status, 403);
 pass('Ownership, stale-tab protection and origin checks reject unsafe writes');
 const complete = { lockVersion: version, consent: true, consentVersion: edition.config.consentVersion };
 const receipt = await parent.request(`/api/registration-drafts/${draftId}/complete`, 'POST', complete);
 assert.ok(receipt.student?.reference);
 assert.deepEqual(await parent.request(`/api/registration-drafts/${draftId}/complete`, 'POST', complete), receipt);
 assert.equal((await parent.request('/api/registration-drafts?kind=student&scope=new')).items.some((d: Row) => d.id === draftId), false);
 assert.ok((await parent.request('/api/participant')).students.some((s: Row) => s.id === receipt.student.id));
 pass('Final consent creates one student registration and an idempotent receipt');

 const teacherId = randomUUID(); let teacherVersion = 0;
 const teacherData = { schoolId: school.id, schoolName: school.name, schoolReference: school.reference, name: `LOCAL TEST teacher ${stamp}`, role: 'Science teacher', email: `teacher-${stamp}@local.test`, subject: 'Science' };
 for (let step = 0; step <= 2; step++) {
  const saved = await parent.request('/api/registration-drafts', 'PUT', { id: teacherId, kind: 'teacher', scope: 'new', payload: teacherData, currentStep: step, lockVersion: teacherVersion }); teacherVersion = saved.lock_version;
 }
 const teacher = await parent.request(`/api/registration-drafts/${teacherId}/complete`, 'POST', { lockVersion: teacherVersion });
 assert.equal(teacher.status, 'pending'); assert.ok(teacher.reference);
 assert.equal((await parent.raw(`/api/schools/${school.id}/dashboard`)).status, 403);
 assert.ok((await parent.request('/api/participant')).teachers.some((t: Row) => t.id === teacher.id));
 pass('Teacher registration stays pending and does not grant unreviewed school access');

 const schoolId = randomUUID(); let schoolVersion = 0;
 const schoolData = { name: `LOCAL TEST draft school ${stamp}`, address: '123 Synthetic Test Street', city: 'Test City', state: 'Test State', postalCode: '000000', contactName: 'LOCAL TEST coordinator', contactRole: 'Teacher', email: `school-${stamp}@local.test` };
 for (let step = 0; step <= 3; step++) {
  const saved = await parent.request('/api/registration-drafts', 'PUT', { id: schoolId, kind: 'school', scope: 'new', payload: schoolData, currentStep: step, lockVersion: schoolVersion }); schoolVersion = saved.lock_version;
 }
 const schoolReceipt = await parent.request(`/api/registration-drafts/${schoolId}/complete`, 'POST', { lockVersion: schoolVersion });
 assert.equal(schoolReceipt.status, 'pending'); assert.ok(schoolReceipt.reference);
 assert.deepEqual(await parent.request(`/api/registration-drafts/${schoolId}/complete`, 'POST', { lockVersion: schoolVersion }), schoolReceipt);
 pass('School steps create a permanent reference once, pending approval');
 const competition = config.competitions.find((c: Row) => c.edition_id === edition.id && c.title.startsWith('LOCAL TEST') && c.config?.mode === 'individual');
 assert.ok(competition);
 const entry = await parent.request('/api/entries', 'POST', { participationId: receipt.participation.id, competitionId: competition.id, answers: {}, memberIds: [] });
 const savedEntry = await parent.request(`/api/entries/${entry.id}`, 'PUT', { answers: { title: 'LOCAL TEST saved work' }, memberIds: [], currentStep: 'upload', lockVersion: entry.lock_version });
 const restoredEntry = await parent.clone().request(`/api/entries/${entry.id}`);
 assert.equal(restoredEntry.entry.current_step, 'upload'); assert.equal(restoredEntry.entry.answers.title, 'LOCAL TEST saved work');
 assert.equal((await parent.raw(`/api/entries/${entry.id}/submit`, 'POST', { lockVersion: savedEntry.lock_version })).status, 422);
 pass('Competition step saves resume correctly; required-file checks still block incomplete submission');

 for (const route of ['/register', '/teachers/register', '/schools/register', '/competitions', '/how-to-participate', '/resources']) assert.equal((await anonymous.raw(route)).status, 200, route);
 const pdf = await anonymous.raw('/documents/guidelines/YOUTH%20ECO%20SUMMIT%20TOPICS%20AND%20GUIDELINES-2027.pdf'); assert.equal(pdf.status, 200);
 pass('Relevant pages and the original guidelines PDF are served locally');
 await writeFile('.local/guidelines-registration-report.json', JSON.stringify({ verifiedAt: new Date().toISOString(), origin, checks, limitations: ['Synthetic local records and captured test OTPs only.', 'Production hosting, real SMS/email and WordPress activation were not tested.', 'No browser visual verification.'] }, null, 2), { mode: 0o600 });
 console.log(`${checks.length} HTTP checks passed. Report: .local/guidelines-registration-report.json`);
}
main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : 'Registration verification failed.'); process.exit(1); });
