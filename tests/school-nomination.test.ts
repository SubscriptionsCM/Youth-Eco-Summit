import {randomUUID} from 'node:crypto';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import source from '../src/data/wordpress-forms.json';
import {referenceForms, validateReferenceAnswers, visibleFields, type Answers} from '../src/domain/wordpress-forms';
import {schoolNominationDesignations} from '../src/domain/school-nomination';
import {createFormRecord, getFormRecord, saveFormRecord, submitFormRecord} from '../src/server/portal-forms';
import {adminList, adminPatch} from '../src/server/admin';
import {deliverFormNotifications} from '../src/server/form-notifications';
import {nativeNotificationPackets} from '../src/server/native-form-notifications';
import {sendTransactionalEmail} from '../src/server/email';
import {fingerprint} from '../src/server/wordpress-migration';
import type {Actor} from '../src/server/core';
import {testDb} from './helpers/db';

vi.mock('../src/server/email', () => ({sendTransactionalEmail: vi.fn(async () => {})}));

const form = referenceForms.find(candidate => candidate.key === 'nomination')!;
const valid = (overrides: Answers = {}): Answers => ({'select-1': 'New Green School, South branch', 'name-2': 'Asha Singh', 'select-2': 'Teacher', 'email-2': 'coordinator@example.test', ...overrides});

describe('native school nomination validation', () => {
 it('replaces only the current native schema and leaves the captured definition and settings intact', () => {
  const archived = source.forms.find(candidate => candidate.id === 8916)!;
  expect(form).toMatchObject({id: 8916, key: 'nomination', settings: archived.settings});
  expect(form.fields.find(field => field.id === 'select-1')).toMatchObject({type: 'text', required: '1', max_length: 200});
  expect(form.fields.find(field => field.id === 'select-1')).not.toHaveProperty('catalogue');
  expect(archived.fields.find(field => field.id === 'select-1')).toMatchObject({type: 'select', catalogue: 'dc8743928b1e'});
  expect(form.fields.find(field => field.id === 'select-2')?.options.map((option: {value: string}) => option.value)).toEqual(schoolNominationDesignations);
 });

 it('accepts a school outside the directory and optional nominator and location details', () => {
  expect(validateReferenceAnswers(form, valid(), {final: true}).errors).toEqual({});
  const input = valid({'name-1': 'Nominator', 'email-1': 'nominator@example.test', 'phone-1': '+91 98765 43210', 'address-1': {address_city: ' Delhi ', address_state: 'Delhi'}});
  expect(validateReferenceAnswers(form, input, {final: true})).toEqual({answers: {...input, 'address-1': {address_city: 'Delhi', address_state: 'Delhi'}}, errors: {}});
 });

 it('allows partial drafts and requires the school, representative, designation and a contact on submission', () => {
  expect(validateReferenceAnswers(form, {}, {final: false})).toEqual({answers: {}, errors: {}});
  const checked = validateReferenceAnswers(form, {}, {final: true});
  expect(Object.keys(checked.errors).sort()).toEqual(['email-2', 'name-2', 'phone-2', 'select-1', 'select-2']);
  expect(validateReferenceAnswers(form, valid({'email-2': ''}), {final: false}).errors).toEqual({});
  expect(validateReferenceAnswers(form, valid({'email-2': '', 'phone-2': '+44 (20) 7123-4567'}), {final: true}).errors).toEqual({});
 });

 it('requires Other designation only when selected and strips hidden or forged values', () => {
  expect(validateReferenceAnswers(form, valid({'select-2': 'Other'}), {final: true}).errors).toHaveProperty('text-2');
  expect(validateReferenceAnswers(form, valid({'select-2': 'Other', 'text-2': 'Sustainability lead'}), {final: true}).errors).toEqual({});
  expect(visibleFields(form, valid()).some(field => field.id === 'text-2')).toBe(false);
  expect(validateReferenceAnswers(form, valid({'text-2': 'Discard', schoolStatus: 'active', schoolId: randomUUID()}), {final: true}).answers).toEqual(valid());
  expect(validateReferenceAnswers(form, valid({'select-2': 'Administrator'}), {final: true}).errors).toHaveProperty('select-2');
 });

 it('normalizes old Others drafts without retaining a duplicate school name', () => {
  const input = valid({'select-1': ' Others ', 'text-1': '  New Green School, South branch  '});
  expect(validateReferenceAnswers(form, input, {final: true})).toEqual({answers: valid(), errors: {}});
  expect(input['select-1']).toBe(' Others ');
  expect(validateReferenceAnswers(form, valid({'select-1': 'Others'}), {final: true}).errors).toHaveProperty('select-1');
 });

 it.each([
  ['select-1', 'x'.repeat(201)], ['name-2', 'x'.repeat(161)], ['name-1', 'x'.repeat(161)],
  ['email-2', 'not-an-email'], ['email-1', 'bad@example'], ['phone-2', '+91 abc 9876543210'], ['phone-2', '123456'], ['phone-2', '1'.repeat(16)], ['phone-2', '1234567)'], ['phone-2', '12..34567'], ['phone-1', 'abc'],
  ['name-2', ['Asha']], ['select-1', 123],
 ])('rejects malformed or overlong %s in drafts too', (field, value) => {
  expect(validateReferenceAnswers(form, valid({[field]: value}), {final: false}).errors).toHaveProperty(field);
 });

 it('bounds Other designation and permits international numbers with 7–15 digits', () => {
  expect(validateReferenceAnswers(form, valid({'select-2': 'Other', 'text-2': 'x'.repeat(101)}), {final: false}).errors).toHaveProperty('text-2');
  for (const phone of ['1234567', '+1 (415) 555-0123', '+919876543210', '123456789012345']) expect(validateReferenceAnswers(form, valid({'phone-2': phone}), {final: true}).errors).toEqual({});
 });
});

describe('school nomination persistence, staff access and native notifications', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>, participant: Actor, owner: Actor, admin: Actor, judge: Actor, outsider: Actor;
 beforeAll(async () => {
  fixture = await testDb();
  vi.stubEnv('APP_ORIGIN', 'https://summit.example.test');
  const account = async (role: Actor['role'], kind = 'unclassified'): Promise<Actor> => {
   const actor: Actor = {id: randomUUID(), role, contact: randomUUID() + '@example.test'};
   await fixture.db.query('INSERT INTO users(id,role,contact,participant_kind) VALUES($1,$2,$3,$4)', [actor.id, role, actor.contact, kind]);
   return actor;
  };
  participant = await account('participant', 'student'); owner = await account('owner'); admin = await account('admin'); judge = await account('judge'); outsider = await account('participant', 'student');
 });
 afterAll(async () => {vi.unstubAllEnvs(); await fixture?.close();});

 it('persists partial drafts, validates final contact fields and retains every submitted field for staff', async () => {
  const created = await createFormRecord(fixture.db, participant, {formKey: 'nomination'});
  const partial = await saveFormRecord(fixture.db, participant, created.record.id, {answers: {'select-1': 'Others', 'text-1': 'New Green School'}, currentStep: 0, lockVersion: 0});
  expect(partial.answers).toEqual({'select-1': 'New Green School'});
  await expect(submitFormRecord(fixture.db, participant, created.record.id, {answers: valid({'email-2': ''}), lockVersion: 1})).rejects.toMatchObject({status: 422, fields: {'email-2': expect.any(String), 'phone-2': expect.any(String)}});
  expect((await getFormRecord(fixture.db, participant, created.record.id)).status).toBe('draft');
  const answers = valid({'select-2': 'Other', 'text-2': 'Eco-club lead', 'phone-2': '+91 98765 43210', 'address-1': {address_city: 'Delhi', address_state: 'Delhi'}, 'name-1': 'Nominator', 'email-1': 'nominator@example.test', 'phone-1': '+91 91234 56789'});
  const receipt = await submitFormRecord(fixture.db, participant, created.record.id, {answers, lockVersion: 1});
  expect(receipt).toMatchObject({formKey: 'nomination', status: 'submitted'});
  expect(receipt).not.toHaveProperty('schoolId');
  for (const staff of [owner, admin]) {
   const record = await getFormRecord(fixture.db, staff, created.record.id);
   expect(record.answers).toEqual(answers);
   for (const field of ['select-1', 'name-2', 'select-2', 'text-2', 'email-2', 'phone-2']) expect(record.form_snapshot.fields).toContainEqual(expect.objectContaining({id: field}));
   const inbox = await adminList(fixture.db, staff, 'submission-inbox', new URLSearchParams({formKey: 'nomination', id: created.record.id}));
   expect(inbox.items).toEqual([expect.objectContaining({id: created.record.id, school_name: answers['select-1'], href: '/forms/nomination#saved=' + created.record.id})]);
  }
  for (const other of [judge, outsider]) {
   await expect(getFormRecord(fixture.db, other, created.record.id)).rejects.toMatchObject({status: 404});
   await expect(adminList(fixture.db, other, 'submission-inbox', new URLSearchParams({formKey: 'nomination'}))).rejects.toMatchObject({status: 403});
  }
  expect((await fixture.db.query("SELECT context FROM portal_form_notification_runs WHERE record_id=$1", [created.record.id])).rows[0].context.normalizedAnswers).toEqual(answers);
  expect((await fixture.db.query("SELECT payload FROM jobs WHERE kind='form_notifications' AND payload->>'recordId'=$1", [created.record.id])).rows).toHaveLength(1);
 });

 it('supports anonymous private drafts without exposing them to an unrelated signed-in account', async () => {
  const created = await createFormRecord(fixture.db, null, {formKey: 'nomination'});
  await submitFormRecord(fixture.db, null, created.record.id, {answers: valid({'email-2': '', 'phone-2': '020 7123 4567'}), lockVersion: 0}, created.token);
  expect((await getFormRecord(fixture.db, null, created.record.id, created.token)).answers['phone-2']).toBe('020 7123 4567');
  await expect(getFormRecord(fixture.db, outsider, created.record.id)).rejects.toMatchObject({status: 404});
 });

 it('never creates or approves a school and a fabricated approval cannot enable student registration', async () => {
  const created = await createFormRecord(fixture.db, participant, {formKey: 'nomination'});
  const receipt = await submitFormRecord(fixture.db, participant, created.record.id, {answers: valid({schoolStatus: 'active', schoolId: created.record.id, approved: true, 'registered-school-id': created.record.reference}), lockVersion: 0});
  expect((await getFormRecord(fixture.db, participant, created.record.id)).school_id).toBeNull();
  expect((await fixture.db.query('SELECT id FROM schools')).rows).toEqual([]);
  expect((await fixture.db.query('SELECT id FROM school_nominations')).rows).toEqual([]);
  await expect(adminPatch(fixture.db, owner, 'schools', created.record.id, {action: 'approve', reason: 'Fabricated nomination approval'})).rejects.toMatchObject({status: 404});
  const student = await createFormRecord(fixture.db, participant, {formKey: 'student'});
  const answers = {'text-1': 'Student', 'email-1': participant.contact, 'select-2': 'New Green School', 'select-yes-class': '5', 'phone-1': '+919876543210', 'text-3': 'Delhi', 'number-1': '110001', 'consent-1': true, 'registered-school-id': receipt.reference};
  await expect(submitFormRecord(fixture.db, participant, student.record.id, {answers, lockVersion: 0}, undefined, new Date('2026-11-04T12:00:00Z'))).rejects.toMatchObject({status: 422, fields: {'registered-school-id': expect.any(String)}});
  expect((await getFormRecord(fixture.db, participant, student.record.id)).status).toBe('draft');
  expect((await fixture.db.query('SELECT id FROM student_participations')).rows).toEqual([]);
 });

 it('renders current nomination fields using retained template and recipient settings without mutating source rows or versions', async () => {
  const fields = source.forms.find(candidate => candidate.id === 8916)!.fields;
  const definition = {post_title: 'School nomination', definition: {fields, notifications: [{slug: 'school-nomination-team', recipients: 'team@example.test', 'email-recipients': 'default', 'cc-email': 'archive@example.test', 'replyto-email': 'reply@example.test', 'email-subject': 'Nomination {submission_id}', 'email-editor': '<p>Received school nomination</p>{all_fields}', conditions: []}]}};
  const current = structuredClone(definition); current.definition.notifications[0]['email-editor'] += '<p>Contact: {name-2}; {select-2}; {text-2}; {email-2}; {phone-2}</p>';
  const sourceId = randomUUID(), baselineChecksum = fingerprint(definition), checksum = fingerprint(current);
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.example.test','form','8916',$2,$3,now())", [sourceId, JSON.stringify(definition), baselineChecksum]);
  await fixture.db.query('INSERT INTO wordpress_record_versions(id,record_id,baseline_checksum,checksum,payload,captured_at) VALUES($1,$2,$3,$4,$5,now())', [randomUUID(), sourceId, baselineChecksum, checksum, JSON.stringify(current)]);
  const snapshot = {format: 'yes-native-form-snapshot/v1', forms: {'8916': checksum}};
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.example.test','option','native-current-forms:nomination-test',$2,$3,now())", [randomUUID(), JSON.stringify(snapshot), fingerprint(snapshot)]);
  const before = (await fixture.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows;
  const versions = (await fixture.db.query('SELECT * FROM wordpress_record_versions ORDER BY id')).rows;
  const created = await createFormRecord(fixture.db, participant, {formKey: 'nomination'});
  const answers = valid({'select-1': '<School & branch>', 'name-2': '<Asha>', 'select-2': 'Other', 'text-2': 'Eco-club lead', 'phone-2': '+91 98765 43210'});
  await submitFormRecord(fixture.db, participant, created.record.id, {answers, lockVersion: 0});
  vi.mocked(sendTransactionalEmail).mockClear();
  expect(await deliverFormNotifications(fixture.db, created.record.id)).toEqual({delivered: 1, review: 0, pending: 0});
  expect(sendTransactionalEmail).toHaveBeenCalledOnce();
  const mail = vi.mocked(sendTransactionalEmail).mock.calls[0][0];
  expect(mail).toMatchObject({to: ['team@example.test'], cc: ['archive@example.test'], replyTo: 'reply@example.test', subject: 'Nomination ' + created.record.reference});
  for (const label of ['School name', 'School contact name', 'Designation', 'Other designation', 'School contact email', 'School contact phone']) expect(mail.html).toContain(label);
  for (const value of ['&lt;School &amp; branch&gt;', '&lt;Asha&gt;', 'Other', 'Eco-club lead', 'coordinator@example.test', '+91 98765 43210']) expect(mail.html).toContain(value);
  expect(mail.html).not.toContain('<Asha>');
  expect((await fixture.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows).toEqual(before);
  expect((await fixture.db.query('SELECT * FROM wordpress_record_versions ORDER BY id')).rows).toEqual(versions);
  await deliverFormNotifications(fixture.db, created.record.id);
  expect(sendTransactionalEmail).toHaveBeenCalledOnce();
 });

 it('limits the notification field override to form 8916 and retains compatible historical template fields', () => {
  const definition = {post_title: 'Archived form', definition: {fields: [{id: 'email-1', type: 'email', field_label: 'Legacy nominator email'}, {id: 'text-1', type: 'text', field_label: 'Legacy school name'}], notifications: [{slug: 'team', recipients: 'team@example.test', 'email-subject': 'Nomination', 'email-editor': '{all_fields}<p>Legacy: {text-1}</p>'}]}};
  const context = {formId: 8916, recordId: randomUUID(), reference: 'YES-8916-TEST', submittedAt: '2026-11-20T10:00:00.000Z', portalOrigin: 'https://summit.example.test', normalizedAnswers: valid({'text-1': 'Legacy school'}), verifiedFileDescriptors: []};
  const [nomination] = nativeNotificationPackets(definition, context);
  expect(nomination.body).toContain('School contact name'); expect(nomination.body).toContain('Legacy school');
  const [other] = nativeNotificationPackets(definition, {...context, formId: 8917});
  expect(other.body).not.toContain('School contact name'); expect(other.body).toContain('Legacy school');
 });

 it('preserves historical Others school answers and never revives dangling recipient fields', () => {
  const definition = {definition: {fields: source.forms.find(candidate => candidate.id === 8916)!.fields, notifications: [{slug: 'team', recipients: 'team@example.test, {email-2}', 'email-subject': 'Nomination', 'email-editor': '{all_fields}<p>Original school: {text-1}</p>'}]}};
  const context = {formId: 8916, recordId: randomUUID(), reference: 'YES-8916-HISTORICAL', submittedAt: '2026-11-20T10:00:00.000Z', portalOrigin: 'https://summit.example.test', normalizedAnswers: valid({'select-1': 'Others', 'text-1': 'Original unlisted school'}), verifiedFileDescriptors: []};
  const [packet] = nativeNotificationPackets(definition, context);
  expect(packet.recipients).toEqual(['team@example.test']);
  expect(packet.body).toContain('Original school: Original unlisted school');
  expect(packet.body).toContain('School Name (Not listed above)');
  expect(packet.body).toContain('coordinator@example.test');
  Object.assign(definition.definition.notifications[0], {'cc-email': '{email-2}'});
  expect(() => nativeNotificationPackets(definition, context)).toThrow();
 });

 it('keeps old nomination packets identical to archived rendering for pending delivery checksums', () => {
  const definition = {definition: {fields: source.forms.find(candidate => candidate.id === 8916)!.fields, notifications: [{slug: 'team', recipients: 'team@example.test, {email-2}', 'email-subject': 'Nomination {select-1}', 'email-editor': '{all_fields}<p>Original school: {text-1}</p>'}]}};
  const context = {formId: 8916, recordId: randomUUID(), reference: 'YES-8916-QUEUED', submittedAt: '2026-11-20T10:00:00.000Z', portalOrigin: 'https://summit.example.test', normalizedAnswers: {'select-1': 'Others', 'text-1': 'Original unlisted school', 'name-1': 'Nominator', 'email-1': 'nominator@example.test'}, verifiedFileDescriptors: []};
  const archived = nativeNotificationPackets(definition, {...context, formId: 8917});
  expect(nativeNotificationPackets(definition, context)).toEqual(archived);
  expect(archived[0].body).not.toContain('School contact name');
  expect(archived[0].body).toContain('School Name (Not listed above)');
 });
});
