import { z } from 'zod';
import { AppError, audit, id, ok, type Actor } from './core';
import type { Db } from './db';
import { loadSubmissionRecords, recordLink, requireActive, type SubmissionRecord } from './submission-records';

const source = z.enum(['portal', 'wordpress']);
const kind = z.enum(['student', 'teacher', 'competition']);
const filters = z.object({
  source: source.optional(),
  kind: kind.optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
  status: z.enum(['linked', 'unlinked']).default('unlinked'),
  q: z.string().trim().max(200).default(''),
  page: z.string().regex(/^\d{1,7}$/).transform(Number).pipe(z.number().min(1)).default(1)
});
const common = {
  source, recordId: z.uuid(),
  sourceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  lockVersion: z.number().int().min(0).max(2147483646),
  reason: z.string().trim().min(3).max(1000)
};
const input = z.discriminatedUnion('action', [
  z.strictObject({...common, action: z.literal('link').default('link'), schoolId: z.uuid()}),
  z.strictObject({...common, action: z.literal('unlink')})
]);
const pageSize = 25;
const activeSchool = "status='active' AND trashed_at IS NULL AND NOT purging";
const linkable = (record: SubmissionRecord) => record.status === 'submitted' && kind.safeParse(record.kind).success;

async function list(request: Request, db: Db) {
  const parsed = filters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError(422, 'Check the school record filters.');
  const {source, kind, status, year, q, page} = parsed.data;
  const eligible = (await loadSubmissionRecords(db, {source})).filter(linkable);
  const years = [...new Set(eligible.flatMap(record => record.year ? [record.year] : []))].sort().reverse();
  const query = q.toLowerCase();
  const matching = eligible.filter(record =>
    !!record.schoolId === (status === 'linked') &&
    (!kind || record.kind === kind) &&
    (!year || record.year === year) &&
    [record.name, record.reference, record.title].join(' ').toLowerCase().includes(query)
  );
  matching.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '') || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  const records = matching.slice((page - 1) * pageSize, page * pageSize).map(record => ({
    id: record.id, source: record.source, formKey: record.formKey, title: record.title,
    name: record.name, reference: record.reference, submittedAt: record.submittedAt,
    schoolId: record.schoolId, directSchoolId: record.directSchoolId,
    sourceChecksum: record.sourceChecksum, linkVersion: record.schoolLinkVersion,
    linkStale: record.schoolLinkStale, linkActive: record.schoolLinkActive, href: recordLink(record)
  }));
  const {rows: schools} = await db.query('SELECT id,reference,name,city,state FROM schools WHERE ' + activeSchool + ' ORDER BY name,city,reference,id');
  return ok({records, schools, years, page, pageSize, total: matching.length});
}

async function save(request: Request, db: Db, actor: Actor) {
  const raw = await request.text();
  if (raw.length > 10000) throw new AppError(422, 'The submitted fields are too long.');
  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { throw new AppError(400, 'Enter a valid request body.'); }
  const parsed = input.safeParse(body && typeof body === 'object' && !Array.isArray(body) ? {action:'link', ...body} : body);
  if (!parsed.success) throw new AppError(422, 'Check the school link action and verification reason.');
  const {action, source, recordId, sourceVersion, lockVersion, reason} = parsed.data;
  const schoolId = action === 'link' ? parsed.data.schoolId.toLowerCase() : null;

  const table = source === 'portal' ? 'portal_form_records' : 'wordpress_records';
  const locked = await db.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [recordId]);
  if (!locked.rows.length) throw new AppError(404, 'Submitted record not found.');
  const [record] = await loadSubmissionRecords(db, {source, recordId});
  if (!record || !linkable(record)) throw new AppError(404, 'Submitted record not found.');
  if (record.sourceChecksum !== sourceVersion) throw new AppError(409, 'The original submission changed. Refresh and verify it before saving.');
  if (action === 'link' && record.directSchoolId) {
    throw new AppError(409, 'The original submission already resolves to a permanent school ID.');
  }
  if (schoolId) {
    const school = await db.query('SELECT id FROM schools WHERE id=$1 AND ' + activeSchool + ' FOR SHARE', [schoolId]);
    if (!school.rows.length) throw new AppError(404, 'Active school not found.');
  }

  const key = [source, recordId];
  const {rows: [before]} = await db.query<{lock_version: number; active: boolean}>(
    'SELECT * FROM school_record_links WHERE source=$1 AND record_id=$2 FOR UPDATE', key
  );
  if ((before?.lock_version ?? 0) !== lockVersion) {
    throw new AppError(409, 'The school link changed. Refresh and check the latest link before saving.');
  }
  if (action === 'unlink' && !before?.active) throw new AppError(409, 'This record has no active manual link to remove.');
  const nextVersion = lockVersion + 1;
  const result = action === 'unlink' ? await db.query(
    `UPDATE school_record_links SET active=false, lock_version=$3, linked_by=$4, reason=$5, updated_at=now()
     WHERE source=$1 AND record_id=$2 RETURNING *`, [...key,nextVersion,actor.id,reason]
  ) : await db.query(
    `INSERT INTO school_record_links(source,record_id,school_id,source_checksum,lock_version,linked_by,reason)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(source,record_id) DO UPDATE SET school_id=EXCLUDED.school_id,
       source_checksum=EXCLUDED.source_checksum, lock_version=EXCLUDED.lock_version,
       linked_by=EXCLUDED.linked_by, reason=EXCLUDED.reason, active=true, updated_at=now()
     RETURNING *`, [...key,schoolId,sourceVersion,nextVersion,actor.id,reason]
  );
  const [after] = result.rows;
  await db.query(
    `INSERT INTO school_record_link_history(id,source,record_id,before_snapshot,after_snapshot,actor_id,reason)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [id(), ...key, before ? JSON.stringify(before) : null, JSON.stringify(after), actor.id, reason]
  );
  await audit(db, actor, `school.record.${action}`, 'school_record', recordId, {
    source, reference: record.reference, reason, before: before ?? null, after
  });
  return ok({schoolId: record.directSchoolId ?? schoolId, lockVersion: nextVersion, linkActive: action === 'link'}, before ? 200 : 201);
}

export async function schoolRecordLinksRoute(request: Request, db: Db, actor: Actor, path: string[]) {
  if (path.length) throw new AppError(404, 'School record link endpoint not found.');
  return db.transaction(async tx => {
    await requireActive(tx, actor, ['owner', 'admin']);
    if (request.method === 'GET') return list(request, tx);
    if (request.method === 'POST') return save(request, tx, actor);
    throw new AppError(405, 'Method not allowed.');
  });
}
