import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {testDb} from './helpers/db';
import type {Actor} from '../src/server/core';
import {referenceForms} from '../src/domain/wordpress-forms';
import {fingerprint} from '../src/server/wordpress-migration';
import {createJudgingRound,assignJudgingEntries,judgingQueue,judgingDetail,saveJudgingReview,changeJudgingAssignment,changeJudgingRound,judgingFile,listJudgingEntries,judgingAdministration} from '../src/server/judge-portal';

describe('dedicated source-linked judge portal',()=>{
 let fixture:Awaited<ReturnType<typeof testDb>>,owner:Actor,judge:Actor,other:Actor,participant:Actor;
 let sourceId:string,fileId:string,archiveId:string,round:any,assignment:any;
 const form=referenceForms.find(f=>f.key==='open-letter')!;
 beforeAll(async()=>{
  fixture=await testDb();
  [owner,judge,other,participant]=(['owner','judge','judge','participant'] as const).map((role,i)=>({id:randomUUID(),role,contact:`portal-${i}@qa.example`}));
  for(const a of [owner,judge,other,participant])await fixture.db.query('INSERT INTO users(id,role,contact) VALUES($1,$2,$3)',[a.id,a.role,a.contact]);
  sourceId=randomUUID();fileId=randomUUID();archiveId=randomUUID();
  await fixture.db.query("INSERT INTO portal_form_records(id,form_key,owner_id,status,reference,answers,form_snapshot,receipt,submitted_at) VALUES($1,$2,$3,'submitted','QA-PORTAL-ENTRY',$4,$5,$6,now())",[sourceId,form.key,participant.id,JSON.stringify({'text-yes-name':'PRIVATE CHILD','email-yes-guardian-1':'private@qa.example','text-yes-school':'PRIVATE SCHOOL','text-yes-title':'School_Class_Project_Authors','select-yes-class':'8','select-yes-topic':'Waste segregation','select-yes-language':'English'}),JSON.stringify(form),JSON.stringify({status:'submitted'})]);
  await fixture.db.query("INSERT INTO portal_form_files(id,record_id,field_id,filename,storage_key,expected_size,expected_checksum,mime_type,status,verified_at) VALUES($1,$2,'upload-yes-1','PRIVATE-CHILD.pdf','private/native-file',20,$3,'application/pdf','ready',now())",[fileId,sourceId,'a'.repeat(64)]);
  const payload={form_id:form.id,status:'active',meta:[{meta_key:'text-yes-name',meta_value:'PRIVATE ARCHIVE CHILD'},{meta_key:'select-yes-class',meta_value:'8'},{meta_key:'select-yes-topic',meta_value:'Waste segregation'},{meta_id:101,meta_key:'upload-yes-1',meta_value:'retained-file'}]};
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.qa','entry','123',$2,$3,now())",[archiveId,JSON.stringify(payload),fingerprint(payload)]);
  await fixture.db.query("INSERT INTO wordpress_attachments(id,source,source_id,entry_record_id,filename,mime_type,byte_size,checksum,storage_key,verified_at) VALUES($1,'https://source.qa',$4,$2,'PRIVATE-ARCHIVE.pdf','application/pdf',20,$3,'wordpress/archive/file',now())",[randomUUID(),archiveId,'b'.repeat(64),'101:'+ 'f'.repeat(64)]);
 });
 afterAll(async()=>fixture?.close());
 it('lets staff configure a round with an exact frozen source rubric',async()=>{
  round=await createJudgingRound(fixture.db,owner,{formKey:'open-letter',edition:'2027',name:'First review',open:true});
  expect(round.rubric.criteria.length).toBeGreaterThan(0);expect(round.rubric.penalties.some((p:any)=>p.marks===-15)).toBe(true);
  await expect(createJudgingRound(fixture.db,judge,{formKey:'open-letter',edition:'2027',name:'Denied'})).rejects.toMatchObject({status:403});
  await expect(createJudgingRound(fixture.db,owner,{formKey:'school',edition:'2027',name:'Denied'})).rejects.toMatchObject({status:422});
 });
 it('lists only supported submitted source entries and permits explicit native/archive assignment',async()=>{
  expect((await listJudgingEntries(fixture.db,owner,new URLSearchParams({source:'portal',formKey:'open-letter'}))).items[0].id).toBe(sourceId);
  expect((await listJudgingEntries(fixture.db,owner,new URLSearchParams({source:'wordpress',formKey:'open-letter'}))).items[0].id).toBe(archiveId);
  const result=await assignJudgingEntries(fixture.db,owner,{roundId:round.id,judgeId:judge.id,source:'portal',entryIds:[sourceId],reason:'QA explicit assignment'});
  assignment=result.items[0];
  expect((await assignJudgingEntries(fixture.db,owner,{roundId:round.id,judgeId:judge.id,source:'portal',entryIds:[sourceId],reason:'QA duplicate retry'})).items[0].id).toBe(assignment.id);
  expect((await assignJudgingEntries(fixture.db,owner,{roundId:round.id,judgeId:other.id,source:'wordpress',entryIds:[archiveId],reason:'QA archive assignment'})).items).toHaveLength(1);
 });
 it('scopes queues and assignment details without exposing identities, filenames or another review',async()=>{
  const queue=await judgingQueue(fixture.db,judge,new URLSearchParams());expect(queue.total).toBe(1);
  const detail=await judgingDetail(fixture.db,judge,assignment.id);
  expect(detail.entry.fields.some((f:any)=>f.id==='select-yes-topic')).toBe(true);
  expect(JSON.stringify(detail)).not.toMatch(/PRIVATE|private@|private\/|School_Class|judge_id|owner_id|storage_key/);
  await expect(judgingDetail(fixture.db,other,assignment.id)).rejects.toMatchObject({status:404});
  await expect(judgingQueue(fixture.db,participant,new URLSearchParams())).rejects.toMatchObject({status:403});
  await expect(judgingAdministration(fixture.db,judge)).rejects.toMatchObject({status:403});
 });
 it('saves partial drafts, rejects invalid/stale scores, requires final criteria and locks final reviews',async()=>{
  const first=round.rubric.criteria[0].id;
  let saved=await saveJudgingReview(fixture.db,judge,assignment.id,{scores:{[first]:1},comment:'Draft',deductions:[],lockVersion:0},false);
  expect(saved.status).toBe('draft');expect(saved.lock_version).toBe(1);
  await expect(saveJudgingReview(fixture.db,judge,assignment.id,{scores:{[first]:99999},comment:'',deductions:[],lockVersion:1},false)).rejects.toMatchObject({status:422});
  await expect(saveJudgingReview(fixture.db,judge,assignment.id,{scores:{[first]:1},comment:'',deductions:[],lockVersion:0},false)).rejects.toMatchObject({status:409});
  await expect(saveJudgingReview(fixture.db,judge,assignment.id,{scores:{[first]:1},comment:'Reviewed',deductions:[],lockVersion:1},true)).rejects.toMatchObject({status:422});
  const scores=Object.fromEntries(round.rubric.criteria.map((c:any)=>[c.id,c.max]));
  saved=await saveJudgingReview(fixture.db,judge,assignment.id,{scores,comment:'QA review',deductions:round.rubric.penalties.filter((p:any)=>p.marks===-15).map((p:any)=>p.id),lockVersion:1},true);
  expect(saved.status).toBe('submitted');expect(Number(saved.total)).toBe(round.rubric.total-15);
  await expect(saveJudgingReview(fixture.db,judge,assignment.id,{scores,comment:'Changed',deductions:[],lockVersion:2},false)).rejects.toMatchObject({status:409});
 });
 it('lets staff reopen with a reason, retaining the prior submitted review and invalidating stale versions',async()=>{
  await changeJudgingAssignment(fixture.db,owner,assignment.id,{action:'reopen',reason:'QA review correction'});
  const d=await judgingDetail(fixture.db,judge,assignment.id);expect(d.review!.status).toBe('draft');expect(d.review!.lock_version).toBe(3);
  expect((await fixture.db.query('SELECT count(*)::int count FROM judging_review_history')).rows[0].count).toBe(1);
  expect((await judgingAdministration(fixture.db,owner)).assignments.length).toBe(2);
 });
 it('checks file scope and integrity independently of download parameters',async()=>{
  const file=await judgingFile(fixture.db,judge,assignment.id,fileId);expect(file.key).toBe('private/native-file');expect(file.filename).not.toContain('PRIVATE');
  await expect(judgingFile(fixture.db,other,assignment.id,fileId)).rejects.toMatchObject({status:404});
  await expect(judgingFile(fixture.db,judge,assignment.id,randomUUID())).rejects.toMatchObject({status:404});
  await fixture.db.query('UPDATE portal_form_files SET expected_checksum=$2 WHERE id=$1',[fileId,'c'.repeat(64)]);
  await expect(judgingFile(fixture.db,judge,assignment.id,fileId)).rejects.toMatchObject({status:409});
  await fixture.db.query('UPDATE portal_form_files SET expected_checksum=$2 WHERE id=$1',[fileId,'a'.repeat(64)]);
 });
 it('prevents closed-round writes and revoked-assignment reads, retaining records',async()=>{
  await changeJudgingRound(fixture.db,owner,round.id,{open:false});
  await expect(saveJudgingReview(fixture.db,judge,assignment.id,{scores:{},comment:'',deductions:[],lockVersion:3},false)).rejects.toMatchObject({status:409});
  await changeJudgingRound(fixture.db,owner,round.id,{open:true});
  await changeJudgingAssignment(fixture.db,owner,assignment.id,{action:'revoke',reason:'QA conflict of interest'});
  await expect(judgingDetail(fixture.db,judge,assignment.id)).rejects.toMatchObject({status:404});
  expect((await judgingQueue(fixture.db,judge,new URLSearchParams())).total).toBe(0);
  await expect(assignJudgingEntries(fixture.db,owner,{roundId:round.id,judgeId:judge.id,source:'portal',entryIds:[sourceId],reason:'Must not revive'})).rejects.toMatchObject({status:409});
  expect((await fixture.db.query('SELECT status,answers FROM portal_form_records WHERE id=$1',[sourceId])).rows[0]).toMatchObject({status:'submitted',answers:{'text-yes-name':'PRIVATE CHILD'}});
 });
 it('rejects inactive users, source drafts, unsupported mappings and corrupt archive records',async()=>{
  await fixture.db.query('UPDATE users SET active=false WHERE id=$1',[other.id]);
  await expect(judgingQueue(fixture.db,other,new URLSearchParams())).rejects.toMatchObject({status:401});
  const draft=randomUUID();await fixture.db.query("INSERT INTO portal_form_records(id,form_key,reference) VALUES($1,'open-letter','QA-DRAFT')",[draft]);
  await expect(assignJudgingEntries(fixture.db,owner,{roundId:round.id,judgeId:judge.id,source:'portal',entryIds:[draft],reason:'No draft assignment'})).rejects.toMatchObject({status:422});
  await fixture.db.query("UPDATE wordpress_records SET checksum=$2 WHERE id=$1",[archiveId,'e'.repeat(64)]);
  await expect(assignJudgingEntries(fixture.db,owner,{roundId:round.id,judgeId:judge.id,source:'wordpress',entryIds:[archiveId],reason:'No corrupt assignment'})).rejects.toMatchObject({status:409});
 });
 it('rejects a string-valued archived draft even when staff bypass the entry picker',async()=>{
  const payload={form_id:form.id,status:'active',is_draft:'true',meta:[]},draftId=randomUUID();
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.qa','entry','draft-string',$2,$3,now())",[draftId,JSON.stringify(payload),fingerprint(payload)]);
  await fixture.db.query("INSERT INTO wordpress_attachments(id,source,source_id,entry_record_id,filename,mime_type,byte_size,checksum,storage_key,verified_at) VALUES($1,'https://source.qa','draft-file',$2,'draft.pdf','application/pdf',20,$3,'wordpress/draft/file',now())",[randomUUID(),draftId,'b'.repeat(64)]);
  await expect(assignJudgingEntries(fixture.db,owner,{roundId:round.id,judgeId:judge.id,source:'wordpress',entryIds:[draftId],reason:'Must reject source draft'})).rejects.toMatchObject({status:422});
 });
 it('does not let optional or duplicate archive attachments stand in for a required upload field',async()=>{
  const craft=referenceForms.find(f=>f.key==='waste-to-art')!,recordId=randomUUID();
  const payload={form_id:craft.id,status:'active',meta:[{meta_id:201,meta_key:'upload-yes-1',meta_value:'retained-required'},{meta_id:202,meta_key:'upload-yes-3',meta_value:'retained-optional'}]};
  await fixture.db.query("INSERT INTO wordpress_records(id,source,kind,source_id,payload,checksum,captured_at) VALUES($1,'https://source.qa','entry','craft-missing-required',$2,$3,now())",[recordId,JSON.stringify(payload),fingerprint(payload)]);
  for(const meta of [201,202])await fixture.db.query("INSERT INTO wordpress_attachments(id,source,source_id,entry_record_id,filename,mime_type,byte_size,checksum,storage_key,verified_at) VALUES($1,'https://source.qa',$2,$3,'craft.pdf','application/pdf',20,$4,$5,now())",[randomUUID(),meta+':'+ 'd'.repeat(64),recordId,'b'.repeat(64),'wordpress/craft/'+meta]);
  const craftRound=await createJudgingRound(fixture.db,owner,{formKey:craft.key,edition:'2027',name:'Craft test'});
  await expect(assignJudgingEntries(fixture.db,owner,{roundId:craftRound.id,judgeId:judge.id,source:'wordpress',entryIds:[recordId],reason:'No missing required role'})).rejects.toMatchObject({status:422});
 });
});
