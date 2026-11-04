import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { participationWindow, participationWindowStatus } from '../src/data/participation-window';
import { createStudent } from '../src/server/registration';
import { completeRegistrationDraft, saveRegistrationDraft } from '../src/server/registration-drafts';
import { createEntry, submitEntry } from '../src/server/entries';
import { storageAction } from '../src/server/storage';
import * as provider from '../src/server/storage/provider';
import { db as liveDb, type Db } from '../src/server/db';
import { id, type Actor } from '../src/server/core';
import { testDb } from './helpers/db';

const opens=Date.parse(participationWindow.opensAt),closes=Date.parse(participationWindow.closesAt);

describe('5 November 2026 participation cutoff',()=>{
 let store:Awaited<ReturnType<typeof testDb>>,actor:Actor,school:string,edition:string,student:string,participation:string,competition:string;
 const at=(time:number)=>vi.spyOn(Date,'now').mockReturnValue(time);
 const input=()=>({name:'Boundary Student',schoolId:school,editionId:edition,class:5,guardianContact:actor.contact!,consent:true,consentVersion:'fixture-consent'});
 async function draft(){return createEntry(store.db,actor,{participationId:participation,competitionId:competition,answers:{title:'Boundary entry'}});}
 async function retainedFile(entryId:string){await store.db.query("INSERT INTO assets(id,submission_id,revision,uploader_id,original_name,storage_key,mime_type,byte_size,checksum,expected_size,expected_checksum,part_size,status) VALUES($1,$2,1,$3,'entry.pdf',$4,'application/pdf',100,$5,100,$5,8388608,'ready')",[id(),entryId,actor.id,`submissions/${entryId}/${id()}`,'a'.repeat(64)]);}
 beforeAll(async()=>{
  store=await testDb();actor={id:id(),role:'participant',contact:'+919876500001'};school=id();edition=id();student=id();participation=id();competition=id();
  await store.db.query("INSERT INTO users(id,role,contact) VALUES($1,'participant',$2)",[actor.id,actor.contact]);
  await store.db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code,status) VALUES($1,$2,'Boundary school','School street','Delhi','Delhi','110001','active')",[school,school]);
  await store.db.query("INSERT INTO editions(id,label,state,registration_opens,registration_closes,config) VALUES($1,'Participation boundary fixture','open',$2,$3,$4)",[edition,participationWindow.opensAt,participationWindow.closesAt,JSON.stringify({registrationApproved:true,consentText:'Test-only consent; not production approval',consentVersion:'fixture-consent'})]);
  await store.db.query("INSERT INTO students(id,reference,name,guardian_contact) VALUES($1,$2,'Existing student',$3)",[student,student,actor.contact]);
  await store.db.query('INSERT INTO participant_access(user_id,student_id) VALUES($1,$2)',[actor.id,student]);
  await store.db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,snapshot) VALUES($1,$2,$3,$4,5,'{}')",[participation,student,school,edition]);
  const config={mode:'individual',minMembers:1,maxMembers:1,entryLimit:null,categories:[{id:'junior',label:'Junior',classes:[5,6]}],fields:[{key:'title',type:'text',label:'Title',required:true}],files:{minCount:1,maxCount:2,maxBytes:1000,types:['application/pdf']}};
  await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,status,opens_at,closes_at,config) VALUES($1,$2,'boundary-fixture','Boundary fixture','Test-only approved rules','approved',$3,$4,$5)",[competition,edition,participationWindow.opensAt,participationWindow.closesAt,JSON.stringify(config)]);
 });
 afterEach(()=>vi.restoreAllMocks());
 afterAll(async()=>await store?.close());
 it('represents the last day in India with an exclusive midnight cutoff',()=>{
  expect(participationWindow.closesAt).toBe('2026-11-05T18:30:00.000Z');
  expect(participationWindowStatus(opens-1).isOpen).toBe(false);
  expect(participationWindowStatus(opens).isOpen).toBe(true);
  expect(participationWindowStatus(closes-1).isOpen).toBe(true);
  expect(participationWindowStatus(closes).state).toBe('closed');
  expect(participationWindowStatus(closes+1).isOpen).toBe(false);
 });
 it('accepts student registration at opening and until the last millisecond, then rejects it exactly at closing',async()=>{
  const clock=at(opens-1);
  await expect(createStudent(store.db,actor,input())).rejects.toThrow('Registration is closed');
  clock.mockReturnValue(opens);expect((await createStudent(store.db,actor,input())).participation.edition_id).toBe(edition);
  clock.mockReturnValue(closes-1);expect((await createStudent(store.db,actor,input())).participation.edition_id).toBe(edition);
  const before=(await store.db.query('SELECT count(*)::int count FROM student_participations WHERE edition_id=$1',[edition])).rows[0].count;
  clock.mockReturnValue(closes);await expect(createStudent(store.db,actor,input())).rejects.toThrow('Registration is closed');
  clock.mockReturnValue(closes+1);await expect(createStudent(store.db,actor,input())).rejects.toThrow('Registration is closed');
  expect((await store.db.query('SELECT count(*)::int count FROM student_participations WHERE edition_id=$1',[edition])).rows[0].count).toBe(before);
 });
 it('enforces the same opening and closing boundaries for new entry drafts',async()=>{
  const clock=at(opens-1);await expect(draft()).rejects.toThrow('not open');
  clock.mockReturnValue(opens);expect((await draft()).state).toBe('draft');
  clock.mockReturnValue(closes-1);expect((await draft()).state).toBe('draft');
  clock.mockReturnValue(closes);await expect(draft()).rejects.toThrow('not open');
 });
 it('rejects an unfinished submission at closing but returns the receipt for an already committed submission',async()=>{
  const clock=at(closes-1),accepted=await draft(),unfinished=await draft();
  await retainedFile(accepted.id);await retainedFile(unfinished.id);
  const receipt=await submitEntry(store.db,actor,accepted.id,0);expect(receipt.state).toBe('submitted');
  clock.mockReturnValue(closes);
  await expect(submitEntry(store.db,actor,unfinished.id,0)).rejects.toThrow('Submissions are closed');
  const retry=await submitEntry(store.db,actor,accepted.id,0);expect(retry.reference).toBe(receipt.reference);expect(retry.revision).toBe(1);
  expect((await store.db.query('SELECT id FROM submission_revisions WHERE submission_id=$1',[accepted.id])).rows).toHaveLength(1);
  expect((await store.db.query('SELECT state,revision FROM submissions WHERE id=$1',[unfinished.id])).rows[0]).toEqual({state:'draft',revision:0});
 });
 it('rechecks closing time after acquiring submission and participant locks',async()=>{
  const clock=at(closes-1),entry=await draft();await retainedFile(entry.id);
  const wrapped=(db:Db):Db=>({query:async(sql,params)=>{if(sql.startsWith('SELECT c.status,c.opens_at'))clock.mockReturnValue(closes);return db.query(sql,params);},transaction:fn=>db.transaction(tx=>fn(wrapped(tx)))});
  await expect(submitEntry(wrapped(store.db),actor,entry.id,0)).rejects.toThrow('Submissions are closed');
  expect((await store.db.query('SELECT id FROM submission_revisions WHERE submission_id=$1',[entry.id])).rows).toHaveLength(0);
 });
 it('lets a completed registration confirmation retry after the cutoff while refusing an unfinished one',async()=>{
  const clock=at(closes-1);
  const payload={name:'Saved registration',schoolId:school,editionId:edition,class:5};
  const accepted=await saveRegistrationDraft(store.db,actor,{id:id(),kind:'student',scope:'new',payload,currentStep:3,lockVersion:0});
  const unfinished=await saveRegistrationDraft(store.db,actor,{id:id(),kind:'student',scope:'new',payload,currentStep:3,lockVersion:0});
  const confirmation={lockVersion:accepted.lock_version,consent:true,consentVersion:'fixture-consent'};
  const receipt=await completeRegistrationDraft(store.db,actor,accepted.id,confirmation);
  clock.mockReturnValue(closes);
  const retry=await completeRegistrationDraft(store.db,actor,accepted.id,confirmation);expect(retry.student.id).toBe(receipt.student.id);expect(retry.participation.id).toBe(receipt.participation.id);
  await expect(completeRegistrationDraft(store.db,actor,unfinished.id,{...confirmation,lockVersion:unfinished.lock_version})).rejects.toThrow('Registration is closed');
  expect((await store.db.query('SELECT state FROM registration_drafts WHERE id=$1',[unfinished.id])).rows[0].state).toBe('draft');
 });
 it('does not let a retained upload resumed at the deadline bypass the submission cutoff',async()=>{
  const clock=at(closes-1),entry=await draft();
  vi.spyOn(liveDb,'query').mockImplementation((sql,params)=>store.db.query(sql,params));
  vi.spyOn(liveDb,'transaction').mockImplementation(fn=>store.db.transaction(fn));
  const storeMock={begin:vi.fn(async()=> 'multipart-id'),sign:vi.fn(async()=> 'https://storage.invalid/upload'),parts:vi.fn(async()=> []),head:vi.fn(async()=>({ContentLength:100,VersionId:'test-version',ETag:'test-etag'}))};
  vi.spyOn(provider,'objectStore').mockReturnValue(storeMock as any);
  const req=(body:unknown)=>new Request('https://yes.test/api/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await storageAction(req({submissionId:entry.id,originalName:'work.pdf',byteSize:100,checksum:'a'.repeat(64)}),actor,['uploads','start']);
  const assetId=(await response!.json()).data.id;
  clock.mockReturnValue(closes);
  // Retention is permitted for an existing draft; it is not an extension of the entry deadline.
  expect((await storageAction(req({partNumber:1}),actor,['uploads',assetId,'parts']))!.status).toBe(200);
  expect((await storageAction(req({}),actor,['uploads',assetId,'complete']))!.status).toBe(202);
  await store.db.query("UPDATE assets SET status='ready',mime_type='application/pdf',byte_size=100 WHERE id=$1",[assetId]);
  await expect(submitEntry(store.db,actor,entry.id,0)).rejects.toThrow('Submissions are closed');
  expect((await store.db.query('SELECT revision FROM submissions WHERE id=$1',[entry.id])).rows[0].revision).toBe(0);
 });
 it('does not treat dates as approval of consent, the edition or competition rules',async()=>{
  at(opens+1);
  try{
   await store.db.query("UPDATE editions SET config=config-'consentText' WHERE id=$1",[edition]);
   await expect(createStudent(store.db,actor,input())).rejects.toThrow('approved consent');
   await store.db.query("UPDATE editions SET config=config||'{\"consentText\":\"Test-only consent\"}',state='draft' WHERE id=$1",[edition]);
   await expect(createStudent(store.db,actor,input())).rejects.toThrow('Registration is closed');
   await expect(draft()).rejects.toThrow('not open');
   await store.db.query("UPDATE editions SET state='open' WHERE id=$1",[edition]);
   await store.db.query("UPDATE competitions SET status='draft' WHERE id=$1",[competition]);
   await expect(draft()).rejects.toThrow('not open');
  }finally{
   await store.db.query("UPDATE editions SET state='open',config=config||'{\"consentText\":\"Test-only consent\"}' WHERE id=$1",[edition]);
   await store.db.query("UPDATE competitions SET status='approved' WHERE id=$1",[competition]);
  }
 });
});
