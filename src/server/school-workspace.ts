import { z } from 'zod';
import { competitionGuidelines2027 } from '../data/guidelines-2027';
import { referenceForms, visibleFields } from '../domain/wordpress-forms';
import { AppError, audit, id, ok, type Actor } from './core';
import type { Db } from './db';
import { loadSubmissionRecords, requireActive, type SubmissionRecord } from './submission-records';

const participantRoles: Actor['role'][] = ['participant'];
const staffRoles: Actor['role'][] = ['owner', 'admin'];
const uuid = z.uuid();
const reason = z.string().trim().min(3).max(1000);
const accessRequest = z.strictObject({schoolId: z.string().trim().min(1).max(100), reason});
const decision = z.strictObject({status: z.enum(['approved', 'revoked']), expectedStatus: z.enum(['pending', 'approved']), reason});
const correction = z.strictObject({
  name: z.string().trim().min(1).max(200),
  className: z.string().trim().max(80),
  section: z.string().trim().max(80),
  reason,
  lockVersion: z.number().int().min(0).max(2147483646)
});
type Status = 'pending' | 'approved' | 'revoked';
type AccessRow = { id: string; school_id: string; user_id: string; status: Status };
type ChangeRow = { name: string; class_name: string; section: string; lock_version: number };
type School = { id: string; reference: string; name: string; city: string; state: string };
type Competition = { title: string; reference: string; source: SubmissionRecord['source']; submittedAt: string | null };

async function input<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await request.text();
  if (raw.length > 10000) throw new AppError(422, 'The submitted fields are too long.');
  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { throw new AppError(400, 'Enter a valid request body.'); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError(422, parsed.error.issues[0]?.message || 'Check the submitted fields.');
  return parsed.data;
}

function validId(value: string) {
  if (!uuid.safeParse(value).success) throw new AppError(404, 'Record not found.');
  return value;
}

const requestFields = 'r.id, r.school_id AS "schoolId", r.status, r.reason, r.created_at AS "createdAt", r.decided_at AS "decidedAt", s.name AS "schoolName", s.reference AS "schoolReference", s.city, s.state';
const pageSize = 25;

function pageNumber(params: URLSearchParams) {
  const value = params.get('page') ?? '1';
  if (!/^\d{1,7}$/.test(value) || Number(value) < 1) throw new AppError(422, 'Enter a valid page number.');
  return Number(value);
}

async function listRequests(db: Db, actor: Actor) {
  const result = await db.query(`SELECT ${requestFields} FROM school_access_requests r JOIN schools s ON s.id=r.school_id
    WHERE r.user_id=$1 ORDER BY r.created_at DESC, r.id`, [actor.id]);
  return ok({requests: result.rows});
}

async function staffRequests(db: Db, page: number) {
  const result = await db.query(`SELECT ${requestFields}, r.decision_reason AS "decisionReason", u.name AS "requesterName", u.contact AS "requesterContact", u.active AS "requesterActive"
    FROM school_access_requests r JOIN schools s ON s.id=r.school_id JOIN users u ON u.id=r.user_id
    ORDER BY (r.status='pending') DESC, r.created_at DESC, r.id LIMIT $1 OFFSET $2`, [pageSize,(page-1)*pageSize]);
  const {rows:[count]} = await db.query<{total:number}>('SELECT count(*)::int AS total FROM school_access_requests');
  return ok({requests:result.rows,page,pageSize,total:count.total});
}

async function createRequest(db: Db, actor: Actor, body: z.infer<typeof accessRequest>) {
  await requireActive(db, actor, participantRoles);
  const schoolId = uuid.safeParse(body.schoolId).success ? body.schoolId : null;
  const school = (await db.query<School>(`SELECT id, name, reference, city, state FROM schools s
    WHERE status='active' AND trashed_at IS NULL AND NOT purging
      AND (s.id=$1 OR s.id=(SELECT school_id FROM school_identifiers WHERE reference=upper($2)))
    ORDER BY (s.id=$1) DESC LIMIT 1 FOR SHARE`, [schoolId, body.schoolId])).rows[0];
  if (!school) throw new AppError(404, 'Enter the permanent ID of a registered school.');
  const request = (await db.query<AccessRow>(`INSERT INTO school_access_requests(id,user_id,school_id,reason)
    VALUES($1,$2,$3,$4) ON CONFLICT(user_id,school_id) WHERE status IN ('pending','approved')
    DO NOTHING RETURNING id,status`, [id(),actor.id,school.id,body.reason])).rows[0];
  if (!request) throw new AppError(409, 'You already have an active request for this school.');
  await audit(db, actor, 'school.access.request', 'school_access_request', request.id, {schoolId: school.id, reason: body.reason});
  return ok({id: request.id, status: request.status}, 201);
}

async function decideRequest(db: Db, actor: Actor, requestId: string, body: z.infer<typeof decision>) {
  await requireActive(db, actor, staffRoles);
  const request = (await db.query<AccessRow>('SELECT * FROM school_access_requests WHERE id=$1 FOR UPDATE', [validId(requestId)])).rows[0];
  if (!request) throw new AppError(404, 'School access request not found.');
  if (request.status !== body.expectedStatus || request.status === body.status) {
    throw new AppError(409, 'The request has changed. Refresh and check its current status.');
  }
  if (body.status === 'approved') {
    const approvable = (await db.query(`SELECT s.id FROM schools s JOIN users u ON u.id=$2
      WHERE s.id=$1 AND s.status='active' AND s.trashed_at IS NULL AND NOT s.purging AND u.active AND u.role='participant'
      FOR SHARE OF s,u`,
      [request.school_id, request.user_id])).rows.length;
    if (!approvable) throw new AppError(409, 'Approval requires an active school and participant account.');
  }
  await db.query('UPDATE school_access_requests SET status=$2,decision_reason=$3,decided_by=$4,decided_at=now() WHERE id=$1',
    [request.id,body.status,body.reason,actor.id]);
  await audit(db, actor, `school.access.${body.status}`, 'school_access_request', request.id,
    {schoolId:request.school_id, previousStatus:request.status, reason:body.reason});
  return ok({id: request.id, status: body.status});
}

async function approvedSchool(db: Db, actor: Actor, schoolId: string, write = false) {
  await requireActive(db, actor, participantRoles);
  const school = (await db.query<School>(`SELECT s.id,s.name,s.reference,s.city,s.state
    FROM school_access_requests r JOIN schools s ON s.id=r.school_id
    WHERE r.user_id=$1 AND r.school_id=$2 AND r.status='approved'
      AND s.status='active' AND s.trashed_at IS NULL AND NOT s.purging
    ${write ? 'FOR UPDATE OF r' : 'FOR SHARE OF r'} FOR SHARE OF s`, [actor.id,validId(schoolId)])).rows[0];
  if (!school) throw new AppError(403, 'Approved access to this school is required.');
  return school;
}

const key = (row: { source: string; id: string }) => `${row.source}:${row.id}`;

function competitionEmails(row: SubmissionRecord) {
  const emails = new Set(row.email ? [row.email] : []);
  const declaredSize = row.answers['number-yes-team-size'];
  const size = typeof declaredSize === 'number' || typeof declaredSize === 'string' ? Number(declaredSize) : 0;
  const team = competitionGuidelines2027.find(guideline => guideline.slug === row.formKey)?.team;
  const form = referenceForms.find(form => form.key === row.formKey);
  if (!form || !team?.allowed || row.answers['radio-yes-entry-mode'] !== 'team' ||
      !Number.isInteger(size) || size < 2 || size > team.maxMembers) return emails;
  const visible = new Set(visibleFields(form,row.answers).map(field => field.id));
  for (let slot = 2; slot <= size; slot++) {
    const field = `email-yes-student-${slot}`;
    const address = row.emails[field];
    if (visible.has(field) && address) emails.add(address);
  }
  return emails;
}

async function schoolRecords(db: Db, school: School, params: URLSearchParams) {
  const page = pageNumber(params);
  const year = params.get('year') ?? '';
  const text = (params.get('q') ?? '').trim().toLowerCase();
  if ((year && year !== 'unknown' && !/^\d{4}$/.test(year)) || text.length > 200) {
    throw new AppError(422, 'Check the search, year and page filters.');
  }
  const records = (await loadSubmissionRecords(db, {schoolId:school.id})).filter(row =>
    row.schoolId === school.id && row.status === 'submitted' && (row.kind === 'student' || row.kind === 'competition'));
  const years = [...new Set(records.flatMap(row => row.year ? [row.year] : []))].sort((a,b) => b.localeCompare(a));
  if (records.some(row => !row.year)) years.push('unknown');
  const selected = records.filter(row => !year || (row.year ?? 'unknown') === year);
  const changes = await db.query<ChangeRow & {source: string; record_id: string}>(
    `SELECT DISTINCT ON(source,record_id) source,record_id,name,class_name,section,lock_version
     FROM school_student_corrections WHERE school_id=$1 ORDER BY source,record_id,lock_version DESC`, [school.id]);
  const changesByRecord = new Map(changes.rows.map(row => [key({source:row.source, id:row.record_id}), row]));
  const competitions = new Map<string, Competition[]>();
  const competitionsByOwner = new Map<string, Competition[]>();
  const studentsPerEmail = new Map<string, number>();
  const studentsPerOwner = new Map<string, number>();
  for (const row of records) {
    if (row.kind !== 'student') continue;
    if (row.email) studentsPerEmail.set(row.email, (studentsPerEmail.get(row.email) ?? 0) + 1);
    if (row.ownerIdentity) studentsPerOwner.set(row.ownerIdentity, (studentsPerOwner.get(row.ownerIdentity) ?? 0) + 1);
  }
  const competitionCounts = new Map<string, number>();
  let competitionTotal = 0;
  for (const row of selected) {
    if (row.kind !== 'competition') continue;
    competitionTotal++;
    competitionCounts.set(row.title, (competitionCounts.get(row.title) ?? 0) + 1);
    const summary = {title:row.title, reference:row.reference, source:row.source, submittedAt:row.submittedAt};
    if (row.submitterRole === 'student') {
      if (row.ownerIdentity && studentsPerOwner.get(row.ownerIdentity) === 1) {
        const owned = competitionsByOwner.get(row.ownerIdentity) ?? [];
        owned.push(summary);
        competitionsByOwner.set(row.ownerIdentity, owned);
      }
      continue;
    }
    for (const email of competitionEmails(row)) {
      if (studentsPerEmail.get(email) !== 1) continue;
      const list = competitions.get(email) ?? [];
      list.push(summary);
      competitions.set(email, list);
    }
  }
  const students = selected.filter(row => row.kind === 'student').map(row => {
    const change = changesByRecord.get(key(row));
    return {
      id:row.id, source:row.source, reference:row.reference, year:row.year,
      name:change?.name ?? row.name, className:change?.class_name ?? row.className, section:change?.section ?? row.section,
      lockVersion:change?.lock_version ?? 0,
      competitions:[...(competitions.get(row.email) ?? []), ...(competitionsByOwner.get(row.ownerIdentity ?? '') ?? [])]
    };
  }).filter(row => [row.name,row.reference,row.className,row.section].some(value => value.toLowerCase().includes(text)))
    .sort((a,b) => a.name.localeCompare(b.name) || key(a).localeCompare(key(b)));
  return ok({school, years, page, pageSize, total:students.length, competitionTotal,
    competitionProgress:[...competitionCounts].sort(([a],[b]) => a.localeCompare(b)).map(([title,submitted]) => ({title,submitted})),
    students:students.slice((page-1)*pageSize,page*pageSize)});
}

async function correctStudent(db: Db, actor: Actor, school: School, source: string, recordId: string, body: z.infer<typeof correction>) {
  if (source !== 'portal' && source !== 'wordpress') throw new AppError(404, 'Student registration not found.');
  validId(recordId);
  const table = source === 'portal' ? 'portal_form_records' : 'wordpress_records';
  const findStudent = async () => {
    const [record] = await loadSubmissionRecords(db, {source,recordId,schoolId:school.id});
    if (!record || record.schoolId !== school.id || record.kind !== 'student' || record.status !== 'submitted') {
      throw new AppError(404, 'Student registration not found at this school.');
    }
    return record;
  };
  await findStudent();
  await db.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [recordId]);
  const student = await findStudent();
  const existing = (await db.query<ChangeRow>(`SELECT name,class_name,section,lock_version
    FROM school_student_corrections WHERE school_id=$1 AND source=$2 AND record_id=$3
    ORDER BY lock_version DESC LIMIT 1`, [school.id,source,recordId])).rows[0];
  if ((existing?.lock_version ?? 0) !== body.lockVersion) {
    throw new AppError(409, 'This student record has changed. Refresh before saving a correction.');
  }
  const lockVersion = body.lockVersion + 1;
  await db.query(`INSERT INTO school_student_corrections(school_id,source,record_id,lock_version,name,class_name,section,reason,changed_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [school.id,source,student.id,lockVersion,body.name,body.className,body.section,body.reason,actor.id]);
  await audit(db, actor, 'school.student.correct', 'school_student_correction', student.id,
    {schoolId:school.id, source, reference:student.reference, reason:body.reason, lockVersion,
      before:{name:existing?.name ?? student.name, className:existing?.class_name ?? student.className, section:existing?.section ?? student.section},
      after:{name:body.name, className:body.className, section:body.section}});
  return ok({lockVersion});
}

export async function schoolWorkspaceRoute(request: Request, db: Db, actor: Actor, path: string[]) {
  const {method} = request;
  if (path[0] === 'admin') {
    await requireActive(db, actor, staffRoles);
    if (method === 'GET' && path.length === 1) return staffRequests(db, pageNumber(new URL(request.url).searchParams));
    if (method === 'PATCH' && path.length === 2) {
      const body = await input(request, decision);
      return db.transaction(tx => decideRequest(tx, actor, path[1], body));
    }
  } else {
    await requireActive(db, actor, participantRoles);
    if (method === 'GET' && path.length === 0) return listRequests(db, actor);
    if (method === 'POST' && path[0] === 'requests' && path.length === 1) {
      const body = await input(request, accessRequest);
      return db.transaction(tx => createRequest(tx, actor, body));
    }
    if (path[0] === 'schools') {
      if (method === 'GET' && path.length === 2) {
        return db.transaction(async tx => schoolRecords(tx, await approvedSchool(tx, actor, path[1]), new URL(request.url).searchParams));
      }
      if (method === 'PATCH' && path[2] === 'students' && path.length === 5) {
        const body = await input(request, correction);
        return db.transaction(async tx => correctStudent(tx, actor, await approvedSchool(tx, actor, path[1], true), path[3], path[4], body));
      }
    }
  }
  throw new AppError(404, 'School workspace action not found.');
}
