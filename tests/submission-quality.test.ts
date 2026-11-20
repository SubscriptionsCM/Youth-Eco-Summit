import {beforeAll,afterAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import type {Actor} from '../src/server/core';
import {submissionReport,saveQuality,setCategoryCoordinator} from '../src/server/submission-quality';
import {judgingAdministration,createJudgingRound} from '../src/server/judge-portal';
async function saveTest(actor:Actor,input:any,now?:Date){const version=(await submissionReport(f.db,owner,new URLSearchParams())).items.find(r=>r.id===input.recordId)?.sourceVersion||'a'.repeat(64);return saveQuality(f.db,actor,{sourceVersion:version,...input},now);}
let f:Awaited<ReturnType<typeof testDb>>,owner:Actor,participant:Actor,entry:string,draft:string,before:unknown;
beforeAll(async()=>{f=await testDb();owner={id:randomUUID(),role:'owner'};participant={id:randomUUID(),role:'participant'};for(const a of [owner,participant])await f.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[a.id,a.role,a.id+'@test.example']);entry=randomUUID();draft=randomUUID();for(const [id,status] of [[entry,'submitted'],[draft,'draft']])await f.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,answers,submitted_at) VALUES($1,'open-letter',$2,$3,'{}','2026-11-17T02:00:00Z')",[id,'QA-'+id,status]);await f.db.query("INSERT INTO portal_form_records(id,form_key,reference,status,answers,submitted_at) VALUES($1,'student','QA-REG','submitted','{}','2026-11-17T02:00:00Z')",[randomUUID()]);before=(await f.db.query('SELECT * FROM portal_form_records ORDER BY id')).rows;});
afterAll(async()=>f?.close());
it('counts registration records separately from submitted competitions and defaults to pending QC',async()=>{const r=await submissionReport(f.db,owner,new URLSearchParams({year:'2026'}));expect(r.summary).toMatchObject({registrations:1,submissions:1,qcCompleted:0,qcRemaining:1});expect(r.items[0]).not.toHaveProperty('answers');expect(r.items[0].qcVersion).toBe(0);});
it('rejects participants and draft QC updates',async()=>{await expect(submissionReport(f.db,participant,new URLSearchParams())).rejects.toMatchObject({status:403});await expect(saveTest(participant,{source:'portal',recordId:entry,status:'completed',note:'',reason:'Checked',lockVersion:0})).rejects.toMatchObject({status:403});await expect(saveTest(owner,{source:'portal',recordId:draft,status:'completed',note:'',reason:'Checked',lockVersion:0})).rejects.toMatchObject({status:422});});
it('preserves sources, records QC completion in India time, and rejects stale overwrites',async()=>{await saveTest(owner,{source:'portal',recordId:entry,status:'completed',note:'Meets requirements',reason:'Checked the original work',lockVersion:0},new Date('2026-11-19T19:00:00Z'));const r=await submissionReport(f.db,owner,new URLSearchParams(),new Date('2026-11-20T01:00:00Z'));expect(r.summary).toMatchObject({qcCompleted:1,qcRemaining:0,qcCompletedToday:1});await expect(saveTest(owner,{source:'portal',recordId:entry,status:'pending',note:'',reason:'Stale update',lockVersion:0})).rejects.toMatchObject({status:409});expect((await f.db.query('SELECT * FROM portal_form_records ORDER BY id')).rows).toEqual(before);expect((await f.db.query('SELECT * FROM submission_quality_history')).rows).toHaveLength(1);});
it('stores a category coordinator without creating accounts or inventing QC decisions',async()=>{await setCategoryCoordinator(f.db,owner,{formKey:'open-letter',coordinator:'Preeti',reason:'Approved category allocation',lockVersion:0});const r=await submissionReport(f.db,owner,new URLSearchParams());expect(r.categories.find((c:any)=>c.formKey==='open-letter')!.coordinator).toBe('Preeti');expect(r.summary.submissions).toBe(1);expect((await f.db.query('SELECT id FROM users')).rows).toHaveLength(2);});
it('summarizes the dedicated judge tables and excludes revoked assignments from progress',async()=>{
 const judge=randomUUID();await f.db.query("INSERT INTO users(id,role,contact,name) VALUES($1,'judge','judge@test.example','Test Judge')",[judge]);
 const round=await createJudgingRound(f.db,owner,{formKey:'open-letter',edition:'2027',name:'First round'});
 const assignment=randomUUID();await f.db.query("INSERT INTO judging_assignments(id,round_id,judge_id,portal_record_id,snapshot,snapshot_checksum,source_checksum,assigned_by,reason) VALUES($1,$2,$3,$4,'{}',$5,$5,$6,'Isolated fixture')",[assignment,round.id,judge,entry,'a'.repeat(64),owner.id]);
 await f.db.query("INSERT INTO judging_reviews(id,assignment_id,status) VALUES($1,$2,'submitted')",[randomUUID(),assignment]);
 let r=await submissionReport(f.db,owner,new URLSearchParams());expect(r.judges).toContainEqual(expect.objectContaining({judgeId:judge,assigned:1,completed:1,remaining:0}));
 const admin=await judgingAdministration(f.db,owner);expect(admin.judges.find(j=>j.id===judge)).toMatchObject({assigned_count:1,completed_count:1,competition_keys:['open-letter']});
 await f.db.query('UPDATE judging_assignments SET active=false WHERE id=$1',[assignment]);r=await submissionReport(f.db,owner,new URLSearchParams());expect(r.judges).toHaveLength(0);
});
it('filters registration and competition totals by original submission year and source',async()=>{
 expect((await submissionReport(f.db,owner,new URLSearchParams({year:'2025'}))).summary).toMatchObject({registrations:0,submissions:0,qcCompleted:0});
 expect((await submissionReport(f.db,owner,new URLSearchParams({source:'wordpress'}))).summary.submissions).toBe(0);
 await expect(submissionReport(f.db,owner,new URLSearchParams({year:'anything'}))).rejects.toMatchObject({status:422});
});
it('rejects a completion against a source revision the reviewer did not see',async()=>{
 const shown=(await submissionReport(f.db,owner,new URLSearchParams())).items.find(r=>r.id===entry)!;
 await f.db.query('UPDATE portal_form_records SET answers=$2 WHERE id=$1',[entry,JSON.stringify({'text-yes-title':'Changed after opening'})]);
 try{await expect(saveTest(owner,{source:'portal',recordId:entry,status:'completed',note:'',reason:'Old screen',lockVersion:shown.qcVersion,sourceVersion:shown.sourceVersion})).rejects.toMatchObject({status:409});}finally{await f.db.query("UPDATE portal_form_records SET answers='{}' WHERE id=$1",[entry]);}
});
it('invalidates a previous QC completion when its attached files change',async()=>{
 const file=randomUUID();await f.db.query("INSERT INTO portal_form_files(id,record_id,field_id,filename,storage_key,expected_size,expected_checksum,mime_type,status,verified_at) VALUES($1,$2,'upload-yes-1','test.pdf','fixture/qc-file',20,$3,'application/pdf','ready',now())",[file,entry,'b'.repeat(64)]);
 const row=(await submissionReport(f.db,owner,new URLSearchParams())).items.find(r=>r.id===entry)!;expect(row.qcStatus).toBe('needs_attention');expect(row.sourceChanged).toBe(true);
});
it('rejects a stale coordinator change instead of silently overwriting it',async()=>{
 await expect(setCategoryCoordinator(f.db,owner,{formKey:'open-letter',coordinator:'Another person',reason:'Stale screen',lockVersion:0})).rejects.toMatchObject({status:409});
 expect((await submissionReport(f.db,owner,new URLSearchParams())).categories.find(c=>c.formKey==='open-letter')?.coordinator).toBe('Preeti');
});
it('can save a native QC decision even if an unrelated archived record is corrupt',async()=>{
 const shown=(await submissionReport(f.db,owner,new URLSearchParams())).items.find(r=>r.id===entry)!,corrupt=randomUUID();
 await f.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://invalid.test','entry','unrelated',$2,$3,now())",[corrupt,JSON.stringify({form_id:48542,status:'active',meta:[]}),'0'.repeat(64)]);
 try{await expect(saveQuality(f.db,owner,{source:'portal',recordId:entry,status:'needs_attention',note:'File changed',reason:'Scoped save',lockVersion:shown.qcVersion,sourceVersion:shown.sourceVersion})).resolves.toMatchObject({status:'needs_attention'});}finally{await f.db.query('DELETE FROM wordpress_records WHERE id=$1',[corrupt]);}
});
it('requires a recheck if an attachment is renamed after a completed QC',async()=>{
 const shown=(await submissionReport(f.db,owner,new URLSearchParams())).items.find(r=>r.id===entry)!;
 await saveTest(owner,{source:'portal',recordId:entry,status:'completed',note:'',reason:'Rechecked file',lockVersion:shown.qcVersion});
 await f.db.query("UPDATE portal_form_files SET filename='renamed.pdf' WHERE record_id=$1",[entry]);
 expect((await submissionReport(f.db,owner,new URLSearchParams())).items.find(r=>r.id===entry)?.qcStatus).toBe('needs_attention');
});
