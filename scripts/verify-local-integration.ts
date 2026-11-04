/** Exercise the real HTTP API against the explicitly isolated local runtime. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { URI } from 'otpauth';
import { bootstrapOwner } from '../src/server/auth';
import { db } from '../src/server/db';

const origin = process.env.APP_ORIGIN || '';
const database = new URL(process.env.DATABASE_URL || 'http://invalid');
if (process.env.YES_LOCAL_RUNTIME !== 'true' || process.env.APP_ENV !== 'development' || process.env.NODE_ENV === 'production'
  || !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)
  || !['127.0.0.1', 'localhost'].includes(database.hostname) || !database.pathname.startsWith('/yes_local')) {
  throw new Error('This verification only runs against the isolated yes_local development database.');
}

type Row = Record<string, any>;
const checks: string[] = [];
function checked(description: string) { checks.push(description); console.log(`PASS ${description}`); }
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function client() {
  let cookie = '';
  async function raw(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(new URL(path, origin), { method, redirect: 'error', headers: {
      Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers,
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return response;
  }
  return { raw, async request(path: string, method = 'GET', body?: unknown): Promise<Row> {
    const response = await raw(path, method, body); const result = await response.json();
    assert.ok(response.ok && !result.error, `${method} ${path}: ${response.status} ${result.error || ''}`);
    return result.data;
  } };
}
async function inbox(kind: string, to: string) {
  for (let i = 0; i < 30; i++) {
    const messages = (await readFile('.local/inbox/messages.jsonl', 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const found = messages.reverse().find(message => message.kind === kind && message.to === to);
    if (found) return found;
    await delay(100);
  }
  throw new Error(`No captured ${kind} message found for the local test account.`);
}
async function participant(phone: string) {
  const session = client();
  await session.request('/api/auth/otp/request', 'POST', { contact: phone });
  const message = await inbox('sms', phone);
  await session.request('/api/auth/otp/verify', 'POST', { contact: phone, code: message.code });
  return session;
}

async function main() {
  await mkdir('.local', { recursive: true, mode: 0o700 });
  const anonymous = client();
  assert.equal((await anonymous.request('/api/health')).configured, true);
  assert.equal((await anonymous.raw('/api/participant')).status, 401);
  assert.equal((await anonymous.raw('/api/public/nominations', 'POST', {}, { Origin: 'https://unrelated.example' })).status, 403);
  checked('Real API is connected; anonymous access and cross-origin mutations are denied');

  let access: Row = JSON.parse(await readFile('.local/integration-access.json', 'utf8').catch(() => '{}'));
  if (!access.owner) {
    const password = randomBytes(24).toString('base64url');
    const owner = await bootstrapOwner(db, { contact: 'owner@local.test', name: 'LOCAL TEST owner', password, secret: process.env.AUTH_SECRET! });
    access.owner = { contact: 'owner@local.test', password, provisioningUri: owner.provisioningUri };
    await writeFile('.local/integration-access.json', JSON.stringify(access, null, 2), { mode: 0o600 });
  }
  const owner = client();
  const ownerTotp = URI.parse(access.owner.provisioningUri);
  const counter = Math.floor(Date.now() / 30000);
  const previous = (await db.query('SELECT totp_last_counter FROM users WHERE contact=$1', [access.owner.contact])).rows[0];
  if (Number(previous?.totp_last_counter) >= counter) await delay(30000 - Date.now() % 30000 + 200);
  const signedIn = await owner.request('/api/auth/login', 'POST', { contact: access.owner.contact, password: access.owner.password, totp: ownerTotp.generate() });
  assert.equal(signedIn.actor.role, 'owner');
  checked('Owner password and authenticator sign-in creates a real session');

  const currentContent = await owner.request('/api/admin/content');
  for (const key of ['privacy', 'terms']) {
    const current = currentContent.items.find((item: Row) => item.key === key);
    assert.ok(!current?.approved || current.body.startsWith('LOCAL TEST'), 'Refusing to replace approved non-test content.');
    await owner.request('/api/admin/content', 'POST', { key, title: `LOCAL TEST ${key}`, body: 'LOCAL TEST ONLY. Synthetic registration data for integration verification. This is not the programme privacy policy or participation terms.', approved: true });
  }
  const oldEditions = await owner.request('/api/admin/editions?pageSize=100');
  for (const previous of oldEditions.items.filter((item: Row) => item.label.startsWith('LOCAL TEST edition ') && item.state === 'open')) {
    await owner.request(`/api/admin/editions/${previous.id}`, 'PATCH', { action: 'archive', reason: 'Keep previous synthetic verification records; start a fresh local test run.' });
  }
  const stamp = Date.now().toString(36);
  const start = new Date(Date.now() - 86400000).toISOString(), end = new Date(Date.now() + 7 * 86400000).toISOString();
  const editionConfig = { registrationApproved: true, schoolVerificationApproved: true, consentVersion: 'local-test-v1', consentText: 'LOCAL TEST: I confirm this record is synthetic test data.', publicationConsentVersion: 'local-pub-v1', publicationConsentText: 'LOCAL TEST: I allow this synthetic example in the local showcase.' };
  const edition = await owner.request('/api/admin/editions', 'POST', { label: `LOCAL TEST edition ${stamp}`, state: 'open', registrationOpens: start, registrationCloses: end, config: editionConfig });
  const competition = await owner.request('/api/admin/competitions', 'POST', {
    editionId: edition.id, slug: `local-challenge-${stamp}`, title: 'LOCAL TEST — Environmental ideas', guidelines: 'LOCAL TEST ONLY. Write a title and attach a PNG illustration to verify the submission workflow.', opensAt: start, closesAt: end,
    config: { mode: 'individual', entryLimit: 3, minMembers: 1, maxMembers: 1, categories: [{ id: 'secondary', label: 'Classes 6–12', classes: [6, 7, 8, 9, 10, 11, 12] }], fields: [{ key: 'title', label: 'Project title', type: 'text', required: true, maxLength: 200 }], files: { minCount: 1, maxCount: 1, maxBytes: 1000000, types: ['image/png'] } },
  });
  await owner.request(`/api/admin/competitions/${competition.id}`, 'PATCH', { action: 'approve', reason: 'LOCAL TEST configuration for integration verification' });
  const catalogue = await anonymous.request('/api/public/config');
  assert.ok(catalogue.competitions.some((c: Row) => c.id === competition.id));
  checked('Admin-approved edition and competition appear through the public catalogue API');

  const phone = `+1999${Date.now().toString().slice(-7)}`;
  const parent = await participant(phone);
  const school = await parent.request('/api/schools', 'POST', { name: `LOCAL TEST School ${stamp}`, address: '123 Synthetic Test Street', city: 'Test City', state: 'Test State', postalCode: '000000', contactName: 'Test Coordinator', contactRole: 'Test Coordinator', email: `school-${stamp}@local.test`, phone, coordinator: 'Test coordinator' });
  assert.equal(school.status, 'pending');
  assert.ok(!(await anonymous.request(`/api/public/schools?q=${encodeURIComponent(school.name)}`)).items.some((s: Row) => s.id === school.id));
  await owner.request(`/api/admin/schools/${school.id}`, 'PATCH', { action: 'approve', reason: 'Synthetic school verified for isolated local integration test' });
  assert.ok((await anonymous.request(`/api/public/schools?q=${encodeURIComponent(school.reference)}`)).items.some((s: Row) => s.id === school.id));
  await parent.request(`/api/schools/${school.reference}/claim`, 'POST', {});
  checked('OTP sign-in, school registration, admin approval and permanent-school lookup work together');

  const studentInput = { name: 'LOCAL TEST Student', schoolId: school.id, editionId: edition.id, class: 8, guardianContact: phone, consent: true, consentVersion: 'local-test-v1' };
  const registration = await parent.request('/api/students', 'POST', studentInput);
  const saved = await parent.request('/api/participant');
  assert.ok(saved.students.some((s: Row) => s.id === registration.student.id));
  const other = await participant(`+1888${Date.now().toString().slice(-7)}`);
  const entry = await parent.request('/api/entries', 'POST', { participationId: registration.participation.id, competitionId: competition.id, answers: {}, memberIds: [] });
  assert.ok([403, 404].includes((await other.raw(`/api/entries/${entry.id}`)).status));
  const draft = await parent.request(`/api/entries/${entry.id}`, 'PUT', { answers: { title: 'LOCAL TEST project saved and resumed' }, memberIds: [], lockVersion: entry.lock_version });
  const resumed = await parent.request(`/api/entries/${entry.id}`);
  assert.equal(resumed.entry.answers.title, 'LOCAL TEST project saved and resumed');
  assert.equal((await parent.raw(`/api/entries/${entry.id}/submit`, 'POST', { lockVersion: draft.lock_version })).status, 422);
  checked('Student registration, dashboard, draft save/resume and cross-account isolation work');

  // A tiny valid raster fixture, kept out of production content. Hash and bytes travel through the actual multipart boundary.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64');
  const upload = await parent.request('/api/uploads/start', 'POST', { submissionId: entry.id, originalName: 'local-integration-test.png', byteSize: png.length, checksum: createHash('sha256').update(png).digest('hex') });
  const part = await parent.request(`/api/uploads/${upload.id}/parts`, 'POST', { partNumber: 1 });
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(part.url).hostname), 'Refusing to upload test bytes outside local storage.');
  assert.ok((await fetch(part.url, { method: 'PUT', body: png })).ok);
  await parent.request(`/api/uploads/${upload.id}/complete`, 'POST', {});
  let file: Row = {};
  for (let i = 0; i < 60; i++) { file = await parent.request(`/api/uploads/${upload.id}`); if (file.status === 'ready') break; if (['failed', 'quarantined'].includes(file.status)) throw new Error(`Local file verification failed: ${file.status}`); await delay(500); }
  assert.equal(file.status, 'ready', 'The background worker must complete verification.');
  const media = await parent.raw(`/api/media/${upload.id}`);
  assert.equal(media.status, 200); assert.deepEqual(Buffer.from(await media.arrayBuffer()), png);
  assert.equal((await anonymous.raw(`/api/media/${upload.id}`)).status, 401);
  checked('Multipart file upload, durable worker, checksum verification and private retrieval work');

  const receipt = await parent.request(`/api/entries/${entry.id}/submit`, 'POST', { lockVersion: draft.lock_version });
  assert.equal(receipt.state, 'submitted');
  assert.equal((await parent.request(`/api/entries/${entry.id}/submit`, 'POST', { lockVersion: draft.lock_version })).reference, receipt.reference);
  const listed = await owner.request(`/api/admin/entries?q=${receipt.reference}`);
  assert.ok(listed.items.some((item: Row) => item.id === entry.id));
  checked('Final submission persists its receipt and appears in the admin dashboard');

  const judgeContact = `judge-${stamp}@local.test`, judgePassword = randomBytes(24).toString('base64url');
  await owner.request('/api/auth/invitations', 'POST', { contact: judgeContact, role: 'judge', name: 'LOCAL TEST Judge' });
  const invitation = await inbox('email', judgeContact);
  const invitationUrl = new URL(invitation.body); const token = invitationUrl.searchParams.get('token');
  const judge = client();
  const setup = await judge.request('/api/auth/invitation/setup', 'POST', { token });
  const authenticator = URI.parse(setup.provisioningUri);
  await judge.request('/api/auth/invitation/accept', 'POST', { token, password: judgePassword, totp: authenticator.generate({ timestamp: Date.now() - 30000 }) });
  const judgeLogin = await judge.request('/api/auth/login', 'POST', { contact: judgeContact, password: judgePassword, totp: authenticator.generate() });
  assert.equal(judgeLogin.actor.role, 'judge');
  const round = await owner.request('/api/admin/rounds', 'POST', { competitionId: competition.id, name: 'LOCAL TEST screening', kind: 'screening', eligibleStates: ['submitted'], rubric: { criteria: [{ id: 'guidelines', label: 'Meets guidelines', min: 0, max: 1, weight: 1, required: true }], commentRequired: true }, decisionRoles: ['owner', 'admin'], requiredReviews: 1, open: true });
  await owner.request('/api/admin/assignments', 'POST', { entryIds: [entry.id], judgeId: judgeLogin.actor.id, roundId: round.id, reason: 'Local workflow verification' });
  const queue = await judge.request('/api/judge');
  const assignment = queue.items.find((item: Row) => item.reference === receipt.reference); assert.ok(assignment);
  const reviewPage = await judge.request(`/api/judge/${assignment.id}`);
  assert.equal(JSON.stringify(reviewPage).includes(phone), false);
  const review = await judge.request(`/api/judge/${assignment.id}/submit`, 'POST', { scores: { guidelines: 1 }, comment: 'Synthetic test entry meets test guidelines.', lockVersion: 0 });
  assert.equal(review.status, 'submitted');
  assert.equal((await judge.raw('/api/admin/students')).status, 403);
  checked('Email invitation, judge MFA, assignment, private review and role isolation work');

  await parent.request('/api/consents/publication', 'POST', { studentId: registration.student.id, editionId: edition.id, accepted: true, version: 'local-pub-v1' });
  const publication = await owner.request('/api/admin/publications', 'POST', { entryId: entry.id, title: 'LOCAL TEST student work', summary: 'Synthetic example for integration verification.', active: true, assetIds: [upload.id], mediaApproved: true });
  assert.ok((await anonymous.request('/api/public/showcase')).items.some((item: Row) => item.id === publication.id));
  assert.equal((await anonymous.raw(`/api/public/showcase/${publication.id}/media/${upload.id}`)).status, 200);
  await parent.request('/api/consents/publication', 'POST', { studentId: registration.student.id, editionId: edition.id, accepted: false, version: 'local-pub-v1' });
  assert.ok(!(await anonymous.request('/api/public/showcase')).items.some((item: Row) => item.id === publication.id));
  assert.equal((await anonymous.raw(`/api/public/showcase/${publication.id}/media/${upload.id}`)).status, 404);
  checked('Separate publication consent, moderation and withdrawal control public showcase and media');

  await parent.request('/api/auth/logout', 'POST', {});
  assert.equal((await parent.raw('/api/participant')).status, 401);
  checked('Sign-out revokes the session');
  access.latest = { editionId: edition.id, competitionId: competition.id, schoolId: school.id, schoolReference: school.reference, studentId: registration.student.id, entryId: entry.id, reference: receipt.reference, participantPhone: phone };
  await writeFile('.local/integration-access.json', JSON.stringify(access, null, 2), { mode: 0o600 });
  await writeFile('.local/integration-report.json', JSON.stringify({ verifiedAt: new Date().toISOString(), origin, checks, limitations: ['Local test messages only; no real SMS/email sent.', 'Development-only scanner bypass; production scanning not verified.', 'Synthetic fixtures remain in the isolated local database.'] }, null, 2), { mode: 0o600 });
  console.log(`${checks.length} integration checks passed. Local report: .local/integration-report.json`);
}
main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : 'Integration verification failed.'); process.exit(1); });
