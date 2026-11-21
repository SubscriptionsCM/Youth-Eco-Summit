import {beforeAll,afterAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import {loadSubmissionRecords} from '../src/server/submission-records';
import {fingerprint} from '../src/server/wordpress-migration';
import {referenceForms} from '../src/domain/wordpress-forms';
let f:Awaited<ReturnType<typeof testDb>>,schoolId:string,before:unknown;
beforeAll(async()=>{f=await testDb();schoolId=randomUUID();await f.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'SCH-READ','A school','Road','City','State','','active')",[schoolId]);
 const form=referenceForms.find(x=>x.key==='open-letter')!;
 for(const [sourceId,is_draft,school] of [['1','0','SCH-READ'],['2','1','SCH-READ'],['3','0','A school']] as const){const payload={form_id:form.id,status:'active',is_draft,date_created:'2026-11-17 08:30:00',meta:[{meta_key:'text-yes-school-id',meta_value:school},{meta_key:'text-yes-name',meta_value:'Student'}]};await f.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.test','entry',$2,$3,$4,'2026-11-20T00:00:00Z')",[randomUUID(),sourceId,JSON.stringify(payload),fingerprint(payload)]);}
 await f.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,answers,school_id,submitted_at) VALUES($1,'student','NATIVE-STUDENT','submitted',$2,$3,'2026-11-17T04:00:00Z')",[randomUUID(),JSON.stringify({'text-1':'Student','email-1':'student@example.test'}),schoolId]);before=(await f.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows;
});
afterAll(async()=>f?.close());
it('retains original source dates and classifies draft entries separately',async()=>{const rows=await loadSubmissionRecords(f.db);expect(rows.filter(r=>r.kind==='competition'&&r.status==='submitted')).toHaveLength(2);expect(rows.find(r=>r.reference==='WP-1')).toMatchObject({submittedAt:'2026-11-17 08:30:00',year:'2026',schoolId});expect(rows.find(r=>r.reference==='WP-2')?.status).toBe('draft');});
it('matches permanent school IDs and never authorizes by school name',async()=>{const rows=await loadSubmissionRecords(f.db);expect(rows.find(r=>r.reference==='WP-3')?.schoolId).toBeNull();expect(rows.find(r=>r.kind==='student')).toMatchObject({schoolId,name:'Student',email:'student@example.test'});expect((await f.db.query('SELECT * FROM wordpress_records ORDER BY id')).rows).toEqual(before);});
it('fails closed when archived duplicate school pointers disagree',async()=>{
 await f.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'SCH-OTHER','Another school','Road','City','State','','active')",[randomUUID()]);
 const original=(await f.db.query("SELECT * FROM wordpress_records WHERE source_id='1'")).rows[0];const payload={...original.payload,meta:[...original.payload.meta,{meta_key:'text-yes-school-id',meta_value:'SCH-OTHER'}]};
 await f.db.query('UPDATE wordpress_records SET payload=$2,checksum=$3 WHERE id=$1',[original.id,JSON.stringify(payload),fingerprint(payload)]);
 expect((await loadSubmissionRecords(f.db)).find(r=>r.reference==='WP-1')?.schoolId).toBeNull();
 await f.db.query('UPDATE wordpress_records SET payload=$2,checksum=$3 WHERE id=$1',[original.id,JSON.stringify(original.payload),original.checksum]);
});
it('does not normalize HTML into a permanent school identifier',async()=>{
 const row=(await f.db.query("SELECT * FROM wordpress_records WHERE source_id='3'")).rows[0],payload={...row.payload,meta:[{meta_key:'registered-school-id',meta_value:'<b>SCH-READ</b>'}]};
 await f.db.query('UPDATE wordpress_records SET payload=$2,checksum=$3 WHERE id=$1',[row.id,JSON.stringify(payload),fingerprint(payload)]);expect((await loadSubmissionRecords(f.db)).find(r=>r.reference==='WP-3')?.schoolId).toBeNull();
});
it('excludes impossible source dates from year reports',async()=>{
 const row=(await f.db.query("SELECT * FROM wordpress_records WHERE source_id='3'")).rows[0],payload={...row.payload,date_created:'2026-02-30 12:00:00'};
 await f.db.query('UPDATE wordpress_records SET payload=$2,checksum=$3 WHERE id=$1',[row.id,JSON.stringify(payload),fingerprint(payload)]);expect((await loadSubmissionRecords(f.db)).find(r=>r.reference==='WP-3')).toMatchObject({submittedAt:null,year:null});
});
it('does not turn HTML or conflicting archived emails into a student identity',async()=>{
 const row=(await f.db.query("SELECT * FROM wordpress_records WHERE source_id='3'")).rows[0];
 for(const meta of [[{meta_key:'email-yes-student-1',meta_value:'<b>student@example.test</b>'}],[{meta_key:'email-yes-student-1',meta_value:'one@example.test'},{meta_key:'email-yes-student-1',meta_value:'two@example.test'}]]){
  const payload={...row.payload,meta};await f.db.query('UPDATE wordpress_records SET payload=$2,checksum=$3 WHERE id=$1',[row.id,JSON.stringify(payload),fingerprint(payload)]);expect((await loadSubmissionRecords(f.db)).find(r=>r.reference==='WP-3')?.email).toBe('');
 }
});
it('does not infer student self-submission from conflicting or HTML-wrapped archived role markers',async()=>{
 const row=(await f.db.query("SELECT * FROM wordpress_records WHERE source_id='3'")).rows[0];
 for(const values of [['educator','student'],['<b>student</b>']]){
  const payload={...row.payload,meta:values.map(meta_value=>({meta_key:'hidden-yes-submitter',meta_value}))};await f.db.query('UPDATE wordpress_records SET payload=$2,checksum=$3 WHERE id=$1',[row.id,JSON.stringify(payload),fingerprint(payload)]);expect((await loadSubmissionRecords(f.db)).find(r=>r.reference==='WP-3')?.submitterRole).toBeNull();
 }
});

async function archivedMetadata(meta:{meta_key:string;meta_value:unknown}[],check:(id:string)=>Promise<void>){
 const id=randomUUID(),payload={form_id:referenceForms.find(form=>form.key==='open-letter')!.id,status:'active',is_draft:'0',date_created:'2026-11-17 08:30:00',meta};
 await f.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.test','entry',$2,$3,$4,now())",[id,id,JSON.stringify(payload),fingerprint(payload)]);
 try{await check(id);}finally{await f.db.query('DELETE FROM wordpress_records WHERE id=$1',[id]);}
}
it.each(['student','educator'])('reads the protected legacy %s role and verified school ID without relying on presentation labels',async role=>{
 await archivedMetadata([
  {meta_key:'_yes_entry_submitter_role',meta_value:role},
  {meta_key:'_yes_entry_submission_by',meta_value:role==='student'?'Educator':'Student'},
  {meta_key:'_yes_verified_school_id',meta_value:' sch-read '}
 ],async id=>{
  const rows=await loadSubmissionRecords(f.db,{source:'wordpress',recordId:id,schoolId});
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({submitterRole:role,schoolId,directSchoolId:schoolId});
 });
});
it('accepts agreeing canonical and visible pointers through an exact imported school alias',async()=>{
 await f.db.query("INSERT INTO school_identifiers(reference,school_id,kind) VALUES('OLD-SCH-READ',$1,'imported')",[schoolId]);
 try{
  await archivedMetadata([
   {meta_key:'_yes_entry_submitter_role',meta_value:'student'},{meta_key:'hidden-yes-submitter',meta_value:'student'},
   {meta_key:'_yes_verified_school_id',meta_value:'OLD-SCH-READ'},{meta_key:'text-yes-school-id',meta_value:'SCH-READ'}
  ],async id=>expect((await loadSubmissionRecords(f.db,{source:'wordpress',recordId:id,schoolId}))[0]).toMatchObject({submitterRole:'student',schoolId,directSchoolId:schoolId}));
 }finally{await f.db.query("DELETE FROM school_identifiers WHERE reference='OLD-SCH-READ'");}
});
it.each([
 [{meta_key:'_yes_entry_submitter_role',meta_value:'student'},{meta_key:'hidden-yes-submitter',meta_value:'educator'}],
 [{meta_key:'_yes_entry_submitter_role',meta_value:'student'},{meta_key:'_yes_entry_submitter_role',meta_value:'educator'}],
 [{meta_key:'_yes_entry_submitter_role',meta_value:'<b>student</b>'}],
 [{meta_key:'_yes_entry_submission_by',meta_value:'student'}]
])('does not authorize a role from conflicting, malformed or human-label-only legacy metadata %#',async(...meta)=>{
 await archivedMetadata(meta,async id=>expect((await loadSubmissionRecords(f.db,{source:'wordpress',recordId:id}))[0].submitterRole).toBeNull());
});
it('rejects conflicting protected school IDs and conflicts between protected and visible school IDs',async()=>{
 const otherSchool=randomUUID();await f.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,'SCH-CANONICAL-OTHER','Other canonical school','Road','City','State','','active')",[otherSchool]);
 try{
  for(const conflictingKey of ['_yes_verified_school_id','text-yes-school-id','registered-school-id','_yes_school_id']){
   await archivedMetadata([
    {meta_key:'_yes_verified_school_id',meta_value:'SCH-READ'},{meta_key:conflictingKey,meta_value:'SCH-CANONICAL-OTHER'}
   ],async id=>{
    for(const scopedSchool of [schoolId,otherSchool])expect((await loadSubmissionRecords(f.db,{source:'wordpress',recordId:id,schoolId:scopedSchool}))[0]).toMatchObject({schoolId:null,directSchoolId:null});
   });
  }
 }finally{await f.db.query('DELETE FROM schools WHERE id=$1',[otherSchool]);}
});
it.each(['A school','student@example.test','<b>SCH-READ</b>','UNKNOWN-SCHOOL'])('does not replace a verified school identifier with a matching name, email, HTML or unknown value: %s',async value=>{
 await archivedMetadata([
  {meta_key:'_yes_verified_school_id',meta_value:value},{meta_key:'text-yes-school',meta_value:'A school'},
  {meta_key:'text-yes-name',meta_value:'Student'},{meta_key:'email-yes-student-1',meta_value:'student@example.test'}
 ],async id=>{
  expect((await loadSubmissionRecords(f.db,{source:'wordpress',recordId:id}))[0]).toMatchObject({schoolId:null,directSchoolId:null});
  expect(await loadSubmissionRecords(f.db,{source:'wordpress',recordId:id,schoolId})).toEqual([]);
 });
});
