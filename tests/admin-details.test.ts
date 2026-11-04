import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { testDb } from './helpers/db';
import { id,type Actor } from '../src/server/core';
import { adminCreate,adminList,adminPatch } from '../src/server/admin';

describe('authenticated administration record details',()=>{
 let store:Awaited<ReturnType<typeof testDb>>;
 const admin:Actor={id:id(),role:'admin'},guardian:Actor={id:id(),role:'participant'},judge:Actor={id:id(),role:'judge'};
 const stranger=id(),school=id(),student=id(),otherStudent=id(),oldEdition=id(),edition=id(),oldParticipation=id(),participation=id(),otherParticipation=id(),competition=id(),leadEntry=id(),teamEntry=id(),unrelatedEntry=id(),round=id(),pendingAssignment=id(),completeAssignment=id(),oldReview=id(),currentReview=id(),history=id();
 const list=async(resource:string,recordId?:string)=>adminList(store.db,admin,resource,new URLSearchParams(recordId?{id:recordId}:{})) as Promise<any>;
 beforeAll(async()=>{
  store=await testDb();const db=store.db;
  for(const [userId,role,name] of [[admin.id,'admin','Administrator'],[guardian.id,'participant','Guardian'],[judge.id,'judge','Judge'],[stranger,'participant','Unrelated guardian']])await db.query("INSERT INTO users(id,role,contact,name,password_hash,totp_secret) VALUES($1,$2,$3,$4,'secret-password-sentinel','secret-seed-sentinel')",[userId,role,userId,name]);
  await db.query("INSERT INTO editions(id,label,state) VALUES($1,'2025','archived'),($2,'2026','open')",[oldEdition,edition]);
  await db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code) VALUES($1,'SCH-DETAIL','Example School','Street','Delhi','Delhi','110001')",[school]);
  const previousSchool=id();
  await db.query("INSERT INTO schools(id,reference,name,address,city,state,postal_code) VALUES($1,'SCH-PREVIOUS','Previous School','Street','Delhi','Delhi','110001')",[previousSchool]);
  for(const editionId of [oldEdition,edition])await db.query('INSERT INTO school_participations(id,school_id,edition_id,snapshot) VALUES($1,$2,$3,$4)',[id(),school,editionId,JSON.stringify({name:editionId===oldEdition?'Historical school name':'Example School'})]);
  await db.query("INSERT INTO students(id,reference,name,guardian_contact) VALUES($1,'ST-DETAIL','Student','same-contact'),($2,'ST-OTHER','Other student','same-contact')",[student,otherStudent]);
  for(const [p,s,e] of [[oldParticipation,student,oldEdition],[participation,student,edition],[otherParticipation,otherStudent,edition]])await db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,section,coordinator,snapshot) VALUES($1,$2,$3,$4,5,'A','Teacher','{}')",[p,s,school,e]);
  await db.query("INSERT INTO student_participations(id,student_id,school_id,edition_id,class,snapshot) VALUES($1,$2,$3,$4,5,'{}')",[id(),otherStudent,previousSchool,oldEdition]);
  await db.query('INSERT INTO participant_access(user_id,student_id) VALUES($1,$2)',[guardian.id,student]);
  for(const userId of [guardian.id,stranger])await db.query("INSERT INTO contact_verifications(id,user_id,contact,method) VALUES($1,$2,'same-contact','sms_otp')",[id(),userId]);
  for(const accepted of [true,false])await db.query("INSERT INTO consents(id,student_id,edition_id,actor_id,purpose,wording_version,wording,accepted) VALUES($1,$2,$3,$4,'publication','v1','Exact consent wording',$5)",[id(),student,edition,guardian.id,accepted]);
  await db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,opens_at,closes_at,config) VALUES($1,$2,'essay','Essay','Rules',now(),now()+interval '1 day','{}')",[competition,edition]);
  for(const [entry,p,ref] of [[leadEntry,participation,'ENT-LEAD'],[teamEntry,otherParticipation,'ENT-TEAM'],[unrelatedEntry,otherParticipation,'ENT-OTHER']])await db.query("INSERT INTO submissions(id,reference,student_participation_id,competition_id,category_id,state,revision) VALUES($1,$2,$3,$4,'junior','submitted',2)",[entry,ref,p,competition]);
  await db.query('INSERT INTO submission_members(submission_id,participation_id) VALUES($1,$2)',[teamEntry,participation]);
  await db.query("INSERT INTO review_rounds(id,competition_id,name,kind,eligible_states,rubric) VALUES($1,$2,'First round','scoring','[\"submitted\"]','{}')",[round,competition]);
  for(const [assignment,entry] of [[pendingAssignment,leadEntry],[completeAssignment,teamEntry]])await db.query('INSERT INTO judge_assignments(id,submission_id,judge_id,round_id,revision) VALUES($1,$2,$3,$4,2)',[assignment,entry,judge.id,round]);
  await db.query("INSERT INTO reviews(id,assignment_id,revision,rubric_version,status,submitted_at) VALUES($1,$2,1,1,'submitted',now()),($3,$4,2,1,'submitted',now())",[oldReview,pendingAssignment,currentReview,completeAssignment]);
  await db.query("INSERT INTO review_history(id,review_id,snapshot,reason,actor_id) VALUES($1,$2,'{\"scores\":{\"quality\":3},\"comment\":\"Original judgment\"}','Correction approved',$3)",[history,currentReview,admin.id]);
 });
 afterAll(async()=>{await store?.close();});
 it('shows yearly participation, consent history, explicit verification links and lead/member entries',async()=>{
  const {items:[record]}=await list('students',student);
  expect(record.participations).toHaveLength(2);
  expect(record.participations.find((p:any)=>p.id===participation)).toMatchObject({edition_label:'2026',school_name:'Example School',school_reference:'SCH-DETAIL',section:'A',coordinator:'Teacher'});
  expect(record.consents).toHaveLength(2);expect(record.consents.map((c:any)=>c.accepted).sort()).toEqual([false,true]);
  expect(record.consents[0]).toMatchObject({wording:'Exact consent wording',actor_name:'Guardian',edition_label:'2026'});
  expect(record.contact_verifications).toHaveLength(1);expect(record.contact_verifications[0].user_id).toBe(guardian.id);
  expect(record.entries).toHaveLength(2);
  expect(record.entries.find((e:any)=>e.id===leadEntry)).toMatchObject({participation_role:'lead',entry_url:`/entries/${leadEntry}`});
  expect(record.entries.find((e:any)=>e.id===teamEntry)).toMatchObject({participation_role:'member',title:'Essay',edition_label:'2026'});
  expect(JSON.stringify(record)).not.toContain('secret-');
 });
 it('retains school annual snapshots and links to filtered student/entry lists',async()=>{
  const {items:[record]}=await list('schools',school);
  expect(record.participations).toHaveLength(2);
  expect(record.participations.find((p:any)=>p.edition_id===oldEdition)).toMatchObject({edition_label:'2025',snapshot:{name:'Historical school name'},student_count:1,entry_count:0});
  expect(record.participations.find((p:any)=>p.edition_id===edition)).toMatchObject({student_count:2,entry_count:3,students_url:`/admin/students?schoolId=${school}&editionId=${edition}`,entries_url:`/admin/entries?schoolId=${school}&editionId=${edition}`});
 });
 it('combines school and edition filters on the same annual participation',async()=>{
  const result:any=await adminList(store.db,admin,'students',new URLSearchParams({schoolId:school,editionId:oldEdition}));
  expect(result.items.map((s:any)=>s.id)).toEqual([student]);
 });
 it('does not count a submitted review of an earlier revision as completing the current assignment',async()=>{
  const {items:[pending]}=await list('assignments',pendingAssignment);
  expect(pending).toMatchObject({review_status:'pending',completed:false,review_id:null,status:'pending'});
  const {items:[complete]}=await list('assignments',completeAssignment);
  expect(complete).toMatchObject({review_status:'submitted',completed:true,review_id:currentReview,review_revision:2,round_name:'First round',competition_title:'Essay',entry_url:`/entries/${teamEntry}`});
 });
 it('exposes preserved review snapshots with safe actor labels',async()=>{
  const {items:[review]}=await list('reviews',currentReview);
  expect(review).toMatchObject({competition_title:'Essay',entry_url:`/entries/${teamEntry}`});
  expect(review.history).toEqual([expect.objectContaining({id:history,reason:'Correction approved',actor_name:'Administrator',snapshot:{scores:{quality:3},comment:'Original judgment'}})]);
  expect(JSON.stringify(review)).not.toContain('secret-');
 });
 it('blocks participant and judge access to administrative details',async()=>{
  for(const actor of [guardian,judge])await expect(adminList(store.db,actor,'students',new URLSearchParams({id:student}))).rejects.toMatchObject({status:403});
 });
 it('keeps manual revocation distinct from assignments invalidated by an entry revision',async()=>{
  const revokedAssignment=id();
  await store.db.query('INSERT INTO judge_assignments(id,submission_id,judge_id,round_id,revision) VALUES($1,$2,$3,$4,2)',[revokedAssignment,unrelatedEntry,judge.id,round]);
  await adminPatch(store.db,admin,'assignments',revokedAssignment,{action:'revoke',reason:'Judge conflict'});
  await adminPatch(store.db,admin,'entries',unrelatedEntry,{action:'reopen',reason:'Participant correction'});
  await adminPatch(store.db,admin,'entries',leadEntry,{action:'reopen',reason:'Participant correction'});
  const rows=(await store.db.query('SELECT id,active,revision_invalidated,revocation_reason FROM judge_assignments WHERE id IN ($1,$2)',[revokedAssignment,pendingAssignment])).rows;
  expect(rows.find(r=>r.id===revokedAssignment)).toMatchObject({active:false,revision_invalidated:false,revocation_reason:'Judge conflict'});
  expect(rows.find(r=>r.id===pendingAssignment)).toMatchObject({active:false,revision_invalidated:true,revocation_reason:'Participant correction'});
  await adminPatch(store.db,admin,'assignments',pendingAssignment,{action:'revoke',reason:'Explicit removal'});
  expect((await store.db.query('SELECT revision_invalidated FROM judge_assignments WHERE id=$1',[pendingAssignment])).rows[0].revision_invalidated).toBe(false);
  expect((await store.db.query('SELECT id FROM reviews WHERE id=$1',[oldReview])).rows).toHaveLength(1);
 });
 it('accepts only scoring prerequisites from the same competition',async()=>{
  const input={competitionId:competition,name:'Jury round',kind:'jury',eligibleStates:['longlisted'],rubric:{criteria:[{id:'quality',label:'Quality',min:0,max:5,weight:1,required:true}],commentRequired:false},decisionRoles:['admin'],requiredReviews:1,prerequisiteRoundIds:[round]};
  const created:any=await adminCreate(store.db,admin,'rounds',input);
  expect(created.prerequisite_round_ids).toEqual([round]);
  await expect(adminCreate(store.db,admin,'rounds',{...input,prerequisiteRoundIds:[created.id]})).rejects.toMatchObject({status:422});
  await expect(adminCreate(store.db,admin,'rounds',{...input,prerequisiteRoundIds:[id()]})).rejects.toMatchObject({status:422});
  const foreignCompetition=id(),foreignRound=id();
  await store.db.query("INSERT INTO competitions(id,edition_id,slug,title,guidelines,opens_at,closes_at,config) VALUES($1,$2,'other','Other','Rules',now(),now()+interval '1 day','{}')",[foreignCompetition,edition]);
  await store.db.query("INSERT INTO review_rounds(id,competition_id,name,kind,eligible_states,rubric) VALUES($1,$2,'Foreign scoring','scoring','[]','{}')",[foreignRound,foreignCompetition]);
  await expect(adminCreate(store.db,admin,'rounds',{...input,prerequisiteRoundIds:[foreignRound]})).rejects.toMatchObject({status:422});
 });
});
