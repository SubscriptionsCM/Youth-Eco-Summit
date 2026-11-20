import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDb } from './helpers/db';
import { schoolWorkspaceRoute } from '../src/server/school-workspace';
import type { Actor } from '../src/server/core';
import { fingerprint } from '../src/server/wordpress-migration';
import { referenceForms } from '../src/domain/wordpress-forms';

const representative: Actor = { id: randomUUID(), role: 'participant' };
const outsider: Actor = { id: randomUUID(), role: 'participant' };
const owner: Actor = { id: randomUUID(), role: 'owner' };
const schoolId = randomUUID(), otherSchool = randomUUID(), studentId = randomUUID(), archivedId = randomUUID();
const archivedStudent = randomUUID(), outsideStudent = randomUUID();
let fixture: Awaited<ReturnType<typeof testDb>>;
let requestId: string;
const school = ['schools', schoolId];
const correction = { name: 'Corrected Student', className: '6', section: 'B', reason: 'Checked the school register', lockVersion: 0 };

async function route(actor: Actor, path: string[], method = 'GET', body?: unknown, search = '') {
  const request = new Request('http://localhost/api/school-workspace' + search, {
    method, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const response = await schoolWorkspaceRoute(request, fixture.db, actor, path);
  return { status: response.status, data: (await response.json()).data };
}

beforeAll(async () => {
  fixture = await testDb();
  for (const [actor, contact] of [[representative, 'rep'], [outsider, 'other'], [owner, 'owner']] as const) {
    await fixture.db.query('INSERT INTO users(id,role,name,contact) VALUES($1,$2,$3,$4)', [actor.id, actor.role, contact, contact + '@example.test']);
  }
  await fixture.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'YES-FIRST','First School','','City','','','active'),($2,'YES-SECOND','Second School','','City','','','active')", [schoolId, otherSchool]);
  const insert = async (id: string, key: string, ref: string, school: string, answers: object, date: string) =>
    fixture.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,school_id,answers,submitted_at) VALUES($1,$2,$3,'submitted',$4,$5,$6)", [id, key, ref, school, JSON.stringify(answers), date]);
  await insert(studentId, 'student', 'STUDENT-1', schoolId, {'text-1':'Test Student','email-1':'student@example.test','email-2':'guardian@example.test'}, '2026-11-17');
  await insert(outsideStudent, 'student', 'STUDENT-2', otherSchool, {'text-1':'Other Student','email-1':'student@example.test'}, '2026-11-17');
  const competition = referenceForms.find(x => x.key === 'open-letter')!;
  const teamCompetition = referenceForms.find(x => x.key === 'waste-to-art')!;
  for (const [id, sourceId, code, date, name, email, draft] of [
    [archivedId, '42', 'YES-FIRST', '2025-11-17 08:30:00', 'Test Student', 'student@example.test', '0'],
    [randomUUID(), '43', 'First School', '2026-11-17 08:30:00', 'Unmatched School', 'student@example.test', '0'],
    [randomUUID(), '44', 'YES-FIRST', '2026-11-18 08:30:00', 'Same Name', 'other@example.test', '0'],
    [randomUUID(), '45', 'YES-SECOND', '2026-11-17 08:30:00', 'Other School', 'student@example.test', '0'],
    [randomUUID(), '46', 'YES-FIRST', '2026-11-17 08:30:00', 'Test Student', 'student@example.test', '1']
  ]) {
    const payload = { form_id: sourceId === '42' ? teamCompetition.id : competition.id, status: 'active', is_draft: draft, date_created: date, meta: [
      { meta_key: 'text-yes-school-id', meta_value: code },
      { meta_key: 'text-yes-name', meta_value: name },
      { meta_key: 'email-yes-student-1', meta_value: sourceId === '42' ? 'lead@example.test' : email },
      ...(sourceId === '42' ? [
        {meta_key:'hidden-yes-submitter',meta_value:'educator'}, {meta_key:'radio-yes-entry-mode',meta_value:'team'},
        {meta_key:'number-yes-team-size',meta_value:'2'},
        {meta_key:'email-yes-student-2',meta_value:email}
      ] : [{meta_key:'email-yes-student-2',meta_value:'student@example.test'}]),
      { meta_key: 'upload-1', meta_value: 'https://private.example.test/file' }
    ] };
    await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.test','entry',$2,$3,$4,now())", [id, sourceId, JSON.stringify(payload), fingerprint(payload)]);
  }
  const studentForm = referenceForms.find(form => form.key === 'student')!;
  await fixture.db.query("INSERT INTO school_identifiers(reference,school_id,kind) VALUES('OLD-YES-FIRST',$1,'imported')", [schoolId]);
  const payload = { form_id: studentForm.id, status:'active', date_created:'2024-11-17 08:30:00', meta:[
    {meta_key:'_yes_school_id',meta_value:'OLD-YES-FIRST'}, {meta_key:'text-1',meta_value:'Archive Student'}
  ] };
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.test','entry','47',$2,$3,now())",
    [archivedStudent,JSON.stringify(payload),fingerprint(payload)]);
});
afterAll(async () => fixture?.close());

it('requires a pending request and active staff approval before exposing a school', async () => {
  const request = await route(representative, ['requests'], 'POST', {schoolId: 'YES-FIRST', reason: 'I represent this school'});
  expect(request.status).toBe(201);
  requestId = request.data.id;
  await expect(route(representative, ['requests'], 'POST', {schoolId,reason:'I represent this school'})).rejects.toMatchObject({status:409});
  await expect(route(representative, school)).rejects.toMatchObject({status:403});
  await expect(route(representative, ['admin', requestId], 'PATCH', {status:'approved',expectedStatus:'pending',reason:'Verification complete'})).rejects.toMatchObject({status:403});
  await expect(route(outsider, [])).resolves.toMatchObject({data:{requests:[]}});
  await expect(route(owner, ['admin'])).resolves.toMatchObject({data:{requests:[{id:requestId,requesterName:'rep',status:'pending',schoolId}] }});
  await expect(route(owner, ['admin'], 'GET', undefined, '?page=2')).resolves.toMatchObject({data:{requests:[],page:2,total:1}});
  await expect(route(owner, ['admin', requestId], 'PATCH', {status:'approved',expectedStatus:'pending',reason:'Verification complete'})).resolves.toMatchObject({data:{status:'approved'}});
  await expect(route(owner, ['admin', requestId], 'PATCH', {status:'revoked',expectedStatus:'pending',reason:'Old decision'})).rejects.toMatchObject({status:409});
  expect((await route(representative, [])).data.requests[0]).not.toHaveProperty('decisionReason');
  await expect(route(representative, ['schools', otherSchool])).rejects.toMatchObject({status:403});
  await expect(route(outsider, school)).rejects.toMatchObject({status:403});
  await fixture.db.query("UPDATE schools SET status='inactive' WHERE id=$1", [schoolId]);
  await expect(route(representative, school)).rejects.toMatchObject({status:403});
  await fixture.db.query("UPDATE schools SET status='active' WHERE id=$1", [schoolId]);
});

it('suppresses individual progress for a shared school email without reducing the competition total', async () => {
  const duplicateId = randomUUID();
  await fixture.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,school_id,answers,submitted_at) VALUES($1,'student','DUPLICATE','submitted',$2,$3,'2024-11-17')",
    [duplicateId,schoolId,JSON.stringify({'text-1':'Sibling','email-1':'student@example.test'})]);
  try {
    const data = (await route(representative, school)).data;
    expect(data.competitionTotal).toBe(2);
    expect(data.students).toEqual(expect.arrayContaining([
      expect.objectContaining({id:studentId,competitions:[]}), expect.objectContaining({id:duplicateId,competitions:[]})
    ]));
  } finally {
    await fixture.db.query('DELETE FROM portal_form_records WHERE id=$1',[duplicateId]);
  }
});

it('shows safe school-scoped data with year and search filters', async () => {
  const all = (await route(representative, school)).data;
  expect(all).toMatchObject({students:[{id:archivedStudent,name:'Archive Student',source:'wordpress',competitions:[]},
    {id:studentId,name:'Test Student',lockVersion:0,competitions:[{reference:'WP-42'}]}],years:['2026','2025','2024'],competitionTotal:2});
  expect(JSON.stringify(all)).not.toMatch(/guardian@|student@example|private.example|STUDENT-2|WP-4[356]|answers|checksum/);
  expect((await route(representative, school, 'GET', undefined, '?year=2026&q=Test')).data).toMatchObject({students:[{id:studentId,competitions:[]}],competitionTotal:1});
  expect((await route(representative, school, 'GET', undefined, '?year=2025')).data).toMatchObject({students:[],competitionTotal:1});
  expect((await route(representative, school, 'GET', undefined, '?page=2')).data).toMatchObject({students:[],page:2,total:2});
});

it('validates correction and saves versioned data with audit while preserving all source rows', async () => {
  const path = [...school, 'students', 'portal', studentId];
  const nativeBefore = (await fixture.db.query('SELECT * FROM portal_form_records ORDER BY id')).rows;
  const archiveBefore = (await fixture.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows;
  await expect(route(representative, path, 'PATCH', null)).rejects.toMatchObject({status:422});
  await expect(route(representative, [...school, 'students', 'portal', outsideStudent], 'PATCH', correction)).rejects.toMatchObject({status:404});
  await expect(route(representative, [...school, 'students', 'wordpress', archivedId], 'PATCH', correction)).rejects.toMatchObject({status:404});
  await expect(route(representative, path, 'PATCH', correction)).resolves.toMatchObject({data:{lockVersion:1}});
  await expect(route(representative, path, 'PATCH', correction)).rejects.toMatchObject({status:409});
  expect((await route(representative, school)).data.students.find((item: {id:string}) => item.id === studentId)).toMatchObject({name:correction.name,className:'6',section:'B',lockVersion:1});
  await expect(route(representative, [...school, 'students', 'wordpress', archivedStudent], 'PATCH', {...correction,name:'Archived Student'})).resolves.toMatchObject({data:{lockVersion:1}});
  expect((await fixture.db.query("SELECT actor_id, detail FROM audit_events WHERE action='school.student.correct' ORDER BY created_at")).rows).toMatchObject([
    {actor_id:representative.id,detail:{reason:correction.reason,reference:'STUDENT-1'}},
    {actor_id:representative.id,detail:{reason:correction.reason,reference:'WP-47'}}
  ]);
  expect((await fixture.db.query('SELECT * FROM portal_form_records ORDER BY id')).rows).toEqual(nativeBefore);
  expect((await fixture.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows).toEqual(archiveBefore);
});

it('keeps the roster available when an unrelated school archive has a corrupt checksum', async () => {
  const damaged = randomUUID();
  const form = referenceForms.find(item => item.key === 'student')!;
  const payload = {form_id:form.id,status:'active',meta:[{meta_key:'_yes_school_id',meta_value:'YES-SECOND'}]};
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.test','entry','99',$2,$3,now())", [damaged,JSON.stringify(payload),'0'.repeat(64)]);
  try {
    await expect(route(representative, school)).resolves.toMatchObject({status:200,data:{total:2}});
    await expect(route(representative, [...school,'students','wordpress',damaged],'PATCH',correction)).rejects.toMatchObject({status:404});
  } finally {
    await fixture.db.query('DELETE FROM wordpress_records WHERE id=$1',[damaged]);
  }
});

it('links student-submitted entries by account ownership and suppresses ambiguous or educator ownership', async () => {
  const studentEntry = randomUUID(), educatorEntry = randomUUID(), duplicate = randomUUID();
  const insertEntry = (id: string, ref: string, role: string) => fixture.db.query(`INSERT INTO portal_form_records
    (id,owner_id,form_key,reference,status,school_id,answers,submitted_at,submitter_role)
    VALUES($1,$2,'open-letter',$3,'submitted',$4,'{}','2026-11-17',$5)`, [id,outsider.id,ref,schoolId,role]);
  await fixture.db.query('UPDATE portal_form_records SET owner_id=$2 WHERE id=$1', [studentId,outsider.id]);
  await insertEntry(studentEntry,'STUDENT-SUBMITTED','student');
  await insertEntry(educatorEntry,'EDUCATOR-SUBMITTED','educator');
  try {
    const record = (data: {students: {id: string; competitions: {reference: string}[]}[]}) => data.students.find(item => item.id === studentId);
    const data = (await route(representative, school, 'GET', undefined, '?year=2026')).data;
    expect(record(data)?.competitions.map(entry => entry.reference)).toEqual(['STUDENT-SUBMITTED']);
    expect(data.competitionTotal).toBe(3);
    await fixture.db.query(`INSERT INTO portal_form_records(id,owner_id,form_key,reference,status,school_id,answers,submitted_at)
      VALUES($1,$2,'student','DUPLICATE-OWNER','submitted',$3,'{}','2025-11-17')`, [duplicate,outsider.id,schoolId]);
    const ambiguous = (await route(representative, school, 'GET', undefined, '?year=2026')).data;
    expect(record(ambiguous)?.competitions).toEqual([]);
    expect(ambiguous.competitionTotal).toBe(3);
  } finally {
    await fixture.db.query('DELETE FROM portal_form_records WHERE id=ANY($1::uuid[])',[ [studentEntry,educatorEntry,duplicate] ]);
    await fixture.db.query('UPDATE portal_form_records SET owner_id=NULL WHERE id=$1',[studentId]);
  }
});

it('revokes access and denies inactive staff and representatives', async () => {
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1', [owner.id]);
  await expect(route(owner, ['admin'])).rejects.toMatchObject({status:401});
  await fixture.db.query('UPDATE users SET active=true WHERE id=$1', [owner.id]);
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1', [representative.id]);
  await expect(route(representative, school)).rejects.toMatchObject({status:401});
  await fixture.db.query('UPDATE users SET active=true WHERE id=$1', [representative.id]);
  await expect(route(owner, ['admin', requestId], 'PATCH', {status:'revoked',expectedStatus:'approved',reason:'No longer represents school'})).resolves.toMatchObject({data:{status:'revoked'}});
  await expect(route(representative, school)).rejects.toMatchObject({status:403});
  await expect(route(representative, [...school, 'students', 'portal', studentId], 'PATCH', correction)).rejects.toMatchObject({status:403});
});

it('gives a renewed request a distinct identity so a stale staff action cannot approve it', async () => {
  const data = (await route(representative, ['requests'], 'POST', {schoolId,reason:'I represent the school again'})).data;
  expect(data.id).not.toBe(requestId);
  await expect(route(owner, ['admin', requestId], 'PATCH', {status:'approved',expectedStatus:'pending',reason:'Old verification evidence'})).rejects.toMatchObject({status:409});
  await expect(route(representative, school)).rejects.toMatchObject({status:403});
});
