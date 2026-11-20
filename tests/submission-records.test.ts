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
