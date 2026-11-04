import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
import { publicSchools, schoolDashboard, claimSchool } from '../src/server/registration';
import { createPartnerEnquiry } from '../src/server/partner-enquiries';
import { adminList, adminPatch } from '../src/server/admin';
import { importPreview, commitImport } from '../src/server/imports';
import type { Actor } from '../src/server/core';

describe('school identity, school dashboard and partner enquiries', () => {
 let fixture: Awaited<ReturnType<typeof testDb>>;
 let owner: Actor, contact: Actor;
 beforeEach(async () => {
  fixture = await testDb(); owner = { id: randomUUID(), role: 'owner' }; contact = { id: randomUUID(), role: 'participant', contact: '+919876543210' };
  await fixture.db.query("INSERT INTO users(id,role,contact) VALUES($1,'owner','owner@example.org'),($2,'participant',$3)", [owner.id, contact.id, contact.contact]);
 });
 afterEach(async () => fixture?.close());
 async function school(reference: string, address = '1 School Road') {
  const schoolId = randomUUID();
  await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,$2,'Army Public School',$3,'Delhi','Delhi','110001','active')", [schoolId, reference, address]);
  return schoolId;
 }
 async function schoolContact(schoolId: string, verified = true) {
  await fixture.db.query('INSERT INTO school_contacts(id,school_id,user_id,name,role,email,phone,verified_at) VALUES($1,$2,$3,\'Teacher\',\'Coordinator\',\'teacher@example.org\',$4,$5)', [randomUUID(), schoolId, contact.id, contact.contact, verified ? new Date() : null]);
 }
 const historical = { sourceId: 'school-1', name: 'Historical School', address: '10 Old Road', city: 'Delhi', state: 'Delhi', postalCode: '110001', approval: 'approved', originalReference: 'EDU-123' };
 async function importSchool(match: string, source = 'approved-school-sheet') {
  const preview = await importPreview(fixture.db, owner, { source, kind: 'schools', rows: [historical], schoolMatches: { 'school-1': match } });
  const result = await commitImport(fixture.db, owner, { reviewed: true, rows: preview.rows.map(row => ({ id: row.id, version: row.version })) });
  return { preview, result };
 }
 it('preserves existing IDs on new imports and requires explicit resolution for collisions', async () => {
  const imported = await importSchool('new');
  expect(imported.result.imported).toBe(1);
  const existing = (await fixture.db.query('SELECT id,reference FROM schools')).rows[0];
  expect(existing.reference).toBe('EDU-123');
  const collision = await importSchool('new', 'second-source');
  expect(collision.preview.rows[0].status).toBe('invalid');
  expect(collision.result.errors).toBe(1);
  expect((await fixture.db.query('SELECT count(*)::int total FROM schools')).rows[0].total).toBe(1);
 });
 it('adds an imported alias without changing the canonical ID and claims it only with the registered phone', async () => {
  const schoolId = await school('SCH-ORIGINAL'); await schoolContact(schoolId, false);
  expect((await importSchool(schoolId)).result.imported).toBe(1);
  expect((await fixture.db.query('SELECT reference FROM schools WHERE id=$1', [schoolId])).rows[0].reference).toBe('SCH-ORIGINAL');
  const found = await publicSchools(fixture.db, new URLSearchParams({ q: 'edu-123' }));
  expect(found.items[0].id).toBe(schoolId); expect(found.items[0].alternate_references).toEqual(['EDU-123']);
  await expect(claimSchool(fixture.db, { ...contact, contact: '+919999999999' }, 'EDU-123')).rejects.toMatchObject({ status: 403 });
  expect((await claimSchool(fixture.db, contact, 'edu-123')).id).toBe(schoolId);
  await expect(fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code) VALUES($1,'edu-123','Other','1 Road','Delhi','Delhi','110001')", [randomUUID()])).rejects.toMatchObject({ code: '23505' });
 });
 it('keeps same-name branches separate and exposes only public school identity fields', async () => {
  await school('EDU-A', 'North Campus'); const south = await school('EDU-B', 'South Campus'); await schoolContact(south);
  const found = await publicSchools(fixture.db, new URLSearchParams({ q: 'Army Public' }));
  expect(found.items).toHaveLength(2); expect(found.items.map(row => row.address).sort()).toEqual(['North Campus', 'South Campus']);
  expect(JSON.stringify(found)).not.toContain(contact.contact); expect(JSON.stringify(found)).not.toContain('teacher@example.org');
  await fixture.db.query("UPDATE schools SET status='inactive' WHERE id=$1", [south]);
  expect((await publicSchools(fixture.db, new URLSearchParams({ q: 'Army' }))).items).toHaveLength(1);
 });
 it('shows scoped school progress without contacts, answers or files and denies unverified or unrelated accounts', async () => {
  const ownSchool = await school('EDU-OWN'), otherSchool = await school('EDU-OTHER', 'Other Branch Road'); await schoolContact(ownSchool, false);
  await expect(schoolDashboard(fixture.db, contact, ownSchool, new URLSearchParams())).rejects.toMatchObject({ status: 403 });
  await claimSchool(fixture.db, contact, 'EDU-OWN');
  const editionId = randomUUID(), studentId = randomUUID(), otherStudent = randomUUID(), participation = randomUUID(), competition = randomUUID();
  await fixture.db.query("INSERT INTO editions(id,label,state) VALUES($1,'2027','open')", [editionId]);
  await fixture.db.query("INSERT INTO students(id,reference,name,guardian_contact) VALUES($1,'STU-A','Own Student','private-phone'),($2,'STU-B','Other Student','other-private-phone')", [studentId, otherStudent]);
  await fixture.db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,snapshot) VALUES($1,$2,$3,$4,7,'{}'),($5,$6,$7,$4,8,'{}')", [participation, studentId, ownSchool, editionId, randomUUID(), otherStudent, otherSchool]);
  await fixture.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,config) VALUES($1,$2,'essay','Essay','Guidelines','{}')", [competition, editionId]);
  await fixture.db.query("INSERT INTO submissions(id,reference,student_participation_id,competition_id,category_id,state,answers) VALUES($1,'ENT-OWN',$2,$3,'junior','submitted','{\"private\":\"secret-work\"}')", [randomUUID(), participation, competition]);
  const result = await schoolDashboard(fixture.db, contact, ownSchool, new URLSearchParams());
  expect(result.counts).toEqual({ students: 1, registrations: 1, submissions: 1 });
  expect(result.items[0].student_name).toBe('Own Student'); expect(result.items[0].entries[0].title).toBe('Essay');
  expect(JSON.stringify(result)).not.toMatch(/private-phone|Other Student|secret-work|guardian_contact/);
  await expect(schoolDashboard(fixture.db, contact, otherSchool, new URLSearchParams())).rejects.toMatchObject({ status: 403 });
  await expect(schoolDashboard(fixture.db, owner, ownSchool, new URLSearchParams())).rejects.toMatchObject({ status: 403 });
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1', [contact.id]);
  await expect(schoolDashboard(fixture.db, contact, ownSchool, new URLSearchParams())).rejects.toMatchObject({ status: 403 });
 });
 const enquiry = { submissionId: randomUUID(), organization: 'Eco Organization', contactName: 'Adult Contact', email: 'partner@example.org', phone: '', interest: 'programme', message: 'We would like to collaborate on student learning workshops.', consent: true, website: '' };
 async function approvePrivacy() { await fixture.db.query("INSERT INTO site_content(key,title,body,approved) VALUES('privacy','Privacy','Approved privacy information for enquiries.',true)"); }
 it('gates partner enquiries on approved privacy, validates consent and stores a private receipt', async () => {
  await expect(createPartnerEnquiry(fixture.db, enquiry)).rejects.toMatchObject({ status: 503 }); await approvePrivacy();
  await expect(createPartnerEnquiry(fixture.db, { ...enquiry, consent: false })).rejects.toThrow();
  await expect(createPartnerEnquiry(fixture.db, { ...enquiry, website: 'spam' })).rejects.toMatchObject({ status: 422 });
  const receipt = await createPartnerEnquiry(fixture.db, enquiry); expect(receipt.reference).toMatch(/^PART-/); expect(Object.keys(receipt).sort()).toEqual(['reference', 'status']);
  expect(await createPartnerEnquiry(fixture.db, enquiry)).toEqual(receipt);
  expect((await fixture.db.query('SELECT count(*)::int total FROM partner_enquiries')).rows[0].total).toBe(1);
  await expect(createPartnerEnquiry(fixture.db, { ...enquiry, message: 'Changed details on an already accepted submission.' })).rejects.toMatchObject({ status: 409 });
  const saved = (await fixture.db.query('SELECT * FROM partner_enquiries')).rows[0];
  expect(saved.privacy_snapshot.body).toBe('Approved privacy information for enquiries.'); expect(saved.message).toBe(enquiry.message);
 });
 it('enforces the contact rate limit and protects the administrative review queue', async () => {
  await approvePrivacy(); for (let i = 0; i < 5; i++) await createPartnerEnquiry(fixture.db, { ...enquiry, submissionId: randomUUID() });
  await expect(createPartnerEnquiry(fixture.db, { ...enquiry, submissionId: randomUUID(), email: 'PARTNER@example.org' })).rejects.toMatchObject({ status: 429 });
  await expect(adminList(fixture.db, contact, 'partner-enquiries', new URLSearchParams())).rejects.toMatchObject({ status: 403 });
  const queue = await adminList(fixture.db, owner, 'partner-enquiries', new URLSearchParams({ q: 'Eco Organization' })); expect(queue.total).toBe(5);
  await expect(adminPatch(fixture.db, { ...contact, role: 'judge' }, 'partner-enquiries', queue.items[0].id, { action: 'closed', reason: 'Followed up' })).rejects.toMatchObject({ status: 403 });
  await adminPatch(fixture.db, owner, 'partner-enquiries', queue.items[0].id, { action: 'contacted', reason: 'Organizer follow-up recorded' });
  expect((await fixture.db.query('SELECT status FROM partner_enquiries WHERE id=$1', [queue.items[0].id])).rows[0].status).toBe('contacted');
  expect((await fixture.db.query("SELECT count(*)::int total FROM audit_events WHERE action='admin.contacted'")).rows[0].total).toBe(1);
 });
});
