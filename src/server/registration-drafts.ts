import { z } from 'zod';
import type { Db } from './db';
import { AppError, audit, id, requireAdmin, type Actor } from './core';
import { createSchool, updateSchool, createStudent } from './registration';
import { phone } from '../domain/rules';

const kindSchema = z.enum(['school', 'student', 'teacher']);
const text = (max: number) => z.string().max(max).optional();
const schoolDraft = z.object({ name: text(200), address: text(1000), city: text(100), state: text(100), postalCode: text(20), contactName: text(150), contactRole: text(100), email: text(254), coordinator: text(200), schoolId: z.uuid().optional() }).strict();
const studentDraft = z.object({ name: text(150), schoolId: z.uuid().optional(), schoolName: text(200), schoolReference: text(100), schoolLocation: text(1200), editionId: z.uuid().optional(), class: z.number().int().min(1).max(12).optional(), section: text(30), coordinator: text(150), emergencyContact: text(30), studentId: z.uuid().optional() }).strict();
const teacherDraft = z.object({ name: text(150), role: text(100), email: text(254), subject: text(200), schoolId: z.uuid().optional(), schoolName: text(200), schoolReference: text(100), schoolLocation: text(1200) }).strict();
const saveSchema = z.object({ id: z.uuid(), kind: kindSchema, scope: z.string().min(1).max(100), payload: z.record(z.string(), z.unknown()), currentStep: z.number().int().min(0).max(3), lockVersion: z.number().int().min(0) }).strict();

async function participant(db: Db, actor: Actor, write = false) {
 if (actor.role !== 'participant' || !actor.contact) throw new AppError(403, 'Verify your contact phone before saving registration progress.');
 const { rows } = await db.query(`SELECT id FROM users WHERE id=$1 AND role='participant' AND contact=$2 AND active ${write ? 'FOR UPDATE' : 'FOR SHARE'}`, [actor.id, actor.contact]);
 if (!rows.length) throw new AppError(403, 'Your verified account is no longer available.');
}
function payloadFor(kind: z.infer<typeof kindSchema>, payload: unknown) {
 return (kind === 'school' ? schoolDraft : kind === 'student' ? studentDraft : teacherDraft).parse(payload);
}
export async function listRegistrationDrafts(db: Db, actor: Actor, params: URLSearchParams) {
 await participant(db, actor);
 const kind = kindSchema.parse(params.get('kind'));
 const scope = params.get('scope') || 'new';
 const { rows } = await db.query("SELECT * FROM registration_drafts WHERE owner_id=$1 AND kind=$2 AND scope=$3 AND state='draft' ORDER BY updated_at DESC LIMIT 20", [actor.id, kind, scope.slice(0,100)]);
 return { items: rows };
}
export async function saveRegistrationDraft(db: Db, actor: Actor, input: unknown) {
 const v = saveSchema.parse(input), payload = payloadFor(v.kind, v.payload);
 if (v.kind === 'teacher' && v.currentStep > 2) throw new AppError(422, 'Choose a valid teacher registration step.');
 return db.transaction(async tx => {
  await participant(tx, actor, true);
  // The owner row serializes first saves so an unverified client cannot flood drafts.
  const { rows: [existing] } = await tx.query('SELECT * FROM registration_drafts WHERE id=$1 FOR UPDATE', [v.id]);
  if (existing && (existing.owner_id !== actor.id || existing.kind !== v.kind || existing.scope !== v.scope)) throw new AppError(404, 'Saved registration not found.');
  if (existing && existing.state !== 'draft') throw new AppError(409, 'This registration has already been completed or discarded.');
  if ((existing?.lock_version || 0) !== v.lockVersion) throw new AppError(409, 'This registration changed in another tab. Reload the saved draft before continuing.');
  if (!existing) {
   const { rows: [count] } = await tx.query("SELECT count(*)::int total FROM registration_drafts WHERE owner_id=$1 AND state='draft'", [actor.id]);
   if (count.total >= 20) throw new AppError(429, 'You have 20 unfinished registrations. Complete or discard one before starting another.');
   await tx.query('INSERT INTO registration_drafts(id,owner_id,kind,scope) VALUES($1,$2,$3,$4)', [v.id, actor.id, v.kind, v.scope]);
  }
  const { rows: [saved] } = await tx.query('UPDATE registration_drafts SET payload=$2,current_step=$3,lock_version=lock_version+1,updated_at=now() WHERE id=$1 RETURNING *', [v.id, JSON.stringify(payload), v.currentStep]);
  return saved;
 });
}
export async function discardRegistrationDraft(db: Db, actor: Actor, draftId: string, lockVersion: number) {
 z.uuid().parse(draftId);
 return db.transaction(async tx => {
  await participant(tx, actor, true);
  const { rows: [draft] } = await tx.query('SELECT * FROM registration_drafts WHERE id=$1 AND owner_id=$2 FOR UPDATE', [draftId, actor.id]);
  if (!draft) throw new AppError(404, 'Saved registration not found.');
  if (draft.state !== 'draft' || draft.lock_version !== lockVersion) throw new AppError(409, 'Reload the current draft before discarding it.');
  await tx.query("UPDATE registration_drafts SET state='discarded',payload='{}',lock_version=lock_version+1,updated_at=now() WHERE id=$1", [draftId]);
  await audit(tx, actor, 'registration.draft.discard', 'registration_drafts', draftId);
  return { discarded: true };
 });
}
const teacherSchema = z.object({ schoolId: z.uuid(), name: z.string().trim().min(2).max(150), role: z.string().trim().min(2).max(100), email: z.email(), subject: z.string().max(200).default(''), phone });
async function createTeacher(db: Db, actor: Actor, input: unknown) {
 const v = teacherSchema.parse(input);
 if (v.phone !== actor.contact) throw new AppError(403, 'Verify the teacher contact phone first.');
 const { rows: [school] } = await db.query("SELECT id FROM schools WHERE id=$1 AND status='active' AND trashed_at IS NULL AND NOT purging FOR SHARE", [v.schoolId]);
 if (!school) throw new AppError(422, 'Select a registered, active school.');
 const { rows: [existing] } = await db.query('SELECT id,reference,status FROM teacher_registrations WHERE user_id=$1 AND school_id=$2', [actor.id, v.schoolId]);
 if (existing) return existing;
 const { rows: [saved] } = await db.query('INSERT INTO teacher_registrations(id,reference,user_id,school_id,name,role,email,phone,subject) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,reference,status', [id(), `TEA-${id().slice(0,12).toUpperCase()}`, actor.id, v.schoolId, v.name, v.role, v.email, v.phone, v.subject]);
 await audit(db, actor, 'teacher.registration', 'teacher_registrations', saved.id);
 return saved;
}
export async function completeRegistrationDraft(db: Db, actor: Actor, draftId: string, input: unknown) {
 z.uuid().parse(draftId);
 const v = z.object({ lockVersion: z.number().int().min(0), consent: z.boolean().optional(), consentVersion: z.string().max(200).optional() }).strict().parse(input);
 return db.transaction(async tx => {
  await participant(tx, actor, true);
  const { rows: [draft] } = await tx.query('SELECT * FROM registration_drafts WHERE id=$1 AND owner_id=$2 FOR UPDATE', [draftId, actor.id]);
  if (!draft) throw new AppError(404, 'Saved registration not found.');
  if (draft.state === 'completed') return draft.receipt;
  if (draft.state !== 'draft' || draft.lock_version !== v.lockVersion) throw new AppError(409, 'Reload and review the latest saved registration before confirming.');
  const data = payloadFor(draft.kind, draft.payload);
  // These services normally start a transaction. Reuse this transaction so the
  // registration and its idempotent receipt commit or roll back together.
  const scope: Db = { query: (sql, values) => tx.query(sql, values), transaction: fn => fn(tx) };
  let receipt;
  if (draft.kind === 'school') {
   const school = data as z.infer<typeof schoolDraft>;
   const { schoolId, ...fields } = school;
   receipt = schoolId ? await updateSchool(scope, actor, schoolId, { ...fields, phone: actor.contact }) : await createSchool(scope, actor, { ...fields, phone: actor.contact });
  } else if (draft.kind === 'student') {
   const { schoolName, schoolReference, schoolLocation, ...fields } = data as z.infer<typeof studentDraft>;
   receipt = await createStudent(scope, actor, { ...fields, emergencyContact: fields.emergencyContact || undefined, guardianContact: actor.contact, consent: v.consent, consentVersion: v.consentVersion });
  } else {
   const { schoolName, schoolReference, schoolLocation, ...fields } = data as z.infer<typeof teacherDraft>;
   receipt = await createTeacher(scope, actor, { ...fields, phone: actor.contact });
  }
  await tx.query("UPDATE registration_drafts SET state='completed',receipt=$2,completed_at=now(),updated_at=now(),lock_version=lock_version+1 WHERE id=$1", [draftId, JSON.stringify(receipt)]);
  await audit(tx, actor, 'registration.draft.complete', 'registration_drafts', draftId, { kind: draft.kind });
  return receipt;
 });
}
export async function reviewTeacherRegistration(db: Db, actor: Actor, teacherId: string, input: unknown) {
 requireAdmin(actor); z.uuid().parse(teacherId);
 const v = z.object({ action: z.enum(['approved','declined']), reason: z.string().trim().min(3).max(2000) }).parse(input);
 return db.transaction(async tx => {
  const { rows: [teacher] } = await tx.query('SELECT * FROM teacher_registrations WHERE id=$1 FOR UPDATE', [teacherId]);
  if (!teacher) throw new AppError(404, 'Teacher registration not found.');
  if (teacher.status !== 'pending') throw new AppError(409, 'This teacher registration has already been reviewed.');
  if (v.action === 'approved') {
   const { rows: [school] } = await tx.query("SELECT id FROM schools WHERE id=$1 AND status='active' AND trashed_at IS NULL AND NOT purging FOR SHARE", [teacher.school_id]);
   const { rows: [user] } = await tx.query("SELECT id FROM users WHERE id=$1 AND contact=$2 AND role='participant' AND active FOR SHARE", [teacher.user_id, teacher.phone]);
   if (!school || !user) throw new AppError(409, 'The school or verified teacher account is no longer active.');
   const { rows: existing } = await tx.query('SELECT id FROM school_contacts WHERE school_id=$1 AND user_id=$2 AND phone=$3', [teacher.school_id, teacher.user_id, teacher.phone]);
   if (existing.length) await tx.query('UPDATE school_contacts SET verified_at=now() WHERE school_id=$1 AND user_id=$2 AND phone=$3', [teacher.school_id, teacher.user_id, teacher.phone]);
   else await tx.query('INSERT INTO school_contacts(id,school_id,user_id,name,role,email,phone,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())', [id(), teacher.school_id, teacher.user_id, teacher.name, teacher.role, teacher.email, teacher.phone]);
  }
  await tx.query('UPDATE teacher_registrations SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1', [teacherId, v.action, v.reason, actor.id]);
  await audit(tx, actor, `teacher.${v.action}`, 'teacher_registrations', teacherId, { reason: v.reason });
  return { id: teacherId, status: v.action };
 });
}
